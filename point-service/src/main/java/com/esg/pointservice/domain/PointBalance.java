package com.esg.pointservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
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
