package com.esg.marketservice.dto;

import com.esg.marketservice.domain.Category;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
public record ProductRequestDto (
  String name,
  Long price,
  Integer stock,
  Category category,
  String content,
  String voucherUrl
) { }
