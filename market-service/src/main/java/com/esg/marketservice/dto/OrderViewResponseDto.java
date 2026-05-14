package com.esg.marketservice.dto;

import lombok.Builder;

@Builder
public record OrderViewResponseDto(
  String productName,
  String voucherUrl,
  String serialNumber,
  String certificateNumber,
  String category,
  Long totalPrice,
  String orderDate
) {
}
