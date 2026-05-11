package com.esg.marketservice.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderItem {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "order_id")
  private Order order;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "product_id")
  private Product product;

  private Long orderPrice;
  private Integer count;

  public void setOrder(Order order) {
    this.order = order;
  }

  public static OrderItem createOrderItem(Product product, int count) {
    // 주문 수량만큼 재고 차감
    product.removeStock(count);

    return OrderItem.builder()
      .product(product)
      .orderPrice(product.getPrice())
      .count(count)
      .build();
  }

  public void cancel() {
    // 취소 시 재고 원복
    this.product.addStock(count);
  }

  public Long getTotalPrice() {
    return getOrderPrice() * getCount();
  }
}
