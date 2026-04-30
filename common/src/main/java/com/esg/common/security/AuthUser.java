package com.esg.common.security;

public record AuthUser(Long memberId, Long companyId, String role) {
}
