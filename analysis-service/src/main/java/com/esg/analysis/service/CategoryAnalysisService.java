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
 * S 또는 G 카테고리 단독 분석 서비스.
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
 * Confidence 계산:
 *   RAG 있음: ConfidenceService 평균 (0~100)
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
                                            Map<String, Double> eMetricInputs) {

        int checklistScore = computeChecklistScore(checkedCount, totalItems);
        log.info("[CategoryAnalysis] category={} checklistScore={} hasFile={}",
                category, checklistScore, file != null && !file.isEmpty());

        // ── 체크리스트 전용 경로 ─────────────────────────────────────────────
        if (file == null || file.isEmpty()) {
            return buildChecklistOnlyResult(checklistScore, totalItems, checkedCount);
        }

        // ── RAG 분석 경로 ───────────────────────────────────────────────────
        List<ESGIndicator> indicators = indicatorRepository.findAllByOrderByCategoryAscCodeAsc().stream()
                .filter(i -> category.equalsIgnoreCase(i.getCategory()))
                .collect(Collectors.toList());

        if (indicators.isEmpty()) {
            log.warn("[CategoryAnalysis] 지표 없음 category={} — 체크리스트 전용으로 대체", category);
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
            int lowCount = 0;

            Map<String, String> titleMap = indicators.stream()
                    .collect(Collectors.toMap(ESGIndicator::getCode, ESGIndicator::getTitle));

            boolean hasEMetrics = "E".equalsIgnoreCase(category)
                    && eMetricInputs != null && !eMetricInputs.isEmpty();

            // ── E 수치 검증: 전체 마크다운에서 메트릭별 수치 선(先)추출 ────────
            // Evidence 청크에 없어도 문서 전체에서 찾을 수 있도록 fallback 맵 생성
            Map<String, Double> markdownExtracted = new HashMap<>();
            if (hasEMetrics) {
                for (String metric : eMetricInputs.keySet()) {
                    numericExtractionService.extractFromText(markdown, metric)
                            .filter(v -> v > 0)
                            .ifPresent(v -> markdownExtracted.put(metric, v));
                }
                log.info("[NumericMatch] 마크다운 선추출 완료: {}", markdownExtracted);
            }

            for (ESGIndicator indicator : indicators) {
                List<EvidenceResult> evidences =
                        reportRagService.retrieveEvidenceForIndicator(sessionId, indicator, 3);

                int conf  = confidenceService.calculate(indicator, evidences);
                int score = conf >= 30 ? scoreCalculator.calculate(indicator, evidences)
                                       : computeChecklistContribution(checklistAnswers, indicator, checkedCount, totalItems);

                // ── E 지표 수치 검증 (Numeric Matching) ────────────────────────
                NumericExtractionService.MatchResult numericMatch = null;
                double inputVal     = 0.0;
                double extractedVal = 0.0;
                String numericMetric = null;

                if (hasEMetrics) {
                    numericMetric = numericExtractionService.indicatorCodeToMetric(indicator.getCode());
                    if (numericMetric != null && eMetricInputs.containsKey(numericMetric)) {
                        inputVal = eMetricInputs.get(numericMetric);

                        // 1차: Evidence 텍스트 합산에서 추출
                        String combinedText = evidences.stream()
                                .map(EvidenceResult::getEvidenceText)
                                .collect(Collectors.joining(" "));
                        java.util.Optional<Double> extracted =
                                numericExtractionService.extractFromText(combinedText, numericMetric);

                        // 2차 fallback: 전체 마크다운 선추출 결과 사용
                        if (!extracted.isPresent() && markdownExtracted.containsKey(numericMetric)) {
                            extracted = java.util.Optional.of(markdownExtracted.get(numericMetric));
                            log.info("[NumericMatch] 마크다운 fallback 사용 metric={} value={}", numericMetric, markdownExtracted.get(numericMetric));
                        }

                        if (extracted.isPresent()) {
                            extractedVal = extracted.get();
                            numericMatch = numericExtractionService.compare(inputVal, extractedVal);
                            double nmScore = numericExtractionService.numericMatchScore(numericMatch.level());

                            // Confidence 재산정 후 수치 불일치 수준별 하드캡 적용
                            conf = (int) Math.min(100, Math.round(conf * 0.8 + nmScore * 20));
                            if (numericMatch.isLow())         conf = Math.min(conf, 40);
                            else if (numericMatch.isMedium()) conf = Math.min(conf, 70);

                            // Score 감점 (수치 핵심 로직)
                            if (numericMatch.isLow())         score = Math.max(0, score - 25);
                            else if (numericMatch.isMedium()) score = Math.max(0, score - 10);

                            log.info("[NumericMatch] indicator={} metric={} input={} extracted={} diff={}% level={}",
                                    indicator.getCode(), numericMetric, inputVal, extractedVal,
                                    numericMatch.diffPercent(), numericMatch.level());
                        } else {
                            log.warn("[NumericMatch] 수치 추출 실패 indicator={} metric={} — 입력값={} 문서에서 {} 단위 값 없음",
                                    indicator.getCode(), numericMetric, inputVal,
                                    numericExtractionService.metricUnit(numericMetric));
                        }
                    }
                }

                if (numericMatch != null && numericMatch.isLow()) lowCount++;
                ragScores.add(score);
                confidences.add(conf);

                // 상위 Evidence 수집 (유효한 것 우선, 최대 2개) + numericMatch 정보 포함
                final NumericExtractionService.MatchResult finalMatch  = numericMatch;
                final String  finalMetric   = numericMetric;
                final double  finalInput    = inputVal;
                final double  finalExtracted = extractedVal;

                evidences.stream()
                        .filter(EvidenceResult::isValidEvidence)
                        .limit(2)
                        .map(ev -> toEvidenceItemWithNumeric(
                                ev, indicator.getCode(), titleMap.get(indicator.getCode()),
                                finalMatch, finalMetric, finalInput, finalExtracted))
                        .forEach(evidenceItems::add);

                log.debug("[CategoryAnalysis] indicator={} ragScore={} conf={}", indicator.getCode(), score, conf);
            }

            // 4. 점수 집계
            int avgRag  = avg(ragScores);
            int avgConf = avg(confidences);

            // ── 수치 불일치 기반 avgRag 가중 감산 (weighted score 이전 단계) ──
            if (hasEMetrics && lowCount >= 4)      avgRag = Math.max(0, (int)(avgRag * 0.35));
            else if (hasEMetrics && lowCount >= 3) avgRag = Math.max(0, (int)(avgRag * 0.55));
            else if (hasEMetrics && lowCount >= 1) avgRag = Math.max(0, (int)(avgRag * 0.75));

            int finalScore = Math.min(100, Math.round(avgRag * 0.6f + checklistScore * 0.4f));
            String grade   = toGrade(finalScore);

            // ── 전역 Confidence 캡 (LOW 1개 이상이면 최대 40) ────────────────
            if (hasEMetrics && lowCount >= 1) avgConf = Math.min(avgConf, 40);

            // 5. Grade Ceiling: ≥1→B, ≥3→C, ≥4→D
            String gradeCeiling = lowCount >= 4 ? "D" : lowCount >= 3 ? "C" : lowCount >= 1 ? "B" : null;
            boolean ceilingApplied = false;
            if (gradeCeiling != null) {
                String capped = applyGradeCeiling(grade, gradeCeiling);
                ceilingApplied = !capped.equals(grade);
                grade = capped;
            }

            // LOW 4개 이상이면 confidence 20 이하 강제
            if (hasEMetrics && lowCount >= 4) avgConf = Math.min(avgConf, 20);

            String warning = lowCount >= 1
                    ? "[경고] 입력 수치와 증빙자료 간 수치 불일치가 감지되었습니다."
                    : null;

            log.info("[CategoryAnalysis] 완료 category={} ragScore={} checklistScore={} → {}점 {} 신뢰도={}% lowCount={} ceilingApplied={}",
                    category, avgRag, checklistScore, finalScore, grade, avgConf, lowCount, ceilingApplied);

            return CategoryAnalysisResponse.builder()
                    .score(finalScore)
                    .grade(grade)
                    .confidence(avgConf)
                    .evidenceCount(evidenceItems.size())
                    .ragBased(true)
                    .lowMismatchCount(lowCount > 0 ? lowCount : null)
                    .gradeCeilingApplied(ceilingApplied ? true : null)
                    .warning(warning)
                    .evidences(evidenceItems.isEmpty() ? null : evidenceItems)
                    .build();

        } catch (Exception e) {
            log.error("[CategoryAnalysis] RAG 실패 category={} 원인={} — 체크리스트 전용으로 대체",
                    category, e.getMessage());
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
                .grade(toGrade(score))
                .confidence(confidence)
                .evidenceCount(checkedCount)
                .ragBased(false)
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
        // binary 지표(여부)는 체크리스트 비율을 그대로 반영; 수치 지표는 40점 하한
        return indicator.getTitle().endsWith("여부") ? Math.max(40, base) : 40;
    }

    private int avg(List<Integer> values) {
        if (values.isEmpty()) return 0;
        return (int) Math.round(values.stream().mapToInt(Integer::intValue).average().orElse(0));
    }

    private String toGrade(int score) {
        if (score >= 80) return "A";
        if (score >= 65) return "B";
        if (score >= 45) return "C";
        return "D";
    }

    // A > B > C > D 순서로 ceiling보다 좋은 등급이면 ceiling으로 낮춥니다.
    private String applyGradeCeiling(String grade, String ceiling) {
        java.util.List<String> order = java.util.List.of("A", "B", "C", "D");
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

    private CategoryAnalysisResponse.EvidenceItem toEvidenceItemWithNumeric(
            EvidenceResult ev, String code, String title,
            NumericExtractionService.MatchResult numericMatch,
            String numericMetric, double inputVal, double extractedVal) {

        double sim = ev.getSimilarity();
        String level = sim >= 0.75 ? "HIGH" : sim >= 0.55 ? "MEDIUM" : "LOW";

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
