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

            // 2. ChromaDB 인덱싱 — category 전달로 G는 더 큰 청크 사이즈 적용
            reportRagService.indexReport(sessionId, markdown, category);
            log.info("[CategoryAnalysis] 인덱싱 완료 sessionId={} category={}", sessionId, category);

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

            // Cross-indicator chunk 재사용 추적 — 동일 chunk가 2개 이상 지표에 재사용되면 제한
            Map<String, Integer> globalChunkUsage = new HashMap<>();

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
                    // waste_kg=0 케이스 포함 — 0.0도 컬럼 존재 증거로 허용
                    numericExtractionService.extractFromText(markdown, metric)
                            .filter(v -> v >= 0)
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
                // topK: G=10 (recall 우선), S=7 (사회 지표 다양성), E=5 (수치 검증 병행)
                int topK = "G".equalsIgnoreCase(category) ? 10
                         : "S".equalsIgnoreCase(category) ? 7
                         : 5;
                List<EvidenceResult> evidences;
                try {
                    evidences = reportRagService.retrieveEvidenceForIndicator(sessionId, indicator, topK, category);
                } catch (Exception retrivalEx) {
                    log.error("[RAG-STAGE] retrieval FAILED indicator={} — 해당 지표 기본값 사용",
                            indicator.getCode(), retrivalEx);
                    ragScores.add(computeChecklistScore(checkedCount, totalItems));
                    confidences.add(0);
                    continue;
                }
                log.info("[RAG-STAGE] retrieval completed indicator={} retrieved={}", indicator.getCode(), evidences.size());

                // ── 유효 evidence 집계 (isValidEvidence + SIM_LOW 기준) ──────────────
                // EXPLICIT phrase match: SIM_LOW rawSim 필터 면제 (finalScore는 0.85+로 boost됨)
                List<EvidenceResult> validEvidences = evidences.stream()
                        .filter(EvidenceResult::isValidEvidence)
                        .filter(ev -> ev.getSimilarity() >= EsgScoreConstants.SIM_LOW
                                || (ev.getMatchedCluster() != null && ev.getMatchedCluster().startsWith("EXPLICIT:")))
                        .collect(Collectors.toList());

                // ── Semantic dedup: 동일 단락 반복 retrieval로 인한 coverage 과대평가 방지 ─
                List<EvidenceResult> dedupedEvidences = deduplicateEvidencesForIndicator(validEvidences);

                // ── Cross-indicator chunk 재사용 제한 (S/G만 적용, E는 numeric match 기반) ──
                // 동일 chunk는 첫 번째 지표에만 VERIFIED 가능. 두 번째 이후는 제외.
                boolean sharedEvidenceDetected = false;
                int reuseCount = 0;
                if (!hasEMetrics && !dedupedEvidences.isEmpty()) {
                    List<EvidenceResult> reuseFiltered = new ArrayList<>();
                    for (EvidenceResult ev : dedupedEvidences) {
                        String ck = makeChunkKey(ev.getEvidenceText());
                        int usageCount = globalChunkUsage.getOrDefault(ck, 0);
                        // 동일 chunk 최대 2개 지표까지만 공유 허용 (cross-indicator 오염 방지)
                        if (usageCount < 2) {
                            reuseFiltered.add(ev);
                            globalChunkUsage.merge(ck, 1, Integer::sum);
                            if (usageCount >= 1) {
                                sharedEvidenceDetected = true;
                                reuseCount++;
                                log.info("[REUSED-EVIDENCE-ALLOWED] indicator={} chunk shared usage={} → reusePenalty 적용 key='{}'",
                                        indicator.getCode(), usageCount + 1, ck.length() > 50 ? ck.substring(0, 50) : ck);
                            }
                        } else {
                            sharedEvidenceDetected = true;
                            log.info("[REUSED-EVIDENCE-BLOCKED] indicator={} chunk usage={} exceeded limit (max=2) key='{}'",
                                    indicator.getCode(), usageCount, ck.length() > 50 ? ck.substring(0, 50) : ck);
                        }
                    }
                    // 안전망: 필터 후 증거가 완전히 사라지면 원본 유지 (단, shared 플래그는 유지)
                    if (!reuseFiltered.isEmpty()) {
                        dedupedEvidences = reuseFiltered;
                    }
                }
                if (sharedEvidenceDetected) {
                    log.info("[SHARED-SEMANTIC-EVIDENCE] indicator={} — 동일 근거가 다른 K-ESG 지표와 중복 사용되었습니다. Evidence 품질 하향 적용.",
                            indicator.getCode());
                }

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
                        // 부정 신호 오탐 방지: evidence 텍스트에 부정 표현이 있으면 긍정 문맥으로 판단
                        // "발생하지 않음", "무재해", "감소", "Zero" 등은 실제 문제 없음을 의미
                        boolean evidenceActuallyNegative = isNegativePolarity && dedupedEvidences.stream()
                                .anyMatch(ev -> isActualNegativeOccurrence(ev.getEvidenceText()));
                        // S-202: historical disclosure + mitigation = ESG disclosure maturity
                        // mitigation signals 2개 이상 존재 시 NEGATIVE_SIGNAL 완화
                        // "2023년 사고 이력 + 2024 개선 완료" 패턴은 transparency로 해석
                        if (evidenceActuallyNegative && "S-202".equals(indicator.getCode())) {
                            String allEvText = dedupedEvidences.stream()
                                    .filter(ev -> ev.getEvidenceText() != null)
                                    .map(ev -> ev.getEvidenceText().toLowerCase())
                                    .collect(Collectors.joining(" "));
                            long mitigationCount = java.util.stream.Stream.of(
                                    "무재해", "무사고", "0건", "ltir 0", "trir", "ltir",
                                    "재발방지", "개선 완료", "업계 평균", "감소", "예방체계",
                                    "원인 분석", "안전관리 강화", "재해율 0", "중대재해 0")
                                    .filter(allEvText::contains)
                                    .count();
                            if (mitigationCount >= 2) {
                                evidenceActuallyNegative = false;
                                log.info("[S202-NEGATIVE-OVERRIDE] indicator=S-202 mitigation signals={} ≥ 2 → evidenceActuallyNegative=false (disclosure maturity)", mitigationCount);
                            }
                        }
                        if (sgUserClaims && dedupedEvidences.isEmpty()) {
                            sgMismatchType = "CHECKLIST_NO_EVIDENCE";
                            sgMismatchCount++;
                            log.debug("[SgMismatch] indicator={} CHECKLIST_NO_EVIDENCE (user=true, ev=0)", indicator.getCode());
                        } else if (!sgUserClaims && hasStrongEvidence && !isNegativePolarity) {
                            sgMismatchType = "EVIDENCE_CONTRADICTION";
                            sgMismatchCount++;
                            contradictionTypeCount++;
                            log.debug("[SgMismatch] indicator={} EVIDENCE_CONTRADICTION (user=false, strongEv=true)", indicator.getCode());
                        } else if (sgUserClaims && hasStrongEvidence && evidenceActuallyNegative) {
                            // 실제 사고 발생 언급 Evidence가 있을 때만 NEGATIVE_SIGNAL
                            sgMismatchType = "NEGATIVE_SIGNAL_DETECTED";
                            sgMismatchCount++;
                            contradictionTypeCount++;
                            log.debug("[SgMismatch] indicator={} NEGATIVE_SIGNAL_DETECTED (actual negative occurrence confirmed)", indicator.getCode());
                        } else if (sgUserClaims && hasStrongEvidence && isNegativePolarity) {
                            // evidence가 긍정 문맥("무재해", "발생하지 않음" 등) → 오탐 방지, 정상 처리
                            log.debug("[SgMismatch] indicator={} NEGATIVE_POLARITY but evidence is positive context — skip mismatch", indicator.getCode());
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
                    if (reuseCount > 0) {
                        int reusePenalty = (int) Math.round(reuseCount * 12.0);
                        score = Math.max(0, score - reusePenalty);
                        log.info("[REUSE-PENALTY] indicator={} reuseCount={} penalty={} score→{}",
                                indicator.getCode(), reuseCount, reusePenalty, score);
                    }

                    // S-202 특화: 긍정 근거 충분 시 confidence/score floor 적용
                    // "중대재해 0건", "TRIR 개선", "재발방지" 등 다수 긍정 신호가 있어도
                    // 단일 historical incident로 낮게 평가되는 문제 방지
                    // historical disclosure + mitigation = ESG disclosure maturity → 적극 인정
                    if ("S-202".equals(indicator.getCode()) && sgMismatchType == null) {
                        String combinedText = evidences.stream()
                                .map(EvidenceResult::getEvidenceText)
                                .filter(t -> t != null)
                                .collect(java.util.stream.Collectors.joining(" "))
                                .toLowerCase();
                        long mitigationCount = java.util.stream.Stream.of(
                                "발생하지 않", "재발방지", "개선조치", "예방체계", "무재해",
                                "zero", "0건", "감소", "ltir 0", "trir", "ltir",
                                "업계 평균", "중대재해 0")
                                .filter(sig -> combinedText.contains(sig))
                                .count();
                        if (mitigationCount >= 3) {
                            conf = Math.max(conf, 65);
                            score = Math.max(score, 72);
                            log.info("[S202-FLOOR-STRONG] indicator=S-202 mitigation={} → conf={} score={}",
                                    mitigationCount, conf, score);
                        } else if (mitigationCount >= 1) {
                            conf = Math.max(conf, 55);
                            score = Math.max(score, 65);
                            log.info("[S202-FLOOR-BASIC] indicator=S-202 mitigation={} → conf={} score={}",
                                    mitigationCount, conf, score);
                        }
                    }
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
                                    // MEDIUM: 경미 불일치 — HIGH와 차이가 체감되도록 기준점 하향
                                    score = Math.min(100, 50 + evidenceBonus);
                                    conf  = 55;
                                    mediumMatchCount++;
                                } else { // LOW
                                    score = 20;
                                    conf  = 25;
                                }
                                if (numericMatch.isLow())         conf = Math.min(conf, 40);
                                else if (numericMatch.isMedium()) conf = Math.min(conf, 62);
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
                                    finalMatch, finalMetric, finalInput, finalExtracted,
                                    false));  // E 카테고리: coverage-based VERIFIED 미적용
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
                    // G-303: 명시적 거버넌스 조직 구문 포함 evidence 최우선 정렬
                    List<EvidenceResult> orderedEvidences = "G-303".equals(indicator.getCode())
                            ? sortByGovernancePriorityForG303(dedupedEvidences)
                            : dedupedEvidences;

                    // [5] Final evidence selection 로그
                    List<EvidenceResult> selectedForLog = orderedEvidences.stream().limit(2).collect(Collectors.toList());
                    for (EvidenceResult ev : selectedForLog) {
                        boolean isExplicit = ev.getMatchedCluster() != null && ev.getMatchedCluster().startsWith("EXPLICIT:");
                        log.info("[FINAL-EVIDENCE-SELECT] indicator={} selectedText='{}' selectedStatus={} selectedScore={} isExplicit={}",
                                indicator.getCode(),
                                ev.getEvidenceText() != null ? (ev.getEvidenceText().length() > 80 ? ev.getEvidenceText().substring(0, 80) : ev.getEvidenceText()) : "null",
                                ev.getMatchedCluster() != null ? ev.getMatchedCluster() : "null",
                                String.format("%.3f", ev.getFinalScore()),
                                isExplicit);
                    }
                    for (int ri = 2; ri < orderedEvidences.size(); ri++) {
                        EvidenceResult ev = orderedEvidences.get(ri);
                        log.info("[REJECTED-CANDIDATE] indicator={} reason=lower_priority text='{}' score={}",
                                indicator.getCode(),
                                ev.getEvidenceText() != null ? (ev.getEvidenceText().length() > 60 ? ev.getEvidenceText().substring(0, 60) : ev.getEvidenceText()) : "null",
                                String.format("%.3f", ev.getFinalScore()));
                    }

                    // coverage-based VERIFIED: policy statement 없이 KPI+운영 evidence 조합으로 VERIFIED 허용
                    final boolean coverageVerified = determineCoverageBasedVerified(
                            indicator.getCode(), dedupedEvidences, sgMismatchType);

                    orderedEvidences.stream()
                            .limit(2)
                            .map(ev -> toEvidenceItemWithNumeric(
                                    ev, indicator.getCode(), titleMap.get(indicator.getCode()),
                                    finalMatch, finalMetric, finalInput, finalExtracted,
                                    coverageVerified))
                            .forEach(evidenceItems::add);
                }

                // ── IndicatorBreakdown 빌드 (deduped 기준) ──────────────────────────
                double indAvgSim = dedupedEvidences.isEmpty() ? 0.0
                        : dedupedEvidences.stream().mapToDouble(EvidenceResult::getSimilarity).average().orElse(0.0);
                boolean isSgMismatch = sgMismatchType != null;

                // similarity tier (avgSim + keyword awareness) — STRONG/MEDIUM/WEAK/LOW
                // STRONG: explicit phrase match OR (sim >= 0.78 AND keyword evidence confirmed)
                // MEDIUM: sim >= 0.78 without keyword, OR sim >= 0.68 with keyword
                // WEAK:   sim >= 0.68, semantic-only (no keyword match)
                // LOW:    sim < 0.68
                String simTier = null;
                if (!dedupedEvidences.isEmpty()) {
                    // EXPLICIT phrase match → 즉시 STRONG (VERIFIED) — sim 수치와 무관
                    boolean hasExplicitMatch = dedupedEvidences.stream()
                            .anyMatch(ev -> ev.getMatchedCluster() != null
                                    && ev.getMatchedCluster().startsWith("EXPLICIT:"));
                    if (hasExplicitMatch) {
                        simTier = "STRONG";
                        log.info("[SIM-TIER-EXPLICIT] indicator={} explicit phrase match → STRONG",
                                indicator.getCode());
                    } else {
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
                }

                // 최고 similarity evidence 앞 100자 (S/G만 노출, E는 numeric 기반이므로 생략)
                // G-303: governance phrase 우선 evidence 사용 (max similarity 대신)
                String evidenceSnippet = null;
                if (!hasEMetrics && !dedupedEvidences.isEmpty()) {
                    EvidenceResult snippetSource;
                    if ("G-303".equals(indicator.getCode())) {
                        snippetSource = sortByGovernancePriorityForG303(dedupedEvidences).get(0);
                    } else {
                        snippetSource = dedupedEvidences.stream()
                                .max(java.util.Comparator.comparingDouble(EvidenceResult::getSimilarity))
                                .orElse(null);
                    }
                    if (snippetSource != null) {
                        String t = snippetSource.getEvidenceText();
                        if (t != null && !t.isBlank()) {
                            String trimmed = t.trim();
                            evidenceSnippet = trimmed.length() > 100 ? trimmed.substring(0, 100) + "…" : trimmed;
                        }
                    }
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
                        .sharedEvidenceDetected(sharedEvidenceDetected ? Boolean.TRUE : null)
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
                // MEDIUM weight 0.6→0.45: 경미 불일치가 완벽 검증과 구별되도록 신뢰도 보정
                // LOW weight 0.25→0.35: 단순 수치 차이를 과도하게 처벌하지 않도록 완화
                double numericScore = (highMatchCount * 1.0 + mediumMatchCount * 0.45
                        + lowCount * 0.35 + failedExtractCount * 0.1) / indicators.size();
                double evidenceBonus = Math.min(10.0, ragChunkCount * 2.0);
                avgConf = (int) Math.min(95, Math.round(numericScore * 85 + evidenceBonus));
                // [7] E confidence floor: numeric match 1건 이상 성공 시 최소 30 보장
                if (numericMatchedCount >= 1 && avgConf < 30) {
                    avgConf = 30;
                    log.info("[EConfFloor] numericMatchedCount={} → floor 30", numericMatchedCount);
                }
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

                // [2] S/G confidence floor: STRONG 근거 충분 + 불일치 적음 → 과도한 감점 완화
                long strongCountForFloor = indicatorBreakdowns.stream()
                        .filter(bd -> "STRONG".equals(bd.getSimilarityTier())).count();
                if (strongCountForFloor >= 3 && catAvgSim >= 0.75 && contradictionTypeCount <= 1 && avgConf < 65) {
                    log.info("[ConfidenceFloor-SG] category={} strong={} avgSim={} contradictions={} → floor 65 (was {})",
                            category, strongCountForFloor, String.format("%.3f", catAvgSim), contradictionTypeCount, avgConf);
                    avgConf = 65;
                }

                // Fix #4/5: 유효 증빙 없음 → confidence 상한 제한 (self-report만 존재)
                if (evidencedIndicatorCount == 0) {
                    avgConf = Math.min(avgConf, 60);
                    log.info("[ConfidenceCeiling-ZeroCoverage] category={} evidencedIndicators=0 → avgConf capped 60", category);
                }
            }

            // ── S/G Coverage 기반 Confidence Hard Ceiling ──────────────────────
            // coverage < 50% 인데 confidence 70+ 는 audit realism에 위배됨
            if (!hasEMetrics && !indicators.isEmpty()) {
                double coverageForCeiling = (double) evidencedIndicatorCount / indicators.size();
                if (coverageForCeiling < 0.30) {
                    if (avgConf > 55) {
                        log.info("[ConfidenceCeiling-Coverage30] category={} coverage={} < 30% → cap 55 (was {})",
                                category, String.format("%.0f%%", coverageForCeiling * 100), avgConf);
                        avgConf = 55;
                    }
                } else if (coverageForCeiling < 0.40) {
                    if (avgConf > 65) {
                        log.info("[ConfidenceCeiling-Coverage40] category={} coverage={} < 40% → cap 65 (was {})",
                                category, String.format("%.0f%%", coverageForCeiling * 100), avgConf);
                        avgConf = 65;
                    }
                } else if (coverageForCeiling < 0.50) {
                    if (avgConf > 72) {
                        log.info("[ConfidenceCeiling-Coverage50] category={} coverage={} < 50% → cap 72 (was {})",
                                category, String.format("%.0f%%", coverageForCeiling * 100), avgConf);
                        avgConf = 72;
                    }
                }
                // NO_EVIDENCE 지표 비율 기반 추가 패널티
                long missingCount = indicatorBreakdowns.stream()
                        .filter(bd -> !Boolean.TRUE.equals(bd.getHasEvidence())).count();
                if (missingCount >= 3 && avgConf > 60) {
                    log.info("[ConfidencePenalty-Missing] category={} missing={}/{} → penalty -8 (was {})",
                            category, missingCount, indicators.size(), avgConf);
                    avgConf = Math.max(20, avgConf - 8);
                } else if (missingCount >= 2 && avgConf > 68) {
                    log.info("[ConfidencePenalty-Missing] category={} missing={}/{} → penalty -5 (was {})",
                            category, missingCount, indicators.size(), avgConf);
                    avgConf = Math.max(20, avgConf - 5);
                }
            }

            // ── 수치 불일치 기반 avgRag 가중 감산 ──────────────────────────────
            if (hasEMetrics && lowCount >= 4)      avgRag = Math.max(0, (int)(avgRag * 0.35));
            else if (hasEMetrics && lowCount >= 3) avgRag = Math.max(0, (int)(avgRag * 0.55));
            else if (hasEMetrics && lowCount >= 1) avgRag = Math.max(0, (int)(avgRag * 0.75));

            // MEDIUM 불일치 카테고리 감산 (LOW 없는 경우에만): HIGH vs MEDIUM 차이 가시화
            if (hasEMetrics && lowCount == 0) {
                if      (mediumMatchCount >= 3) avgRag = Math.max(0, (int)(avgRag * 0.90));
                else if (mediumMatchCount >= 2) avgRag = Math.max(0, (int)(avgRag * 0.93));
                else if (mediumMatchCount >= 1) avgRag = Math.max(0, (int)(avgRag * 0.96));
                if (mediumMatchCount > 0)
                    log.info("[MediumPenalty] medium={} → avgRag={}", mediumMatchCount, avgRag);
            }

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

            // G 카테고리 점수 최소 기준: STRONG tier >= 2 + avgSim >= 0.80 + domain consistency 조건 충족 시 D/C 방지
            // 강화: keyword gate 통과(STRONG) 지표 2개 이상 + 높은 유사도 + S-domain 오염 없음 필요
            if ("G".equalsIgnoreCase(category) && !indicatorBreakdowns.isEmpty()) {
                double catAvgSimForG = allValidSimilarities.isEmpty() ? 0.0
                        : allValidSimilarities.stream().mapToDouble(v -> v).average().orElse(0.0);
                long strongGCount = indicatorBreakdowns.stream()
                        .filter(bd -> "STRONG".equals(bd.getSimilarityTier())).count();
                long govKwMatchedCount = indicatorBreakdowns.stream()
                        .filter(bd -> "STRONG".equals(bd.getSimilarityTier())
                                   || "MEDIUM".equals(bd.getSimilarityTier())).count();
                // domain consistency: evidenceSnippet에 S-domain 표현 없어야 함 (G-302 봉사활동 오탐 방지)
                boolean gDomainConsistent = indicatorBreakdowns.stream()
                        .filter(bd -> bd.getIndicatorCode() != null && bd.getIndicatorCode().startsWith("G-"))
                        .noneMatch(bd -> {
                            String snip = bd.getEvidenceSnippet();
                            if (snip == null) return false;
                            String sl = snip.toLowerCase();
                            return sl.contains("봉사활동") || sl.contains("봉사 활동")
                                    || sl.contains("봉사시간") || sl.contains("volunteer")
                                    || sl.contains("사회공헌") || sl.contains("참여시간")
                                    || sl.contains("지역사회 봉사");
                        });
                if (strongGCount >= 2 && govKwMatchedCount >= 2 && catAvgSimForG >= 0.80
                        && gDomainConsistent && finalScore < 72) {
                    log.info("[GScoreFloor] G 최소 점수 적용: {} → 72 (strong={} kwMatched={} avgSim={} domainOK={})",
                            finalScore, strongGCount, govKwMatchedCount,
                            String.format("%.3f", catAvgSimForG), gDomainConsistent);
                    finalScore = 72;
                }
            }

            // G score hard cap: missing >= 2 이면 최대 79 (VERIFIED 4+ 이상만 80+ 허용)
            if ("G".equalsIgnoreCase(category) && !indicatorBreakdowns.isEmpty()) {
                long qualifiedGForCap = indicatorBreakdowns.stream()
                        .filter(bd -> !"CHECKLIST_NO_EVIDENCE".equals(bd.getMismatchType())).count();
                int gMissing = 5 - (int) qualifiedGForCap;
                long strongGForCap = indicatorBreakdowns.stream()
                        .filter(bd -> "STRONG".equals(bd.getSimilarityTier())).count();
                if (gMissing >= 2 && strongGForCap < 4 && finalScore > 79) {
                    log.info("[GScoreCap] G missing={} strong={} → 79 cap (was {})",
                            gMissing, strongGForCap, finalScore);
                    finalScore = 79;
                }
                // G soft cap: VERIFIED < 3 시 최대 77 (미검출 2개 이상에서 과상승 방지)
                if (gMissing >= 2 && strongGForCap < 3 && finalScore > 77) {
                    log.info("[GScoreSoftCap] G missing={} verifiedSTRONG={} → 77 soft cap (was {})",
                            gMissing, strongGForCap, finalScore);
                    finalScore = 77;
                }
            }

            // S 카테고리 점수 최소 기준: 정책·교육·참여 근거 확인 시 C 방지
            // 조건 완화: qualified >= 2 + avgSim >= 0.72 → floor 72
            if ("S".equalsIgnoreCase(category) && !indicatorBreakdowns.isEmpty()) {
                double catAvgSimForS = allValidSimilarities.isEmpty() ? 0.0
                        : allValidSimilarities.stream().mapToDouble(v -> v).average().orElse(0.0);
                long qualifiedSCount = indicatorBreakdowns.stream()
                        .filter(bd -> "STRONG".equals(bd.getSimilarityTier())
                                   || "MEDIUM".equals(bd.getSimilarityTier())
                                   || "WEAK".equals(bd.getSimilarityTier())).count();
                if (qualifiedSCount >= 2 && catAvgSimForS >= 0.72 && finalScore < 72) {
                    log.info("[SScoreFloor] S 최소 점수 적용: {} → 72 (qualified={} avgSim={})",
                            finalScore, qualifiedSCount, String.format("%.3f", catAvgSimForS));
                    finalScore = 72;
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

            // PRE-RESULT: 지표별 최종 verificationStatus 요약 로그
            if (!dedupedEvidence.isEmpty()) {
                dedupedEvidence.forEach(ev -> log.info(
                        "[INDICATOR-FINAL-STATUS] indicator={} verificationStatus={} isExplicit={} rawSim={} finalScore={} textLen={}",
                        ev.getIndicatorCode(),
                        ev.getVerificationStatus() != null ? ev.getVerificationStatus() : "null",
                        ev.getMatchedCluster() != null && ev.getMatchedCluster().startsWith("EXPLICIT:"),
                        ev.getSimilarity() != null ? String.format("%.3f", ev.getSimilarity()) : "null",
                        ev.getFinalScore() != null ? String.format("%.3f", ev.getFinalScore()) : "null",
                        ev.getEvidenceText() != null ? ev.getEvidenceText().length() : 0));
            }

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

    // ── Coverage-based VERIFIED determination — cluster 조합 기반 ─────────────────
    // policy statement 없이 "실행 evidence + KPI + 운영 evidence" 조합으로 VERIFIED 판정 허용

    // S-201: 안전교육 VERIFIED 조건 — 5개 cluster 중 3개 이상 존재
    private static final List<List<String>> S201_VERIFIED_CLUSTERS = List.of(
            List.of("안전교육", "안전 교육", "안전보건교육", "교육시간", "교육 시간"),
            List.of("iso45001", "iso 45001"),
            List.of("vr", "가상현실", "체험형"),
            List.of("협력사 안전", "협력업체 안전", "파트너 안전"),
            List.of("이수율", "교육 이수율", "교육이수율")
    );

    // S-202: 재해 VERIFIED 조건 — positive signals 중 3개 이상 존재
    private static final List<String> S202_VERIFIED_SIGNALS = List.of(
            "중대재해 0건", "중대재해0건", "trir", "ltir",
            "재발방지", "예방체계", "무재해", "무사고",
            "업계 평균", "원인 분석", "개선 완료", "0건"
    );

    // S-203: ESG교육 VERIFIED 조건 — 교육 운영 cluster 중 2개 이상 존재
    private static final List<List<String>> S203_VERIFIED_CLUSTERS = List.of(
            List.of("esg 교육 이수율", "교육 이수율", "이수율"),
            List.of("온보딩", "신입 교육"),
            List.of("관리자 심화", "심화 교육", "심화 과정"),
            List.of("esg 전략", "esg 공시", "esg 역량", "esg 교육"),
            List.of("교육 모듈", "교육과정", "교육 프로그램")
    );

    // S-205: 지역사회공헌 VERIFIED 조건 — 6개 cluster 중 3개 이상 존재
    private static final List<List<String>> S205_VERIFIED_CLUSTERS = List.of(
            List.of("자원봉사 시간", "봉사 시간", "봉사시간"),
            List.of("참여 인원", "참여인원"),
            List.of("사회공헌 투자", "사회공헌 금액", "사회공헌"),
            List.of("교육 지원", "stem", "취학"),
            List.of("취약계층", "복지 지원", "에너지 복지"),
            List.of("esg 캠페인", "캠페인", "나눔")
    );

    /**
     * coverage-based VERIFIED 판정.
     * policy statement가 없더라도 "실행 evidence + KPI + 운영 evidence" 조합이 충분하면 VERIFIED 허용.
     * S-201/S-202/S-203/S-205 전용 — 그 외 지표는 기존 sim 기반 로직 유지.
     */
    private boolean determineCoverageBasedVerified(String code, List<EvidenceResult> dedupedEvidences, String mismatchType) {
        if (dedupedEvidences.isEmpty()) return false;
        if ("NEGATIVE_SIGNAL_DETECTED".equals(mismatchType)) return false;

        String combined = dedupedEvidences.stream()
                .filter(e -> e.getEvidenceText() != null)
                .map(e -> e.getEvidenceText().toLowerCase())
                .collect(Collectors.joining(" "));

        switch (code) {
            case "S-201": {
                long covered = S201_VERIFIED_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combined.contains(kw.toLowerCase())))
                        .count();
                // ISO45001 + 안전교육 조합만으로 충분 → 임계값 3→2
                if (covered >= 2) {
                    log.info("[COVERAGE-VERIFIED] S-201 cluster coverage={}/5 ≥ 2 → VERIFIED granted", covered);
                    return true;
                }
                return false;
            }
            case "S-202": {
                long count = S202_VERIFIED_SIGNALS.stream()
                        .filter(sig -> combined.contains(sig.toLowerCase()))
                        .count();
                // TRIR + 재발방지 조합만으로 충분 → 임계값 3→2
                if (count >= 2) {
                    log.info("[COVERAGE-VERIFIED] S-202 positive signals={} ≥ 2 → VERIFIED granted", count);
                    return true;
                }
                return false;
            }
            case "S-203": {
                long covered = S203_VERIFIED_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combined.contains(kw.toLowerCase())))
                        .count();
                // 이수율 + ESG교육 조합으로 충분 (임계값 2 유지)
                if (covered >= 2) {
                    log.info("[COVERAGE-VERIFIED] S-203 education coverage={}/5 ≥ 2 → VERIFIED granted", covered);
                    return true;
                }
                return false;
            }
            case "S-205": {
                long covered = S205_VERIFIED_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combined.contains(kw.toLowerCase())))
                        .count();
                // 봉사시간 + 사회공헌 조합만으로 충분 → 임계값 3→2
                if (covered >= 2) {
                    log.info("[COVERAGE-VERIFIED] S-205 community coverage={}/6 ≥ 2 → VERIFIED granted", covered);
                    return true;
                }
                return false;
            }
            default:
                return false;
        }
    }

    // G-303: 명시적 거버넌스 조직 구문 포함 evidence 우선 정렬
    // explicit phrase → VERIFIED → PARTIAL → semantic similarity 순서
    private static final List<String> G303_GOV_PRIORITY_PHRASES = List.of(
            "esg 전담 부서", "esg전담부서",
            "esg 담당 조직", "esg담당조직",
            "지속가능경영 조직", "지속가능경영조직",
            "대표이사 직속 esg", "대표이사직속esg",
            "대표이사 직속", "전담 부서", "전담부서",
            "담당 조직", "담당조직",
            "esg 위원회", "esg위원회",
            "지속가능경영위원회", "esg팀"
    );

    private List<EvidenceResult> sortByGovernancePriorityForG303(List<EvidenceResult> evidences) {
        return evidences.stream()
                .sorted((a, b) -> {
                    boolean aGov = hasG303GovPhrase(a.getEvidenceText());
                    boolean bGov = hasG303GovPhrase(b.getEvidenceText());
                    boolean aExp = a.getMatchedCluster() != null && a.getMatchedCluster().startsWith("EXPLICIT:");
                    boolean bExp = b.getMatchedCluster() != null && b.getMatchedCluster().startsWith("EXPLICIT:");
                    // 1순위: explicit phrase 포함 여부
                    if (aGov && !bGov) return -1;
                    if (!aGov && bGov) return 1;
                    // 2순위: EXPLICIT cluster
                    if (aExp && !bExp) return -1;
                    if (!aExp && bExp) return 1;
                    // 3순위: finalScore 내림차순
                    return Double.compare(b.getFinalScore(), a.getFinalScore());
                })
                .collect(Collectors.toList());
    }

    private boolean hasG303GovPhrase(String text) {
        if (text == null || text.isBlank()) return false;
        String tNorm = text.toLowerCase().replaceAll("\\s+", "");
        return G303_GOV_PRIORITY_PHRASES.stream()
                .anyMatch(p -> tNorm.contains(p.toLowerCase().replaceAll("\\s+", "")));
    }

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

        // evidence 없음: "근거 없음" ≠ "부정" 원칙 — neutral baseline 처리
        // S-202·S-205·G-304·G-305 같은 미공시성 지표는 과도한 감점 방지
        // claim=true:  자기보고 주장 있으나 검증 불가 → 55 (neutral minus)
        // claim=false: 주장도 증빙도 없음 → 50 (unknown neutral, not punitive — 미공시≠부정)
        if (dedupedEvidences.isEmpty()) {
            int noEvScore = userClaims ? 55 : 50;
            log.debug("[SgHybrid] no evidence claim={} → {} (neutral-baseline)", userClaims, noEvScore);
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

    /**
     * Cross-indicator chunk 재사용 추적용 fingerprint 키 생성.
     * 앞 80자(소문자·공백정규화)를 키로 사용하여 deduplicateEvidencesForIndicator와 동일 로직 유지.
     */
    private static String makeChunkKey(String text) {
        if (text == null || text.isBlank()) return "";
        String normalized = text.trim().toLowerCase().replaceAll("\\s+", " ");
        return normalized.length() > 80 ? normalized.substring(0, 80) : normalized;
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
        String extractedStr = extractedVal >= 0 ? formatNumericValue(extractedVal) : "-";
        String evText = String.format(
                "%s%n· 입력값: %s %s%n· 증빙값: %s %s%n· 차이율: %s%n· 판정: %s",
                koreanName,
                formatNumericValue(inputVal), unit,
                extractedStr, unit,
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
                .extractedValue(extractedVal >= 0 ? extractedVal : null)  // 0-value 허용
                .unit(unit)
                .build();
    }

    private static String computeEvidenceStrength(double sim, double kw) {
        String base;
        if      (sim >= 0.85) base = "STRONG";
        else if (sim >= 0.74) base = "MEDIUM";   // 0.78→0.74: operational evidence 인정 범위 확대
        else if (sim >= 0.64) base = "WEAK";
        else                  base = "LOW";
        if (kw >= 0.4) {   // 0.5→0.4: keyword match 기준 완화
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
            String numericMetric, double inputVal, double extractedVal,
            boolean coverageVerified) {

        double sim = ev.getSimilarity();
        double kw  = ev.getKeywordMatchScore();
        boolean isExplicit = ev.getMatchedCluster() != null && ev.getMatchedCluster().startsWith("EXPLICIT:");

        // EXPLICIT phrase match → unconditionally STRONG (finalScore boosted to 0.85+, rawSim may be lower)
        String level;
        if (isExplicit || coverageVerified) {
            level = "STRONG";
            log.info("[EVIDENCE-STRENGTH] indicator={} sim={} kw={} final={} strength=STRONG reason={}",
                    code, String.format("%.3f", sim), String.format("%.3f", kw),
                    String.format("%.3f", ev.getFinalScore()),
                    isExplicit ? "EXPLICIT cluster=" + ev.getMatchedCluster() : "COVERAGE_VERIFIED");
        } else {
            // Use max(rawSim, finalScore) so BM25/boost elevated scores are reflected
            double effectiveSim = Math.max(sim, ev.getFinalScore());
            level = computeEvidenceStrength(effectiveSim, kw);
            log.info("[EVIDENCE-STRENGTH] indicator={} sim={} kw={} final={} effectiveSim={} strength={}{}",
                    code, String.format("%.3f", sim), String.format("%.3f", kw),
                    String.format("%.3f", ev.getFinalScore()), String.format("%.3f", effectiveSim), level,
                    kw >= 0.5 ? " reason=keyword_boost" : "");
        }

        // ── backend verificationStatus 결정 ─────────────────────────────────
        // frontend getVerificationStatus()의 단일 source of truth로 사용됨
        // E 지표는 numericMatchLevel 기반이므로 여기서 설정 안 함 (null → frontend 결정)
        String vStatus = null;
        if (!code.startsWith("E-")) {
            if (isExplicit) {
                vStatus = "VERIFIED";
                log.info("[VSTATUS] indicator={} verificationStatus=VERIFIED reason=EXPLICIT", code);
            } else {
                double effectiveSim = Math.max(sim, ev.getFinalScore());
                String text = ev.getEvidenceText();
                boolean hasClusterMatch = ev.getMatchedCluster() != null
                        && !ev.getMatchedCluster().isBlank()
                        && !"NO_GATE".equals(ev.getMatchedCluster());

                // [1] semantic similarity >= 0.75 + 유효 텍스트 → VERIFIED
                // 텍스트 길이 조건: 5자 이상 (단문 KPI "TRIR 0", "0건" 등 처리)
                if (effectiveSim >= 0.75 && text != null && text.length() > 5) {
                    vStatus = "VERIFIED";
                    log.info("[VSTATUS] indicator={} verificationStatus=VERIFIED reason=SIM_HIGH sim={}",
                            code, String.format("%.3f", effectiveSim));
                }
                // [1b] S 지표 + keyword cluster match + sim >= 0.72 → VERIFIED
                // operational maturity evidence (ISO45001, TRIR, 이수율, 투자 등)는
                // policy statement 없이 cluster match + 적당한 similarity만으로 VERIFIED 인정
                if (vStatus == null && code.startsWith("S-")
                        && effectiveSim >= 0.72 && text != null && text.length() > 5
                        && hasClusterMatch) {
                    vStatus = "VERIFIED";
                    log.info("[VSTATUS] indicator={} verificationStatus=VERIFIED reason=S_CLUSTER_MATCH sim={} cluster={}",
                            code, String.format("%.3f", effectiveSim), ev.getMatchedCluster());
                }
                // [2] coverage-based VERIFIED: KPI+실행+운영 evidence 조합이 충분하면 VERIFIED
                // "정책 문구가 없으면 실패" 대신 "실제 ESG 운영 evidence가 충분하면 VERIFIED"
                if (vStatus == null && coverageVerified && text != null && text.length() > 5) {
                    vStatus = "VERIFIED";
                    log.info("[VSTATUS] indicator={} verificationStatus=VERIFIED reason=COVERAGE_BASED sim={}",
                            code, String.format("%.3f", effectiveSim));
                }
                // [3] sim >= 0.70 + keyword evidence 있음 → VERIFIED (KPI 수치 evidence 승격)
                if (vStatus == null && effectiveSim >= 0.70 && text != null && text.length() > 5
                        && ev.getMatchedKeywords() != null && !ev.getMatchedKeywords().isEmpty()) {
                    vStatus = "VERIFIED";
                    log.info("[VSTATUS] indicator={} verificationStatus=VERIFIED reason=SIM_KW sim={} kws={}",
                            code, String.format("%.3f", effectiveSim), ev.getMatchedKeywords());
                }
            }
            // [4] G-303: 명시적 거버넌스 조직 구문 포함 시 mandatory VERIFIED 강제
            if ("G-303".equals(code) && hasG303GovPhrase(ev.getEvidenceText())) {
                vStatus = "VERIFIED";
                log.info("[VSTATUS] indicator=G-303 verificationStatus=VERIFIED reason=GOVERNANCE_PHRASE_FORCED text='{}'",
                        ev.getEvidenceText() != null
                                ? (ev.getEvidenceText().length() > 60 ? ev.getEvidenceText().substring(0, 60) : ev.getEvidenceText())
                                : "null");
            }
        }

        // VERIFIED + LOW/WEAK level 모순 방지: VERIFIED 판정 시 최소 MEDIUM 보장
        // 이유: "직접 근거 확인" + "신뢰도 낮음" 뱃지 동시 표시 → 사용자 혼란 방지
        if ("VERIFIED".equals(vStatus) && ("LOW".equals(level) || "WEAK".equals(level))) {
            log.info("[LEVEL-UPGRADE] indicator={} VERIFIED+{} → MEDIUM (consistency)", code, level);
            level = "MEDIUM";
        }

        log.info("[VERDICT-TRACE] indicator={} isExplicit={} rawSim={} finalScore={} effectiveSim={} vStatus={} level={} textLen={}",
                code, isExplicit,
                String.format("%.3f", sim),
                String.format("%.3f", ev.getFinalScore()),
                String.format("%.3f", Math.max(sim, ev.getFinalScore())),
                vStatus != null ? vStatus : "null(frontend-decides)",
                level,
                ev.getEvidenceText() != null ? ev.getEvidenceText().length() : 0);

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
                        .sourceFile(ev.getSourceFile())
                        // Explainability: keyword gate 결과를 UI에 노출
                        .matchedKeywords(ev.getMatchedKeywords() != null && !ev.getMatchedKeywords().isEmpty()
                                ? ev.getMatchedKeywords() : null)
                        .matchedCluster(ev.getMatchedCluster())
                        .verificationStatus(vStatus);

        if (numericMatch != null && numericMetric != null) {
            builder.numericMatchLevel(numericMatch.level())
                   .numericDiffPercent(numericMatch.diffPercent())
                   .numericMetric(numericMetric)
                   .inputValue(inputVal > 0 ? inputVal : null)
                   .extractedValue(extractedVal >= 0 ? extractedVal : null)  // 0-value 허용
                   .unit(numericExtractionService.metricUnit(numericMetric));
        }

        return builder.build();
    }

    /**
     * S-202(산업재해 발생 여부) 전용: 증빙 텍스트가 실제 부정적 사건(사고 발생)을 언급하는지 판단.
     * 부정 표현("발생하지 않음", "무재해", "감소", "0건" 등)이 포함된 경우 긍정 문맥으로 처리.
     */
    private boolean isActualNegativeOccurrence(String text) {
        if (text == null || text.isBlank()) return false;
        String t = text.toLowerCase();

        // 긍정 문맥 패턴 — 이 패턴이 있으면 실제 부정 사건이 아님 (오탐 방지)
        boolean hasPositiveNegation =
                t.contains("발생하지 않") || t.contains("발생 없") || t.contains("없었습니다")
                || t.contains("없습니다") || t.contains("0건") || t.contains("zero")
                || t.contains("무재해") || t.contains("무사고") || t.contains("ltir 0")
                || t.contains("ltir0") || t.contains("재해율 0") || t.contains("재해 없음")
                || t.contains("사고 없음") || t.contains("사망 없음") || t.contains("부상 없음")
                || t.contains("감소") || t.contains("예방") || t.contains("안전관리 운영")
                || t.contains("안전 강화") || t.contains("발생률 0") || t.contains("재해건수 0")
                // mitigation & improvement signals — disclosure maturity로 해석
                || t.contains("재발방지") || t.contains("개선 완료") || t.contains("업계 평균")
                || t.contains("원인 분석") || t.contains("trir") || t.contains("ltir")
                || t.contains("개선조치") || t.contains("예방체계") || t.contains("안전 개선")
                || t.contains("중대재해 0");

        if (hasPositiveNegation) {
            log.debug("[NegationDetect] positive context detected — not a real incident: '{}'",
                    text.length() > 80 ? text.substring(0, 80) + "..." : text);
            return false;
        }

        // 실제 부정 사건 패턴 — 이 패턴이 있어야 진짜 NEGATIVE_SIGNAL
        return t.contains("사고 발생") || t.contains("재해 발생") || t.contains("중대재해 발생")
                || t.contains("사망 발생") || t.contains("부상자 발생") || t.contains("산업재해 발생")
                || t.contains("안전사고 발생") || t.contains("명 사망") || t.contains("명 부상")
                || t.contains("환경오염 발생") || t.contains("화재 발생") || t.contains("누출 발생");
    }
}
