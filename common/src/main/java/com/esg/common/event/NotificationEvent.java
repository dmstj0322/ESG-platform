package com.esg.common.event;

public record NotificationEvent(
  Long memberId,
  String message,
  String type,
  Long targetId
) {
}
