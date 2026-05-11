package com.esg.authservice.dto;

public record LoginResponse(String accessToken, String refreshToken, String email, String nickname, Long memberId) {
}
