package com.esg.analysis.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class UpstageConfig {

    @Value("${upstage.api.key}") // application.yml에 등록된 키를 읽어옵니다.
    private String apiKey;

    @Bean
    public WebClient upstageWebClient() {
        return WebClient.builder()
                .baseUrl("https://api.upstage.ai/v1/document-ai/layout-analysis")
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
    }
}