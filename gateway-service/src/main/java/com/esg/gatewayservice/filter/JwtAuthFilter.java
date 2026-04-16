package com.esg.gatewayservice.filter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.security.Key;

@Component
public class JwtAuthFilter extends AbstractGatewayFilterFactory<JwtAuthFilter.Config> {

    // Auth-service와 반드시 동일해야 함
    private final String secret = "vms_secret_key_testing_1234567890_vms_secret_key";
    private final Key key = Keys.hmacShaKeyFor(secret.getBytes());

    public JwtAuthFilter() {
        super(Config.class);
    }

    public static class Config { }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();

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

                String userId = claims.getSubject();

                // 3. 다음 서비스로 유저 ID 전달
                ServerHttpRequest modifiedRequest = request.mutate()
                        .header("X-User-Id", userId)
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
