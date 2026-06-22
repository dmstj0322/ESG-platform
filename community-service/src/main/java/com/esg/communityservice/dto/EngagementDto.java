package com.esg.communityservice.dto;

public record EngagementDto(
  Long memberId,
  String name,
  long activities,
  long points,
  String tier
) {}
