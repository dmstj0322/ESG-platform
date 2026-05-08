package com.esg.authservice.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Role {
  USER("ROLE_USER", "직원"),
  ADMIN("ROLE_ADMIN", "관리자");

  private final String role;
  private final String title;
}
