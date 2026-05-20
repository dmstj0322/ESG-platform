package com.esg.analysis.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.*;

/**
 * OCR/CSV 텍스트에서 E 지표 관련 수치를 추출하고 사용자 입력값과 비교합니다.
 *
 * <pre>
 * 지원 지표 -> 메트릭 매핑:
 *   E-101 전력 사용량 -> electricity (kWh)
 *   E-102 가스 사용량 -> gas (MJ)
 *   E-103 탄소 배출량 -> carbon (tCO2)
 *   E-104 폐기물 발생량 -> waste (kg)
 *   E-105 수자원 사용량 -> water (m3)
 *
 * 비교 기준:
 *   diffPercent = abs(input - extracted) / input * 100
 *   <= 5%  -> HIGH
 *   <= 15% -> MEDIUM
 *   >  15% -> LOW
 * </pre>
 *
 * 추출 전략 (우선순위 순):
 *   1. Markdown table 전체 파싱
 *   2. 라인 단위 파싱 (영문/한글 키워드 모두 지원)
 *   3. regex fallback (unicode 정규화 후 적용)
 */
@Slf4j
@Service
public class NumericExtractionService {

    // ---- 지표 코드 -> 메트릭 이름 -----------------------------------------------
    private static final Map<String, String> CODE_TO_METRIC = Map.of(
            "E-101", "electricity",
            "E-102", "gas",
            "E-103", "carbon",
            "E-104", "waste",
            "E-105", "water"
    );

    // ---- 메트릭 -> 표시 단위 -----------------------------------------------------
    private static final Map<String, String> METRIC_UNIT = Map.of(
            "electricity", "kWh",
            "gas",         "MJ",
            "carbon",      "tCO2",
            "waste",       "kg",
            "water",       "m3"
    );

    private static final Map<String, String> METRIC_KOREAN_NAME = Map.of(
            "electricity", "전력 사용량",
            "gas",         "가스 사용량",
            "carbon",      "탄소 배출량",
            "waste",       "폐기물 발생량",
            "water",       "용수 사용량"
    );

    // ---- 메트릭 -> 한국어/영문 라인 필터 키워드 (strategy-2) ----------------------
    private static final Map<String, List<String>> METRIC_KOR_KEYWORDS = new java.util.LinkedHashMap<>();
    static {
        METRIC_KOR_KEYWORDS.put("carbon", List.of(
                "탄소배출량",   // 탄소배출량
                "탄소 배출량",  // 탄소 배출량
                "온실가스배출량",   // 온실가스배출량
                "온실가스 배출량",  // 온실가스 배출량
                "온실가스",   // 온실가스
                "탄소",               // 탄소
                "tco2", "co2"
        ));
        METRIC_KOR_KEYWORDS.put("electricity", List.of(
                "전력사용량",    // 전력사용량
                "전력 사용량",   // 전력 사용량
                "전기사용량",    // 전기사용량
                "전기 사용량",   // 전기 사용량
                "전력",  // 전력
                "전기",  // 전기
                "kwh"
        ));
        METRIC_KOR_KEYWORDS.put("gas", List.of(
                "가스사용량",    // 가스사용량
                "가스 사용량",   // 가스 사용량
                "천연가스",           // 천연가스
                "가스"                        // 가스
        ));
        METRIC_KOR_KEYWORDS.put("waste", List.of(
                "폐기물발생량",  // 폐기물발생량
                "폐기물 발생량", // 폐기물 발생량
                "폐기물"                     // 폐기물
        ));
        METRIC_KOR_KEYWORDS.put("water", List.of(
                "수자원",    // 수자원
                "용수사용량",   // 용수사용량
                "용수 사용량",  // 용수 사용량
                "용수",          // 용수
                "취수량"     // 취수량
        ));
    }

    // ---- UnitDef: 단위 패턴 + 정규화 계수 ----------------------------------------
    private record UnitDef(String token, double factor) {}

