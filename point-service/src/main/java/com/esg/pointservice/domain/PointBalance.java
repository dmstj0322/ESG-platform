package com.esg.pointservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
public class PointBalance extends BaseTimeEntity {
  @Id
  private Long memberId;

  private Long companyId;

  private Long balance;

  @Column(nullable = false)
  private Long totalCo2Reduction = 0L; // 누적 탄소 저감량

  public void addCo2Reduction(long amount) {
    this.totalCo2Reduction += amount;
  }

  @Version
  private Long version;

  public PointBalance(Long memberId, Long companyId, Long balance) {
    this.memberId = memberId;
    this.companyId = companyId;
    this.balance = balance;
  }

  public void add(Long amount) {
    this.balance += amount;
  }

  public void use(Long amount) {
    if (this.balance < amount) {
      throw new IllegalArgumentException("잔액이 부족합니다.");
    }
    this.balance -= amount;
  }
}
