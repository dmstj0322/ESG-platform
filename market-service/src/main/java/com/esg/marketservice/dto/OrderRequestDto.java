package com.esg.marketservice.dto;

public record OrderRequestDto(
  Long productId, int count
) {
}
