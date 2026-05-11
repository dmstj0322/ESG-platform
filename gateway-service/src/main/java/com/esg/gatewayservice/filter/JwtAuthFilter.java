package com.esg.gatewayservice.filter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.security.Key;
import java.util.List;

@Component
public class JwtAuthFilter extends AbstractGatewayFilterFactory<JwtAuthFilter.Config> {

    // Auth-service와 반드시 동일해야 함
    private final String secret;
    private final Key key;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    private static final List<String> EXCLUDE_URLS = List.of(
      "/auth/signup",
      "/auth/login",
      "/auth/refresh"
    );

    public JwtAuthFilter(@Value("${jwt.secret}") String secret) {
        super(Config.class);
        this.secret = secret;
        this.key = Keys.hmacShaKeyFor(secret.getBytes());
    }

    public static class Config { }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();
            String path = request.getPath().toString();

            boolean isExcluded = EXCLUDE_URLS.stream()
              .anyMatch(pattern -> pathMatcher.match(pattern, path));

            if (isExcluded) {
                System.out.println(">>> 예외 경로 매칭 성공! 필터 통과: " + path);
                return chain.filter(exchange);
            }

            // 1. 헤더에 Authorization이 있는지 확인
            if (!request.getHeaders().containsKey(HttpHeaders.AUTHORIZATION)) {
                return onError(exchange, "헤더가 없습니다.", HttpStatus.UNAUTHORIZED);
            }

            String authHeader = request.getHeaders().get(HttpHeaders.AUTHORIZATION).get(0);
            if (!authHeader.startsWith("Bearer ")) {
                return onError(exchange, "잘못된 토큰 형식입니다.", HttpStatus.UNAUTHORIZED);
            }

            String token = authHeader.replace("Bearer ", "");

            try {
                // 2. 토큰 검증
                Claims claims = Jwts.parserBuilder()
                  .setSigningKey(key)
                  .build()
                  .parseClaimsJws(token)
                  .getBody();

                String memberId = String.valueOf(claims.get("memberId"));
                String companyId = String.valueOf(claims.get("companyId"));
                String role = claims.get("role", String.class);

                // 3. 다음 서비스로 유저 ID 전달
                ServerHttpRequest modifiedRequest = request.mutate()
                  .header("X-Member-Id", memberId)
                  .header("X-Company-Id", companyId)
                  .header("X-Role", role)
                  .build();

                return chain.filter(exchange.mutate().request(modifiedRequest).build());

            } catch (Exception e) {
                return onError(exchange, "유효하지 않은 토큰입니다.", HttpStatus.UNAUTHORIZED);
            }
        };
    }

    private Mono<Void> onError(ServerWebExchange exchange, String err, HttpStatus status) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(status);
        return response.setComplete();
    }
}
