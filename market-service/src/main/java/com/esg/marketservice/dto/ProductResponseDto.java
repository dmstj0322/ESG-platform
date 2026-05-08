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
  String content,
  String voucherUrl,
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
      product.getContent(),
      product.getVoucherUrl(),
      product.getCreatedDate(),
      product.getModifiedDate()
    );
  }
}