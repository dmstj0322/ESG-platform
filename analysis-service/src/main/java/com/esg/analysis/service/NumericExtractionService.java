package com.esg.analysis.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.*;

/**
 * OCR/CSV 텍스트에서 E 지표 관련 수치를 추출하고 사용자 입력값과 비교합니다.
 *
 * <pre>
 * 지원 지표 → 메트릭 매핑:
 *   E-101 전력 사용량 → electricity (kWh)
 *   E-102 가스 사용량 → gas (MJ)
 *   E-103 탄소 배출량 → carbon (tCO₂)
 *   E-104 폐기물 발생량 → waste (kg)
 *   E-105 수자원 사용량 → water (m³)
 *
 * 비교 기준:
 *   diffPercent = abs(input - extracted) / input × 100
 *   ≤ 5%  → HIGH
 *   ≤ 15% → MEDIUM
 *   > 15% → LOW
 * </pre>
 *
 * 추출 전략 (우선순위 순):
 *   1. 라인 단위 파싱 — metric 키워드가 포함된 라인에서만 수치 탐색
 *      a. 단위 키워드(kWh, MJ …) 바로 앞 숫자
 *      b. 파이프(|) 구분 마크다운 테이블 컬럼 파싱
 *      c. 라인 내 첫 번째 유효 숫자 (1자리 index 제외)
 *   2. 전문 regex fallback — 단락형 OCR 텍스트용
 */
@Slf4j
@Service
public class NumericExtractionService {

    // ── 지표 코드 → 메트릭 이름 ──────────────────────────────────────────────
    private static final Map<String, String> CODE_TO_METRIC = Map.of(
            "E-101", "electricity",
            "E-102", "gas",
            "E-103", "carbon",
            "E-104", "waste",
            "E-105", "water"
    );

    // ── 메트릭 → 표시 단위 ────────────────────────────────────────────────────
    private static final Map<String, String> METRIC_UNIT = Map.of(
            "electricity", "kWh",
            "gas",         "MJ",
            "carbon",      "tCO₂",
            "waste",       "kg",
            "water",       "m³"
    );

    // ── 메트릭 → 단위 키워드 목록 (단위 앞 숫자 추출용) ──────────────────────
    private static final Map<String, List<String>> UNIT_KEYWORDS = Map.of(
            "electricity", List.of("kWh", "KWH", "MWh", "킬로와트시"),
            "gas",         List.of("MJ", "Nm³", "Nm3", "Mcal", "메가줄"),
            "carbon",      List.of("tCO2", "tCO₂", "TCO2", "tco2eq", "tCO2-eq"),
            "waste",       List.of("kg", "킬로그램"),
            "water",       List.of("m³", "m3", "㎥", "세제곱미터", "입방미터")
    );

    // ── Fallback: 전문 regex 패턴 (단락형 OCR 텍스트용) ──────────────────────
    // 그룹 1: 숫자(콤마·소수 포함)
    private static final Map<String, List<Pattern>> REGEX_FALLBACK;
    private static final Pattern NUM_PATTERN = Pattern.compile("([\\d][\\d,，]*(?:\\.\\d+)?)");

