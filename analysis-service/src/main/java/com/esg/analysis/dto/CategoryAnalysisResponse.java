package com.esg.analysis.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * POST /api/v1/analysis/category 응답 DTO.
 * S 또는 G 카테고리 단독 분석 결과를 반환합니다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryAnalysisResponse {

    private Integer score;
    private String  grade;
    private Integer confidence;
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
}
