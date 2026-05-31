package com.esg.marketservice.dto;

import com.esg.marketservice.domain.Category;
import com.esg.marketservice.domain.Product;

import java.time.LocalDateTime;

public record ProductResponseDto(
  Long id,
  String name,
  Long price,
  Integer stock,
  Category category,
  String status,
  boolean hidden,
  String content,
  String voucherUrl,
  Long targetAmount,
  Long currentAmount,
  LocalDateTime createdDate,
  LocalDateTime modifiedDate
) {
  public ProductResponseDto(Product product) {
    this(
      product.getId(),
      product.getName(),
      product.getPrice(),
      product.getStock(),
      product.getCategory(),
      product.getStatus().toString(),
      product.isHidden(),
      product.getContent(),
      product.getVoucherUrl(),
      product.getTargetAmount(),
      product.getCurrentAmount(),
      product.getCreatedDate(),
      product.getModifiedDate()
    );
  }
}