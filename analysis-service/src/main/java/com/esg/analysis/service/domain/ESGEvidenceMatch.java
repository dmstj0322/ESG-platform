package com.esg.analysis.service.domain;

import com.esg.analysis.dto.EvidenceResult;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "esg_evidence_matches", indexes = {
        @Index(name = "idx_eem_analysis_id",  columnList = "analysis_id"),
        @Index(name = "idx_eem_indicator",     columnList = "indicator_code")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ESGEvidenceMatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** analysis_reports.id 참조 (FK 없이 논리적 연관) */
    @Column(name = "analysis_id", nullable = false)
    private Long analysisId;

    @Column(name = "indicator_code", nullable = false, length = 10)
    private String indicatorCode;

    @Column(columnDefinition = "TEXT")
    private String evidenceText;

    /** ChromaDB 원시 코사인 유사도 (0.0~1.0) */
    private Double similarity;

    /** indicator keywords 매칭 비율 (0.0~1.0) */
    private Double keywordMatchScore;

    /** similarity*0.7 + keywordMatchScore*0.3 */
    private Double finalScore;

    /** finalScore >= ReportRagService.EVIDENCE_THRESHOLD */
    private Boolean isValidEvidence;

    /** ConfidenceService 계산 결과 (0.0~1.0) */
    private Double confidenceScore;

    /**
     * Retrieval 결과 내 순위 (1-based, 낮을수록 더 관련성 높음).
     * finalScore 내림차순 정렬 기준.
     */
    @Column(name = "retrieval_rank")
    private Integer retrievalRank;

    /**
     * confidenceScore 기반 등급.
     * HIGH >= 0.70 / MEDIUM >= 0.40 / LOW < 0.40
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "confidence_level", length = 10)
    private ConfidenceLevel confidenceLevel;

    private Integer pageNumber;

    @Column(length = 255)
    private String sourceFile;

    /** E 지표 수치 정합성 검증 결과 (HIGH/MEDIUM/LOW). E 지표 외에는 null. */
    @Column(name = "numeric_match_level", length = 10)
    private String numericMatchLevel;

    /** 입력값 대비 추출값 차이 비율 (%). numericMatchLevel이 null이면 null. */
    @Column(name = "numeric_diff_percent")
    private Double numericDiffPercent;

    /** 사용자 CSV 원본 입력값 (E 지표 외에는 null) */
    @Column(name = "input_value")
    private Double inputValue;

    /** OCR/CSV 문서 추출값 (E 지표 외에는 null) */
    @Column(name = "extracted_value")
    private Double extractedValue;

    /** 수치 단위 (예: "kWh", "Nm³", "tCO₂", "kg", "m³") */
    @Column(name = "numeric_unit", length = 20)
    private String unit;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    /**
     * EvidenceResult → ESGEvidenceMatch 변환 팩토리.
     * retrievalRank는 EvidenceResult에 이미 포함된 값을 사용합니다.
     * (retrieveEvidenceForIndicator에서 finalScore 기준 내림차순 1-based로 부여됨)
     */
    public static ESGEvidenceMatch from(Long analysisId, EvidenceResult ev, double confidenceScore) {
        return from(analysisId, ev, confidenceScore, null, null);
    }

    public static ESGEvidenceMatch from(Long analysisId, EvidenceResult ev, double confidenceScore,
                                        String numericMatchLevel, Double numericDiffPercent) {
        return ESGEvidenceMatch.builder()
                .analysisId(analysisId)
                .indicatorCode(ev.getIndicatorCode())
                .evidenceText(ev.getEvidenceText())
                .similarity(ev.getSimilarity())
                .keywordMatchScore(ev.getKeywordMatchScore())
                .finalScore(ev.getFinalScore())
                .isValidEvidence(ev.isValidEvidence())
                .confidenceScore(confidenceScore)
                .retrievalRank(ev.getRetrievalRank())
                .confidenceLevel(ConfidenceLevel.from(confidenceScore))
                .pageNumber(ev.getPageNumber())
                .sourceFile(ev.getSourceFile())
                .numericMatchLevel(numericMatchLevel)
                .numericDiffPercent(numericDiffPercent)
                .build();
    }
}
