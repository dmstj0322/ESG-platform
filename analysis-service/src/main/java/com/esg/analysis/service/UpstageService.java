package com.esg.analysis.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;

@Slf4j
@Service
@RequiredArgsConstructor
public class UpstageService {

    private final WebClient upstageWebClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String parsePdfToMarkdown(MultipartFile file) throws IOException {
        log.info(">>>> [Upstage] Layout Analysis 호출 시작: {}", file.getOriginalFilename());

        // 1. Multipart 요청 구성
        MultipartBodyBuilder builder = new MultipartBodyBuilder();

        // [중요] .contentType(...)을 추가하여 415 에러를 원천 차단합니다.
        builder.part("document", new ByteArrayResource(file.getBytes()))
                .filename(file.getOriginalFilename())
                .contentType(MediaType.valueOf(file.getContentType())); // application/pdf 등 주입

        try {
            // 2. RAW String으로 응답 받기
            String rawResponse = upstageWebClient.post()
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (rawResponse == null || rawResponse.trim().isEmpty()) {
                log.error(">>>> Upstage 응답이 비어있습니다.");
                return "";
            }

            // 3. 재귀적으로 모든 텍스트 노드 수집
            StringBuilder combinedText = new StringBuilder();
            JsonNode root = objectMapper.readTree(rawResponse);
            findAndCollectText(root, combinedText);

            String result = combinedText.toString().trim();
            log.info(">>>> [Upstage] 추출 성공 - 데이터 길이: {}", result.length());
            return result;

        } catch (Exception e) {
            log.error(">>>> [Upstage] 처리 중 오류 발생: {}", e.getMessage());
            // 에러 발생 시 빈 값을 넘겨 시스템이 멈추지 않게 하거나, 예외를 던집니다.
            throw new RuntimeException("Upstage API 처리 실패: " + e.getMessage());
        }
    }

    /**
     * JSON 트리를 타면서 markdown, text, html 필드가 보이면 모두 수집합니다.
     */
    private void findAndCollectText(JsonNode node, StringBuilder sb) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String key = entry.getKey();
                JsonNode value = entry.getValue();

                // Upstage 응답 구조에서 텍스트 데이터가 포함된 키들을 수집
                if ((key.equals("markdown") || key.equals("text") || key.equals("html")) && value.isTextual()) {
                    sb.append(value.asText()).append("\n\n"); // 가독성을 위해 개행 추가
                } else {
                    findAndCollectText(value, sb);
                }
            });
        } else if (node.isArray()) {
            for (JsonNode item : node) {
                findAndCollectText(item, sb);
            }
        }
    }
}