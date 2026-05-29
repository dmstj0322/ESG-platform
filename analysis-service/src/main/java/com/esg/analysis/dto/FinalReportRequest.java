package com.esg.analysis.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class FinalReportRequest {

    private CategoryResult environmentResult;
    private CategoryResult socialResult;
    private CategoryResult governanceResult;
    private boolean ecoPointApplied;
    /** 프론트엔드가 계산한 S 점수 보정값 (0~5). 미제공 시 ecoPointApplied=true → 4 폴백. */
    private Integer ecoSBonus;
    private Integer totalScore;
    private String finalGrade;
    private Integer confidence;
    /** AUTO 모드 사전 진단 여부 — E 파일 없이 benchmark 기반으로만 계산된 경우 true */
    private boolean isAutoSimulation;

    /**
     * KSIC 업종 코드 (앞 5자리 또는 2자리).
     * Dynamic Industry Weighting에 사용. null 시 DEFAULT 가중치 (E0.4/S0.3/G0.3) 적용.
     */
    private String ksicCode;

    /** S/G 카테고리 분석에서 수집된 실제 RAG Evidence (optional) */
    private List<EvidenceItem> evidences;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CategoryResult {
        private Integer score;
        private String  grade;
        private Integer confidence;
        private Integer evidenceCount;
        private Boolean ragBased;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EvidenceItem {
        private String  indicatorCode;
        private String  indicatorTitle;
        private String  evidenceText;
        private Double  similarity;
        private Double  finalScore;
        private String  confidenceLevel;
        private Integer retrievalRank;
        private Integer pageNumber;
        private String  sourceFile;

        // E 지표 수치 정합성 — CategoryAnalysisService에서 계산된 값을 최종 저장 시 전달
        private String  numericMatchLevel;
        private Double  numericDiffPercent;
        private String  numericMetric;
        private Double  inputValue;
        private Double  extractedValue;
        private String  unit;
    }
}