    private static final Map<String, List<UnitDef>> UNIT_DEFS;
    static {
        Map<String, List<UnitDef>> m = new java.util.LinkedHashMap<>();
        m.put("electricity", List.of(
            new UnitDef("GWh",    1_000_000.0),
            new UnitDef("MWh",    1_000.0),
            new UnitDef("kWh",    1.0),
            new UnitDef("KWH",    1.0),
            new UnitDef("킬로와트시", 1.0)   // 킬로와트시
        ));
        m.put("gas", List.of(
            new UnitDef("Nm3",    38.4),
            new UnitDef("Ncm",    38.4),
            new UnitDef("Mcal",   4.1868),
            new UnitDef("MJ",     1.0),
            new UnitDef("메가줄", 1.0)  // 메가줄
        ));
        m.put("carbon", List.of(
            new UnitDef("tCO2",    1.0),
            new UnitDef("tCO2e",   1.0),
            new UnitDef("tCO2-eq", 1.0),
            new UnitDef("tco2eq",  1.0),
            new UnitDef("TCO2",    1.0),
            new UnitDef("tonCO2",  1.0),
            new UnitDef("ton CO2", 1.0)
        ));
        m.put("waste", List.of(
            new UnitDef("ton",     1_000.0),
            new UnitDef("kg",      1.0),
            new UnitDef("킬로그램", 1.0)  // 킬로그램
        ));
        m.put("water", List.of(
            new UnitDef("ML",      1_000.0),
            new UnitDef("kL",      1.0),
            new UnitDef("m3",      1.0),
            new UnitDef("세제곱미터", 1.0),  // 세제곱미터
            new UnitDef("입방미터",       1.0)   // 입방미터
        ));
        UNIT_DEFS = Collections.unmodifiableMap(m);
    }

    // ---- Fallback regex (normalizeForExtraction 적용 후 매칭) ---------------------
    private record RegexDef(Pattern compiled, double factor, String description) {}
    private static final Map<String, List<RegexDef>> REGEX_FALLBACK;
    private static final Pattern NUM_PATTERN = Pattern.compile("([\\d][\\d,，]*(?:\\.\\d+)?)");

    static {
        Map<String, List<RegexDef>> m = new LinkedHashMap<>();
        final String NUM = "([\\d][\\d,，]*(?:\\.\\d+)?)";

        m.put("electricity", List.of(
            new RegexDef(Pattern.compile(NUM + "\\s*(?:GWh|\\uae30\\uac00\\uc640\\ud2b8\\uc2dc)", Pattern.CASE_INSENSITIVE), 1_000_000.0, "NUM+GWh"),
            new RegexDef(Pattern.compile(NUM + "\\s*(?:MWh|\\uba54\\uac00\\uc640\\ud2b8\\uc2dc)", Pattern.CASE_INSENSITIVE), 1_000.0,     "NUM+MWh"),
            new RegexDef(Pattern.compile(NUM + "\\s*(?:kWh|KWH|\\ud82c\\ub85c\\uc640\\ud2b8\\uc2dc)",                        Pattern.CASE_INSENSITIVE), 1.0, "NUM+kWh"),
            new RegexDef(Pattern.compile("\\uc804\\ub825\\s*(?:\\uc0ac\\uc6a9\\ub7c9|\\uc18c\\ube44\\ub7c9?)[^\\d]{0,30}" + NUM), 1.0, "전력사용량+NUM"),
            new RegexDef(Pattern.compile("\\uc804\\uae30\\s*(?:\\uc0ac\\uc6a9\\ub7c9|\\uc18c\\ube44\\ub7c9?)[^\\d]{0,30}" + NUM), 1.0, "전기사용량+NUM")
        ));
        m.put("gas", List.of(
            new RegexDef(Pattern.compile(NUM + "\\s*(?:MJ|\\uba54\\uac00\\uc904|Mcal)", Pattern.CASE_INSENSITIVE), 1.0,  "NUM+MJ"),
            new RegexDef(Pattern.compile(NUM + "\\s*(?:Nm3|Ncm|\\ub178\\uba40\\uc785\\ubc29)",  Pattern.CASE_INSENSITIVE), 38.4, "NUM+Nm3"),
            new RegexDef(Pattern.compile("\\uac00\\uc2a4\\s*(?:\\uc0ac\\uc6a9\\ub7c9|\\uc18c\\ube44\\ub7c9?)[^\\d]{0,30}" + NUM), 1.0, "가스사용량+NUM")
        ));
        // carbon: normalizeForExtraction 후 tco2 소문자 통일
        // ton\s*-?\s*co2 -> "ton CO2", "ton-CO2", "tonCO2" 모두 매칭
        m.put("carbon", List.of(
            new RegexDef(Pattern.compile(
                    NUM + "\\s*(?:tco2(?:[e-]?eq)?|tco2e?|ton\\s*-?\\s*co2|t-?co2)",
                    Pattern.CASE_INSENSITIVE), 1.0, "NUM+tco2-variants"),
            new RegexDef(Pattern.compile(
                    "\\ud0c4\\uc18c\\s*\\ubc30\\ucd9c\\ub7c9[^\\d]{0,30}" + NUM,
                    Pattern.CASE_INSENSITIVE), 1.0, "탄소배출량+NUM"),
            new RegexDef(Pattern.compile(
                    "\\uc628\\uc2e4\\uac00\\uc2a4\\s*\\ubc30\\ucd9c\\ub7c9[^\\d]{0,30}" + NUM,
                    Pattern.CASE_INSENSITIVE), 1.0, "온실가스배출량+NUM"),
            new RegexDef(Pattern.compile(
                    "\\ud0c4\\uc18c\\s*\\ubc1c\\uc0dd\\ub7c9[^\\d]{0,30}" + NUM,
                    Pattern.CASE_INSENSITIVE), 1.0, "탄소발생량+NUM")
        ));
        m.put("waste", List.of(
            new RegexDef(Pattern.compile(NUM + "\\s*(?:kg|\\ud82c\\ub85c\\uadf8\\ub7a8)", Pattern.CASE_INSENSITIVE), 1.0,       "NUM+kg"),
            new RegexDef(Pattern.compile("(?:\\ud3d0\\uae30\\ubb3c|waste)[^\\n]{0,40}?" + NUM + "\\s*(?:ton|t\\b)", Pattern.CASE_INSENSITIVE), 1_000.0, "폐기물+NUM+ton"),
            new RegexDef(Pattern.compile("\\ud3d0\\uae30\\ubb3c\\s*(?:\\ubc1c\\uc0dd\\ub7c9?|\\ucc98\\ub9ac\\ub7c9?)?[^\\d]{0,30}" + NUM), 1.0, "폐기물발생량+NUM")
        ));
        m.put("water", List.of(
            new RegexDef(Pattern.compile(NUM + "\\s*(?:m3|\\u338d|\\uc138\\uc81c\\uacf1\\ubbf8\\ud130|\\uc785\\ubc29\\ubbf8\\ud130)", Pattern.CASE_INSENSITIVE), 1.0, "NUM+m3"),
            new RegexDef(Pattern.compile("\\uc218\\uc790\\uc6d0\\s*(?:\\uc0ac\\uc6a9\\ub7c9?|\\ucde8\\uc218\\ub7c9?)?[^\\d]{0,30}" + NUM), 1.0, "수자원+NUM"),
            new RegexDef(Pattern.compile("\\uc6a9\\uc218\\s*(?:\\uc0ac\\uc6a9\\ub7c9?)?[^\\d]{0,30}" + NUM), 1.0, "용수+NUM")
        ));

        REGEX_FALLBACK = Collections.unmodifiableMap(m);
    }

