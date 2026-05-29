package com.esg.marketservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DonationRecord extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long memberId;
  private String memberName;
  private Long productId;
  private String productName;
  private Long amount;

  @Column(unique = true)
  private String certificateNo; // 증서 고유 번호 (예: CERT-20240512-XXXX)

  // 증서 번호 자동 생성 로직
  public void generateCertificateNo() {
    this.certificateNo = "CERT-" + LocalDate.now().toString().replace("-", "")
      + "-" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
  }
}
