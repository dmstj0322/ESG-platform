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
    this.orderId = orderId;
  }

  public void markAsUsed() {
    this.isUsed = true;
  }

  public void releaseOrder() {
    this.orderId = null;
    this.isUsed = false;
  }
}