    // ==========================================================================
    // 공개 API
    // ==========================================================================

    public String indicatorCodeToMetric(String code) {
        return CODE_TO_METRIC.get(code);
    }

    public String metricUnit(String metric) {
        return METRIC_UNIT.getOrDefault(metric, "");
    }

    public String metricKoreanName(String metric) {
        return METRIC_KOREAN_NAME.getOrDefault(metric, metric);
    }

    /**
     * OCR/CSV 텍스트에서 메트릭 수치를 추출합니다.
     * 내부적으로 normalizeForExtraction() 을 거쳐 3단계 전략을 순서대로 시도합니다.
     *
     * @param text   OCR/마크다운/Evidence 텍스트
     * @param metric "electricity" | "gas" | "carbon" | "waste" | "water"
     * @return 추출된 양수 값 (없으면 empty)
     */
    public Optional<Double> extractFromText(String text, String metric) {
        if (text == null || text.isBlank() || metric == null) return Optional.empty();

        log.info("[E-METRIC-PARSE-ENTRY] metric={} textLen={} textPreview='{}'",
                metric, text.length(),
                text.length() > 120 ? text.substring(0, 120).replaceAll("\\s+", " ") + "..." : text.replaceAll("\\s+", " "));

        // unicode subscript/공백 정규화
        String normalized = normalizeForExtraction(text);

        String previewRaw  = text.replaceAll("\\s+", " ");
        String previewNorm = normalized;
        if (previewRaw.length()  > 300) previewRaw  = previewRaw.substring(0, 300)  + "...";
        if (previewNorm.length() > 300) previewNorm = previewNorm.substring(0, 300) + "...";

        log.info("[E-METRIC-PARSE] metric={} textLen={} rawPreview='{}' normalizedPreview='{}'",
                metric, text.length(), previewRaw, previewNorm);

        // 1차: Markdown table
        Optional<Double> tableResult = extractFromMarkdownTable(normalized, metric);
        if (tableResult.isPresent()) {
            log.info("[E-METRIC-PARSE] metric={} strategy=table value={} SUCCESS", metric, tableResult.get());
            return tableResult;
        }
        log.debug("[E-METRIC-PARSE] metric={} strategy=table MISS", metric);

        // 2차: 라인 단위 (영문+한글 키워드)
        Optional<Double> lineResult = extractFromLines(normalized, metric);
        if (lineResult.isPresent()) {
            log.info("[E-METRIC-PARSE] metric={} strategy=line value={} SUCCESS", metric, lineResult.get());
            return lineResult;
        }
        log.debug("[E-METRIC-PARSE] metric={} strategy=line MISS", metric);

        // 3차: regex fallback
        Optional<Double> regexResult = extractByRegexFallback(normalized, metric);
        if (regexResult.isEmpty()) {
            log.info("[E-METRIC-PARSE] metric={} strategy=all-fail reason=NO_PATTERN_MATCH normalizedText='{}'",
                    metric, previewNorm);
        }
        return regexResult;
    }

