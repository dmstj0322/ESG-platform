package com.esg.analysis.service;

import com.esg.analysis.dto.AnalysisRequestDto;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.EcoCommitRequestDto;
import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.dto.IndicatorResult;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.domain.ESGEvidenceMatch;
import com.esg.analysis.service.domain.ESGIndicator;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.esg.analysis.service.repository.ESGEvidenceMatchRepository;
import com.esg.analysis.service.repository.ESGIndicatorRepository;
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
import org.springframework.transaction.annotation.Transactional;  // EcoCommit consumer에서 사용

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisConsumer {

    private final AnalysisReportRepository analysisReportRepository;
    private final ESGIndicatorRepository esgIndicatorRepository;
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
    private final ESGScoreCalculator scoreCalculator;
    private final ConfidenceService confidenceService;
    private final ESGEvidenceMatchRepository evidenceMatchRepository;

    private static final long FRAUD_POINT_THRESHOLD = 1_000_000L;
    private static final String LOCK_PREFIX = "analysis:processing:";

    // ═══════════════════════════════════════════════════════════════════════
    // 표준 ESG 분석 Consumer
    // ═══════════════════════════════════════════════════════════════════════

    // @Transactional 제거: 10분+ 장시간 분석 동안 DB 트랜잭션을 열어두면
    // evidenceMatchRepository.saveAll() 실패 시 Hibernate 세션이 오염되어
    // 이후 saveAndFlush()에서 UnexpectedRollbackException이 발생함.
    // 각 repository 메서드는 Spring Data JPA 기본 @Transactional(REQUIRED)로 독립 관리.
    @KafkaListener(topics = "esg-analysis-requests", groupId = "analysis-group")
    public void consumeDtoRequest(AnalysisRequestDto request) {
        Long analysisId = request.getAnalysisId();
        String fileHash = request.getFileHash();
        Long companyId  = request.getCompanyId();
        long userPoints = request.getUserPoints() != null ? Long.valueOf(request.getUserPoints()) : 0L;

        log.info("[분석 시작] ID:{} 기업:{}", analysisId, companyId);

        String lockKey = LOCK_PREFIX + companyId;
        RLock lock = redissonClient.getLock(lockKey);
        String sessionId = UUID.randomUUID().toString();
        boolean lockAcquired = false;

        log.info("[분산 락] 획득 시도 기업:{} lockKey={}", companyId, lockKey);
        try {
            lockAcquired = lock.tryLock(10, 600, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("[분산 락 실패] 기업:{} lockKey={} — 이미 분석 진행 중 (waitTime=10s 초과)", companyId, lockKey);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
                return;
            }
            log.info("[분산 락 획득] 기업:{} lockKey={} leaseTime=600s", companyId, lockKey);

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

            // 2. 보고서 세션 RAG 인덱싱 (텍스트 청킹 → ChromaDB)
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "CHUNKING");
            reportRagService.indexReport(sessionId, reportText);

            // 3. K-ESG 가이드라인 검색
            String kEsgGuidelines = esgRagService.retrieveRelevantGuidelines(
                    reportText.length() > 1000 ? reportText.substring(0, 1000) : reportText, 6, 0.5);

            // 4. ESGIndicator 기반 Evidence Retrieval 준비
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "RETRIEVAL");
            List<ESGIndicator> indicators = esgIndicatorRepository.findAllByOrderByCategoryAscCodeAsc();

            // 5. Evidence → 지표 매핑 + Rule-based Score + GPT Summary
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "EVIDENCE_MAPPING");
            long socialBonus = converter.toAnalysisSocialBonus(userPoints);
            log.info("[STEP] analyzeWithIndicators 진입 analysisId={} indicators={}개", analysisId, indicators.size());
            List<IndicatorResult> indicatorResults = analyzeWithIndicators(analysisId, sessionId, companyId, indicators, kEsgGuidelines, socialBonus);
            log.info("[STEP] analyzeWithIndicators 반환 analysisId={} results={}개", analysisId, indicatorResults.size());

            // 6. 점수 집계
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "MERGING_SCORE");
            log.info("[STEP] MERGING_SCORE 시작 analysisId={}", analysisId);

            // 7. DB 저장
            log.info("[STEP] CACHE_SAVE 시작 analysisId={}", analysisId);
            AnalysisResultCache resultDto = scoreAggregator.aggregate(indicatorResults, socialBonus);
            resultDto.setAnalysisId(analysisId);
            resultDto.setAnalyzedAt(LocalDateTime.now().toString());
            log.info("[CACHE_SAVE] aggregate 결과 — analysisId={} grade={} eScore={} sScore={} gScore={} totalScore={} confidence={} sectionsCount={} evidenceMappingCount={}",
                    analysisId, resultDto.getFinalGrade(),
                    resultDto.getEScore(), resultDto.getSScore(), resultDto.getGScore(),
                    resultDto.getTotalScore(), resultDto.getOverallConfidence(),
                    resultDto.getSections() != null ? resultDto.getSections().size() : 0,
                    resultDto.getEvidenceMapping() != null ? resultDto.getEvidenceMapping().size() : 0);

            // ── [1/4] JSON 직렬화 ──────────────────────────────────────────
            log.info("[CACHE_SAVE][1/4] JSON 직렬화 시작 analysisId={}", analysisId);
            String reportJson;
            try {
                reportJson = objectMapper.writeValueAsString(resultDto);
                log.info("[CACHE_SAVE][1/4] JSON 직렬화 완료 analysisId={} jsonLen={}자", analysisId, reportJson.length());
            } catch (Exception e) {
                log.error("[CACHE_SAVE ERROR][1/4] JSON 직렬화 실패 analysisId={} dto={}",
                        analysisId, resultDto, e);
                throw new RuntimeException("CACHE_SAVE JSON 직렬화 실패", e);
            }

            // ── [2/4] 저장 전 entity 상태 확인 (존재 여부 + 현재 status) ───
            log.info("[CACHE_SAVE][2/4] entity 존재 확인 시작 analysisId={}", analysisId);
            AnalysisReport reportSnapshot;
            try {
                reportSnapshot = analysisReportRepository.findById(analysisId)
                        .orElseThrow(() -> new IllegalArgumentException("리포트 없음: " + analysisId));
                log.info("[CACHE_SAVE][2/4] entity 확인 완료 — id={} currentStatus={} companyId={} memberId={} grade={} reportContentLen={}",
                        reportSnapshot.getId(),
                        reportSnapshot.getStatus(),
                        reportSnapshot.getCompanyId(),
                        reportSnapshot.getMemberId(),
                        reportSnapshot.getGrade(),
                        reportSnapshot.getReportContent() != null ? reportSnapshot.getReportContent().length() : 0);
                if ("FAILED".equals(reportSnapshot.getStatus())) {
                    log.warn("[CACHE_SAVE][2/4] currentStatus=FAILED 감지 — StartupAnalysisCleanup 또는 이전 실패로 인한 상태. " +
                            "completeById()는 상태와 무관하게 UPDATE 실행하므로 계속 진행합니다. analysisId={}", analysisId);
                }
            } catch (Exception e) {
                log.error("[CACHE_SAVE ERROR][2/4] entity 존재 확인 실패 analysisId={}", analysisId, e);
                throw e;
            }

            // ── [3/4] 저장 직전 최종 DTO 검증 로그 ───────────────────────
            log.info("[CACHE_SAVE][3/4] 저장 직전 DTO 검증 — analysisId={} grade={} eScore={} sScore={} gScore={} " +
                            "totalScore={} confidence={} fullReportLen={} sectionsCount={} evidenceMappingCount={}",
                    analysisId,
                    resultDto.getFinalGrade(),
                    resultDto.getEScore(), resultDto.getSScore(), resultDto.getGScore(),
                    resultDto.getTotalScore(), resultDto.getOverallConfidence(),
                    resultDto.getFullReport() != null ? resultDto.getFullReport().length() : 0,
                    resultDto.getSections() != null ? resultDto.getSections().size() : 0,
                    resultDto.getEvidenceMapping() != null ? resultDto.getEvidenceMapping().size() : 0);
            log.info("[CACHE_SAVE][3/4] reportContent(JSON) 길이 = {}자 ({} KB) analysisId={}",
                    reportJson.length(), reportJson.length() / 1024, analysisId);

            // ── [4/4] 직접 UPDATE 쿼리 — merge 경로(SELECT→UPDATE) 완전 우회 ─
            // saveAndFlush(detached entity)는 내부에서 em.merge() → SELECT FOR UPDATE → UPDATE 순으로 실행.
            // 이 SELECT 시점에 다른 트랜잭션이 같은 row를 잠그면 silent hang이 발생함.
            // @Modifying @Query는 단일 UPDATE 문만 발행하므로 lock 대기가 없음.
            log.info("[CACHE_SAVE][4/4] completeById() 직접 UPDATE 시작 analysisId={} → status=COMPLETED grade={}",
                    analysisId, resultDto.getFinalGrade());
            try {
                int affected = analysisReportRepository.completeById(
                        analysisId, reportJson, resultDto.getFinalGrade());
                if (affected == 0) {
                    log.error("[CACHE_SAVE ERROR][4/4] UPDATE 영향 row = 0 analysisId={} — row가 삭제됐거나 ID 오류", analysisId);
                    throw new IllegalStateException("UPDATE affected 0 rows for analysisId=" + analysisId);
                }
                log.info("[CACHE_SAVE][4/4] completeById() 완료 — DB row 확정 analysisId={} grade={} affectedRows={}",
                        analysisId, resultDto.getFinalGrade(), affected);
            } catch (Exception e) {
                log.error("[CACHE_SAVE ERROR][4/4] completeById() 실패 analysisId={} grade={} reportJsonLen={}자",
                        analysisId, resultDto.getFinalGrade(), reportJson.length(), e);
                throw e;
            }

            log.info("[STEP] DB 저장 완료 analysisId={} grade={}", analysisId, resultDto.getFinalGrade());

            // 8. Redis 캐시 저장 (30일) — 실패해도 DB 저장은 이미 완료
            try {
                redisTemplate.opsForValue().set("analysis:cache:" + fileHash, resultDto, 30, TimeUnit.DAYS);
                log.info("[CACHE_SAVE] Redis 캐시 저장 완료 fileHash={}", fileHash);
            } catch (Exception e) {
                log.warn("[CACHE_SAVE] Redis 캐시 저장 실패 (DB 저장은 완료됨) fileHash={} 원인={}", fileHash, e.getMessage());
            }

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETED");
            log.info("[분석 완료] 등급:{} sessionId:{}", resultDto.getFinalGrade(), sessionId);

        } catch (Exception e) {
            log.error("[Consumer 오류] ID:{} 원인:{}", analysisId, e.getMessage(), e);
            handleAnalysisFailure(companyId, analysisId);
        } finally {
            if (lockAcquired) {
                // 세션 컬렉션 삭제 실패가 unlock을 막지 않도록 분리
                try {
                    reportRagService.deleteSessionCollection(sessionId);
                } catch (Exception e) {
                    log.warn("[Consumer] 세션 컬렉션 삭제 실패 sessionId={} — unlock은 계속 진행. 원인: {}", sessionId, e.getMessage());
                }
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
                    log.info("[분산 락 해제] 기업:{} lockKey={}", companyId, lockKey);
                } else {
                    log.warn("[분산 락 경고] 기업:{} lockKey={} — leaseTime 초과로 락이 이미 만료됨. 분석 시간 초과 가능성 있음.", companyId, lockKey);
                }
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

        String lockKey = LOCK_PREFIX + companyId;
        RLock lock = redissonClient.getLock(lockKey);
        boolean lockAcquired = false;

        log.info("[EcoCommit 분산 락] 획득 시도 기업:{} lockKey={}", companyId, lockKey);
        try {
            lockAcquired = lock.tryLock(10, 300, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("[EcoCommit 락 실패] 기업:{} lockKey={} — 이미 분석 진행 중 (waitTime=10s 초과)", companyId, lockKey);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
                return;
            }
            log.info("[EcoCommit 분산 락 획득] 기업:{} lockKey={}", companyId, lockKey);

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

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETED");
            log.info("[EcoCommit 완료] 등급:{}", resultDto.getFinalGrade());

        } catch (Exception e) {
            log.error("[EcoCommit 오류] analysisId:{} 원인:{}", analysisId, e.getMessage());
            handleAnalysisFailure(companyId, analysisId);
        } finally {
            if (lockAcquired) {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
                    log.info("[EcoCommit 분산 락 해제] 기업:{} lockKey={}", companyId, lockKey);
                } else {
                    log.warn("[EcoCommit 분산 락 경고] 기업:{} lockKey={} — leaseTime 초과로 락이 이미 만료됨.", companyId, lockKey);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESGIndicator 기반 분석 (Rule-based Score + GPT Summary)
    // ═══════════════════════════════════════════════════════════════════════

    private List<IndicatorResult> analyzeWithIndicators(
            Long analysisId, String sessionId, Long companyId,
            List<ESGIndicator> indicators, String kEsgGuidelines, long socialBonus) {

        List<IndicatorResult> results = new ArrayList<>();
        int callIndex = 0;
        int total = indicators.size();
        boolean gptSummarySent = false;

        log.info("[STEP] analyzeWithIndicators 루프 시작 — 총 {}개 지표", total);

        for (ESGIndicator indicator : indicators) {
            String code = indicator != null ? indicator.getCode() : "NULL_INDICATOR";

            log.info("[STEP][{}/{}] 지표 시작 indicator={} analysisId={}",
                    callIndex + 1, total, code, analysisId);

            if (callIndex > 0) {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("[Analyze] 인터럽트 — 분석 중단 at indicator={}", code);
                    break;
                }
            } else {
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "RULE_BASED_SCORING");
                log.info("[STEP] WS RULE_BASED_SCORING 전송 완료");
            }
            callIndex++;

            // ── per-indicator try-catch: 한 지표 실패 시 기본값으로 파이프라인 유지 ──
            try {
                // 1. Evidence Retrieval
                log.info("[STEP][{}/{}] Retrieval 시작 indicator={}", callIndex, total, code);
                List<EvidenceResult> evidences =
                        reportRagService.retrieveEvidenceForIndicator(sessionId, indicator, 5);
                log.info("[STEP][{}/{}] Retrieval 완료 indicator={} evidence={}건",
                        callIndex, total, code, evidences.size());

                // 2. Confidence 먼저 계산 — Score gating의 기준값
                int confidenceScore = confidenceService.calculate(indicator, evidences);
                log.info("[STEP][{}/{}] Confidence 완료 indicator={} confidence={}%",
                        callIndex, total, code, confidenceScore);

                // 3. Confidence gating → Score / Grade 결정
                int score;
                String grade;
                boolean skipGpt;
                String overrideComment      = null;
                String overrideRecommendation = null;

                if (confidenceScore < 30) {
                    // 근거 부족 — 점수·GPT 모두 생략
                    score = 0;
                    grade = "N/A";
                    skipGpt = true;
                    overrideComment = "[근거 부족] 신뢰도 " + confidenceScore
                            + "% — 문서 내 [" + indicator.getTitle() + "] 관련 근거가 충분하지 않아 평가를 보류합니다."
                            + " [정보 부족] 정량 데이터 미확인으로 현황 분석 불가."
                            + " [가이드라인 준수 여부] 확인 불가."
                            + " [성과 평가] 평가 보류."
                            + " [개선 제언] 보고서 내 관련 공시 데이터 보완 후 재분석을 권고합니다.";
                    overrideRecommendation = "보고서 내 " + indicator.getTitle()
                            + " 관련 정량 데이터(수치·단위) 보완 후 재분석 필요";
                    log.info("[STEP][{}/{}] Confidence gating — 평가 보류 indicator={} confidence={}%",
                            callIndex, total, code, confidenceScore);
                } else {
                    score = scoreCalculator.calculate(indicator, evidences);
                    grade = scoreAggregator.scoreToGrade(score);
                    skipGpt = false;
                    log.info("[STEP][{}/{}] 점수 산출 완료 indicator={} score={} grade={}",
                            callIndex, total, code, score, grade);
                }

                // 4. Evidence 영속화
                if (!evidences.isEmpty()) {
                    log.info("[STEP][{}/{}] Evidence DB 저장 시작 indicator={} count={}건",
                            callIndex, total, code, evidences.size());
                    List<ESGEvidenceMatch> matches = new ArrayList<>();
                    for (EvidenceResult ev : evidences) {
                        matches.add(ESGEvidenceMatch.from(analysisId, ev, confidenceScore / 100.0));
                    }
                    evidenceMatchRepository.saveAll(matches);
                    log.info("[STEP][{}/{}] Evidence DB 저장 완료 indicator={}", callIndex, total, code);
                }

                // 5. 대표 Evidence 메타데이터
                EvidenceResult bestEvidence = evidences.isEmpty() ? null : evidences.get(0);
                String evidenceText = bestEvidence != null ? bestEvidence.getEvidenceText() : "";
                int pageNumber      = bestEvidence != null ? bestEvidence.getPageNumber() : -1;

                // 6. GPT: comment + recommendation 생성 (confidence < 30 skip)
                String comment;
                String recommendation;
                if (skipGpt) {
                    comment        = overrideComment;
                    recommendation = overrideRecommendation;
                } else {
                    if (!gptSummarySent) {
                        messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "GPT_SUMMARY");
                        log.info("[STEP] WS GPT_SUMMARY 전송 완료");
                        gptSummarySent = true;
                    }
                    try {
                        log.info("[STEP][{}/{}] GPT_SUMMARY 요청 시작 indicator={}", callIndex, total, code);
                        String prompt = promptBuilder.buildSummaryPrompt(
                                indicator, evidences, score, kEsgGuidelines, confidenceScore);
                        String json   = openAiClient.callWithRetry(prompt);
                        log.info("[STEP][{}/{}] GPT_SUMMARY 응답 수신 indicator={} jsonLen={}",
                                callIndex, total, code, json != null ? json.length() : -1);
                        JsonNode node = objectMapper.readTree(json);
                        comment        = node.path("comment").asText("분석 결과를 확인할 수 없습니다.");
                        recommendation = node.path("recommendation").asText("");
                        // confidence 30~50: Low Reliability 접두어 부착
                        if (confidenceScore < 50) {
                            comment = "[Low Reliability: 신뢰도 " + confidenceScore + "%] " + comment;
                        }
                    } catch (Exception e) {
                        String errorType = e.getMessage() != null && e.getMessage().contains("429")
                                ? "OpenAI Rate Limit(429)"
                                : e.getClass().getSimpleName() + ": " + e.getMessage();
                        log.warn("[STEP][{}/{}] GPT_SUMMARY 실패 indicator={} 원인={}",
                                callIndex, total, code, errorType, e);
                        comment = "[현황 분석] API 응답 오류로 분석 불가."
                                + " [가이드라인 준수 여부] 확인 불가."
                                + " [성과 평가] Rule-based " + score + "점 적용."
                                + " [개선 제언] 보고서 재업로드 후 재분석을 권고합니다.";
                        recommendation = errorType + " — 재분석 필요";
                    }
                }

                String key = indicator.getCode() + "_" + indicator.getTitle();
                results.add(new IndicatorResult(key, score, grade, comment, recommendation,
                        evidenceText, pageNumber, confidenceScore, indicator.getCode()));
                log.info("[STEP][{}/{}] 지표 완료 indicator={} score={} grade={} confidence={}%",
                        callIndex, total, code, score, grade, confidenceScore);

            } catch (Exception e) {
                // 단일 지표 실패 → 전체 파이프라인 중단 금지, 기본값으로 대체하고 계속
                log.error("[ERROR][{}/{}] 지표 처리 실패 indicator={} analysisId={} — 기본값(30점) 적용 후 계속. 원인: {}",
                        callIndex, total, code, analysisId, e.getMessage(), e);
                String fallbackKey  = indicator != null
                        ? indicator.getCode() + "_" + indicator.getTitle() : "UNKNOWN_지표";
                String fallbackCode = indicator != null ? indicator.getCode() : "UNKNOWN";
                results.add(new IndicatorResult(
                        fallbackKey, 30, "D",
                        "[현황 분석] 지표 처리 중 오류 발생."
                                + " [가이드라인 준수 여부] 확인 불가."
                                + " [성과 평가] 오류로 인해 기본값 30점 적용."
                                + " [개선 제언] 보고서 재업로드 후 재분석을 권고합니다.",
                        "지표 처리 오류 — 재분석 필요",
                        "", -1, 0, fallbackCode
                ));
            }
        }

        log.info("[STEP] analyzeWithIndicators 루프 종료 — 처리 완료 {}개 / 요청 {}개 analysisId={}",
                results.size(), total, analysisId);
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
        // 별도 try-catch: 실패 처리 중 예외가 원래 오류 로그를 덮어쓰지 않도록 격리
        try {
            analysisReportRepository.findById(analysisId).ifPresent(report -> {
                report.failAnalysis();
                analysisReportRepository.saveAndFlush(report);
            });
            log.info("[AnalysisFailure] 상태 FAILED 저장 완료 analysisId={}", analysisId);
        } catch (Exception e) {
            log.error("[AnalysisFailure ERROR] FAILED 상태 저장 실패 analysisId={} — DB 상태 확인 필요. 원인: {}",
                    analysisId, e.getMessage());
        }
    }
}
