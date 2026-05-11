package com.esg.communityservice.domain;

public enum AIStatus {
  PENDING("분석 대기"),
  PROCESSING("분석 중"),
  SUCCESS("정상"),
  FAIL("이상 탐지");

  private final String description;

  AIStatus(String description) {
    this.description = description;
  }
}
