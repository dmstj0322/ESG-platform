package com.esg.communityservice.domain;

public enum AdminStatus {
  WAITING("대기"),
  APPROVED("승인"),
  REJECTED("반려");

  private final String description;

  AdminStatus(String description) {
    this.description = description;
  }
}
