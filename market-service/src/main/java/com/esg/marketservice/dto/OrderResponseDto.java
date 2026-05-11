package com.esg.marketservice.dto;

import com.esg.marketservice.domain.Category;
import com.esg.marketservice.domain.Order;
import com.esg.marketservice.domain.OrderItem;
import com.esg.marketservice.domain.OrderStatus;

import java.time.LocalDateTime;
import java.util.List;

public record OrderResponseDto(
  Long orderId,
  Long memberId,
  Long companyId,
  String productName,
  Long totalPrice,
  OrderStatus status,
  Category category,
  LocalDateTime createdDate,
  LocalDateTime modifiedDate,
  List<OrderItemDto> items,
  String voucherUrl
) {
  public OrderResponseDto(Order order) {
    this(
      order.getId(),
      order.getMemberId(),
      order.getCompanyId(),
      order.getOrderItems().get(0).getProduct().getName(),
      order.getTotalPrice(),
      order.getStatus(),
      order.getOrderItems().get(0).getProduct().getCategory(),
      order.getCreatedDate(),
      order.getModifiedDate(),
      order.getOrderItems().stream().map(OrderItemDto::new).toList(),
      order.getOrderItems().get(0).getProduct().getVoucherUrl());
  }

  public record OrderItemDto(
    Long productId,
    String productName,
    Long orderPrice,
    Integer count
  ) {
    public OrderItemDto(OrderItem item) {
      this(
        item.getProduct().getId(),
        item.getProduct().getName(),
        item.getOrderPrice(),
        item.getCount());
    }
  }
}
