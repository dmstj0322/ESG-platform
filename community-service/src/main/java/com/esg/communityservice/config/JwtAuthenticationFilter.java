package com.esg.communityservice.config;

import com.esg.common.security.AuthUser;
import com.esg.common.security.JwtUtil;
import io.jsonwebtoken.ExpiredJwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {
  private final JwtUtil jwtUtil;

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
    String token = request.getHeader("Authorization");

    if (token != null && token.startsWith("Bearer ")) {
      String jwt = token.substring(7);

      try {
        var claims = jwtUtil.getUserInfoFromToken(jwt);

        Long memberId = claims.get("memberId", Long.class);
        Long companyId = claims.get("companyId", Long.class);
        String role = claims.get("role", String.class);
        String email = claims.get("email", String.class);

        List<SimpleGrantedAuthority> authorities = Collections.singletonList(
          new SimpleGrantedAuthority("ROLE_" + role)
        );

        var auth = new UsernamePasswordAuthenticationToken(new AuthUser(memberId, companyId, role, email), null, authorities);
        SecurityContextHolder.getContext().setAuthentication(auth);

      } catch (ExpiredJwtException e) {
        log.warn("토큰이 만료되었습니다: {}", e.getMessage());
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.getWriter().write("{\"error\": \"Expired Token\"}");
        return;
      } catch (Exception e) {
        log.error("토큰 검증 실패: {}", e.getMessage());
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.getWriter().write("{\"error\": \"Invalid Token\"}");
        return;
      }
    }

    filterChain.doFilter(request, response);
  }
}