    static {
        Map<String, List<Pattern>> m = new LinkedHashMap<>();
        final String NUM = "([\\d][\\d,，]*(?:\\.\\d+)?)";

        m.put("electricity", List.of(
                Pattern.compile(NUM + "\\s*(?:kWh|킬로와트시|KWH)", Pattern.CASE_INSENSITIVE),
                Pattern.compile(NUM + "\\s*(?:MWh|메가와트시)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("전력\\s*(?:사용량|소비량?)[^\\d]*" + NUM),
                Pattern.compile("전기\\s*(?:사용량|소비량?)[^\\d]*" + NUM)
        ));
        m.put("gas", List.of(
                Pattern.compile(NUM + "\\s*(?:MJ|메가줄|Mcal)", Pattern.CASE_INSENSITIVE),
                Pattern.compile(NUM + "\\s*(?:Nm³|Nm3|Ncm|노멀입방)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("가스\\s*(?:사용량|소비량?)[^\\d]*" + NUM)
        ));
        m.put("carbon", List.of(
                Pattern.compile(NUM + "\\s*(?:tCO2|tCO₂|톤-?CO2|ton-?CO2|TCO2|tco2eq|tCO2-eq)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("탄소\\s*배출량[^\\d]*" + NUM),
                Pattern.compile("온실가스\\s*배출량[^\\d]*" + NUM)
        ));
        m.put("waste", List.of(
                Pattern.compile(NUM + "\\s*(?:kg|킬로그램)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("(?:폐기물|waste)[^\\n]{0,40}?" + NUM + "\\s*(?:ton|t\\b)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("폐기물\\s*(?:발생량?|처리량?)?[^\\d]*" + NUM)
        ));
        m.put("water", List.of(
                Pattern.compile(NUM + "\\s*(?:m³|m3|㎥|세제곱미터|입방미터)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("수자원\\s*(?:사용량?|취수량?)?[^\\d]*" + NUM),
                Pattern.compile("용수\\s*(?:사용량?)?[^\\d]*" + NUM)
        ));

        REGEX_FALLBACK = Collections.unmodifiableMap(m);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 공개 API
    // ══════════════════════════════════════════════════════════════════════════

    /** E 지표 코드를 메트릭 이름으로 변환합니다. 매핑 없으면 null. */
    public String indicatorCodeToMetric(String code) {
        return CODE_TO_METRIC.get(code);
    }

    /** 메트릭 이름에 대응하는 표준 단위를 반환합니다. */
    public String metricUnit(String metric) {
        return METRIC_UNIT.getOrDefault(metric, "");
    }

    /**
     * OCR/CSV 마크다운 텍스트에서 특정 메트릭 수치를 추출합니다.
     *
     * <p>전략: 라인 단위 파싱(우선) → 전문 regex fallback
     *
     * @param text   OCR 마크다운 / CSV 마크다운 / Evidence 텍스트
     * @param metric "electricity" | "gas" | "carbon" | "waste" | "water"
     * @return 첫 번째로 발견된 양수 값 (없으면 empty)
     */
    public Optional<Double> extractFromText(String text, String metric) {
        if (text == null || text.isBlank() || metric == null) return Optional.empty();

        // 1차: 라인 단위 파싱 — row/column index 오추출 방지
        Optional<Double> lineResult = extractFromLines(text, metric);
        if (lineResult.isPresent()) return lineResult;

        // 2차: 전문 regex fallback (단락형 OCR 텍스트)
        return extractByRegexFallback(text, metric);
    }

    /**
     * 사용자 입력값과 OCR 추출값을 비교하여 MatchResult를 반환합니다.
     *
     * <pre>
     * diffPercent = abs(input - extracted) / input × 100
     * HIGH   : diffPercent ≤  5%
     * MEDIUM : diffPercent ≤ 15%
     * LOW    : diffPercent >  15%
     * </pre>
     */
    public MatchResult compare(double input, double extracted) {
        if (input <= 0) return new MatchResult("LOW", 100.0);
        double diff = Math.abs(input - extracted) / input * 100.0;
        double roundedDiff = Math.round(diff * 100.0) / 100.0;
        String level = diff <= 5.0 ? "HIGH" : diff <= 15.0 ? "MEDIUM" : "LOW";
        return new MatchResult(level, roundedDiff);
    }

    /**
     * MatchLevel → Confidence 가중치 점수 (0.0~1.0).
     */
    public double numericMatchScore(String level) {
        return switch (level) {
            case "HIGH"   -> 1.0;
            case "MEDIUM" -> 0.5;
            default       -> 0.0;
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 라인 단위 파싱
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 텍스트를 라인 단위로 분리 후 metric 키워드를 포함한 라인에서만 수치를 추출합니다.
     * row/column index가 추출되지 않도록 라인 범위를 제한합니다.
     */
    private Optional<Double> extractFromLines(String text, String metric) {
        String metricLower = metric.toLowerCase();

        for (String rawLine : text.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (line.isBlank()) continue;
            if (!line.toLowerCase().contains(metricLower)) continue;
            // 마크다운 구분선(|---|---|) 제외
            if (line.replaceAll("[|:\\-\\s]", "").isEmpty()) continue;

            // 우선순위 a: 단위 키워드 바로 앞 숫자
            Optional<Double> byUnit = extractByUnit(line, metric);
            if (byUnit.isPresent()) {
                log.info("[NumericMatch] parsed metric={} value={} from line={}", metric, byUnit.get(), line);
                return byUnit;
            }

            // 우선순위 b: 파이프 테이블 컬럼 파싱 (| metric | VALUE | unit |)
            if (line.contains("|")) {
                Optional<Double> tableVal = extractFromTableLine(line, metric);
                if (tableVal.isPresent()) {
                    log.info("[NumericMatch] parsed metric={} value={} from line={}", metric, tableVal.get(), line);
                    return tableVal;
                }
            }

            // 우선순위 c: 라인 내 첫 번째 유효 숫자 (1자리 index 제외)
            Optional<Double> firstNum = extractFirstSignificantNumber(line);
            if (firstNum.isPresent()) {
                log.info("[NumericMatch] parsed metric={} value={} from line={}", metric, firstNum.get(), line);
                return firstNum;
            }
        }
        return Optional.empty();
    }

    /**
     * 단위 키워드(kWh, MJ …) 바로 앞에 위치한 숫자를 추출합니다.
     * 단위와 숫자 사이의 공백만 허용 — 파이프(|)가 사이에 있으면 미매칭.
     */
    private Optional<Double> extractByUnit(String line, String metric) {
        for (String unit : UNIT_KEYWORDS.getOrDefault(metric, List.of())) {
            Pattern p = Pattern.compile(
                    "([\\d][\\d,，]*(?:\\.\\d+)?)\\s*" + Pattern.quote(unit),
                    Pattern.CASE_INSENSITIVE
            );
            Matcher mat = p.matcher(line);
            if (mat.find()) {
                try {
                    double val = Double.parseDouble(mat.group(1).replaceAll("[,，]", ""));
                    if (val > 0) return Optional.of(val);
                } catch (NumberFormatException ignore) {}
            }
        }
        return Optional.empty();
    }

    /**
     * 파이프(|) 구분 마크다운 테이블 라인을 컬럼 단위로 분리하고
     * metric 키워드 컬럼의 바로 다음 컬럼 값을 반환합니다.
     *
     * 예: "| electricity | 50000 | kWh |" → 50000.0
     */
    private Optional<Double> extractFromTableLine(String line, String metric) {
        String[] cols = line.split("\\|");
        for (int i = 0; i < cols.length; i++) {
            if (cols[i].trim().toLowerCase().contains(metric.toLowerCase())) {
                if (i + 1 < cols.length) {
                    String valStr = cols[i + 1].trim().replaceAll("[,，]", "");
                    try {
                        double val = Double.parseDouble(valStr);
                        if (val > 0) return Optional.of(val);
                    } catch (NumberFormatException ignore) {}
                }
            }
        }
        return Optional.empty();
    }

    /**
     * 라인에서 첫 번째 유효 숫자를 반환합니다.
     * 단, 1자리 숫자(row/column index 가능성)는 건너뜁니다.
     */
    private Optional<Double> extractFirstSignificantNumber(String line) {
        Matcher mat = NUM_PATTERN.matcher(line);
        while (mat.find()) {
            try {
                String raw = mat.group(1).replaceAll("[,，]", "");
                double val = Double.parseDouble(raw);
                // 1자리 숫자는 row/column index일 가능성이 높으므로 제외
                if (val >= 10 && val > 0) return Optional.of(val);
            } catch (NumberFormatException ignore) {}
        }
        return Optional.empty();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 전문 regex fallback (단락형 OCR 텍스트용)
    // ══════════════════════════════════════════════════════════════════════════

    private Optional<Double> extractByRegexFallback(String text, String metric) {
        List<Pattern> patterns = REGEX_FALLBACK.get(metric);
        if (patterns == null) return Optional.empty();

        for (Pattern p : patterns) {
            Matcher mat = p.matcher(text);
            if (mat.find()) {
                try {
                    String numStr = mat.group(1).replaceAll("[,，]", "");
                    double val = Double.parseDouble(numStr);
                    if (val > 0) {
                        log.info("[NumericMatch] regex-fallback metric={} value={}", metric, val);
                        return Optional.of(val);
                    }
                } catch (NumberFormatException ignore) {}
            }
        }
        return Optional.empty();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 결과 타입
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 수치 비교 결과.
     *
     * @param level      "HIGH" / "MEDIUM" / "LOW"
     * @param diffPercent 차이 비율 (%)
     */
    public record MatchResult(String level, double diffPercent) {
        public boolean isHigh()   { return "HIGH".equals(level); }
        public boolean isMedium() { return "MEDIUM".equals(level); }
        public boolean isLow()    { return "LOW".equals(level); }
    }
}
