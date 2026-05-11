package com.esg.common.dto;

public record MemberResponse(
  Long memberId,
  Long companyId,
  String name,
  String email
) {
}
