package com.esg.common.dto;

public record PointRequest(
  Long memberId,
  Long companyId,
  Long amount,
  String description,
  Long targetId,
  int earnedCo2
) {
}
