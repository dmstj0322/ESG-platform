package com.esg.communityservice.domain;

import lombok.Getter;

@Getter
public enum AIStatus {
  PENDING("분석 대기"),
  PROCESSING("분석 중"),
  SUCCESS("자동 승인"),
  REVIEW_NEEDED("관리자 검토 필요");

  private final String description;

  AIStatus(String description) {
    this.description = description;
  }
}
