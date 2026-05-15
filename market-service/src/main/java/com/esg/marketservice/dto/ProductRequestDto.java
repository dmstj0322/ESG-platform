package com.esg.marketservice.dto;

import com.esg.marketservice.domain.Category;
import lombok.Builder;

@Builder
public record ProductRequestDto (
  String name,
  Long price,
  Integer stock,
  Category category,
  String content,
  String voucherUrl,
  Long targetAmount
) { }
