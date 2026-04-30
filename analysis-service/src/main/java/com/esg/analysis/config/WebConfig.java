package com.esg.analysis.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                // 1. 프론트엔드(Vite) 포트 허용
                .allowedOrigins("http://localhost:5173")

                // 2. 허용할 HTTP 메서드 명시 (파일 업로드는 POST)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")

                // 3. 모든 헤더 허용 (X-UserId, X-CompanyId 등 커스텀 헤더 포함)
                .allowedHeaders("*")

                // 4. 브라우저가 응답 헤더를 읽을 수 있도록 허용 (필요 시)
                .exposedHeaders("Authorization", "X-UserId", "X-CompanyId")

                // 5. 쿠키 및 인증 정보 포함 허용
                .allowCredentials(true)

                // 6. 프리플라이트(Preflight) 요청 캐싱 시간 (1시간)
                .maxAge(3600);
    }
}