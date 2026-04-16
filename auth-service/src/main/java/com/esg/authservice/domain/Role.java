package com.esg.authservice.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Role {
  GUEST("ROLE_GUEST", "손님"),
  USER("ROLE_USER", "일반 사용자"),
  ADMIN("ROLD_ADMIN", "관리자");

  private final String role;
  private final String title;
}
