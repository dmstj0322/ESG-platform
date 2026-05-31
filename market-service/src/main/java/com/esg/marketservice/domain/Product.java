package com.esg.marketservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Slf4j
public class Product extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private Long price;

  @Column(nullable = false)
  private Integer stock;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Category category;

  @Enumerated(EnumType.STRING)
  private ProductStatus status;

  @Enumerated(EnumType.STRING)
  private ProductStatus previousStatus;

  private String content;

  private String voucherUrl;

  private Long companyId;

  @Builder.Default
  private boolean deleted = false;

  @Builder.Default
  private boolean hidden = false;

  private Long targetAmount;
  private Long currentAmount;

  public void removeStock(int quantity) {
    if (this.category == Category.DONATION) {
      log.info("기부 상품 주문: 재고 차감을 진행하지 않습니다.");
      return;
    }

    int restStock = this.stock - quantity;
    if (restStock < 0) {
      throw new IllegalArgumentException("재고가 부족합니다.");
    }
    this.stock = restStock;

    if (this.stock == 0 && this.category == Category.GIFTICON) {
      this.status = ProductStatus.SOLD_OUT;
    }
  }

  public void addStock(int quantity) {
    if (this.category == Category.DONATION) {
      log.info("기부 상품 취소: 재고 복구를 진행하지 않습니다.");
      return;
    }

    this.stock += quantity;
    if (this.stock > 0 && this.status == ProductStatus.SOLD_OUT) {
      this.status = ProductStatus.ON_SALE;
    }
  }

  public void removeDonation(Long amount) {
    if (this.category == Category.DONATION && this.currentAmount != null) {
      this.currentAmount -= amount;
      if (this.currentAmount < 0) {
        this.currentAmount = 0L; // 마이너스 방지
      }
      log.info("기부 모금액 차감 완료. 차감액: {}, 남은 모금액: {}", amount, this.currentAmount);
    }
  }

  public void update(String name, Long price, Integer stock, Category category, String content, String voucherUrl, Long targetAmount) {
    this.name = name;
    this.price = price;
    this.stock = (stock == null) ? this.stock : stock;
    this.category = category;
    this.content = content;
    this.voucherUrl = voucherUrl;
    this.targetAmount = targetAmount;

    if (this.stock > 0 && this.status == ProductStatus.SOLD_OUT) {
      this.status = ProductStatus.ON_SALE;
    }
  }

  public void changeStatus(ProductStatus status) {
    this.status = status;
  }

  public void setHidden(boolean hidden) {
    if (hidden) {
      this.previousStatus = this.status;
      this.hidden = true;
      log.info("상품 숨김 처리 - ID: {}, 이전 상태: {}", id, this.previousStatus);
    } else {
      if (this.previousStatus != null) {
        this.status = this.previousStatus;
        log.info("상품 숨김 해제 - ID: {}, 복구된 상태: {}", id, this.previousStatus);
      } else {
        this.status = (this.stock > 0) ? ProductStatus.ON_SALE : ProductStatus.SOLD_OUT;
        log.warn("상품 숨김 해제 (이전 상태 없음) - ID: {}, 설정된 상태: {}", id, this.status);
      }
      this.previousStatus = null;
      this.hidden = false;
    }
  }

  public void delete() {
    this.deleted = true;
    this.hidden = true;
    this.status = ProductStatus.SOLD_OUT; // 삭제 시 마켓에서 안 보이게 처리
  }

  public void addDonation(Long amount) {
    if (this.category != Category.DONATION) return;

    this.currentAmount = (this.currentAmount == null ? 0L : this.currentAmount) + amount;

    if (this.targetAmount != null && this.currentAmount >= this.targetAmount) {
      this.status = ProductStatus.SOLD_OUT;
      log.info("캠페인 목표 달성으로 인한 종료: {}", this.name);
    }
  }

  public boolean isVisible() {
    return !this.hidden;
  }
}
