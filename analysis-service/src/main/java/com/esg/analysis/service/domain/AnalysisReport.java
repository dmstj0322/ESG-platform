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

  @Builder
  public AnalysisReport(Long memberId, Long companyId, String status, String reportContent, String grade) {
    this.memberId = memberId;
    this.companyId = companyId;
    this.status = status;
    this.reportContent = reportContent;
    this.grade = grade;
  }

  // --- 비즈니스 편의 메서드 ---
  public void updateStatus(String status) {
    this.status = status;
  }

  // Consumer에서 이 메서드를 호출할 것입니다.
  public void completeAnalysis(String content, String grade) {
    this.reportContent = content;
    this.grade = grade;
    this.status = "COMPLETED";
  }

  public void failAnalysis() {
    this.status = "FAILED";
  }
}
