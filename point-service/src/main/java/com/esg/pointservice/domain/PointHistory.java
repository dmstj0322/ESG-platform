package com.esg.pointservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
public class PointHistory extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long memberId;

  private Long companyId;

  private Long amount;

  @Enumerated(EnumType.STRING)
  private PointType type;

  private String description;

  private Long balance;

  private Long targetId;

  @Builder
  public PointHistory(Long memberId, Long companyId, Long amount, PointType type,
                      String description, Long balance, Long targetId) {
    this.memberId = memberId;
    this.companyId = companyId;
    this.amount = amount;
    this.type = type;
    this.description = description;
    this.balance = balance;
    this.targetId = targetId;
  }
}
