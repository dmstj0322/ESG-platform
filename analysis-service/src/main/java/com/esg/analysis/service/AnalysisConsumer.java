package com.esg.analysis.service;

import com.esg.analysis.dto.AnalysisRequestDto;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.EcoCommitRequestDto;
import com.esg.analysis.dto.IndicatorResult;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisConsumer {

    private final AnalysisReportRepository analysisReportRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final EsgRagService esgRagService;
    private final ReportRagService reportRagService;
    private final RedissonClient redissonClient;
    private final EcoPointConverter converter;
    private final AnalysisPromptBuilder promptBuilder;
    private final AnalysisOpenAiClient openAiClient;
    private final AnalysisScoreAggregator scoreAggregator;

    private static final long FRAUD_POINT_THRESHOLD = 1_000_000L;
    private static final String LOCK_PREFIX = "analysis:processing:";

    // ═══════════════════════════════════════════════════════════════════════
    // 표준 ESG 분석 Consumer
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    @KafkaListener(topics = "esg-analysis-requests", groupId = "analysis-group")
    public void consumeDtoRequest(AnalysisRequestDto request) {
        Long analysisId = request.getAnalysisId();
        String fileHash = request.getFileHash();
        Long companyId  = request.getCompanyId();
        long userPoints = request.getUserPoints() != null ? Long.valueOf(request.getUserPoints()) : 0L;

        log.info("[분석 시작] ID:{} 기업:{}", analysisId, companyId);

        RLock lock = redissonClient.getLock(LOCK_PREFIX + companyId);
        String sessionId = UUID.randomUUID().toString();
        boolean lockAcquired = false;

        try {
            lockAcquired = lock.tryLock(10, 600, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("[분산 락 실패] 기업:{} — 이미 분석 진행 중", companyId);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
                return;
            }

            // 1. 전처리
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "PREPROCESSING");
            if (userPoints >= FRAUD_POINT_THRESHOLD) {
                log.warn("[그린워싱 감지] 기업:{} 포인트:{}", companyId, userPoints);
                handleFraudDetection(companyId, analysisId, userPoints);
                return;
            }

            String reportText = Optional.ofNullable(request.getContent())
                    .map(c -> c.replaceAll("\\s+", " ").trim())
                    .orElse("");

            // 2. 보고서 세션 RAG 인덱싱
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "INDEXING_REPORT");
            reportRagService.indexReport(sessionId, reportText);

            // 3. K-ESG 가이드라인 검색
            String kEsgGuidelines = esgRagService.retrieveRelevantGuidelines(
                    reportText.length() > 1000 ? reportText.substring(0, 1000) : reportText, 6, 0.5);

            // 4. 지표별 Targeted Retrieval
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "RETRIEVING_CONTEXT");
            Map<String, String> indicatorChunks = new LinkedHashMap<>();
            for (String key : ReportRagService.INDICATOR_KEYWORDS.keySet()) {
                indicatorChunks.put(key, reportRagService.retrieveForIndicator(sessionId, key, 8));
            }

            // 5. OpenAI 지표별 순차 분석
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "AI_ANALYZING");
            long socialBonus = converter.toAnalysisSocialBonus(userPoints);
            List<IndicatorResult> indicatorResults = analyzeSequentially(indicatorChunks, kEsgGuidelines, socialBonus);

            // 6. 점수 집계
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "MERGING_SCORE");

            // 7. DB 저장
            AnalysisResultCache resultDto = scoreAggregator.aggregate(indicatorResults, socialBonus);
            resultDto.setAnalysisId(analysisId);
            resultDto.setAnalyzedAt(LocalDateTime.now().toString());

            String reportJson = objectMapper.writeValueAsString(resultDto);
            AnalysisReport report = analysisReportRepository.findById(analysisId)
                    .orElseThrow(() -> new IllegalArgumentException("리포트 없음: " + analysisId));
            report.completeAnalysis(reportJson, resultDto.getFinalGrade());
            analysisReportRepository.saveAndFlush(report);

            // 8. Redis 캐시 저장 (30일)
            redisTemplate.opsForValue().set("analysis:cache:" + fileHash, resultDto, 30, TimeUnit.DAYS);

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETE");
            log.info("[분석 완료] 등급:{} sessionId:{}", resultDto.getFinalGrade(), sessionId);

        } catch (Exception e) {
            log.error("[Consumer 오류] ID:{} 원인:{}", analysisId, e.getMessage(), e);
            handleAnalysisFailure(companyId, analysisId);
        } finally {
            reportRagService.deleteSessionCollection(sessionId);
            if (lockAcquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 에코포인트 성과 확정 Consumer
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    @KafkaListener(
            topics = "esg-eco-commit",
            groupId = "eco-commit-group",
            containerFactory = "ecoCommitListenerContainerFactory"
    )
    public void consumeEcoCommitRequest(String message) {
        EcoCommitRequestDto request;
        try {
            request = objectMapper.readValue(message, EcoCommitRequestDto.class);
        } catch (Exception e) {
            log.error("[EcoCommit] 메시지 파싱 실패:{}", e.getMessage());
            return;
        }

        Long analysisId = request.getPendingAnalysisId();
        Long companyId  = request.getCompanyId();
        log.info("[EcoCommit 시작] analysisId:{} EP:{}", analysisId, request.getEcoPoints());

        RLock lock = redissonClient.getLock(LOCK_PREFIX + companyId);
        boolean lockAcquired = false;

        try {
            lockAcquired = lock.tryLock(10, 300, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("[EcoCommit 락 실패] 기업:{}", companyId);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
                return;
            }

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "PREPROCESSING");
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "AI_ANALYZING");

            String ecoPrompt = promptBuilder.buildEcoCommitPrompt(
                    request.getEcoPoints(), request.getCarbonReductionKg(),
                    request.getEquivalentTrees(), request.getEBonus(), request.getSBonus());
            String rawJson = openAiClient.callWithCircuitBreaker(ecoPrompt);

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "MERGING_SCORE");

            AnalysisResultCache resultDto = objectMapper.readValue(rawJson, AnalysisResultCache.class);
            resultDto.setAnalysisId(analysisId);
            resultDto.setAnalyzedAt(LocalDateTime.now().toString());
            resultDto.setEcoPoints(request.getEcoPoints());
            resultDto.setCarbonReductionKg(request.getCarbonReductionKg());
            resultDto.setEquivalentTrees(request.getEquivalentTrees());

            String enrichedJson = objectMapper.writeValueAsString(resultDto);
            AnalysisReport report = analysisReportRepository.findById(analysisId)
                    .orElseThrow(() -> new IllegalArgumentException("리포트 없음: " + analysisId));
            report.completeWithEco(enrichedJson, resultDto.getFinalGrade(),
                    request.getEcoPoints(), request.getCarbonReductionKg(), request.getEquivalentTrees());
            analysisReportRepository.saveAndFlush(report);

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETE");
            log.info("[EcoCommit 완료] 등급:{}", resultDto.getFinalGrade());

        } catch (Exception e) {
            log.error("[EcoCommit 오류] analysisId:{} 원인:{}", analysisId, e.getMessage());
            handleAnalysisFailure(companyId, analysisId);
        } finally {
            if (lockAcquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 지표별 순차 분석 (OpenAI Rate Limit 대응)
    // ═══════════════════════════════════════════════════════════════════════

    private List<IndicatorResult> analyzeSequentially(
            Map<String, String> indicatorChunks, String kEsgGuidelines, long socialBonus) {

        List<IndicatorResult> results = new ArrayList<>();
        int callIndex = 0;

        for (Map.Entry<String, String> entry : indicatorChunks.entrySet()) {
            String key   = entry.getKey();
            String chunk = entry.getValue();

            if (callIndex++ > 0) {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("[Sequential] 인터럽트 — 분석 중단");
                    break;
                }
            }

            try {
                String prompt = promptBuilder.buildIndicatorPrompt(key, chunk, kEsgGuidelines);
                String json   = openAiClient.callWithRetry(prompt);

                JsonNode node = objectMapper.readTree(json);
                int score           = Math.max(0, Math.min(100, node.path("score").asInt(30)));
                String grade        = node.path("grade").asText("D");
                String comment      = node.path("comment").asText("분석 결과를 확인할 수 없습니다.");
                String recommendation = node.path("recommendation").asText("");
                String evidenceText = node.path("evidence_text").asText("");
                int pageNumber      = node.path("page_number").asInt(-1);
                int confidenceScore = Math.max(0, Math.min(100, node.path("confidence_score").asInt(50)));

                results.add(new IndicatorResult(key, score, grade, comment, recommendation,
                        evidenceText, pageNumber, confidenceScore, promptBuilder.resolveKesgCode(key)));
                log.debug("[Sequential] {} → {}점({}) 신뢰도:{}%", key, score, grade, confidenceScore);

            } catch (Exception e) {
                String errorType = e.getMessage() != null && e.getMessage().contains("429")
                        ? "OpenAI Rate Limit(429)"
                        : e.getClass().getSimpleName() + ": " + e.getMessage();
                log.warn("[Sequential] {} 분석 실패: {}", key, errorType);
                results.add(new IndicatorResult(key, 30, "D",
                        "[현황 분석] [정량적 공시 수준 미흡 — API 응답 지연] 사유: " + errorType + ". "
                                + "[가이드라인 준수 여부] 확인 불가. "
                                + "[성과 평가] 기본값 30점(D) 적용. (추론) "
                                + "[개선 제언] 보고서 재업로드 후 재분석을 권고합니다.",
                        errorType + " — 재분석 필요",
                        "", -1, 0, promptBuilder.resolveKesgCode(key)));
            }
        }
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 에러 처리
    // ═══════════════════════════════════════════════════════════════════════

    private void handleFraudDetection(Long companyId, Long analysisId, Long userPoints) {
        messagingTemplate.convertAndSend("/topic/admin/alert", Map.of(
                "companyId",  companyId,
                "userPoints", userPoints,
                "analysisId", analysisId,
                "message",    "비정상적인 포인트 급증 감지"
        ));
        handleAnalysisFailure(companyId, analysisId);
    }

    private void handleAnalysisFailure(Long companyId, Long analysisId) {
        messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
        analysisReportRepository.findById(analysisId).ifPresent(report -> {
            report.failAnalysis();
            analysisReportRepository.saveAndFlush(report);
        });
    }
}
