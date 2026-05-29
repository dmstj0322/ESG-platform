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
    /** EcoPoint 적용으로 보정된 S 점수 보너스 (0~5). null=미적용 또는 구버전 리포트. */
    private Integer ecoSBonus;
    /** 분석 전 회사 ESG Pool (company_esg_pool.esg_points) */
    private Long esgPoolBefore;
    /** ESG 분석에 실제 차감된 EcoPoint (ecoSBonus × 1000) */
    private Long ecoUsedPoints;
    /** 차감 후 회사 ESG Pool 잔액 */
    private Long esgPoolAfter;

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
    /** AUTO 모드 사전 진단 여부 — E 파일 없이 benchmark 기반으로만 계산된 경우 true */
    private Boolean isAutoSimulation;

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
