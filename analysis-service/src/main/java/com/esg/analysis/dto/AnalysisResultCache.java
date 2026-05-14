package com.esg.analysis.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class AnalysisResultCache implements Serializable {

    private Long analysisId;
    private String finalGrade;
    private String fullReport;
    private String overallOpinion;
    private String riskOpportunity;
    private List<SectionDto> sections;
    private List<EvidenceMappingDto> evidenceMapping;
    private String analyzedAt;

    private Long ecoPoints;
    private Double carbonReductionKg;
    private Double equivalentTrees;

    /** E/S/G 카테고리별 점수 (AnalysisScoreAggregator에서 설정, 구버전 리포트는 null) */
    private Integer eScore;
    private Integer sScore;
    private Integer gScore;
    private Integer totalScore;
    /** 전체 지표 신뢰도 평균 0~100 (구버전 리포트는 null) */
    private Integer overallConfidence;
    /** 수치검증 LOW 불일치 개수 — 없으면 null */
    private Integer lowMismatchCount;
    /** Grade Ceiling 규칙으로 등급이 낮아진 경우 true */
    private Boolean gradeCeilingApplied;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SectionDto implements Serializable {
        private String category;
        private int score;
        private String grade;
        private String comment;
        private String recommendation;
        private List<SubIndicatorDto> subIndicators;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SubIndicatorDto implements Serializable {
        private String title;
        private String kesgCode;
        private int score;
        private String grade;
        private String comment;
        private int confidenceScore;
        private String evidenceText;
        private Integer pageNumber;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EvidenceMappingDto implements Serializable {
        private String indicator;
        private String kesgCode;
        private String evidence;
        private Integer page;
        private String consistency;
        private int confidenceScore;
        private int score;
        private String grade;
    }
}
