package com.esg.analysis.config; // 패키지 경로 본인 프로젝트에 맞게 수정

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class JacksonConfig {

    @Bean
    @Primary
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        // 🔥 Java 8 날짜/시간 모듈 등록
        mapper.registerModule(new JavaTimeModule());
        // 🔥 날짜를 숫자 배열이 아닌 문자열(ISO-8601)로 출력
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }
}