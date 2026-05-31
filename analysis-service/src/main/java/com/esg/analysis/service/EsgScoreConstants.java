package com.esg.analysis.service;

import java.util.*;

/**
 * ESG 분석 전역 상수.
 *
 * v10 Calibration 변경:
 *   SIM_HIGH   0.85 → 0.80  (실제 강한 ESG 문서가 A/S 받을 수 있도록)
 *   SIM_S_GATE 0.88 → 0.84  (실 운용 문서 분포 기반 하향)
 *   SIM_A_GATE 0.70 → 0.65  (A 등급 접근성 개선)
 *   Dynamic Industry Weighting 추가 (KSIC 기반)
 */
public final class EsgScoreConstants {

    private EsgScoreConstants() {}

    // ── Similarity tier thresholds ────────────────────────────────────────
    public static final double SIM_HIGH   = 0.80;   // calibrated: 0.85 → 0.80
    public static final double SIM_MEDIUM = 0.70;
    public static final double SIM_LOW    = 0.55;

    // ── 고정 가중치 (Dynamic Weighting fallback — 업종 미분류 기본값) ─────
    public static final double WEIGHT_E = 0.40;
    public static final double WEIGHT_S = 0.30;
    public static final double WEIGHT_G = 0.30;

    // ── 등급 기준 ─────────────────────────────────────────────────────────
    public static final int GRADE_S_MIN = 90;
    public static final int GRADE_A_MIN = 80;
    public static final int GRADE_B_MIN = 70;
    public static final int GRADE_C_MIN = 60;

    public static String toGrade(int score) {
        if (score >= GRADE_S_MIN) return "S";
        if (score >= GRADE_A_MIN) return "A";
        if (score >= GRADE_B_MIN) return "B";
        if (score >= GRADE_C_MIN) return "C";
        return "D";
    }

    public static final List<String> GRADE_ORDER = List.of("S", "A", "B", "C", "D");

    // ── S/G 등급 gating ──────────────────────────────────────────────────
    public static final double SIM_S_GATE        = 0.84;  // calibrated: 0.88 → 0.84
    public static final double SIM_A_GATE        = 0.65;  // calibrated: 0.70 → 0.65
    public static final int    S_MIN_EVIDENCE    = 5;
    public static final int    S_MIN_UNIQUE_PAGES = 3;

    // ── 업종별 Dynamic Weighting ─────────────────────────────────────────

    public enum IndustryType {
        /** 제조·중공업 (KSIC 10-33): 환경 데이터 중심 */
        MANUFACTURING,
        /** 에너지·화학·철강·광업 (KSIC 06-08, 19-24, 35-36): 환경 최중요 */
        ENERGY_CHEMICAL,
        /** 금융·보험·서비스 (KSIC 64-66, 45-47, 55-56): S/G 중심 */
        FINANCE_SERVICE,
        /** IT·정보통신·소프트웨어 (KSIC 58-63): S/G 중심 */
        IT_PLATFORM,
        /** 기본 (K-ESG 표준 가중치) */
        DEFAULT
    }

    /** 업종별 [E, S, G] 가중치 — 합계 = 1.0 */
    private static final Map<IndustryType, double[]> INDUSTRY_WEIGHTS;
    static {
        Map<IndustryType, double[]> m = new EnumMap<>(IndustryType.class);
        m.put(IndustryType.MANUFACTURING,   new double[]{0.50, 0.25, 0.25});
        m.put(IndustryType.ENERGY_CHEMICAL, new double[]{0.55, 0.25, 0.20});
        m.put(IndustryType.FINANCE_SERVICE, new double[]{0.25, 0.40, 0.35});
        m.put(IndustryType.IT_PLATFORM,     new double[]{0.30, 0.40, 0.30});
        m.put(IndustryType.DEFAULT,         new double[]{WEIGHT_E, WEIGHT_S, WEIGHT_G});
        INDUSTRY_WEIGHTS = Collections.unmodifiableMap(m);
    }

