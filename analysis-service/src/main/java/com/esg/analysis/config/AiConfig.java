package com.esg.analysis.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AiConfig {

    /**
     * OpenAI API 호출 시 사용할 RestTemplate을 빈으로 등록합니다.
     * AnalysisConsumer에서 주입받아 사용합니다.
     */
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}