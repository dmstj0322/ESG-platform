package com.esg.communityservice.dto;

import com.esg.common.domain.ActivityType;

public record PostRequestDto(
  String title,
  String content,
  Long memberId,
  Long companyId,
  String nickname,
  ActivityType activityType,
  Double aiScore,
  String aiResult) {
}
