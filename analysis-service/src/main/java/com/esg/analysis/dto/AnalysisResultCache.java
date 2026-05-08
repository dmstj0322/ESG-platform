//package com.esg.analysis.dto;
//
//import com.fasterxml.jackson.annotation.JsonFormat;
//import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
//import com.fasterxml.jackson.databind.annotation.JsonSerialize;
//import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
//import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
//import lombok.*;
//
//import java.io.Serializable;
//import java.time.LocalDateTime;
//import java.util.List;
//
///**
// * [F-301] Redis 캐시용 DTO
// */
//@Data
//@Builder
//@NoArgsConstructor
//@AllArgsConstructor
//public class AnalysisResultCache implements Serializable {
//    private static final long serialVersionUID = 1L;
//
//    private Long analysisId;
//    private String finalGrade;
//    private String fullReport;
//    private List<EvidenceData> evidence;
//
//    // LocalDateTime 직렬화 문제 해결을 위한 어노테이션 추가
//    @JsonSerialize(using = LocalDateTimeSerializer.class)
//    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
//    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
//    private LocalDateTime analyzedAt;
//
//    @Data
//    @NoArgsConstructor
//    @AllArgsConstructor
//    @Builder
//    public static class EvidenceData implements Serializable {
//        private String indicator;
//        private String content;
//        private String page;
//    }
//}

//package com.esg.analysis.dto;
//
//import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
//import lombok.AllArgsConstructor;
//import lombok.Data;
//import lombok.NoArgsConstructor;
//
//import java.io.Serializable;
//import java.util.List;
//
//@Data
//@NoArgsConstructor
//@AllArgsConstructor
//@JsonIgnoreProperties(ignoreUnknown = true)
//public class AnalysisResultCache implements Serializable {
//
//    private Long analysisId;
//    private String finalGrade;
//    private String fullReport;
//    private List<SectionDto> sections;
//    private String analyzedAt; // ← LocalDateTime → String
//
//    @Data
//    @NoArgsConstructor
//    @AllArgsConstructor
//    @JsonIgnoreProperties(ignoreUnknown = true)
//    public static class SectionDto implements Serializable {
//        private String category;
//        private int score;
//        private String comment;
//    }
//}

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
    private String fullReport;       // 완전한 마크다운 리포트 (종합소견+지표별진단+Risk&Opportunity)
    private String overallOpinion;   // [종합 소견] 단독 필드
    private String riskOpportunity;  // [Risk & Opportunity] 단독 필드
    private List<SectionDto> sections;
    private List<EvidenceMappingDto> evidenceMapping; // React Table data prop — useReactTable({ data: evidenceMapping }) 직접 사용
    private String analyzedAt;

    // 에코 포인트 성과 확정 필드
    private Long ecoPoints;
    private Double carbonReductionKg;
    private Double equivalentTrees;

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
        private String kesgCode;        // K-ESG 문항 코드 (예: "E-2-1")
        private int score;
        private String grade;
        private String comment;
        private int confidenceScore;    // AI 원문 충실도 지수 (0~100)
        private String evidenceText;    // 원문 인용 문구
        private Integer pageNumber;     // 페이지 번호 정수형 (null=불명확)
    }

    /**
     * React Table data prop 직접 호환 포맷.
     * useReactTable({ data: report.evidenceMapping, columns }) 형태로 바로 사용 가능.
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EvidenceMappingDto implements Serializable {
        private String indicator;       // 지표명
        private String kesgCode;        // K-ESG 문항 코드 (예: "E-2-1")
        private String evidence;        // 원문 인용 문구
        private Integer page;           // 페이지 번호 정수형 (PDF 뷰어 연동용, null=불명확)
        private String consistency;     // "High" | "Medium" | "Low"
        private int confidenceScore;    // AI 분석 신뢰도 (0~100)
        private int score;              // 지표 점수
        private String grade;           // 지표 등급
    }
}