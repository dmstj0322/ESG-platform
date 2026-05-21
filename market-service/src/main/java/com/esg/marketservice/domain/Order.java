package com.esg.marketservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Table(name = "orders")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long memberId;

  @Column(nullable = false)
  private String nickname;

  @Column(nullable = false)
  private Long companyId;

  @Column(nullable = false)
  private Long totalPrice;

  @Builder.Default
  @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<OrderItem> orderItems = new ArrayList<>();

  @Enumerated(EnumType.STRING)
  private OrderStatus status;

  public void addOrderItem(OrderItem orderItem) {
    orderItems.add(orderItem);
    orderItem.setOrder(this);
  }

  public static Order createOrder(Long memberId, Long companyId, String nickname, List<OrderItem> orderItems) {
    Long total = orderItems.stream().mapToLong(OrderItem::getTotalPrice).sum();

    Order order = Order.builder()
      .memberId(memberId)
      .companyId(companyId)
      .nickname(nickname)
      .totalPrice(total)
      .status(OrderStatus.COMPLETED)
      .orderItems(new ArrayList<>())
      .build();

    for (OrderItem item : orderItems) {
      order.addOrderItem(item);
    }
    return order;
  }

  public void cancel() {
    this.status = OrderStatus.CANCELED;
    for (OrderItem item : orderItems) {
      item.cancel();
    }
  }
}