    /**
     * 사용자 입력값 vs OCR 추출값 비교.
     */
    public MatchResult compare(double input, double extracted) {
        if (input <= 0) return new MatchResult("LOW", 100.0);
        double diff = Math.abs(input - extracted) / input * 100.0;
        double roundedDiff = Math.round(diff * 100.0) / 100.0;
        String level = diff <= 5.0 ? "HIGH" : diff <= 20.0 ? "MEDIUM" : "LOW";
        return new MatchResult(level, roundedDiff);
    }

    public double numericMatchScore(String level) {
        return switch (level) {
            case "HIGH"   -> 1.0;
            case "MEDIUM" -> 0.5;
            default       -> 0.0;
        };
    }

    // ==========================================================================
    // 정규화 헬퍼
    // ==========================================================================

    /**
     * OCR 텍스트를 regex 매칭에 적합하도록 정규화합니다.
     *
     * 처리 순서:
     *   1. Unicode subscript/superscript 숫자 -> ASCII  (tCO2 의 U+2082 subscript 2 포함)
     *   2. 비표준 공백(non-breaking, en, em, thin, ideographic) -> 일반 공백  (U+00A0, U+2002, U+2003, U+2009, U+3000)
     *   3. 연속 공백 -> 단일 공백
     */
    static String normalizeForExtraction(String text) {
        // subscript/superscript 숫자 -> ASCII
        String s = text
                .replace('₀', '0')
                .replace('₁', '1')
                .replace('₂', '2')   // tCO2 의 핵심
                .replace('₃', '3')
                .replace('₄', '4')
                .replace('₅', '5')
                .replace('₆', '6')
                .replace('₇', '7')
                .replace('₈', '8')
                .replace('₉', '9')
                .replace('²', '2')   // superscript 2
                .replace('³', '3');  // superscript 3

        // 비표준 공백 -> 일반 공백
        s = s.replaceAll("[    　​⁠]", " ");

        // 각 줄 내 연속 공백/탭 -> 단일 공백 (줄바꿈 보존 — 테이블 행 분리 유지)
        s = s.replaceAll("[ \t]+", " ");

        // CRLF 통일
        s = s.replace("\r\n", "\n").replace("\r", "\n");

        return s.trim();
    }

    // ==========================================================================
    // 1차 전략: Markdown table 전체 파싱
    // ==========================================================================

    private Optional<Double> extractFromMarkdownTable(String text, String metric) {
        String metricLower = metric.toLowerCase();

        List<String> tableLines = new ArrayList<>();
        for (String rawLine : text.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (line.startsWith("|") && line.endsWith("|") && !line.isBlank()) {
                tableLines.add(line);
            }
        }
        if (tableLines.isEmpty()) return Optional.empty();

        int targetColIdx  = -1;
        int headerLineIdx = -1;

        for (int i = 0; i < tableLines.size(); i++) {
            String line = tableLines.get(i);
            if (isSeparatorRow(line)) continue;

            List<String> cols = splitTableLine(line);
            for (int j = 0; j < cols.size(); j++) {
                if (cols.get(j).toLowerCase().contains(metricLower)) {
                    targetColIdx  = j;
                    headerLineIdx = i;
                    log.info("[NumericMatch] header found metric={} col_idx={} col_name='{}'",
                            metric, j, cols.get(j));
                    break;
                }
            }
            if (targetColIdx >= 0) break;
        }

        if (targetColIdx < 0) return Optional.empty();

        List<Double> values = new ArrayList<>();
        for (int i = headerLineIdx + 1; i < tableLines.size(); i++) {
            String line = tableLines.get(i);
            if (isSeparatorRow(line)) continue;

            List<String> cols = splitTableLine(line);
            if (targetColIdx < cols.size()) {
                String valStr = cols.get(targetColIdx).replaceAll("[,，]", "");
                try {
                    double val = Double.parseDouble(valStr);
                    if (val > 0) {
                        values.add(val);
                        log.info("[NumericMatch] data row metric={} col_idx={} value={}",
                                metric, targetColIdx, val);
                    }
                } catch (NumberFormatException ignore) {}
            }
        }

        if (values.isEmpty()) return Optional.empty();

        double total = values.stream().mapToDouble(Double::doubleValue).sum();
        log.info("[NumericMatch] parsed {}={} ({}rows summed)", metric, total, values.size());
        return Optional.of(total);
    }

