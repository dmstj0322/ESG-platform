package com.esg.analysis.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisOpenAiClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${openai.api.key}")
    private String openAiApiKey;

    @Value("${openai.api.model-name}")
    private String openAiModel;

    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    /** 지표별 분석 — 3회 Exponential Backoff 재시도 */
    public String callWithRetry(String prompt) throws Exception {
        Exception lastException = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                if (attempt > 0) {
                    long backoffMs = 2000L * (1L << (attempt - 1));
                    log.info("[OpenAI] {}차 재시도 — {}ms 대기", attempt + 1, backoffMs);
                    Thread.sleep(backoffMs);
                }
                return call(prompt, 1500);
            } catch (Exception e) {
                lastException = e;
                log.warn("[OpenAI] {}차 실패: {}", attempt + 1, e.getMessage());
            }
        }
        throw lastException;
    }

    /** EcoCommit 전용 — Circuit Breaker 적용 */
    @CircuitBreaker(name = "openaiAnalysis", fallbackMethod = "fallback")
    public String callWithCircuitBreaker(String prompt) throws Exception {
        return call(prompt, 4000);
    }

    public String fallback(String prompt, Exception e) {
        log.error("[OpenAI Fallback] 사유:{}", e.getMessage());
        return "{\"finalGrade\":\"C\",\"fullReport\":\"서비스 지연으로 인한 임시 리포트입니다. 잠시 후 재분석을 시도하세요.\","
                + "\"sections\":["
                + "{\"category\":\"Environment\",\"score\":30,\"grade\":\"D\","
                + "\"comment\":\"[현황 분석] 서비스 오류로 분석 불가. [가이드라인 준수 여부] 확인 불가. [성과 평가] 재분석 필요. [개선 제언] 재분석 후 확인.\","
                + "\"recommendation\":\"재분석 필요\",\"subIndicators\":[]},"
                + "{\"category\":\"Social\",\"score\":30,\"grade\":\"D\","
                + "\"comment\":\"[현황 분석] 서비스 오류로 분석 불가. [가이드라인 준수 여부] 확인 불가. [성과 평가] 재분석 필요. [개선 제언] 재분석 후 확인.\","
                + "\"recommendation\":\"재분석 필요\",\"subIndicators\":[]},"
                + "{\"category\":\"Governance\",\"score\":30,\"grade\":\"D\","
                + "\"comment\":\"[현황 분석] 서비스 오류로 분석 불가. [가이드라인 준수 여부] 확인 불가. [성과 평가] 재분석 필요. [개선 제언] 재분석 후 확인.\","
                + "\"recommendation\":\"재분석 필요\",\"subIndicators\":[]}"
                + "]}";
    }

    private String call(String prompt, int maxTokens) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(openAiApiKey);

        Map<String, Object> requestMap = Map.of(
                "model", openAiModel,
                "messages", List.of(
                        Map.of("role", "system", "content",
                                "You are a Korean ESG analyst. Output ONLY valid JSON. No markdown, no code blocks."),
                        Map.of("role", "user", "content", prompt)
                ),
                "response_format", Map.of("type", "json_object"),
                "temperature", 0.0,
                "max_tokens", maxTokens
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestMap, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(OPENAI_API_URL, entity, String.class);
        return parseResponse(response.getBody());
    }

    private String parseResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        return root.path("choices").get(0).path("message").path("content").asText();
    }
}
