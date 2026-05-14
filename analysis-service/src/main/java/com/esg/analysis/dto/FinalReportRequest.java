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
    private Integer totalScore;
    private String finalGrade;
    private Integer confidence;

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
    }
}
