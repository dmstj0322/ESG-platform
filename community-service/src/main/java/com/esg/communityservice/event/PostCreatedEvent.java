package com.esg.communityservice.event;

import com.esg.communityservice.domain.ActivityType;

import java.io.Serializable;
import java.util.List;

public record PostCreatedEvent(
  Long postId,
  Long memberId,
  Long companyId,
  List<String> imageUrls,
  ActivityType activityType
) implements Serializable {
}
