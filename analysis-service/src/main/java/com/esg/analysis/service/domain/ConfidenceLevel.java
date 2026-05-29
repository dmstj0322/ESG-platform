package com.esg.analysis.service.domain;

/**
 * Evidence Confidence 등급.
 *
 * <pre>
 * HIGH   : confidenceScore >= 0.70  (신뢰할 수 있는 근거)
 * MEDIUM : confidenceScore >= 0.40  (참고 가능한 근거)
 * LOW    : confidenceScore <  0.40  (신뢰도 부족, UI 경고 표시 권장)
 * </pre>
 */
public enum ConfidenceLevel {
    HIGH, MEDIUM, LOW;

    /** confidenceScore 0.0~1.0 → ConfidenceLevel */
    public static ConfidenceLevel from(double confidenceScore) {
        if (confidenceScore >= 0.70) return HIGH;
        if (confidenceScore >= 0.40) return MEDIUM;
        return LOW;
    }
}
