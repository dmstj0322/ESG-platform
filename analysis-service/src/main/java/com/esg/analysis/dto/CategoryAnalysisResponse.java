package com.esg.analysis.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * POST /api/v1/analysis/category 응답 DTO.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryAnalysisResponse {

    private Integer score;
    private String  grade;
    /** RAG 검증 품질 기반 신뢰도 (evidence 수·similarity·체크리스트 일치율·numeric 검증 반영) */
    private Integer confidence;
    /** 실제 RAG에서 threshold 이상으로 검색된 evidence chunk 수 (synthetic numeric-only 제외) */
    private Integer evidenceCount;
    /** true = OCR+RAG 기반, false = 체크리스트 기반 */
    private Boolean ragBased;

    /** E 카테고리 수치검증 LOW 불일치 개수 (0이면 null) */
    private Integer lowMismatchCount;
    /** Grade Ceiling 규칙이 실제 등급을 낮췄는지 여부 */
    private Boolean gradeCeilingApplied;
    /** 수치 불일치 경고 메시지 (LOW mismatch 존재 시) */
    private String  warning;

    /** RAG가 수행된 경우에만 포함 */
    private List<EvidenceItem> evidences;

    /** 지표별 점수 기여 상세 (score가 어떻게 계산됐는지 breakdown) */
    private List<IndicatorBreakdown> indicatorBreakdowns;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EvidenceItem {
        private String  indicatorCode;
        private String  indicatorTitle;
        private String  evidenceText;
        private Double  similarity;
        private Double  finalScore;
        /** "HIGH" / "MEDIUM" / "LOW" */
        private String  confidenceLevel;
        private Integer retrievalRank;
        private Integer pageNumber;
        private String  sourceFile;

        // ── E 지표 수치 정합성 (E 지표 외에는 null) ──────────────────────────
        /** "HIGH" / "MEDIUM" / "LOW" — MATCH/MISMATCH 배지 표시용 */
        private String  numericMatchLevel;
        /** 입력값 대비 추출값 차이 비율 (%) */
        private Double  numericDiffPercent;
        /** 메트릭 이름 ("electricity" / "gas" / "carbon" / "waste" / "water") */
        private String  numericMetric;
        /** 사용자 입력값 */
        private Double  inputValue;
        /** OCR/CSV 추출값 */
        private Double  extractedValue;
        /** 단위 ("kWh" / "MJ" / "tCO₂" / "kg" / "m³") */
        private String  unit;
    }

    /**
     * 지표별 점수 기여 상세.
     * 최종 score가 어떻게 계산됐는지 사용자에게 설명하기 위한 breakdown.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class IndicatorBreakdown {
        private String  indicatorCode;
        private String  indicatorTitle;
        /** 이 지표에 부여된 raw score (0~100) */
        private Integer rawScore;
        /** RAG에서 유효 evidence가 존재하는지 여부 */
        private Boolean hasEvidence;
        /** E 카테고리: numeric verification 통과 여부 (HIGH/MEDIUM), S/G는 null */
        private Boolean numericVerified;
        /** E 카테고리: LOW mismatch 감지 여부, S/G는 null */
        private Boolean mismatchDetected;
        /** 유효 evidence의 평균 similarity (없으면 null) */
        private Double  avgSimilarity;
        /** 이 지표에서 유효하게 검색된 evidence chunk 수 (semantic dedup 적용 후) */
        private Integer evidenceCount;
        /** 서로 다른 page에서 발견된 고유 evidence 수 (page 다양성, page 정보 없으면 null) */
        private Integer uniquePageCount;
        /** 불일치 유형: "NUMERIC_LOW" / "CHECKLIST_NO_EVIDENCE" / "EVIDENCE_CONTRADICTION" / "NEGATIVE_SIGNAL_DETECTED" / null */
        private String  mismatchType;
        /** avgSimilarity 기반 evidence 품질 tier: "HIGH"(≥0.85) / "MEDIUM"(≥0.70) / "LOW"(≥0.55) / null */
        private String  similarityTier;
        /** 최고 similarity evidence 앞 100자 미리보기 (S/G 지표 근거 확인용, E는 null) */
        private String  evidenceSnippet;
    }
}
