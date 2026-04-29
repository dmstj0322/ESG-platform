package com.esg.pointservice.event;

import com.esg.pointservice.domain.ActivityType;

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