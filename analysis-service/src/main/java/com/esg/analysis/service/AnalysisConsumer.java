package com.esg.analysis.service;

import com.esg.analysis.dto.AnalysisRequestDto;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.EcoCommitRequestDto;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.*;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisConsumer {

    private final AnalysisReportRepository analysisReportRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final EsgRagService esgRagService;
    private final ReportRagService reportRagService;
    private final RedissonClient redissonClient;

    private static final long FRAUD_POINT_THRESHOLD = 1_000_000L;
    private static final String LOCK_PREFIX = "analysis:processing:";
    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    private static final Map<String, String> KESG_CODE_MAP = Map.ofEntries(
            Map.entry("E1", "E-1-1"), Map.entry("E2", "E-2-1"), Map.entry("E3", "E-3-1"),
            Map.entry("E4", "E-4-1"), Map.entry("E5", "E-5-1"), Map.entry("E6", "E-6-1"),
            Map.entry("S1", "S-1-1"), Map.entry("S2", "S-2-1"), Map.entry("S3", "S-3-1"),
            Map.entry("S4", "S-4-1"), Map.entry("S5", "S-5-1"), Map.entry("S6", "S-6-1"),
            Map.entry("G1", "G-1-1"), Map.entry("G2", "G-2-1"), Map.entry("G3", "G-3-1"),
            Map.entry("G4", "G-4-1"), Map.entry("G5", "G-5-1"), Map.entry("G6", "G-6-1")
    );

    @Value("${openai.api.key}")
    private String openAiApiKey;

    @Value("${openai.api.model-name}")
    private String openAiModel;

    // ═══════════════════════════════════════════════════════════════════════
    // 표준 ESG 분석 Consumer (Selective Context RAG)
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    @KafkaListener(topics = "esg-analysis-requests", groupId = "analysis-group")
    public void consumeDtoRequest(AnalysisRequestDto request) {
        Long analysisId = request.getAnalysisId();
        String fileHash  = request.getFileHash();
        Long companyId   = request.getCompanyId();
        Long userPoints  = (request.getUserPoints() != null) ? Long.valueOf(request.getUserPoints()) : 0L;

        log.info("[Selective-RAG 분석 시작] ID:{} 기업:{} 모델:{}", analysisId, companyId, openAiModel);

        // 분산 락: 동일 기업의 동시 분석 방지 (최대 10분 대기 → 10분 점유)
        RLock lock = redissonClient.getLock(LOCK_PREFIX + companyId);
        String sessionId = UUID.randomUUID().toString();
        boolean lockAcquired = false;

        try {
            lockAcquired = lock.tryLock(10, 600, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("[분산 락 실패] 기업ID:{} — 이미 분석 진행 중", companyId);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
                return;
            }

            // ── 1. 전처리 ────────────────────────────────────────────────────
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "PREPROCESSING");

            if (userPoints >= FRAUD_POINT_THRESHOLD) {
                log.warn("[F-403 그린워싱] 기업ID:{} 포인트:{}", companyId, userPoints);
                handleFraudDetection(companyId, analysisId, userPoints);
                return;
            }

            String rawContent = request.getContent();
            String reportText = (rawContent != null) ? rawContent.replaceAll("\\s+", " ").trim() : "";

            // ── 2. 보고서 세션 RAG 인덱싱 (임시 ChromaDB 컬렉션, UUID명) ────
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "INDEXING_REPORT");
            log.info("[Session RAG] 인덱싱 시작 sessionId={}", sessionId);
            reportRagService.indexReport(sessionId, reportText);

            // ── 3. K-ESG 가이드라인 RAG (영구 가이드라인 컬렉션 검색) ─────────
            log.info("[Guideline RAG] K-ESG 가이드라인 검색");
            String kEsgGuidelines = esgRagService.retrieveRelevantGuidelines(
                    reportText.length() > 1000 ? reportText.substring(0, 1000) : reportText,
                    6, 0.5
            );
            boolean ragAvailable = !kEsgGuidelines.isBlank();

            // ── 4. 지표별 정밀 검색 Targeted Retrieval (18개 K-ESG 지표) ──────
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "RETRIEVING_CONTEXT");
            Map<String, String> indicatorChunks = new LinkedHashMap<>();
            for (String indicatorKey : ReportRagService.INDICATOR_KEYWORDS.keySet()) {
                // OpenAI 컨텍스트 윈도우를 감안해 Top-8 청크 검색
                String chunks = reportRagService.retrieveForIndicator(sessionId, indicatorKey, 8);
                indicatorChunks.put(indicatorKey, chunks);
                log.debug("[Targeted Retrieval] {} → {}자 추출", indicatorKey, chunks.length());
            }
            log.info("[Targeted Retrieval] 완료 — 유효 지표 {}개",
                    indicatorChunks.values().stream().filter(v -> !v.isBlank()).count());

            // ── 5. OpenAI 분석 — 지표별 순차 호출 ────────────────────────────
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "AI_ANALYZING");

            // 가산점 = 포인트 / 10,000 (10,000 EP → +1점, 100,000 EP → +10점)
            long socialBonus = userPoints / 10_000L; // Long 나눗셈 명시
            List<IndicatorResult> indicatorResults = analyzeIndicatorsSequentially(
                    indicatorChunks, kEsgGuidelines, socialBonus);
            String cleanJsonResponse = aggregateToFinalReportJson(indicatorResults, socialBonus);

            // ── 6. 점수 집계 단계 ─────────────────────────────────────────────
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "MERGING_SCORE");

            // ── 7. 파싱 및 DB 저장 ───────────────────────────────────────────
            AnalysisResultCache resultDto = objectMapper.readValue(cleanJsonResponse, AnalysisResultCache.class);
            resultDto.setAnalysisId(analysisId);
            resultDto.setAnalyzedAt(LocalDateTime.now().toString());

            AnalysisReport report = analysisReportRepository.findById(analysisId)
                    .orElseThrow(() -> new IllegalArgumentException("리포트 없음: " + analysisId));
            report.completeAnalysis(cleanJsonResponse, resultDto.getFinalGrade());
            analysisReportRepository.saveAndFlush(report);

            // ── 8. Redis 캐시 저장 (30일) ─────────────────────────────────────
            redisTemplate.opsForValue().set("analysis:cache:" + fileHash, resultDto, 30, TimeUnit.DAYS);

            // ── 9. 완료 알림 ──────────────────────────────────────────────────
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETE");
            log.info("[분석 완료] 등급:{} RAG사용:{} sessionId:{}", resultDto.getFinalGrade(), ragAvailable, sessionId);

        } catch (Exception e) {
            log.error("[Consumer 에러] ID:{} 원인:{}", analysisId, e.getMessage(), e);
            handleAnalysisFailure(companyId, analysisId);
        } finally {
            // 항상 실행: 임시 컬렉션 삭제 + 분산 락 해제
            reportRagService.deleteSessionCollection(sessionId);
            if (lockAcquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.debug("[분산 락 해제] 기업ID:{}", companyId);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 지표별 순차 분석 (Sequential Call — OpenAI Throttling 대응)
    // ═══════════════════════════════════════════════════════════════════════

    private static class IndicatorResult {
        final String key;
        final int score;
        final String grade;
        final String comment;
        final String recommendation;
        final String evidenceText;  // 원문 인용 문구
        final int pageNumber;       // 페이지 번호 (-1=불명확)
        final int confidenceScore;  // AI 원문 충실도 (0~100)
        final String kesgCode;      // K-ESG 문항 코드 (예: "E-2-1")

        IndicatorResult(String key, int score, String grade, String comment, String recommendation,
                        String evidenceText, int pageNumber, int confidenceScore, String kesgCode) {
            this.key = key;
            this.score = score;
            this.grade = grade;
            this.comment = comment;
            this.recommendation = recommendation;
            this.evidenceText = evidenceText;
            this.pageNumber = pageNumber;
            this.confidenceScore = confidenceScore;
            this.kesgCode = kesgCode;
        }
    }

    private List<IndicatorResult> analyzeIndicatorsSequentially(
            Map<String, String> indicatorChunks,
            String kEsgGuidelines,
            long socialBonus) {

        List<IndicatorResult> results = new ArrayList<>();
        int callIndex = 0;

        for (Map.Entry<String, String> entry : indicatorChunks.entrySet()) {
            String indicatorKey = entry.getKey();
            String chunk = entry.getValue();

            // 첫 번째 호출 이후 1.5초 딜레이 — OpenAI Rate Limit 안전 여유 확보
            if (callIndex > 0) {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("[Sequential] 딜레이 중 인터럽트 발생 — 분석 중단");
                    break;
                }
            }
            callIndex++;

            try {
                String prompt = buildIndicatorPrompt(indicatorKey, chunk, kEsgGuidelines);
                String json = callOpenAiForIndicatorWithRetry(prompt);

                JsonNode node = objectMapper.readTree(json);
                int score = Math.max(0, Math.min(100, node.path("score").asInt(30)));
                String grade = node.path("grade").asText("D");
                String comment = node.path("comment").asText("분석 결과를 확인할 수 없습니다.");
                String recommendation = node.path("recommendation").asText("");

                String evidenceText = node.path("evidence_text").asText("");
                int pageNumber = node.path("page_number").asInt(-1);
                int confidenceScore = Math.max(0, Math.min(100, node.path("confidence_score").asInt(50)));

                results.add(new IndicatorResult(indicatorKey, score, grade, comment, recommendation,
                        evidenceText, pageNumber, confidenceScore, resolveKesgCode(indicatorKey)));
                log.debug("[Sequential] {} → {}점({}) 신뢰도:{}%", indicatorKey, score, grade, confidenceScore);

            } catch (Exception e) {
                String errorType;
                if (e.getMessage() != null && e.getMessage().contains("429")) {
                    errorType = "OpenAI API Rate Limit(429)";
                } else if (e.getMessage() != null && e.getMessage().matches(".*5\\d\\d.*")) {
                    errorType = "OpenAI Server Error(5xx): " + e.getMessage();
                } else {
                    errorType = e.getClass().getSimpleName() + ": " + e.getMessage();
                }
                log.warn("[Sequential] {} 분석 최종 실패 사유={}", indicatorKey, errorType);
                results.add(new IndicatorResult(indicatorKey, 30, "D",
                        "[현황 분석] [정량적 공시 수준 미흡 — API 응답 지연] 사유: " + errorType + ". "
                                + "[가이드라인 준수 여부] 확인 불가. "
                                + "[성과 평가] 기본값 30점(D) 적용. (추론) "
                                + "[개선 제언] 보고서 재업로드 후 재분석을 권고합니다.",
                        errorType + " — 재분석 필요",
                        "", -1, 0, resolveKesgCode(indicatorKey)));
            }
        }

        long successCount = results.stream().filter(r -> !r.comment.contains("데이터 검색 실패")).count();
        log.info("[Sequential] 완료 — 총 {}개 지표 (성공:{}, 실패:{})",
                results.size(), successCount, results.size() - successCount);
        return results;
    }

    private String buildIndicatorPrompt(String indicatorKey, String chunk, String kEsgGuidelines) {
        String indicatorName = indicatorKey.contains("_") ? indicatorKey.split("_", 2)[1] : indicatorKey;
        String kesgCode = resolveKesgCode(indicatorKey);
        String chunkText = (chunk == null || chunk.isBlank()) ? "(보고서 내 관련 데이터 미발견)" : chunk;
        String guidelineSnippet = kEsgGuidelines.isBlank()
                ? "(가이드라인 미조회)"
                : (kEsgGuidelines.length() > 400 ? kEsgGuidelines.substring(0, 400) + "..." : kEsgGuidelines);

        return "당신은 15년 경력의 ESG 전문 컨설턴트로서 '종합 진단 결과서'를 작성합니다.\n"
                + "평이한 서술(예: '데이터가 있음')을 금지합니다. "
                + "'지표 관리 상태 양호', '전략적 보완 필요', '정량적 공시 수준 미흡' 등 전문 진단 용어를 사용하세요.\n"
                + "모든 분석 코멘트에는 PDF에서 추출한 수치(tCO2-eq, %, 명, 원, kWh, m³, 톤 등)를 포함해야 합니다. "
                + "수치가 없는 분석은 '(추론)' 표기를 의무화합니다.\n\n"
                + "[수치 비교 오류 방지 — 필수]\n"
                + "두 수치를 비교할 때 반드시 두 값을 나란히 놓고 대소를 확인한 뒤 서술하세요.\n"
                + "예) A=4,443명, B=3,815명 → A>B이므로 여성이 더 많음.\n"
                + "'~에 비해 낮음/높음/적음/많음' 표현은 실제 숫자 계산을 먼저 수행한 후에만 사용하세요.\n"
                + "부정적 평가(미흡·낮음·부족·불균형 등)는 해당 수치가 비교 기준값보다 실제로 작을 때만 허용합니다.\n\n"
                + "[분석 대상 지표]\n"
                + "K-ESG 문항코드: " + kesgCode + "\n"
                + "지표명: " + indicatorName + "\n\n"
                + "[보고서 발췌 — 벡터 검색 결과]\n"
                + "※ 표 데이터가 있다면 수치와 단위를 반드시 분석에 포함하세요. "
                + "숫자가 나열되어 있다면 표의 행/열로 간주하고, 지표 이름과 연결된 수치를 끝까지 찾아내세요.\n"
                + chunkText + "\n\n"
                + "[K-ESG 가이드라인 참조]\n"
                + guidelineSnippet + "\n\n"
                + "[분석 지시사항]\n"
                + "1. 보고서 발췌에서 핵심 수치와 단위를 추출하여 0~100점으로 평가하세요.\n"
                + "2. 발췌가 '미발견'이면 30점.\n"
                + "3. comment는 ① [현황 분석] ② [가이드라인 준수 여부] ③ [성과 평가] ④ [개선 제언] 순서로 작성. "
                + "각 항목에 구체적 수치와 단위를 반드시 포함하세요.\n"
                + "4. 등급: 90+ A, 70~89 B, 50~69 C, 50미만 D\n"
                + "5. evidence_text: 이 지표를 가장 잘 뒷받침하는 원문 문구를 그대로 인용(최대 100자). 없으면 빈 문자열.\n"
                + "6. page_number: 보고서 발췌문에서 evidence_text 위치 직전에 등장하는 [FILE_PAGE:X] 마커의 X 값을 정수로 반환하세요. "
                + "예: 발췌문에 '[FILE_PAGE:23]'이 있으면 23을 반환. "
                + "[FILE_PAGE:X] 마커가 발췌문에 없으면 -1을 반환.\n"
                + "7. confidence_score: 원문 수치 기반이면 80~100, 부분 추론이면 50~79, 완전 추론이면 0~49.\n\n"
                + "[출력 규칙]\n"
                + "마크다운 없이 순수 JSON만 반환하세요:\n"
                + "{\"score\": 75, \"grade\": \"B\", "
                + "\"comment\": \"[현황 분석]...[가이드라인 준수 여부]...[성과 평가]...[개선 제언]...\", "
                + "\"recommendation\": \"...\", "
                + "\"evidence_text\": \"원문 인용 문구\", "
                + "\"page_number\": 121, "
                + "\"confidence_score\": 85}";
    }
    private String callOpenAiForIndicatorWithRetry(String prompt) throws Exception {
        int maxRetries = 3;
        Exception lastException = null;

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // 2s → 4s Exponential Backoff — 429 Rate Limit 및 5xx 서버 오류 복구 시간 확보
                    long backoffMs = 2000L * (1L << (attempt - 1));
                    log.info("[OpenAI Retry] {}차 재시도 — {}ms 대기 중...", attempt + 1, backoffMs);
                    Thread.sleep(backoffMs);
                }
                return callOpenAiForIndicator(prompt);
            } catch (Exception e) {
                lastException = e;
                log.warn("[OpenAI Retry] {}차 실패: {}", attempt + 1, e.getMessage());
            }
        }
        throw lastException;
    }

    private String callOpenAiForIndicator(String prompt) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(openAiApiKey);

        Map<String, Object> requestMap = Map.of(
                "model", openAiModel,
                "messages", List.of(
                        Map.of("role", "system", "content",
                                "You are a Korean ESG analyst. Output ONLY valid JSON. No markdown, no code blocks."),
                        Map.of("role", "user", "content", prompt)
                ),
                "response_format", Map.of("type", "json_object"),
                "temperature", 0.0,
                "max_tokens", 900
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestMap, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(OPENAI_API_URL, entity, String.class);
        return parseOpenAiResponse(response.getBody());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 지표 결과 집계 → AnalysisResultCache JSON 생성
    // ═══════════════════════════════════════════════════════════════════════

    private String aggregateToFinalReportJson(List<IndicatorResult> results, long socialBonus) throws Exception {
        Map<String, List<IndicatorResult>> grouped = new LinkedHashMap<>();
        grouped.put("E", new ArrayList<>());
        grouped.put("S", new ArrayList<>());
        grouped.put("G", new ArrayList<>());

        for (IndicatorResult r : results) {
            String prefix = r.key.isEmpty() ? "E" : r.key.substring(0, 1);
            grouped.getOrDefault(prefix, grouped.get("E")).add(r);
        }

        int eScore = computeAvgScore(grouped.get("E"));
        int rawSScore = computeAvgScore(grouped.get("S"));
        long cappedBonus = Math.min(socialBonus, (long) rawSScore);
        int sScore = (int) Math.min((long) rawSScore + cappedBonus, 100L); // Long 산술 명시
        int gScore = computeAvgScore(grouped.get("G"));

        String eGrade = scoreToGrade(eScore);
        String sGrade = scoreToGrade(sScore);
        String gGrade = scoreToGrade(gScore);

        int finalScoreInt = (int) Math.round(eScore * 0.4 + sScore * 0.3 + gScore * 0.3);
        String finalGrade = scoreToGrade(finalScoreInt);

        // [종합 소견]
        String overallOpinion = buildOverallOpinionText(
                eScore, eGrade, sScore, sGrade, rawSScore, gScore, gGrade,
                finalScoreInt, finalGrade, cappedBonus);

        // [지표별 정밀 진단]
        String indicatorDiagnosis = buildIndicatorDiagnosisText(results);

        // [Risk & Opportunity]
        String riskOpportunity = buildRiskOpportunityText(results);

        // 완전한 마크다운 리포트 (marked()로 렌더링 가능)
        String fullReport = "## [종합 소견]\n\n" + overallOpinion
                + "\n\n---\n\n## [지표별 정밀 진단]\n\n" + indicatorDiagnosis
                + "\n---\n\n## [Risk & Opportunity]\n\n" + riskOpportunity;

        // React Table data prop — evidence_mapping JSON 배열
        List<Map<String, Object>> evidenceMapping = buildEvidenceMapping(results);

        List<Map<String, Object>> sections = new ArrayList<>();
        addSection(sections, "Environment", eScore, eGrade, grouped.get("E"));
        addSection(sections, "Social",       sScore, sGrade, grouped.get("S"));
        addSection(sections, "Governance",   gScore, gGrade, grouped.get("G"));

        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("finalGrade", finalGrade);
        resultMap.put("fullReport", fullReport);
        resultMap.put("overallOpinion", overallOpinion);
        resultMap.put("riskOpportunity", riskOpportunity);
        resultMap.put("evidenceMapping", evidenceMapping);
        resultMap.put("sections", sections);

        return objectMapper.writeValueAsString(resultMap);
    }

    private int computeAvgScore(List<IndicatorResult> results) {
        if (results == null || results.isEmpty()) return 30;
        return (int) Math.round(results.stream().mapToInt(r -> r.score).average().orElse(30));
    }

    private String scoreToGrade(int score) {
        if (score >= 90) return "A";
        if (score >= 70) return "B";
        if (score >= 50) return "C";
        return "D";
    }

    private void addSection(List<Map<String, Object>> sections, String category,
                            int score, String grade, List<IndicatorResult> indicators) {
        String topComment = indicators.stream()
                .filter(r -> !r.comment.contains("오류가 발생"))
                .sorted(Comparator.comparingInt((IndicatorResult r) -> r.score).reversed())
                .map(r -> r.comment)
                .limit(2)
                .collect(Collectors.joining(" "));
        if (topComment.isBlank() && !indicators.isEmpty()) topComment = indicators.get(0).comment;
        // 지표 comment 안의 마커 태그([현황 분석] 등)를 제거해야 카테고리 comment 파싱이 깨지지 않음
        String cleanedComment = topComment
                .replaceAll("\\[(현황[^\\]]*|가이드라인\\s*준수\\s*여부|준수\\s*여부|성과\\s*평가|성과|개선\\s*제언|개선)\\]\\s*", "")
                .replaceAll("\\s+", " ")
                .trim();
        String snippet = cleanedComment.length() > 200 ? cleanedComment.substring(0, 200) + "..." : cleanedComment;

        String diagnosisStatus = score >= 90 ? "지표 관리 상태 최우수"
                : score >= 70 ? "지표 관리 상태 양호"
                : score >= 50 ? "전략적 보완 필요"
                : "정량적 공시 수준 미흡";

        String categoryComment = "[현황 분석] " + category + " 영역 평균 " + score + "점(" + grade + "등급) — " + diagnosisStatus + ". "
                + "[가이드라인 준수 여부] K-ESG 기준 " + grade + "등급 수준으로 평가됨. "
                + "[성과 평가] " + (snippet.isBlank() ? "세부 지표 분석 결과를 참고하세요." : snippet) + " "
                + "[개선 제언] 세부 지표별 권고사항을 참고하세요.";

        String recommendation = indicators.stream()
                .filter(r -> r.score < 70 && r.recommendation != null && !r.recommendation.isBlank())
                .map(r -> r.recommendation)
                .findFirst()
                .orElse(category + " 영역의 현재 성과를 유지하고, 미달 지표를 중심으로 지속적 개선을 권고합니다.");

        List<Map<String, Object>> subIndicators = indicators.stream()
                .map(r -> {
                    Map<String, Object> sub = new LinkedHashMap<>();
                    sub.put("title", r.key.contains("_") ? r.key.split("_", 2)[1] : r.key);
                    sub.put("kesgCode", r.kesgCode);
                    sub.put("score", r.score);
                    sub.put("grade", r.grade);
                    sub.put("comment", r.comment);
                    sub.put("confidenceScore", r.confidenceScore);
                    sub.put("evidenceText", r.evidenceText);
                    sub.put("pageNumber", r.pageNumber > 0 ? r.pageNumber : null);
                    return sub;
                })
                .collect(Collectors.toList());

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("category", category);
        section.put("score", score);
        section.put("grade", grade);
        section.put("comment", categoryComment);
        section.put("recommendation", recommendation);
        section.put("subIndicators", subIndicators);
        sections.add(section);
    }

    // ── 진단 리포트 헬퍼 메서드 ─────────────────────────────────────────────

    private String buildOverallOpinionText(int eScore, String eGrade,
                                           int sScore, String sGrade, int rawSScore,
                                           int gScore, String gGrade,
                                           int finalScoreInt, String finalGrade, long cappedBonus) {
        String assessment = switch (finalGrade) {
            case "A" -> "전반적인 ESG 공시 수준이 우수하며, 지표 관리 상태가 양호합니다. 업계 선도적 수준으로 지속 유지를 권고합니다.";
            case "B" -> "핵심 지표 공시는 충실하나, 일부 영역에서 전략적 보완이 필요합니다. 미달 지표 집중 개선 시 A등급 달성이 가능합니다.";
            case "C" -> "정량적 공시 수준이 미흡한 영역이 다수 확인됩니다. 중장기 ESG 전략 수립 및 공시 체계 강화가 시급합니다.";
            default  -> "ESG 관련 공시 데이터가 현저히 부족하여 체계적 관리 시스템 구축이 필요합니다. 즉각적인 개선 조치를 강력히 권고합니다.";
        };

        StringBuilder sb = new StringBuilder();
        sb.append(String.format(
                "본 기업의 ESG 경영 체력을 K-ESG 가이드라인(산업통상자원부, 2021) 기준으로 정밀 진단한 결과, "
                        + "환경(E) **%d점(%s등급)**, 사회(S) **%d점(%s등급)**, 지배구조(G) **%d점(%s등급)**으로, "
                        + "가중평균(E×40%% + S×30%% + G×30%%) 적용 종합 **%d점(%s등급)**으로 평가됩니다.\n\n%s",
                eScore, eGrade, sScore, sGrade, gScore, gGrade, finalScoreInt, finalGrade, assessment));

        if (cappedBonus > 0) {
            String preSGrade = scoreToGrade(rawSScore);
            int preFinalScore = (int) Math.round(eScore * 0.4 + rawSScore * 0.3 + gScore * 0.3);
            String preFinalGrade = scoreToGrade(preFinalScore);
            sb.append(String.format(
                    "\n\n**[에코포인트 가산 효과 — 투명성 공시]** 임직원 에코포인트 활동으로 "
                            + "사회(S) 순수 분석점수 %d점(%s등급)에 **+%d점** 가산 반영되었습니다. "
                            + "포인트 가산 전 종합 **%s등급** → 가산 후 **%s등급**으로 평가 변화.",
                    rawSScore, preSGrade, cappedBonus, preFinalGrade, finalGrade));
        }
        return sb.toString();
    }

    private String buildIndicatorDiagnosisText(List<IndicatorResult> results) {
        StringBuilder sb = new StringBuilder();
        for (IndicatorResult r : results) {
            String name = r.key.contains("_") ? r.key.split("_", 2)[1] : r.key;
            sb.append(String.format("**[%s] %s** — %d점 (%s등급, 신뢰도 %d%%)\n",
                    r.kesgCode, name, r.score, r.grade, r.confidenceScore));
            sb.append(r.comment).append("\n");
            if (r.evidenceText != null && !r.evidenceText.isBlank()) {
                String pageRef = r.pageNumber > 0 ? " (p." + r.pageNumber + ")" : "";
                sb.append(String.format("> 📄 원문 근거: \"%s\"%s\n", r.evidenceText, pageRef));
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private String buildRiskOpportunityText(List<IndicatorResult> results) {
        StringBuilder sb = new StringBuilder();

        sb.append("### 🔴 Red Flag (위험 요소)\n\n");
        List<IndicatorResult> redFlags = results.stream()
                .filter(r -> r.score < 50)
                .sorted(Comparator.comparingInt(r -> r.score))
                .collect(Collectors.toList());
        if (redFlags.isEmpty()) {
            sb.append("- D등급 지표 없음. 현재 수준 유지를 권고합니다.\n");
        } else {
            redFlags.forEach(r -> {
                String name = r.key.contains("_") ? r.key.split("_", 2)[1] : r.key;
                sb.append(String.format("- **[%s] %s** (%d점): %s\n",
                        r.kesgCode, name, r.score, r.recommendation));
            });
        }

        sb.append("\n### 🟢 Opportunity (개선 처방전)\n\n");
        List<IndicatorResult> opportunities = results.stream()
                .filter(r -> r.score >= 50 && r.score < 70)
                .sorted(Comparator.comparingInt((IndicatorResult r) -> r.score).reversed())
                .collect(Collectors.toList());
        if (opportunities.isEmpty()) {
            sb.append("- C등급 지표 없음. 상위 등급 도전을 권고합니다.\n");
        } else {
            opportunities.forEach(r -> {
                String name = r.key.contains("_") ? r.key.split("_", 2)[1] : r.key;
                sb.append(String.format("- **[%s] %s** (%d점 → B등급 목표): %s\n",
                        r.kesgCode, name, r.score, r.recommendation));
            });
        }
        return sb.toString();
    }

    private List<Map<String, Object>> buildEvidenceMapping(List<IndicatorResult> results) {
        return results.stream()
                .map(r -> {
                    String name = r.key.contains("_") ? r.key.split("_", 2)[1] : r.key;
                    String consistency = r.confidenceScore >= 80 ? "High"
                            : r.confidenceScore >= 60 ? "Medium" : "Low";
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("indicator", name);
                    item.put("kesgCode", r.kesgCode);
                    // evidence 없는 지표도 포함 (null → UI에서 "—" 표시)
                    item.put("evidence", (r.evidenceText != null && !r.evidenceText.isBlank())
                            ? r.evidenceText : null);
                    item.put("page", r.pageNumber > 0 ? r.pageNumber : null);
                    item.put("consistency", consistency);
                    item.put("confidenceScore", r.confidenceScore);
                    item.put("score", r.score);
                    item.put("grade", r.grade);
                    return item;
                })
                .collect(Collectors.toList());
    }

    private String resolveKesgCode(String indicatorKey) {
        if (indicatorKey == null || indicatorKey.length() < 2) return "K-ESG";
        String prefix = indicatorKey.substring(0, 2).toUpperCase();
        return KESG_CODE_MAP.getOrDefault(prefix, indicatorKey);
    }
    // OpenAI API 호출 (Circuit Breaker 적용 — EcoCommit 전용)
    // ═══════════════════════════════════════════════════════════════════════

    @CircuitBreaker(name = "openaiAnalysis", fallbackMethod = "fallbackOpenAiAnalysis")
    public String callOpenAiWithCircuitBreaker(String prompt) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(openAiApiKey);

        Map<String, Object> requestMap = Map.of(
                "model", openAiModel,
                "messages", List.of(
                        Map.of("role", "system", "content",
                                "You are a Korean ESG analyst. Output ONLY valid JSON matching the exact structure specified. No markdown, no explanation, no code blocks."),
                        Map.of("role", "user", "content", prompt)
                ),
                "response_format", Map.of("type", "json_object"),
                "temperature", 0.0,
                "max_tokens", 4000
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestMap, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(OPENAI_API_URL, entity, String.class);
        return parseOpenAiResponse(response.getBody());
    }

    private String parseOpenAiResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        return root.path("choices").get(0).path("message").path("content").asText();
    }

    public String fallbackOpenAiAnalysis(String prompt, Exception e) {
        log.error("[OpenAI Fallback] 사유:{}", e.getMessage());
        return "{\"finalGrade\":\"C\",\"fullReport\":\"서비스 지연으로 인한 임시 리포트입니다. 잠시 후 재분석을 시도하세요.\","
                + "\"sections\":["
                + "{\"category\":\"Environment\",\"score\":30,\"grade\":\"D\",\"comment\":\"[현황 분석] 서비스 오류로 분석 불가. [가이드라인 준수 여부] 확인 불가. [성과 평가] 재분석 필요. [개선 제언] 재분석 후 확인.\",\"recommendation\":\"재분석 필요\",\"subIndicators\":[]},"
                + "{\"category\":\"Social\",\"score\":30,\"grade\":\"D\",\"comment\":\"[현황 분석] 서비스 오류로 분석 불가. [가이드라인 준수 여부] 확인 불가. [성과 평가] 재분석 필요. [개선 제언] 재분석 후 확인.\",\"recommendation\":\"재분석 필요\",\"subIndicators\":[]},"
                + "{\"category\":\"Governance\",\"score\":30,\"grade\":\"D\",\"comment\":\"[현황 분석] 서비스 오류로 분석 불가. [가이드라인 준수 여부] 확인 불가. [성과 평가] 재분석 필요. [개선 제언] 재분석 후 확인.\",\"recommendation\":\"재분석 필요\",\"subIndicators\":[]}"
                + "]}";
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
        log.info("[EcoCommit] 시작 analysisId:{} EP:{} 탄소:{}kg 소나무:{}그루",
                analysisId, request.getEcoPoints(), request.getCarbonReductionKg(), request.getEquivalentTrees());

        RLock lock = redissonClient.getLock(LOCK_PREFIX + companyId);
        boolean lockAcquired = false;

        try {
            lockAcquired = lock.tryLock(10, 300, TimeUnit.SECONDS);
            if (!lockAcquired) {
                log.warn("[EcoCommit 분산 락 실패] 기업ID:{}", companyId);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
                return;
            }

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "PREPROCESSING");
            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "AI_ANALYZING");

            String ecoPrompt = buildEcoCommitPrompt(request.getEcoPoints(),
                    request.getCarbonReductionKg(), request.getEquivalentTrees(),
                    request.getEBonus(), request.getSBonus());

            String cleanJsonResponse = callOpenAiWithCircuitBreaker(ecoPrompt);

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "MERGING_SCORE");

            AnalysisResultCache resultDto = objectMapper.readValue(cleanJsonResponse, AnalysisResultCache.class);
            resultDto.setAnalysisId(analysisId);
            resultDto.setAnalyzedAt(LocalDateTime.now().toString());
            resultDto.setEcoPoints(request.getEcoPoints());
            resultDto.setCarbonReductionKg(request.getCarbonReductionKg());
            resultDto.setEquivalentTrees(request.getEquivalentTrees());

            AnalysisReport report = analysisReportRepository.findById(analysisId)
                    .orElseThrow(() -> new IllegalArgumentException("리포트 없음: " + analysisId));

            String enrichedJson = objectMapper.writeValueAsString(resultDto);
            report.completeWithEco(enrichedJson, resultDto.getFinalGrade(),
                    request.getEcoPoints(), request.getCarbonReductionKg(), request.getEquivalentTrees());
            analysisReportRepository.saveAndFlush(report);

            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETE");
            log.info("[EcoCommit] 완료 등급:{} 소나무:{}그루", resultDto.getFinalGrade(), request.getEquivalentTrees());

        } catch (Exception e) {
            log.error("[EcoCommit] 처리 실패 analysisId:{} 원인:{}", analysisId, e.getMessage());
            handleAnalysisFailure(companyId, analysisId);
        } finally {
            if (lockAcquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    private String buildEcoCommitPrompt(Long ecoPoints,
                                        double carbonKg, double trees, int eBonus, int sBonus) {
        return String.format(
                "당신은 K-ESG 지침(산업통상자원부, 2021) 전문 ESG 애널리스트입니다.\n\n"
                        + "[임직원 에코 포인트 성과 확정 데이터]\n"
                        + "- 기업 전체 에코 포인트 합계: %,d EP\n"
                        + "- 탄소 절감량 환산 (1,000 EP = 1 kg): %.1f kg CO₂eq\n"
                        + "- 소나무 식재 효과 (6.6 kg = 1그루): %.1f그루\n"
                        + "- 환경(E) 점수 보정: +%d점\n"
                        + "- 사회(S) 점수 보정: +%d점 (임직원 자발적 참여 지표)\n\n"
                        + "[분석 지시사항]\n"
                        + "1. 에코 포인트 성과를 K-ESG 환경(E) 및 사회(S) 공식 성과로 반영하세요.\n"
                        + "2. 환경(E) 점수: 에코포인트 성과 기반 +%d점 가산 (최대 100점).\n"
                        + "3. 사회(S) 점수: 임직원 자발적 참여 지표로 +%d점 가산 (최대 100점).\n"
                        + "4. [현황 분석] → [가이드라인 준수 여부] → [성과 평가] → [개선 제언] 순서로 comment를 작성하세요.\n"
                        + "5. fullReport에 '임직원 에코 포인트 %,d EP → 탄소 %.1f kg 절감 → 소나무 %.1f그루 식재 효과' 문구를 반드시 포함하세요.\n"
                        + "6. fullReport는 '## [종합 소견]', '## [지표별 정밀 진단]', '## [Risk & Opportunity]' 마크다운 섹션 순서로 구성하세요.\n"
                        + "7. [종합 소견]에 '에코포인트 가산 전 E점수 (E보정전점수)점([등급]) → 가산 후 (E보정후점수)점([등급])' 형식으로 등급 변화를 명시하세요.\n"
                        + "8. finalGrade: E×40%% + S×30%% + G×30%% 가중평균, 등급 기준: 90+ A, 70~89 B, 50~69 C, 50미만 D\n\n"
                        + "[출력 규칙]\n"
                        + "마크다운 코드블록(```json) 없이 순수 JSON만 반환하세요.\n\n"
                        + "[응답 JSON 구조]\n"
                        + "{\n"
                        + "  \"finalGrade\": \"A|B|C|D\",\n"
                        + "  \"fullReport\": \"E점수 X점(등급), S점수 Y점(등급), G점수 Z점(등급). 에코 포인트 성과 반영 종합 분석...\",\n"
                        + "  \"sections\": [\n"
                        + "    {\"category\": \"Environment\", \"score\": 0, \"grade\": \"A|B|C|D\", \"comment\": \"[현황 분석]...[가이드라인 준수 여부]...[성과 평가]...[개선 제언]...\", \"recommendation\": \"...\", \"subIndicators\": []},\n"
                        + "    {\"category\": \"Social\",       \"score\": 0, \"grade\": \"A|B|C|D\", \"comment\": \"[현황 분석]...[가이드라인 준수 여부]...[성과 평가]...[개선 제언]...\", \"recommendation\": \"...\", \"subIndicators\": []},\n"
                        + "    {\"category\": \"Governance\",   \"score\": 0, \"grade\": \"A|B|C|D\", \"comment\": \"[현황 분석]...[가이드라인 준수 여부]...[성과 평가]...[개선 제언]...\", \"recommendation\": \"...\", \"subIndicators\": []}\n"
                        + "  ]\n"
                        + "}",
                ecoPoints, carbonKg, trees, eBonus, sBonus,
                eBonus, sBonus,
                ecoPoints, carbonKg, trees
        );
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
