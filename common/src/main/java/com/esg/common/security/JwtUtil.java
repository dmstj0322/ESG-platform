package com.esg.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;

@Component
public class JwtUtil {
  @Value("${jwt.secret}")
  private String secret;

  private Key key;

  private final long ACCESS_TOKEN_TIME = 60 * 60 * 1000L; // 1시간
  private final long REFRESH_TOKEN_TIME = 14 * 24 * 60 * 60 * 1000L; // 14일

  @PostConstruct
  public void init() {
    this.key = Keys.hmacShaKeyFor(secret.getBytes());
  }

  public String createToken(Long memberId, String email, Long companyId, String role, String nickname) {
    Claims claims = Jwts.claims().setSubject(email);
    claims.put("memberId", memberId);
    claims.put("companyId", companyId);
    claims.put("role", role);
    claims.put("nickname", nickname);

    return Jwts.builder()
      .setClaims(claims)
      .setIssuedAt(new Date())
      .setExpiration(new Date(System.currentTimeMillis() + ACCESS_TOKEN_TIME))
      .signWith(key, SignatureAlgorithm.HS256)
      .compact();
  }

  public String createRefreshToken(String email) {
    return Jwts.builder()
      .setSubject(email)
      .setIssuedAt(new Date())
      .setExpiration(new Date(System.currentTimeMillis() + REFRESH_TOKEN_TIME))
      .signWith(key, SignatureAlgorithm.HS256)
      .compact();
  }

  public Claims getUserInfoFromToken(String token) {
    return Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token).getBody();
  }
}