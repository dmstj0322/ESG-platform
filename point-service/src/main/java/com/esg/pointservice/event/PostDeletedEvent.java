package com.esg.pointservice.event;

import com.esg.common.domain.ActivityType;

public record PostDeletedEvent(
  Long postId,
  Long memberId,
  Long companyId,
  ActivityType activityType
) {
}
