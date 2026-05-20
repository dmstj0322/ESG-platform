package com.esg.analysis.service;

import com.esg.analysis.dto.CategoryAnalysisResponse;
import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.domain.ESGIndicator;
import com.esg.analysis.service.repository.ESGIndicatorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * E / S / G 카테고리 단독 분석 서비스.
 *
 * <pre>
 * 점수 산출 공식:
 *   PDF 업로드 있음: finalScore = ragScore×0.6 + checklistScore×0.4
 *   PDF 없음:        finalScore = checklistScore
 *
 * ragScore     = 카테고리 지표별 ESGScoreCalculator 평균
 * checklistScore = (체크된 항목 수 / 전체 항목 수) × 100
 * </pre>
 *
 * ─ E 카테고리 특별 정책 ──────────────────────────────────────────────
 * E 지표는 정책 문서보다 "정량 수치 증빙"이 핵심이므로
 * Numeric Match 결과를 indicator score의 직접 근거로 사용합니다.
 * semantic evidence가 없어도 수치 검증이 통과하면 점수를 부여합니다.
 *
 * <pre>
 * Numeric Match → Indicator Score / Confidence:
 *   HIGH   → score 90~95 / conf 85   (diff ≤ 5%)
 *   MEDIUM → score 60~65 / conf 60   (diff ≤ 15%)
 *   LOW    → score 20    / conf ≤ 40 (diff > 15%) + 기존 warning·ceiling 유지
 * </pre>
 * ─────────────────────────────────────────────────────────────────────
 *
 * Confidence 계산:
 *   RAG 있음: ConfidenceService 평균 (0~100) / E 카테고리는 위 정책 우선
 *   RAG 없음: checklistScore의 75% + 15 (최대 90, 최소 15)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryAnalysisService {

    private final UpstageService            upstageService;
    private final ReportRagService          reportRagService;
    private final ConfidenceService         confidenceService;
    private final ESGScoreCalculator        scoreCalculator;
    private final ESGIndicatorRepository    indicatorRepository;
    private final NumericExtractionService  numericExtractionService;

    /**
     * @param category         "E" / "S" / "G"
     * @param checklistAnswers 체크리스트 응답 Map
     * @param checkedCount     checked 항목 수
     * @param totalItems       전체 항목 수
     * @param file             증빙 PDF (nullable — 없으면 체크리스트 전용)
     * @param eMetricInputs    E 지표 수치 입력값 (category=E 일 때만 사용, 그 외 null/empty)
     *                         key: "electricity"|"gas"|"carbon"|"waste"|"water", value: 사용자 입력 수치
     */
    public CategoryAnalysisResponse analyze(String category,
                                            Map<String, Boolean> checklistAnswers,
                                            int checkedCount, int totalItems,
                                            MultipartFile file,
                                            Map<String, Double> eMetricInputs,
                                            String ksicCode,
                                            String envMode) {

        int checklistScore = computeChecklistScore(checkedCount, totalItems);
        log.info("[CATEGORY-START] category={} checklistScore={} hasFile={} eMetricInputsSize={} ksicCode={} envMode={}",
                category, checklistScore, file != null && !file.isEmpty(),
                eMetricInputs != null ? eMetricInputs.size() : -1, ksicCode, envMode);

        // S/G 카테고리: 증빙 PDF 없으면 분석 자체를 차단 (점수·등급·신뢰도 생성 금지)
        if (("S".equalsIgnoreCase(category) || "G".equalsIgnoreCase(category))
                && (file == null || file.isEmpty())) {
            log.warn("[CATEGORY-SKIPPED] category={} reason=SG_NO_FILE", category);
            throw new IllegalArgumentException("S/G 카테고리 분석에는 증빙 PDF 업로드가 필요합니다.");
        }

        // ── E 카테고리 파일 없음 경로 ──────────────────────────────────────────
        // ESG 점수는 오직 사용자 입력 데이터(PDF/CSV/체크리스트)만 기반으로 산출.
        // 업종 benchmark는 비교 분석 전용이며 점수 계산에 개입하지 않음.
        if ("E".equalsIgnoreCase(category) && (file == null || file.isEmpty())) {
            boolean hasMetrics = eMetricInputs != null && !eMetricInputs.isEmpty();
            if ("MANUAL".equalsIgnoreCase(envMode) && !hasMetrics) {
                log.warn("[MANUAL-VALIDATION] REJECTED category=E envMode=MANUAL hasFile=false hasMetrics=false");
                throw new IllegalArgumentException("MANUAL mode requires ESG data input.");
            }
            // 파일 없음 → 체크리스트 기반 점수만 사용 (benchmark 추정값 미사용)
            log.info("[E-NO-FILE] category=E 파일 없음 → 체크리스트 점수만 적용 checklistScore={}", checklistScore);
            return buildChecklistOnlyResult(checklistScore, totalItems, checkedCount);
        }

        // ── 비E 파일 없음 (방어 경로) ──────────────────────────────────────────
        if (file == null || file.isEmpty()) {
            log.info("[CATEGORY-SKIPPED] category={} reason=NO_FILE → checklist-only", category);
            return buildChecklistOnlyResult(checklistScore, totalItems, checkedCount);
        }

        // ── RAG 분석 경로 ───────────────────────────────────────────────────
        List<ESGIndicator> indicators = indicatorRepository.findAllByOrderByCategoryAscCodeAsc().stream()
                .filter(i -> category.equalsIgnoreCase(i.getCategory()))
                .collect(Collectors.toList());

        log.info("[INDICATOR-COUNT] category={} indicatorCount={} indicatorCodes={}",
                category, indicators.size(),
                indicators.stream().map(ESGIndicator::getCode).collect(Collectors.toList()));

        if (indicators.isEmpty()) {
            log.warn("[CATEGORY-SKIPPED] category={} reason=NO_INDICATORS_IN_DB", category);
            return buildChecklistOnlyResult(checklistScore, totalItems, checkedCount);
        }

        String sessionId = UUID.randomUUID().toString();
        try {
            // 1. 파일 형식 분기: E 카테고리 + CSV → Upstage 호출 금지, 직접 파싱
            String markdown;
            if ("E".equalsIgnoreCase(category) && isCsvFile(file)) {
                log.info("[CategoryAnalysis] CSV direct parsing mode enabled file={}", file.getOriginalFilename());
                markdown = parseCsvToMarkdown(file);
                log.info("[CategoryAnalysis] CSV markdown generated len={}", markdown.length());
                log.info("[CategoryAnalysis] CSV markdown generated content=\n{}", markdown);
            } else {
                log.info("[CategoryAnalysis] Upstage OCR 시작 file={}", file.getOriginalFilename());
                markdown = upstageService.parsePdfToMarkdown(file);
                log.info("[CategoryAnalysis] OCR 완료 markdownLen={}", markdown.length());
            }

            // 2. ChromaDB 인덱싱
            reportRagService.indexReport(sessionId, markdown);
            log.info("[CategoryAnalysis] 인덱싱 완료 sessionId={}", sessionId);

            // 3. 지표별 Retrieval + Scoring
            List<Integer> ragScores   = new ArrayList<>();
            List<Integer> confidences = new ArrayList<>();
            List<CategoryAnalysisResponse.EvidenceItem> evidenceItems = new ArrayList<>();
            int lowCount            = 0;
            int highMatchCount      = 0;
            int mediumMatchCount    = 0;
            int numericMatchedCount = 0; // numeric match 성공 지표 수 (E 카테고리 finalScore 공식 분기용)
            int sgValidEvidenceCount = 0; // 구 공식 호환 유지 (신규 공식에서 미사용)

            // ── 신뢰도·evidence 품질 추적 변수 ────────────────────────────────
            int evidencedIndicatorCount = 0;           // 유효 evidence가 있는 지표 수
            List<Double> allValidSimilarities = new ArrayList<>(); // 전체 유효 evidence similarity
            int ragChunkCount = 0;                     // 실제 RAG 청크 수 (synthetic numeric-only 제외)
            int sgMismatchCount = 0;                   // S/G 체크리스트 vs evidence 충돌 수
            int contradictionTypeCount = 0;            // EVIDENCE_CONTRADICTION + NEGATIVE_SIGNAL_DETECTED 총 건수
            Set<Integer> allUniquePages = new java.util.HashSet<>(); // 카테고리 전체 고유 page 집합
            List<CategoryAnalysisResponse.IndicatorBreakdown> indicatorBreakdowns = new ArrayList<>();

            Map<String, String> titleMap = indicators.stream()
                    .collect(Collectors.toMap(ESGIndicator::getCode, ESGIndicator::getTitle));

            // E 카테고리이면 사용자 입력값 유무와 관계없이 항상 문서 수치 추출 활성화
            boolean hasEMetrics = "E".equalsIgnoreCase(category);
            log.info("[INDICATOR-INIT] category={} hasEMetrics={} userInputKeys={}",
                    category, hasEMetrics,
                    eMetricInputs != null ? eMetricInputs.keySet() : "null");

            // ── E 수치 검증: 전체 마크다운에서 5개 메트릭 선(先)추출 ────────────
            // 사용자 입력값 유무와 무관하게 항상 스캔 (fallback 맵 생성)
            Map<String, Double> markdownExtracted = new HashMap<>();
            if (hasEMetrics) {
                for (String metric : List.of("electricity", "gas", "carbon", "waste", "water")) {
                    numericExtractionService.extractFromText(markdown, metric)
                            .filter(v -> v > 0)
                            .ifPresent(v -> markdownExtracted.put(metric, v));
                }
                log.info("[NumericMatch] 마크다운 선추출 완료: {}", markdownExtracted);
            }

            log.info("[RAG-STAGE] evidence mapping started category={} indicatorCount={}", category, indicators.size());

            for (ESGIndicator indicator : indicators) {
                log.info("[INDICATOR-ID] category={} indicator={} title='{}'",
                        category, indicator.getCode(), indicator.getTitle());
                log.info("[RAG-STAGE] indicator scoring started indicator={} title='{}'",
                        indicator.getCode(), indicator.getTitle());
                List<EvidenceResult> evidences;
                try {
                    evidences = reportRagService.retrieveEvidenceForIndicator(sessionId, indicator, 3, category);
                } catch (Exception retrivalEx) {
                    log.error("[RAG-STAGE] retrieval FAILED indicator={} — 해당 지표 기본값 사용",
                            indicator.getCode(), retrivalEx);
                    ragScores.add(computeChecklistScore(checkedCount, totalItems));
                    confidences.add(0);
                    continue;
                }
                log.info("[RAG-STAGE] retrieval completed indicator={} retrieved={}", indicator.getCode(), evidences.size());

                // ── 유효 evidence 집계 (isValidEvidence + SIM_LOW 기준) ──────────────
                List<EvidenceResult> validEvidences = evidences.stream()
                        .filter(EvidenceResult::isValidEvidence)
                        .filter(ev -> ev.getSimilarity() >= EsgScoreConstants.SIM_LOW)
                        .collect(Collectors.toList());

                // ── Semantic dedup: 동일 단락 반복 retrieval로 인한 coverage 과대평가 방지 ─
                List<EvidenceResult> dedupedEvidences = deduplicateEvidencesForIndicator(validEvidences);
                int uniquePageCount = computeUniquePageCount(dedupedEvidences);
                dedupedEvidences.stream().mapToInt(EvidenceResult::getPageNumber).filter(p -> p > 0).forEach(allUniquePages::add);
                if (!dedupedEvidences.isEmpty()) evidencedIndicatorCount++;
                dedupedEvidences.forEach(ev -> allValidSimilarities.add(ev.getSimilarity()));
                ragChunkCount += dedupedEvidences.size();

                log.info("[RAG-STAGE] contradiction check started indicator={} validEv={}",
                        indicator.getCode(), dedupedEvidences.size());

                // ── S/G: 체크리스트 claim + 충돌 검사 (score 계산 전 선행) ─────────
                boolean sgUserClaims = false;
                String sgMismatchType = null;
                if (!hasEMetrics) {
                    java.util.Optional<String> ckKey = EsgScoreConstants.CHECKLIST_TO_INDICATOR.entrySet().stream()
                            .filter(entry -> entry.getValue().equals(indicator.getCode()))
                            .map(java.util.Map.Entry::getKey)
                            .findFirst();
                    if (ckKey.isPresent()) {
                        // getOrDefault 는 키가 존재하지만 값이 null인 경우 null을 반환
                        // → primitive boolean 자동 언박싱 시 NPE 발생. Boolean.TRUE.equals 로 null-safe 처리
                        sgUserClaims = Boolean.TRUE.equals(checklistAnswers.get(ckKey.get()));
                        boolean hasStrongEvidence = dedupedEvidences.stream()
                                .anyMatch(ev -> ev.getSimilarity() >= EsgScoreConstants.SIM_MEDIUM);
                        boolean isNegativePolarity = EsgScoreConstants.NEGATIVE_POLARITY_INDICATORS.contains(indicator.getCode());
                        if (sgUserClaims && dedupedEvidences.isEmpty()) {
                            sgMismatchType = "CHECKLIST_NO_EVIDENCE";
                            sgMismatchCount++;
                            log.debug("[SgMismatch] indicator={} CHECKLIST_NO_EVIDENCE (user=true, ev=0)", indicator.getCode());
                        } else if (!sgUserClaims && hasStrongEvidence && !isNegativePolarity) {
                            sgMismatchType = "EVIDENCE_CONTRADICTION";
                            sgMismatchCount++;
                            contradictionTypeCount++;
                            log.debug("[SgMismatch] indicator={} EVIDENCE_CONTRADICTION (user=false, strongEv=true)", indicator.getCode());
                        } else if (sgUserClaims && hasStrongEvidence && isNegativePolarity) {
                            sgMismatchType = "NEGATIVE_SIGNAL_DETECTED";
                            sgMismatchCount++;
                            contradictionTypeCount++;
                            log.debug("[SgMismatch] indicator={} NEGATIVE_SIGNAL_DETECTED (negative polarity confirmed by evidence)", indicator.getCode());
                        }
                    }
                }

                // ── Score / Confidence 계산 ────────────────────────────────────
                int conf  = confidenceService.calculate(indicator, evidences);
                int score;
                if (hasEMetrics) {
                    // E: RAG score 또는 체크리스트 기여 (아래 numeric match에서 override 가능)
                    score = conf >= 30 ? scoreCalculator.calculate(indicator, evidences)
                                       : computeChecklistContribution(checklistAnswers, indicator, checkedCount, totalItems);
                } else {
                    // S/G: evidence quality + page diversity 기반 hybrid scoring
                    score = computeSgIndicatorScore(sgUserClaims, dedupedEvidences, uniquePageCount, sgMismatchType);
                }

                // ── E 지표 수치 검증 (Numeric Matching) ────────────────────────
                NumericExtractionService.MatchResult numericMatch = null;
                double inputVal     = 0.0;
                double extractedVal = 0.0;
                String numericMetric = null;

                if (hasEMetrics) {
                    numericMetric = numericExtractionService.indicatorCodeToMetric(indicator.getCode());
                    boolean userInputProvided = numericMetric != null
                            && eMetricInputs != null
                            && eMetricInputs.containsKey(numericMetric)
                            && eMetricInputs.get(numericMetric) != null
                            && eMetricInputs.get(numericMetric) > 0;
                    log.info("[E-INDICATOR] indicator={} metricType={} extractionEnabled={} userInputProvided={}",
                            indicator.getCode(),
                            numericMetric != null ? numericMetric : "none",
                            numericMetric != null,
                            userInputProvided);

                    if (numericMetric != null) {
                        inputVal = userInputProvided ? eMetricInputs.get(numericMetric) : 0.0;

                        // 1차: Evidence 텍스트 합산에서 추출
                        String combinedText = evidences.stream()
                                .map(EvidenceResult::getEvidenceText)
                                .collect(Collectors.joining(" "));
                        log.info("[E-METRIC-ENTRY] indicator={} metric={} combinedTextLen={} preview='{}'",
                                indicator.getCode(), numericMetric, combinedText.length(),
                                combinedText.length() > 120 ? combinedText.substring(0, 120) + "..." : combinedText);
                        java.util.Optional<Double> extracted =
                                numericExtractionService.extractFromText(combinedText, numericMetric);

                        // 2차 fallback: 전체 마크다운 선추출 결과 사용
                        if (!extracted.isPresent() && markdownExtracted.containsKey(numericMetric)) {
                            extracted = java.util.Optional.of(markdownExtracted.get(numericMetric));
                            log.info("[NumericMatch] 마크다운 fallback 사용 metric={} value={}", numericMetric, markdownExtracted.get(numericMetric));
                        }

                        if (extracted.isPresent()) {
                            extractedVal = extracted.get();
                            long validEvCount  = evidences.stream().filter(EvidenceResult::isValidEvidence).count();
                            int  evidenceBonus = (int) Math.min(5, validEvCount * 2);

                            if (userInputProvided) {
                                // 사용자 입력값 vs 추출값 비교 모드
                                numericMatch = numericExtractionService.compare(inputVal, extractedVal);
                                log.info("[NumericMatch] indicator={} metric={} input={} extracted={} diff={}% level={}",
                                        indicator.getCode(), numericMetric, inputVal, extractedVal,
                                        numericMatch.diffPercent(), numericMatch.level());

                                if (numericMatch.isHigh()) {
                                    score = Math.min(100, 90 + evidenceBonus);
                                    conf  = 85;
                                    highMatchCount++;
                                } else if (numericMatch.isMedium()) {
                                    score = Math.min(100, 60 + evidenceBonus);
                                    conf  = 60;
                                    mediumMatchCount++;
                                } else { // LOW
                                    score = 20;
                                    conf  = 25;
                                }
                                if (numericMatch.isLow())         conf = Math.min(conf, 40);
                                else if (numericMatch.isMedium()) conf = Math.min(conf, 70);
                            } else {
                                // 사용자 입력 없음 — 문서에서 수치 발견 → MEDIUM evidence 처리
                                numericMatch = new NumericExtractionService.MatchResult("MEDIUM", 0.0);
                                score = Math.min(100, 60 + evidenceBonus);
                                conf  = 55;
                                mediumMatchCount++;
                                log.info("[NumericMatch] indicator={} metric={} 사용자입력없음 문서추출값={} → MEDIUM",
                                        indicator.getCode(), numericMetric, extractedVal);
                            }

                            numericMatchedCount++;
                            log.info("[NumericScore] indicator={} level={} diff={}% assignedScore={}",
                                    indicator.getCode(), numericMatch.level(),
                                    numericMatch.diffPercent(), score);
                            log.info("[E-METRIC-RESULT] metric={} value={} success=true indicator={}",
                                    numericMetric, extractedVal, indicator.getCode());
                        } else {
                            log.warn("[NumericMatch] 수치 추출 실패 indicator={} metric={} input={} unit={}",
                                    indicator.getCode(), numericMetric, inputVal,
                                    numericExtractionService.metricUnit(numericMetric));
                            // ── Narrative E partial credit ────────────────────────────
                            // 수치 추출 실패 but 서술형 환경 증거 존재 시 부분 점수 인정
                            // greenwashing 방지: max 50점, conf max 35
                            if (!dedupedEvidences.isEmpty()) {
                                double narrativeSim = dedupedEvidences.stream()
                                        .mapToDouble(EvidenceResult::getSimilarity).average().orElse(0.0);
                                if (narrativeSim >= EsgScoreConstants.SIM_MEDIUM) {
                                    int narrativeBase = (int) Math.round(narrativeSim * 60);
                                    score = Math.min(score, Math.min(50, narrativeBase));
                                    conf  = Math.min(conf, 35);
                                    log.info("[NarrativeE] indicator={} avgSim={} → narrativeScore={} conf={}",
                                            indicator.getCode(), String.format("%.3f", narrativeSim), score, conf);
                                }
                            }
                        }
                    }
                }

                if (numericMatch != null && numericMatch.isLow()) lowCount++;
                // S/G 카테고리: conf >= 30인 지표를 유효 evidence로 집계
                if (!hasEMetrics && conf >= 30) sgValidEvidenceCount++;
                ragScores.add(score);
                confidences.add(conf);

                // 상위 Evidence 수집 (유효한 것 우선, 최대 2개) + numericMatch 정보 포함
                final NumericExtractionService.MatchResult finalMatch  = numericMatch;
                final String  finalMetric   = numericMetric;
                final double  finalInput    = inputVal;
                final double  finalExtracted = extractedVal;

                // E 카테고리: semantic evidence 없어도 numeric match 결과를 evidence item으로 등록
                if (hasEMetrics && finalMatch != null && finalMetric != null) {
                    boolean semanticAdded = false;
                    for (EvidenceResult ev : evidences) {
                        if (ev.isValidEvidence()) {
                            evidenceItems.add(toEvidenceItemWithNumeric(
                                    ev, indicator.getCode(), titleMap.get(indicator.getCode()),
                                    finalMatch, finalMetric, finalInput, finalExtracted));
                            log.info("[E-EVIDENCE] indicator={} metric={} evidenceCreated=true type=semantic sim={}",
                                    indicator.getCode(), finalMetric, String.format("%.3f", ev.getSimilarity()));
                            semanticAdded = true;
                            break;
                        }
                    }
                    if (!semanticAdded) {
                        evidenceItems.add(buildNumericOnlyEvidenceItem(
                                indicator.getCode(), titleMap.get(indicator.getCode()),
                                finalMatch, finalMetric, finalInput, finalExtracted));
                        log.info("[E-EVIDENCE] indicator={} metric={} evidenceCreated=true type=numeric-only",
                                indicator.getCode(), finalMetric);
                    }
                } else if (hasEMetrics) {
                    log.warn("[E-EVIDENCE] indicator={} metric={} evidenceCreated=false reason=numeric-match-null",
                            indicator.getCode(), finalMetric != null ? finalMetric : "unknown");
                } else {
                    // S/G: 중복 제거된 evidence 사용 (최대 2건)
                    dedupedEvidences.stream()
                            .limit(2)
                            .map(ev -> toEvidenceItemWithNumeric(
                                    ev, indicator.getCode(), titleMap.get(indicator.getCode()),
                                    finalMatch, finalMetric, finalInput, finalExtracted))
                            .forEach(evidenceItems::add);
                }

                // ── IndicatorBreakdown 빌드 (deduped 기준) ──────────────────────────
                double indAvgSim = dedupedEvidences.isEmpty() ? 0.0
                        : dedupedEvidences.stream().mapToDouble(EvidenceResult::getSimilarity).average().orElse(0.0);
                boolean isSgMismatch = sgMismatchType != null;

                // similarity tier (avgSim + keyword awareness) — STRONG/MEDIUM/WEAK/LOW
                // STRONG: sim >= 0.78 AND keyword evidence confirmed
                // MEDIUM: sim >= 0.78 without keyword, OR sim >= 0.68 with keyword
                // WEAK:   sim >= 0.68, semantic-only (no keyword match)
                // LOW:    sim < 0.68
                String simTier = null;
                if (!dedupedEvidences.isEmpty()) {
                    boolean hasKeywordEvidence = dedupedEvidences.stream()
                            .anyMatch(ev -> (ev.getMatchedKeywords() != null && !ev.getMatchedKeywords().isEmpty())
                                    || (ev.getMatchedCluster() != null
                                            && !ev.getMatchedCluster().isBlank()
                                            && !"NO_GATE".equals(ev.getMatchedCluster())));
                    if      (indAvgSim >= 0.78 && hasKeywordEvidence) simTier = "STRONG";
                    else if (indAvgSim >= 0.78)                        simTier = "MEDIUM";
                    else if (indAvgSim >= 0.68 && hasKeywordEvidence)  simTier = "MEDIUM";
                    else if (indAvgSim >= 0.68)                        simTier = "WEAK";
                    else                                               simTier = "LOW";
                }

                // 최고 similarity evidence 앞 100자 (S/G만 노출, E는 numeric 기반이므로 생략)
                String evidenceSnippet = null;
                if (!hasEMetrics && !dedupedEvidences.isEmpty()) {
                    evidenceSnippet = dedupedEvidences.stream()
                            .max(java.util.Comparator.comparingDouble(EvidenceResult::getSimilarity))
                            .map(ev -> {
                                String t = ev.getEvidenceText();
                                if (t == null || t.isBlank()) return null;
                                String trimmed = t.trim();
                                return trimmed.length() > 100 ? trimmed.substring(0, 100) + "…" : trimmed;
                            })
                            .orElse(null);
                }

                // [DEBUG-385] IndicatorBreakdown 빌드 직전 — nullable Boolean 필드 값 추적
                log.info("[DEBUG-385] indicator={} isSgMismatch={} hasEvidence={} sgUserClaims={}" +
                                " evidenceCount={} hasEMetrics={} numericMatchNull={}",
                        indicator.getCode(), isSgMismatch, !dedupedEvidences.isEmpty(), sgUserClaims,
                        dedupedEvidences.size(), hasEMetrics, numericMatch == null);

                // numericVerified / mismatchDetected 모두 Boolean.valueOf() 또는 명시적 Boolean 리터럴 사용
                // 이유: 아래 ternary 의 true arm(boolean primitive) vs false arm(Boolean wrapper) 혼합 시
                // JLS 15.25.1 이 결과 타입을 boolean(primitive)으로 강제 → null Boolean 언박싱 → NPE
                Boolean numericVerifiedVal  = hasEMetrics
                        ? Boolean.valueOf(numericMatch != null && !numericMatch.isLow())
                        : null;
                Boolean mismatchDetectedVal = hasEMetrics
                        ? Boolean.valueOf(numericMatch != null && numericMatch.isLow())
                        : (isSgMismatch ? Boolean.TRUE : null);   // null 은 null type — Boolean으로 안전

                indicatorBreakdowns.add(CategoryAnalysisResponse.IndicatorBreakdown.builder()
                        .indicatorCode(indicator.getCode())
                        .indicatorTitle(indicator.getTitle())
                        .rawScore(score)
                        .hasEvidence(!dedupedEvidences.isEmpty())
                        .numericVerified(numericVerifiedVal)
                        .mismatchDetected(mismatchDetectedVal)
                        .mismatchType(hasEMetrics
                                ? (numericMatch != null && numericMatch.isLow() ? "NUMERIC_LOW" : null)
                                : sgMismatchType)
                        .avgSimilarity(dedupedEvidences.isEmpty() ? null : Math.round(indAvgSim * 1000.0) / 1000.0)
                        .evidenceCount(dedupedEvidences.size())
                        .uniquePageCount(uniquePageCount > 0 ? uniquePageCount : null)
                        .similarityTier(simTier)
                        .evidenceSnippet(evidenceSnippet)
                        .build());

                log.debug("[CategoryAnalysis] indicator={} ragScore={} conf={} validEv={} avgSim={}",
                        indicator.getCode(), score, conf, validEvidences.size(),
                        String.format("%.3f", indAvgSim));
            }

            log.info("[RAG-STAGE] grade calculation started category={} ragScores={} evidencedIndicators={}",
                    category, ragScores, evidencedIndicatorCount);

            // 4. 점수 집계
            int avgRag  = avg(ragScores);
            int avgConf = avg(confidences);

            // ── E 카테고리 신뢰도: numeric 검증 품질 × 85 + evidence 보너스 ──────
            // HIGH=1.0, MEDIUM=0.6, LOW=0.25, 추출실패=0.1 가중치
            // evidence가 많을수록 최대 10점 보너스 (신뢰도 90+ 가능)
            if (hasEMetrics && numericMatchedCount > 0) {
                int failedExtractCount = indicators.size() - numericMatchedCount;
                double numericScore = (highMatchCount * 1.0 + mediumMatchCount * 0.6
                        + lowCount * 0.25 + failedExtractCount * 0.1) / indicators.size();
                double evidenceBonus = Math.min(10.0, ragChunkCount * 2.0);
                avgConf = (int) Math.min(95, Math.round(numericScore * 85 + evidenceBonus));
                log.info("[ConfidenceCalc-E] high={} medium={} low={} failed={} numericScore={} ragChunks={} → avgConf={}",
                        highMatchCount, mediumMatchCount, lowCount, failedExtractCount,
                        String.format("%.3f", numericScore), ragChunkCount, avgConf);
            }

            // ── S/G 카테고리 신뢰도: avgSim×40 + coverage×30 + pageDiversity×15 + base15 ──
            // contradictionPenalty: contradiction 1건당 -10 (최대 -30)
            // checklist 비율 제거 → confidence 는 AI 검증 품질 독립 지표
            if (!hasEMetrics && !indicators.isEmpty()) {
                double catAvgSim     = allValidSimilarities.isEmpty() ? 0.0
                        : allValidSimilarities.stream().mapToDouble(d -> d).average().orElse(0.0);
                double coverageRatio = (double) evidencedIndicatorCount / indicators.size();
                double pageFactor    = Math.min(1.0, (double) allUniquePages.size() / 5.0);

                double rawConf            = catAvgSim * 40 + coverageRatio * 30 + pageFactor * 15 + 15;
                int contradictionPenalty  = Math.min(30, contradictionTypeCount * 10);

                avgConf = (int) Math.min(95, Math.max(10, Math.round(rawConf) - contradictionPenalty));
                log.info("[ConfidenceCalc-SG] coverage={}/{} catAvgSim={} uniquePages={} contradictions={} penalty={} → avgConf={}",
                        evidencedIndicatorCount, indicators.size(),
                        String.format("%.3f", catAvgSim),
                        allUniquePages.size(), contradictionTypeCount, contradictionPenalty, avgConf);

                // Fix #4/5: 유효 증빙 없음 → confidence 상한 제한 (self-report만 존재)
                if (evidencedIndicatorCount == 0) {
                    avgConf = Math.min(avgConf, 60);
                    log.info("[ConfidenceCeiling-ZeroCoverage] category={} evidencedIndicators=0 → avgConf capped 60", category);
                }
            }

            // ── 수치 불일치 기반 avgRag 가중 감산 ──────────────────────────────
            if (hasEMetrics && lowCount >= 4)      avgRag = Math.max(0, (int)(avgRag * 0.35));
            else if (hasEMetrics && lowCount >= 3) avgRag = Math.max(0, (int)(avgRag * 0.55));
            else if (hasEMetrics && lowCount >= 1) avgRag = Math.max(0, (int)(avgRag * 0.75));

            // ── finalScore 공식 분기 ────────────────────────────────────────
            int finalScore;
            if (hasEMetrics && numericMatchedCount > 0) {
                finalScore = Math.min(100, avgRag);
            } else if (!hasEMetrics) {
                finalScore = Math.min(100, avgRag);
            } else {
                // E + numeric 추출 전혀 실패 → Narrative E 처리
                double catNarrSim = allValidSimilarities.isEmpty() ? 0.0
                        : allValidSimilarities.stream().mapToDouble(d -> d).average().orElse(0.0);
                if (catNarrSim >= EsgScoreConstants.SIM_MEDIUM && evidencedIndicatorCount >= 2) {
                    // 서술형 환경 증거 충분 → 체크리스트 비중 상향, narrative cap 55
                    finalScore = Math.min(55, Math.round(avgRag * 0.50f + checklistScore * 0.50f));
                    log.info("[NarrativeE-Cat] numericFailed narrativeSim={} evidenced={} → finalScore={}",
                            String.format("%.3f", catNarrSim), evidencedIndicatorCount, finalScore);
                } else {
                    finalScore = Math.min(100, Math.round(avgRag * 0.6f + checklistScore * 0.4f));
                }
            }

            // ── S/G 점수 포화 방지 ──────────────────────────────────────────
            // strong evidence여도 기본적으로 88~95 수준 유지 (규칙 계산기 느낌 방지)
            // 98~100은 exceptional 6조건 동시 충족 시에만 허용
            if (!hasEMetrics && finalScore >= 96) {
                double catAvgSimForSat = allValidSimilarities.isEmpty() ? 0.0
                        : allValidSimilarities.stream().mapToDouble(d -> d).average().orElse(0.0);
                boolean hasLowTierForSat = indicatorBreakdowns.stream()
                        .anyMatch(bd -> "LOW".equals(bd.getSimilarityTier()));
                boolean exceptionalQualified = contradictionTypeCount == 0
                        && catAvgSimForSat >= 0.93
                        && ragChunkCount >= 6
                        && allUniquePages.size() >= 4
                        && !hasLowTierForSat;
                if (!exceptionalQualified) {
                    log.info("[ScoreSaturation] category={} raw={} → 95 cap (avgSim={} evidence={} pages={} contradictions={} lowTier={})",
                            category, finalScore, String.format("%.3f", catAvgSimForSat),
                            ragChunkCount, allUniquePages.size(), contradictionTypeCount, hasLowTierForSat);
                    finalScore = 95;
                }
            }

            String grade = EsgScoreConstants.toGrade(finalScore);

            // 5. Grade Ceiling: ≥1→B, ≥3→C, ≥4→D
            String gradeCeiling = lowCount >= 4 ? "D" : lowCount >= 3 ? "C" : lowCount >= 1 ? "B" : null;
            boolean ceilingApplied = false;
            if (gradeCeiling != null) {
                String capped = applyGradeCeiling(grade, gradeCeiling);
                ceilingApplied = !capped.equals(grade);
                grade = capped;
            }

            // ── Confidence Ceiling: 낮은 증빙 신뢰도 → 높은 등급 제한 ──────────
            // 체크리스트 점수가 높더라도 증빙 불충분(confidence 낮음) 시 과평가 방지
            if (avgConf < 35) {
                String before = grade;
                grade = applyGradeCeiling(grade, "C");
                if (!grade.equals(before)) {
                    ceilingApplied = true;
                    log.info("[ConfidenceCeiling] category={} rawScore={} confidence={} {} → {} (conf<35)",
                            category, finalScore, avgConf, before, grade);
                }
            } else if (avgConf < 50) {
                String before = grade;
                grade = applyGradeCeiling(grade, "B");
                if (!grade.equals(before)) {
                    ceilingApplied = true;
                    log.info("[ConfidenceCeiling] category={} rawScore={} confidence={} {} → {} (conf<50)",
                            category, finalScore, avgConf, before, grade);
                }
            }

            // ── S/G 등급 gating: evidence 품질 조건 미충족 시 상위 등급 제한 ─────
            if (!hasEMetrics) {
                double catAvgSim = allValidSimilarities.isEmpty() ? 0.0
                        : allValidSimilarities.stream().mapToDouble(d -> d).average().orElse(0.0);

                // S 등급: 모든 조건 동시 만족 필요 (strict gating)
                if ("S".equals(grade)) {
                    // LOW tier evidence가 하나라도 있으면 S 불가
                    boolean hasLowTierIndicator = indicatorBreakdowns.stream()
                            .anyMatch(bd -> "LOW".equals(bd.getSimilarityTier()));
                    // CHECKLIST_NO_EVIDENCE 있으면 S 불가
                    boolean hasNoEvIndicatorForS = indicatorBreakdowns.stream()
                            .anyMatch(bd -> "CHECKLIST_NO_EVIDENCE".equals(bd.getMismatchType()));

                    boolean sQualified = catAvgSim >= EsgScoreConstants.SIM_S_GATE
                            && ragChunkCount >= EsgScoreConstants.S_MIN_EVIDENCE
                            && allUniquePages.size() >= EsgScoreConstants.S_MIN_UNIQUE_PAGES
                            && contradictionTypeCount == 0
                            && !hasLowTierIndicator
                            && !hasNoEvIndicatorForS;
                    if (!sQualified) {
                        grade = "A";
                        ceilingApplied = true;
                        log.info("[GradeGating-S] category={} score={} catAvgSim={} evidence={} uniquePages={} contradictions={} lowTier={} noEv={} → S→A",
                                category, finalScore, String.format("%.3f", catAvgSim),
                                ragChunkCount, allUniquePages.size(), contradictionTypeCount,
                                hasLowTierIndicator, hasNoEvIndicatorForS);
                    }
                }

                // A 등급: avgSim≥0.70 필요
                if ("A".equals(grade) && catAvgSim < EsgScoreConstants.SIM_A_GATE) {
                    grade = "B";
                    ceilingApplied = true;
                    log.info("[GradeGating-A] category={} score={} catAvgSim={} < {} → A→B",
                            category, finalScore, String.format("%.3f", catAvgSim), EsgScoreConstants.SIM_A_GATE);
                }

                // CHECKLIST_NO_EVIDENCE ceiling: B
                boolean hasNoEvIndicator = indicatorBreakdowns.stream()
                        .anyMatch(bd -> "CHECKLIST_NO_EVIDENCE".equals(bd.getMismatchType()));
                if (hasNoEvIndicator) {
                    String before = grade;
                    grade = applyGradeCeiling(grade, "B");
                    if (!grade.equals(before)) {
                        ceilingApplied = true;
                        log.info("[GradeGating-NoEv] category={} CHECKLIST_NO_EVIDENCE detected → {} → B", category, before);
                    }
                }

                // Contradiction ceiling: B
                if (contradictionTypeCount > 0) {
                    String before = grade;
                    grade = applyGradeCeiling(grade, "B");
                    if (!grade.equals(before)) {
                        ceilingApplied = true;
                        log.info("[GradeGating-Contradiction] category={} contradictions={} → {} → B",
                                category, contradictionTypeCount, before);
                    }
                }

                // Fix #3: 모든 지표에 유효 증빙 없음 → grade ceiling C (자기보고만 존재)
                if (evidencedIndicatorCount == 0) {
                    String before = grade;
                    grade = applyGradeCeiling(grade, "C");
                    if (!grade.equals(before)) {
                        ceilingApplied = true;
                        log.info("[GradeGating-ZeroEvidence] category={} evidencedIndicators=0 → {} → C", category, before);
                    }
                }
            }

            String warning = lowCount >= 1
                    ? "입력값과 증빙 데이터 간 차이가 발견되었습니다. 일부 항목의 신뢰도가 낮게 평가될 수 있습니다."
                    : null;

            // ── Evidence 중복 제거: 동일 indicatorCode + normalizedSnippet ─────────
            Set<String> seenEvidenceKeys = new LinkedHashSet<>();
            List<CategoryAnalysisResponse.EvidenceItem> dedupedEvidence = evidenceItems.stream()
                    .filter(ev -> {
                        if (ev.getEvidenceText() == null) return true;
                        String key = ev.getIndicatorCode() + "|" + normalizeSnippet(ev.getEvidenceText());
                        boolean added = seenEvidenceKeys.add(key);
                        if (!added) {
                            log.info("[EvidenceDedup] removed duplicate indicator={} snippet='{}'",
                                    ev.getIndicatorCode(),
                                    ev.getEvidenceText().substring(0, Math.min(40, ev.getEvidenceText().length())));
                        }
                        return added;
                    })
                    .collect(Collectors.toList());
            int removedCount = evidenceItems.size() - dedupedEvidence.size();
            if (removedCount > 0) {
                log.info("[EvidenceDedup] category={} removed={} total={}→{}",
                        category, removedCount, evidenceItems.size(), dedupedEvidence.size());
            }

            log.info("[CategoryAnalysis] 완료 category={} ragScore={} checklistScore={} → {}점 {} 신뢰도={}% lowCount={} ragChunks={} ceilingApplied={}",
                    category, avgRag, checklistScore, finalScore, grade, avgConf, lowCount, ragChunkCount, ceilingApplied);

            return CategoryAnalysisResponse.builder()
                    .score(finalScore)
                    .grade(grade)
                    .confidence(avgConf)
                    .evidenceCount(ragChunkCount)          // 실제 RAG 청크 수 (synthetic 제외)
                    .ragBased(true)
                    .lowMismatchCount(lowCount > 0 ? lowCount : null)
                    .gradeCeilingApplied(ceilingApplied ? true : null)
                    .warning(warning)
                    .evidences(dedupedEvidence.isEmpty() ? null : dedupedEvidence)
                    .indicatorBreakdowns(indicatorBreakdowns.isEmpty() ? null : indicatorBreakdowns)
                    .build();

        } catch (Exception e) {
            log.error("[CategoryAnalysis] RAG scoring FAILED category={} — full stack trace below", category, e);
            log.error("[CategoryAnalysis] 원인 요약: {} : {}", e.getClass().getSimpleName(), e.getMessage());
            // S/G: PDF 증빙 없이 점수 산출 금지 → 낮은 점수 + 낮은 신뢰도 (검증 불가 fallback)
            if ("S".equalsIgnoreCase(category) || "G".equalsIgnoreCase(category)) {
                return buildSgFallbackResult(checklistScore, totalItems, checkedCount);
            }
            return buildChecklistOnlyResult(checklistScore, totalItems, checkedCount);
        } finally {
            try { reportRagService.deleteSessionCollection(sessionId); }
            catch (Exception ignore) {}
        }
    }

    // ── 내부 헬퍼 ────────────────────────────────────────────────────────────

    private CategoryAnalysisResponse buildChecklistOnlyResult(int score, int totalItems, int checkedCount) {
        int confidence = computeChecklistConfidence(score);
        return CategoryAnalysisResponse.builder()
                .score(score)
                .grade(EsgScoreConstants.toGrade(score))
                .confidence(confidence)
                .evidenceCount(checkedCount)
                .ragBased(false)
                .build();
    }

    /**
     * S/G RAG 실패 fallback — 체크리스트(claim)만으로는 HIGH 등급 불가.
     * 체크리스트는 자기보고이므로 LOW tier 상한 + grade ceiling C + 낮은 신뢰도로 반환.
     */
    private CategoryAnalysisResponse buildSgFallbackResult(int rawChecklistScore, int totalItems, int checkedCount) {
        // 체크리스트 비율 적용 후 LOW tier (40점) 상한
        int score = Math.min(40, (int) Math.round(rawChecklistScore * 0.4));
        String grade = applyGradeCeiling(EsgScoreConstants.toGrade(score), "C");
        log.warn("[SgFallback] RAG 실패 — checklistScore={} → penalized score={} grade={} conf=40", rawChecklistScore, score, grade);
        return CategoryAnalysisResponse.builder()
                .score(score)
                .grade(grade)
                .confidence(40)
                .evidenceCount(0)
                .ragBased(false)
                .gradeCeilingApplied(true)
                .warning("증빙 문서 처리 실패로 체크리스트 기반 예비 결과입니다. 재분석을 권장합니다.")
                .build();
    }

    private int computeChecklistScore(int checkedCount, int totalItems) {
        if (totalItems == 0) return 0;
        return Math.round((checkedCount * 100.0f) / totalItems);
    }

    private int computeChecklistConfidence(int checklistScore) {
        // 체크리스트 점수 기반 신뢰도 추정 (자기보고 → 최대 85%)
        return Math.min(85, Math.max(15, (int) Math.round(checklistScore * 0.75 + 15)));
    }

    /**
     * RAG confidence < 30인 지표에 대해 체크리스트 기여분으로 대체 점수를 산출합니다.
     * 체크리스트 항목이 지표와 직접 매핑되지 않으므로 전체 체크리스트 비율을 활용합니다.
     */
    private int computeChecklistContribution(Map<String, Boolean> answers,
                                              ESGIndicator indicator,
                                              int checkedCount, int totalItems) {
        int base = computeChecklistScore(checkedCount, totalItems);
        return indicator.getTitle().endsWith("여부") ? Math.max(40, base) : 40;
    }

    /**
     * S/G 지표별 evidence quality 기반 hybrid scoring.
     *
     * 설계 원칙:
     *   - 체크리스트(claim)는 "시작 기준점"만 담당 (최대 35점 → 전체의 ~35%)
     *   - 최종 점수는 similarity 품질 + page 다양성이 지배 (최대 65점)
     *   - evidence 없으면 claim 여부와 무관하게 LOW tier 상한 적용
     *
     * <pre>
     * claim=true  + HIGH(≥0.80) + 3pages  → ~90~100  (A/S 등급 가능)
     * claim=true  + HIGH        + 1page   → ~83~88   (A 등급)
     * claim=true  + MEDIUM(≥0.70) + 2p   → ~68~78   (B/A 경계)
     * claim=true  + MEDIUM      + 1page  → ~65~70   (B/C 경계)
     * claim=true  + LOW(≥0.55)  + 1page  → ~45~48   (C/D)
     * claim=true  + no evidence          → 35 (LOW tier 상한, 미검증 주장)
     * claim=false + no evidence          → 5  (정보 없음)
     * NEGATIVE_SIGNAL_DETECTED           → 15 (고정)
     * </pre>
     */
    private int computeSgIndicatorScore(boolean userClaims,
                                         List<EvidenceResult> dedupedEvidences,
                                         int uniquePageCount,
                                         String mismatchType) {
        // 부정적 ESG 사건 evidence 확인 → 즉시 고정 점수 (dedupedEvidences에 강한 증거 있는 경우만 도달)
        if ("NEGATIVE_SIGNAL_DETECTED".equals(mismatchType)) {
            log.debug("[SgHybrid] NEGATIVE_SIGNAL_DETECTED confirmed → score=15");
            return 15;
        }

        // evidence 없음: claim만 존재 → LOW tier 상한 (체크리스트=자기보고, 검증 불가)
        // Fix #1/#2: CHECKLIST_NO_EVIDENCE 패널티로 10점까지 낮추는 대신 LOW tier 하한값 반환
        if (dedupedEvidences.isEmpty()) {
            int noEvScore = userClaims ? 35 : 5;
            log.debug("[SgHybrid] no evidence claim={} → {}", userClaims, noEvScore);
            return noEvScore;
        }

        // 1. 체크리스트 claim은 시작 기준점만 담당 (35 → 전체 100의 35%)
        int base = userClaims ? 35 : 5;

        // 2. similarity 품질 보너스 — 점수의 핵심 동인 (최대 55점)
        //    HIGH 구간 내 saturation: 약한 HIGH(0.80)와 exceptional(0.94+)을 구분
        double bestSim = dedupedEvidences.stream()
                .mapToDouble(EvidenceResult::getSimilarity).max().orElse(0.0);
        int simBonus;
        if      (bestSim >= 0.94)                         simBonus = 55;  // 0.94+: exceptional
        else if (bestSim >= 0.90)                         simBonus = 50;  // 0.90~0.93: very strong
        else if (bestSim >= EsgScoreConstants.SIM_HIGH)   simBonus = 45;  // SIM_HIGH~0.89: strong
        else if (bestSim >= EsgScoreConstants.SIM_MEDIUM) simBonus = 30;  // SIM_MEDIUM~SIM_HIGH: medium
        else if (bestSim >= EsgScoreConstants.SIM_LOW)    simBonus = 10;  // SIM_LOW~SIM_MEDIUM: weak
        else                                               simBonus = 0;   // 근거 없음

        // 3. page 다양성 보너스 (최대 10점) — diminishing return 강화
        int diversityBonus;
        if      (uniquePageCount >= 4)        diversityBonus = 10;
        else if (uniquePageCount == 3)        diversityBonus = 8;
        else if (uniquePageCount == 2)        diversityBonus = 6;
        else if (uniquePageCount == 1)        diversityBonus = 3;
        else                                  diversityBonus = 2;  // page 정보 없는 evidence

        // 4. 충돌 패널티
        int penalty = 0;
        if ("EVIDENCE_CONTRADICTION".equals(mismatchType)) penalty = 10;
        // CHECKLIST_NO_EVIDENCE: evidence 없는 경우 → 위 early return으로 처리, 이 아래 도달 불가

        int result = Math.min(100, Math.max(0, base + simBonus + diversityBonus - penalty));
        log.debug("[SgHybrid] claim={} bestSim={} dedupEv={} uniquePages={} mismatch={} base={} simBonus={} divBonus={} penalty={} → {}",
                userClaims, String.format("%.3f", bestSim), dedupedEvidences.size(), uniquePageCount,
                mismatchType, base, simBonus, diversityBonus, penalty, result);
        return result;
    }

    /**
     * 지표 내 near-duplicate evidence chunk를 제거합니다.
     * - similarity 내림차순으로 처리해 가장 강한 근거를 우선 보존합니다.
     * - 지문(fingerprint): 정규화 텍스트 앞 80자 기준 → 동일 단락 반복 retrieval 방지
     */
    private List<EvidenceResult> deduplicateEvidencesForIndicator(List<EvidenceResult> evidences) {
        if (evidences.size() <= 1) return new ArrayList<>(evidences);
        List<EvidenceResult> deduped = new ArrayList<>();
        Set<String> seenFingerprints = new LinkedHashSet<>();
        evidences.stream()
                .sorted(java.util.Comparator.comparingDouble(EvidenceResult::getSimilarity).reversed())
                .forEach(ev -> {
                    String text = ev.getEvidenceText();
                    if (text == null || text.isBlank()) {
                        deduped.add(ev);
                        return;
                    }
                    String normalized = text.trim().toLowerCase().replaceAll("\\s+", " ");
                    String fingerprint = normalized.substring(0, Math.min(80, normalized.length()));
                    if (seenFingerprints.add(fingerprint)) {
                        deduped.add(ev);
                    } else {
                        log.debug("[EvidenceDedup-Ind] Removed near-dup page={} sim={}",
                                ev.getPageNumber(), String.format("%.3f", ev.getSimilarity()));
                    }
                });
        return deduped;
    }

    /**
     * 서로 다른 page에서 검색된 고유 evidence 수를 반환합니다.
     * pageNumber=0 또는 미설정은 "page 정보 없음"으로 처리해 제외합니다.
     */
    private int computeUniquePageCount(List<EvidenceResult> evidences) {
        return (int) evidences.stream()
                .mapToInt(EvidenceResult::getPageNumber)
                .filter(p -> p > 0)
                .distinct()
                .count();
    }

    private int avg(List<Integer> values) {
        if (values.isEmpty()) return 0;
        return (int) Math.round(values.stream().mapToInt(Integer::intValue).average().orElse(0));
    }

    private static String normalizeSnippet(String text) {
        return text.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    // S > A > B > C > D 순서로 ceiling보다 좋은 등급이면 ceiling으로 낮춥니다.
    private String applyGradeCeiling(String grade, String ceiling) {
        java.util.List<String> order = EsgScoreConstants.GRADE_ORDER;
        int gi = order.indexOf(grade);
        int ci = order.indexOf(ceiling);
        if (gi < 0 || ci < 0) return grade;
        return order.get(Math.max(gi, ci));
    }

    // ── CSV 판별 & 파싱 헬퍼 ─────────────────────────────────────────────────

    private boolean isCsvFile(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name != null && name.toLowerCase().endsWith(".csv")) return true;
        String ct = file.getContentType();
        return "text/csv".equalsIgnoreCase(ct) || "application/vnd.ms-excel".equalsIgnoreCase(ct);
    }

    /**
     * CSV 파일을 읽어 Markdown 테이블 형식으로 변환합니다.
     * - UTF-8 BOM 자동 제거
     * - 쌍따옴표 quoted 필드 처리
     * - 파이프(|) 이스케이프
     */
    private String parseCsvToMarkdown(MultipartFile file) throws java.io.IOException {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            StringBuilder sb = new StringBuilder();
            String line;
            boolean isHeader = true;

            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                // BOM 제거
                if (isHeader && line.startsWith("﻿")) {
                    line = line.substring(1);
                }
                String[] cols = splitCsvLine(line);
                sb.append("| ");
                for (String col : cols) {
                    sb.append(col.trim().replace("|", "\\|")).append(" | ");
                }
                sb.append("\n");

                if (isHeader) {
                    sb.append("|");
                    for (int i = 0; i < cols.length; i++) {
                        sb.append(" --- |");
                    }
                    sb.append("\n");
                    isHeader = false;
                }
            }
            return sb.toString();
        }
    }

    private String[] splitCsvLine(String line) {
        List<String> cols = new ArrayList<>();
        boolean inQuotes = false;
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                cols.add(current.toString());
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        cols.add(current.toString());
        return cols.toArray(new String[0]);
    }

    /**
     * Numeric match 결과만으로 Evidence Item을 합성합니다.
     * E 카테고리에서 semantic evidence가 없을 때 수치 검증 결과를 UI에 표시하기 위해 사용합니다.
     */
    private CategoryAnalysisResponse.EvidenceItem buildNumericOnlyEvidenceItem(
            String code, String title,
            NumericExtractionService.MatchResult numericMatch,
            String numericMetric, double inputVal, double extractedVal) {

        String unit        = numericExtractionService.metricUnit(numericMetric);
        String koreanName  = numericExtractionService.metricKoreanName(numericMetric);
        String judgment    = numericMatch.isHigh()   ? "HIGH (일치)"
                           : numericMatch.isMedium() ? "MEDIUM (근사)"
                           :                           "LOW (불일치)";
        String diffStr     = numericMatch.diffPercent() < 0.1
                           ? "0%"
                           : String.format("%.1f%%", numericMatch.diffPercent());
        String evText = String.format(
                "%s%n· 입력값: %s %s%n· 증빙값: %s %s%n· 차이율: %s%n· 판정: %s",
                koreanName,
                formatNumericValue(inputVal), unit,
                formatNumericValue(extractedVal), unit,
                diffStr, judgment);

        String confLevel = numericMatch.isHigh() ? "HIGH" : numericMatch.isMedium() ? "MEDIUM" : "LOW";

        return CategoryAnalysisResponse.EvidenceItem.builder()
                .indicatorCode(code)
                .indicatorTitle(title)
                .evidenceText(evText)
                .confidenceLevel(confLevel)
                .numericMatchLevel(numericMatch.level())
                .numericDiffPercent(numericMatch.diffPercent())
                .numericMetric(numericMetric)
                .inputValue(inputVal > 0 ? inputVal : null)
                .extractedValue(extractedVal > 0 ? extractedVal : null)
                .unit(unit)
                .build();
    }

    private static String computeEvidenceStrength(double sim, double kw) {
        String base;
        if      (sim >= 0.88) base = "STRONG";
        else if (sim >= 0.78) base = "MEDIUM";
        else if (sim >= 0.68) base = "WEAK";
        else                  base = "LOW";
        if (kw >= 0.5) {
            if      ("LOW".equals(base))    return "WEAK";
            else if ("WEAK".equals(base))   return "MEDIUM";
            else if ("MEDIUM".equals(base)) return "STRONG";
        }
        return base;
    }

    private String formatNumericValue(double val) {
        if (val >= 1_000_000) return String.format("%.2fM", val / 1_000_000);
        if (val >= 1_000)     return String.format("%.1fK", val / 1_000);
        return String.valueOf((long) val);
    }

    private CategoryAnalysisResponse.EvidenceItem toEvidenceItemWithNumeric(
            EvidenceResult ev, String code, String title,
            NumericExtractionService.MatchResult numericMatch,
            String numericMetric, double inputVal, double extractedVal) {

        double sim = ev.getSimilarity();
        double kw  = ev.getKeywordMatchScore();
        String level = computeEvidenceStrength(sim, kw);
        log.info("[EVIDENCE-STRENGTH] indicator={} sim={} kw={} final={} strength={}{}",
                code, String.format("%.3f", sim), String.format("%.3f", kw),
                String.format("%.3f", ev.getFinalScore()), level,
                kw >= 0.5 ? " reason=keyword_boost" : "");

        CategoryAnalysisResponse.EvidenceItem.EvidenceItemBuilder builder =
                CategoryAnalysisResponse.EvidenceItem.builder()
                        .indicatorCode(code)
                        .indicatorTitle(title)
                        .evidenceText(ev.getEvidenceText())
                        .similarity(Math.round(sim * 1000.0) / 1000.0)
                        .finalScore(Math.round(ev.getFinalScore() * 1000.0) / 1000.0)
                        .confidenceLevel(level)
                        .retrievalRank(ev.getRetrievalRank())
                        .pageNumber(ev.getPageNumber() > 0 ? ev.getPageNumber() : null)
                        .sourceFile(ev.getSourceFile());

        if (numericMatch != null && numericMetric != null) {
            builder.numericMatchLevel(numericMatch.level())
                   .numericDiffPercent(numericMatch.diffPercent())
                   .numericMetric(numericMetric)
                   .inputValue(inputVal > 0 ? inputVal : null)
                   .extractedValue(extractedVal > 0 ? extractedVal : null)
                   .unit(numericExtractionService.metricUnit(numericMetric));
        }

        return builder.build();
    }
}
