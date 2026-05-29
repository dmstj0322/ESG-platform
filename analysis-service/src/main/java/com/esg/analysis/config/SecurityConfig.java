package com.esg.analysis.config;

import com.esg.common.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {
  private final JwtUtil jwtUtil;

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
      .cors(cors -> cors.disable())
      .csrf(csrf -> csrf.disable())
      .sessionManagement(session -> session
        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .authorizeHttpRequests(auth -> auth
        .requestMatchers("/error").permitAll()
        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
        .requestMatchers("/ws-esg/**").permitAll()
        .requestMatchers(HttpMethod.GET,
          "/latest", "/stats", "/carbon/stats", "/carbon/report-data",
          "/eco/preview", "/benchmark", "/benchmark/company").permitAll()
        // 분석 결과 조회 — 인증 없이 접근 가능 (개발 단계)
        // 실제 경로: /api/v1/analysis/{analysisId}/result
        .requestMatchers(HttpMethod.GET, "/api/v1/analysis/*/result").permitAll()
        .requestMatchers(HttpMethod.POST, "/report", "/api/v1/analysis/report", "/api/v1/analysis/final-report", "/api/v1/analysis/category").permitAll()
        .requestMatchers(HttpMethod.POST, "/test/retrieval/index").permitAll()
        .requestMatchers(HttpMethod.GET, "/test/retrieval/**").permitAll()
        .requestMatchers(HttpMethod.DELETE, "/test/retrieval/session").permitAll()
        .requestMatchers("/admin/**").hasRole("ADMIN")
        .anyRequest().authenticated())
      .addFilterBefore(new JwtAuthenticationFilter(jwtUtil), UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }

}
