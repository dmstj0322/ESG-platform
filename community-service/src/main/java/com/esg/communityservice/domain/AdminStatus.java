package com.esg.communityservice.domain;

import lombok.Getter;

@Getter
public enum AdminStatus {
  WAITING("대기"),
  APPROVED("승인"),
  REJECTED("반려"),
  AUTO_REJECTED("AI 자동 반려");

  private final String description;

  AdminStatus(String description) {
    this.description = description;
  }
}
