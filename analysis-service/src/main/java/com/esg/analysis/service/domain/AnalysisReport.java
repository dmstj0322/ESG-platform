package com.esg.analysis.service.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class AnalysisReport extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long memberId;

  @Column(nullable = false)
  private Long companyId;

  @Column(nullable = false)
  private String status; // PENDING, COMPLETED, FAILED

  @Column(columnDefinition = "TEXT")
  private String reportContent;

  private String grade;

  // 에코 포인트 성과 확정 필드
  private Long ecoPoints;
  private Double carbonReductionKg;
  private Double equivalentTrees;

  @Builder
  public AnalysisReport(Long memberId, Long companyId, String status, String reportContent, String grade,
                        Long ecoPoints, Double carbonReductionKg, Double equivalentTrees) {
    this.memberId = memberId;
    this.companyId = companyId;
    this.status = status;
    this.reportContent = reportContent;
    this.grade = grade;
    this.ecoPoints = ecoPoints;
    this.carbonReductionKg = carbonReductionKg;
    this.equivalentTrees = equivalentTrees;
  }

  // --- 비즈니스 편의 메서드 ---
  public void updateStatus(String status) {
    this.status = status;
  }

  public void completeAnalysis(String content, String grade) {
    this.reportContent = content;
    this.grade = grade;
    this.status = "COMPLETED";
  }

  public void completeWithEco(String content, String grade,
                              Long ecoPoints, Double carbonReductionKg, Double equivalentTrees) {
    this.reportContent = content;
    this.grade = grade;
    this.status = "COMPLETED";
    this.ecoPoints = ecoPoints;
    this.carbonReductionKg = carbonReductionKg;
    this.equivalentTrees = equivalentTrees;
  }

  public void failAnalysis() {
    this.status = "FAILED";
  }
}