    // ==========================================================================
    // 2차 전략: 라인 단위 파싱 (영문/한글 키워드 지원)
    // ==========================================================================

    private Optional<Double> extractFromLines(String text, String metric) {
        String metricLower = metric.toLowerCase();
        List<String> korKeywords = METRIC_KOR_KEYWORDS.getOrDefault(metric, List.of());

        for (String rawLine : text.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (line.isBlank()) continue;
            if (isSeparatorRow(line)) continue;

            String lineLower = line.toLowerCase();
            boolean hasMetricKeyword = lineLower.contains(metricLower)
                    || korKeywords.stream().anyMatch(k -> lineLower.contains(k.toLowerCase()));
            if (!hasMetricKeyword) continue;

            // 우선순위 a: 단위 키워드 직전 숫자
            Optional<Double> byUnit = extractByUnit(line, metric);
            if (byUnit.isPresent()) {
                log.info("[NumericMatch] inline unit-match metric={} value={} line='{}'",
                        metric, byUnit.get(), line);
                return byUnit;
            }

            // 우선순위 b: 파이프 테이블 라인 — col 이름 기준 바로 다음 셀 추출
            if (line.contains("|")) {
                Optional<Double> tableVal = extractFromTableLine(line, metric);
                if (tableVal.isPresent()) {
                    log.info("[NumericMatch] inline table-match metric={} value={} line='{}'",
                            metric, tableVal.get(), line);
                    return tableVal;
                }
                // 파이프 테이블 행에서는 first-num fallback 사용 금지 (날짜 컬럼 오추출 방지)
                log.debug("[NumericMatch] pipe-table line skipped first-num metric={} line='{}'",
                        metric, line.length() > 80 ? line.substring(0, 80) + "..." : line);
                continue;
            }

            // 우선순위 c: 라인 내 첫 번째 유효 숫자 (비테이블 라인 전용)
            Optional<Double> firstNum = extractFirstSignificantNumber(line);
            if (firstNum.isPresent()) {
                log.info("[NumericMatch] inline first-num metric={} value={} line='{}'",
                        metric, firstNum.get(), line);
                return firstNum;
            }
        }
        return Optional.empty();
    }

    private Optional<Double> extractByUnit(String line, String metric) {
        for (UnitDef ud : UNIT_DEFS.getOrDefault(metric, List.of())) {
            Pattern p = Pattern.compile(
                    "([\\d][\\d,，]*(?:\\.\\d+)?)\\s*" + Pattern.quote(ud.token()),
                    Pattern.CASE_INSENSITIVE
            );
            Matcher mat = p.matcher(line);
            if (mat.find()) {
                try {
                    double raw = Double.parseDouble(mat.group(1).replaceAll("[,，]", ""));
                    if (raw > 0) {
                        double normalized = raw * ud.factor();
                        if (ud.factor() != 1.0)
                            log.info("[UnitNorm] metric={} unit='{}' {}x{}={}", metric, ud.token(), raw, ud.factor(), normalized);
                        return Optional.of(normalized);
                    }
                } catch (NumberFormatException ignore) {}
            }
        }
        return Optional.empty();
    }

