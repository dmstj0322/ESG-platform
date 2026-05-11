package com.esg.marketservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Voucher extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String serialNumber;

  @Builder.Default
  private boolean isUsed = false;

  private Long productId;
  private Long orderId;

  public void assignToOrder(Long orderId) {
    this.isUsed = true;
    this.orderId = orderId;
  }
}
