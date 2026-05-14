package com.esg.analysis.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * GET /api/v1/analysis/{analysisId}/result 응답 DTO.
 * React 프론트에서 추가 가공 없이 바로 사용할 수 있도록 설계됩니다.
 * @JsonInclude(NON_NULL) — null 필드는 JSON에서 제거됩니다.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AnalysisResultResponse {

    // ── 기본 메타 ─────────────────────────────────────────────────────────
    private Long   analysisId;
    private String companyName;
    /** null 시 "미분류" 기본값 적용 */
    private String industry;

    // ── 최종 점수 ─────────────────────────────────────────────────────────
    /** null 불허 — 구버전 캐시는 0 기본값 적용 */
    private String  finalGrade;
    private Integer eScore;
    private Integer sScore;
    private Integer gScore;
    private Integer totalScore;
    private Integer overallConfidence;

    /** ISO-8601 초 단위: "2026-05-14T10:30:00" */
    private String analyzedAt;
    /** 수치검증 LOW 불일치 개수 — 없으면 null */
    private Integer lowMismatchCount;
    /** Grade Ceiling 규칙으로 등급이 낮아진 경우 true */
    private Boolean gradeCeilingApplied;

    // ── 에코포인트 ────────────────────────────────────────────────────────
    /** null → 0 기본값 적용 */
    private Long   ecoPoints;
    private Double carbonReductionKg;
    private Double equivalentTrees;

    // ── 리포트 본문 ───────────────────────────────────────────────────────
    /** 마크다운 전체 리포트 (## [종합 소견] / ## [지표별 정밀 진단] / ## [Risk & Opportunity]) */
    private String fullReport;
    private String overallOpinion;
    private String riskOpportunity;

    // ── React 차트 전용 데이터 ────────────────────────────────────────────
    /**
     * E/S/G 레이더 차트 및 지표별 바 차트용 정규화 데이터.
     * sections에서 직접 추출할 필요 없이 esgChart만 사용하면 됩니다.
     */
    private EsgChartDto esgChart;

    // ── 섹션 상세 ─────────────────────────────────────────────────────────
    private List<AnalysisResultCache.SectionDto> sections;

    /**
     * 지표별 Evidence 요약 (score/grade 포함, 1행/지표).
     * sections.subIndicators와 중복이나 evidence table 전용으로 유지합니다.
     */
    private List<AnalysisResultCache.EvidenceMappingDto> evidenceMapping;

    /** DB 저장된 RAG Evidence 상세 (복수/지표). Evidence deep-dive 탭용. */
    private List<EvidenceMatchDto> evidenceMatches;

    /** 업종 벤치마크 비교. 벤치마크 데이터 없으면 null → JSON 미포함. */
    private BenchmarkComparisonDto benchmarkComparison;

    // ═══════════════════════════════════════════════════════════════════════
    // 중첩 DTO
    // ═══════════════════════════════════════════════════════════════════════

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EvidenceMatchDto {
        private String  indicatorCode;
        private String  indicatorTitle;
        private String  evidenceText;
        /** similarity×0.7 + keywordMatch×0.3 — 관련도 정렬용 */
        private Double  finalScore;
        /** RAG Retrieval 순위 (1-based, 낮을수록 관련성 높음) */
        private Integer retrievalRank;
        private Boolean isValidEvidence;
        /** "HIGH" / "MEDIUM" / "LOW" — badge 표시용. null 시 "LOW" 기본값 */
        private String  confidenceLevel;
        /** 보고서 원본 페이지 번호. 확인 불가 시 null (프론트에서 "-" 처리) */
        private Integer pageNumber;
        /** 원본 파일명. 확인 불가 시 null */
        private String  sourceFile;

        // ── E 지표 수치 정합성 (E 지표 외에는 null) ──────────────────────────
        /** "HIGH" / "MEDIUM" / "LOW" — MATCH/MISMATCH 배지 */
        private String  numericMatchLevel;
        /** 입력값 대비 추출값 차이 비율 (%) */
        private Double  numericDiffPercent;
    }

    /**
     * React Recharts / Chart.js 에서 추가 가공 없이 바로 사용 가능한 차트 데이터.
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EsgChartDto {

        /** E/S/G 레이더 차트용 3개 포인트 */
        private List<RadarPointDto> radar;

        /** 종합 점수 (E×40% + S×30% + G×30%) */
        private Integer totalScore;
        /** 종합 등급 ("A"/"B"/"C"/"D"/"N/A") */
        private String  totalGrade;

        /** 지표별 바 차트용 — 18개 (K-ESG 기준) */
        private List<IndicatorBreakdownDto> breakdown;

        @Data @Builder @NoArgsConstructor @AllArgsConstructor
        public static class RadarPointDto {
            /** "E" / "S" / "G" */
            private String category;
            /** "환경" / "사회" / "지배구조" */
            private String label;
            private int    score;
            private String grade;
        }

        @Data @Builder @NoArgsConstructor @AllArgsConstructor
        public static class IndicatorBreakdownDto {
            /** K-ESG 코드 (예: "E-1-1") */
            private String kesgCode;
            /** 지표명 (예: "환경경영목표") */
            private String title;
            private int    score;
            private String grade;
            /** 0~100 신뢰도 — 바 차트 투명도·색상 기준으로 활용 */
            private int    confidence;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class BenchmarkComparisonDto {
        private String industry;
        private String regionName;
        /** "ACTUAL" = 기업 실측값 / "BENCHMARK" = 업종 평균으로 대체 */
        private String companyDataSource;

        // 기존 쌍별 필드 — 하위 호환 유지
        private Double companyElectricityKwh;
        private Double industryAvgElectricityKwh;
        private Double companyGasMj;
        private Double industryAvgGasMj;
        private Double companyCarbonTco2;
        private Double industryAvgCarbonTco2;
        private Double companyWasteKg;
        private Double industryAvgWasteKg;
        private Double companyWaterM3;
        private Double industryAvgWaterM3;

        /**
         * 차트용 정규화 배열.
         * Recharts BarChart data prop에 바로 전달 가능:
         * {@code <Bar dataKey="company" /> <Bar dataKey="industryAvg" />}
         */
        private List<BenchmarkMetricDto> metrics;

        @Data @Builder @NoArgsConstructor @AllArgsConstructor
        public static class BenchmarkMetricDto {
            /** 표시 이름 (예: "전력 사용량") */
            private String name;
            /** 단위 (예: "kWh", "tCO₂", "m³") */
            private String unit;
            private Double company;
            private Double industryAvg;
        }
    }
}
