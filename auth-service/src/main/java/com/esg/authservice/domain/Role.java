package com.esg.authservice.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Role {
  SYSTEM_ADMIN("ROLE_SYSTEM_ADMIN", "시스템 최종 관리자"),
  COMPANY_ADMIN("ROLE_COMPANY_ADMIN", "회사 관리자"),
  USER("ROLE_USER", "일반 직원");

  private final String role;
  private final String title;
}
