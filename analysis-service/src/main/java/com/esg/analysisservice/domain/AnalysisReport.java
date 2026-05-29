//package com.esg.analysisservice.domain;
//
//import com.esg.common.BaseTimeEntity;
//import jakarta.persistence.*;
//import lombok.Getter;
//import lombok.NoArgsConstructor;
//
//@Entity
//@Getter
//@NoArgsConstructor
//public class AnalysisReport extends BaseTimeEntity {
//  @Id
//  @GeneratedValue(strategy = GenerationType.AUTO)
//  private Long id;
//
//  private Long memberId;
//
//  @Column(columnDefinition = "TEXT")
//  private String reportContent;
//
//  private String grade;
//}
package com.esg.analysisservice.domain; // 패키지 경로 확인!

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Getter
@NoArgsConstructor
public class AnalysisReport {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long memberId;
  private Long companyId;

  @Column(columnDefinition = "LONGTEXT")
  private String reportContent; // 여기에 JSON 전체가 들어갑니다.

  private String grade;

  private String status; // PENDING, COMPLETED, FAILED

  // 생성자나 빌더가 없다면 추가
  public AnalysisReport(Long memberId, Long companyId, String status) {
    this.memberId = memberId;
    this.companyId = companyId;
    this.status = status;
  }

  // 🔥 Groq 분석 완료 후 호출될 메서드
  public void completeAnalysis(String content, String grade) {
    this.reportContent = content;
    this.grade = grade;
    this.status = "COMPLETED";
  }
}