    private Optional<Double> extractFromTableLine(String line, String metric) {
        List<String> cols = splitTableLine(line);
        String metricNorm = metric.toLowerCase();
        for (int i = 0; i < cols.size(); i++) {
            if (cols.get(i).toLowerCase().contains(metricNorm)) {
                if (i + 1 < cols.size()) {
                    String valStr  = cols.get(i + 1).replaceAll("[,，]", "");
                    String unitStr = (i + 2 < cols.size()) ? cols.get(i + 2) : "";
                    try {
                        double val = Double.parseDouble(valStr);
                        if (val > 0) {
                            log.info("[NumericMatch] extractTableLine metric={} value={} unit={}",
                                    cols.get(i), val, unitStr);
                            return Optional.of(val);
                        }
                    } catch (NumberFormatException ignore) {}
                }
            }
        }
        return Optional.empty();
    }

    private Optional<Double> extractFirstSignificantNumber(String line) {
        Matcher mat = NUM_PATTERN.matcher(line);
        while (mat.find()) {
            try {
                String raw = mat.group(1).replaceAll("[,，]", "");
                double val = Double.parseDouble(raw);
                if (val >= 10) return Optional.of(val);
            } catch (NumberFormatException ignore) {}
        }
        return Optional.empty();
    }

    // ==========================================================================
    // 3차 전략: regex fallback — 상세 [E-METRIC-PARSE] 로그 포함
    // ==========================================================================

    private Optional<Double> extractByRegexFallback(String text, String metric) {
        List<RegexDef> patterns = REGEX_FALLBACK.get(metric);
        if (patterns == null) {
            log.info("[E-METRIC-PARSE] metric={} strategy=regex FAIL reason=NO_PATTERNS_DEFINED", metric);
            return Optional.empty();
        }

        int idx = 0;
        for (RegexDef rd : patterns) {
            idx++;
            Matcher mat = rd.compiled().matcher(text);
            if (!mat.find()) {
                log.debug("[E-METRIC-PARSE] metric={} strategy=regex pattern[{}]='{}' reason=NO_REGEX_MATCH",
                        metric, idx, rd.description());
                continue;
            }

            String matchedText = mat.group(0);
            String numStr;
            try {
                numStr = mat.group(1).replaceAll("[,，]", "");
            } catch (IndexOutOfBoundsException e) {
                log.info("[E-METRIC-PARSE] metric={} strategy=regex pattern[{}]='{}' matchedText='{}' FAIL reason=NO_CAPTURE_GROUP",
                        metric, idx, rd.description(), matchedText);
                continue;
            }

            double raw;
            try {
                raw = Double.parseDouble(numStr);
            } catch (NumberFormatException e) {
                log.info("[E-METRIC-PARSE] metric={} strategy=regex pattern[{}]='{}' matchedText='{}' numStr='{}' FAIL reason=NUMBER_PARSE_FAIL",
                        metric, idx, rd.description(), matchedText, numStr);
                continue;
            }

            if (raw <= 0) {
                log.info("[E-METRIC-PARSE] metric={} strategy=regex pattern[{}]='{}' matchedText='{}' value={} SKIP reason=NOT_POSITIVE",
                        metric, idx, rd.description(), matchedText, raw);
                continue;
            }

            double normalized = raw * rd.factor();
            if (rd.factor() != 1.0)
                log.info("[UnitNorm-Regex] metric={} raw={} x{}={}", metric, raw, rd.factor(), normalized);

            log.info("[E-METRIC-PARSE] metric={} strategy=regex pattern[{}]='{}' matchedText='{}' value={} unit={} SUCCESS",
                    metric, idx, rd.description(), matchedText, normalized, metricUnit(metric));
            return Optional.of(normalized);
        }

        log.info("[E-METRIC-PARSE] metric={} strategy=regex FAIL reason=ALL_PATTERNS_NO_MATCH patternsTriedCount={}",
                metric, idx);
        return Optional.empty();
    }

    // ==========================================================================
    // 공통 헬퍼
    // ==========================================================================

    private List<String> splitTableLine(String line) {
        List<String> cols = new ArrayList<>();
        for (String c : line.split("\\|")) {
            String trimmed = c.trim();
            if (!trimmed.isEmpty()) cols.add(trimmed);
        }
        return cols;
    }

    private boolean isSeparatorRow(String line) {
        return line.replaceAll("[|:\\-\\s]", "").isEmpty();
    }

    // ==========================================================================
    // 결과 타입
    // ==========================================================================

    /**
     * 수치 비교 결과.
     *
     * @param level       "HIGH" / "MEDIUM" / "LOW"
     * @param diffPercent 차이 비율 (%)
     */
    public record MatchResult(String level, double diffPercent) {
        public boolean isHigh()   { return "HIGH".equals(level); }
        public boolean isMedium() { return "MEDIUM".equals(level); }
        public boolean isLow()    { return "LOW".equals(level); }
    }
}
