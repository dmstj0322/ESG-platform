package com.esg.communityservice.dto;

import java.util.List;
import java.util.Map;

public record BadgeDashboardDto(
  Map<String, Long> activityCounts,
  List<BadgeDto> earnedBadges,
  Long representativeBadgeId
) {
  public record BadgeDto(Long id, String name, String description, String imageUrl) {}
}