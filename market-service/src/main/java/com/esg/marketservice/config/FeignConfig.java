package com.esg.marketservice.config;

import feign.RequestInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Configuration
public class FeignConfig {
  @Bean
  public RequestInterceptor requestInterceptor() {
    return template -> {
      ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
      if (attributes != null) {
        String accessToken = attributes.getRequest().getHeader("Authorization");
        if (accessToken != null) {
          template.header("Authorization", accessToken);
        }
      }
    };
  }
}