    /** KSIC 앞 2자리 → IndustryType 매핑 */
    private static final Map<String, IndustryType> KSIC_TO_INDUSTRY;
    static {
        Map<String, IndustryType> m = new HashMap<>();
        // 광업 (06-08)
        for (String k : List.of("06","07","08")) m.put(k, IndustryType.ENERGY_CHEMICAL);
        // 제조업 (10-18, 21-22, 25-33)
        for (String k : List.of("10","11","12","13","14","15","16","17","18",
                                "21","22","25","26","27","28","29","30","31","32","33"))
            m.put(k, IndustryType.MANUFACTURING);
        // 에너지·화학 (19, 20, 23, 24, 35, 36)
        for (String k : List.of("19","20","23","24","35","36")) m.put(k, IndustryType.ENERGY_CHEMICAL);
        // 운수·물류·도소매 (45-47, 49-53)
        for (String k : List.of("45","46","47","49","50","51","52","53")) m.put(k, IndustryType.FINANCE_SERVICE);
        // 숙박·음식 (55-56)
        for (String k : List.of("55","56")) m.put(k, IndustryType.FINANCE_SERVICE);
        // IT·정보통신 (58-63)
        for (String k : List.of("58","59","60","61","62","63")) m.put(k, IndustryType.IT_PLATFORM);
        // 금융·보험 (64-66)
        for (String k : List.of("64","65","66")) m.put(k, IndustryType.FINANCE_SERVICE);
        // 전문·과학·기술 (70-73)
        for (String k : List.of("70","71","72","73")) m.put(k, IndustryType.IT_PLATFORM);
        // 기타 서비스 (74-96) → DEFAULT
        KSIC_TO_INDUSTRY = Collections.unmodifiableMap(m);
    }

    public static IndustryType getIndustryType(String ksicCode) {
        if (ksicCode == null || ksicCode.length() < 2) return IndustryType.DEFAULT;
        return KSIC_TO_INDUSTRY.getOrDefault(ksicCode.substring(0, 2), IndustryType.DEFAULT);
    }

    /** KSIC 코드 기반 [E, S, G] 가중치 배열 반환 (null-safe, 합계 = 1.0 보장) */
    public static double[] getWeights(String ksicCode) {
        return INDUSTRY_WEIGHTS.get(getIndustryType(ksicCode));
    }

    // ── E 카테고리 벤치마크 기반 점수 산출 ───────────────────────────────────
    // ratio = 회사값 / 업종평균 (낮을수록 우수 — 에너지·탄소·폐기물 모두 적을수록 좋음)
    // 업종 평균 수준(ratio≈1.0) = B등급(70점) 기준으로 설계
    public static int calcBenchmarkScore(double ratio) {
        if (ratio <= 0.50) return 95;  // 업종의 절반 이하 — S등급
        if (ratio <= 0.70) return 85;  // 업종보다 30% 적게 — A등급
        if (ratio <= 0.90) return 77;  // 업종 하회 — B+
        if (ratio <= 1.10) return 70;  // 업종 평균 수준 — B등급 (기준점)
        if (ratio <= 1.30) return 58;  // 업종 초과 — C등급
        if (ratio <= 1.50) return 45;  // 업종 대비 50% 과다 — D+
        return 30;                      // 업종 대비 심각 — D등급
    }

    // numericMatch 신뢰도 → 벤치마크 점수 보정 배율
    // HIGH=데이터 신뢰(페널티 없음), MEDIUM=경미 불일치, LOW=심각 불일치
    public static double calcValidityMultiplier(String matchLevel) {
        if (matchLevel == null) return 0.65;
        switch (matchLevel.toUpperCase()) {
            case "HIGH":   return 1.00;
            case "MEDIUM": return 0.93;
            case "LOW":    return 0.80;
            default:       return 0.65;
        }
    }

    // 벤치마크 데이터 없을 때 numericMatch 기반 fallback 점수
    public static int calcFallbackEScore(String matchLevel, int evidenceBonus) {
        if (matchLevel == null) return 50;
        switch (matchLevel.toUpperCase()) {
            case "HIGH":   return Math.min(100, 82 + evidenceBonus);
            case "MEDIUM": return Math.min(100, 60 + evidenceBonus);
            case "LOW":    return 35;
            default:       return 50;
        }
    }

    // ── Negative polarity 지표 ────────────────────────────────────────────
    public static final Set<String> NEGATIVE_POLARITY_INDICATORS = Set.of("S-202");

    // ── Checklist → Indicator 매핑 ────────────────────────────────────────
    public static final Map<String, String> CHECKLIST_TO_INDICATOR = Map.of(
        "s1", "S-201", "s2", "S-203", "s3", "S-202", "s4", "S-204", "s5", "S-205",
        "g1", "G-301", "g2", "G-302", "g3", "G-303", "g4", "G-304", "g5", "G-305"
    );
}
