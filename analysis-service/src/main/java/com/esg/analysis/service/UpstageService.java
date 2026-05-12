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

    /** MultipartFile 편의 오버로드 — 내부적으로 byte[] 버전을 호출한다. */
    public String parsePdfToMarkdown(MultipartFile file) throws IOException {
        return parsePdfToMarkdown(file.getBytes(), file.getOriginalFilename(), file.getContentType());
    }

    /**
     * byte[] 기반 호출 — HTTP 요청 스레드가 종료된 후 비동기 스레드에서 호출할 때 사용.
     * MultipartFile 스트림은 요청 범위(request-scoped)이므로 비동기 컨텍스트에서 직접 접근하면 닫혀 있다.
     */
    public String parsePdfToMarkdown(byte[] fileBytes, String filename, String contentType) throws IOException {
        log.info(">>>> [Upstage] Layout Analysis 호출 시작: {}", filename);

        // 1. Multipart 요청 구성
        MultipartBodyBuilder builder = new MultipartBodyBuilder();

        builder.part("document", new ByteArrayResource(fileBytes))
                .filename(filename)
                .contentType(MediaType.valueOf(contentType != null ? contentType : "application/pdf"));
        builder.part("ocr", "force");

        try {
            // 2. RAW String으로 응답 받기
            String rawResponse = upstageWebClient.post()
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (rawResponse == null || rawResponse.trim().isEmpty()) {
                log.error(">>>> [Upstage] 응답이 비어있습니다. filename={}", filename);
                return "";
            }

            // 3. elements 배열에서 페이지 마커 보존 추출 → fallback: 재귀 텍스트 수집
            JsonNode root = objectMapper.readTree(rawResponse);
            String result = extractWithPageMarkers(root);
            if (result.isBlank()) {
                StringBuilder fallback = new StringBuilder();
                findAndCollectText(root, fallback);
                result = fallback.toString().trim();
                log.info(">>>> [Upstage] fallback 추출 완료 - 길이: {}", result.length());
            } else {
                log.info(">>>> [Upstage] 페이지 마커 추출 완료 - 길이: {}", result.length());
            }
            return result;

        } catch (Exception e) {
            log.error(">>>> [Upstage] 처리 중 오류 발생: {}", e.getMessage());
            // 에러 발생 시 빈 값을 넘겨 시스템이 멈추지 않게 하거나, 예외를 던집니다.
            throw new RuntimeException("Upstage API 처리 실패: " + e.getMessage());
        }
    }

    /**
     * Upstage elements 배열에서 페이지별 텍스트를 추출하고 [PAGE:X] 마커를 삽입합니다.
     * elements 배열이 없거나 비어있으면 빈 문자열을 반환하고 fallback이 처리합니다.
     *
     * Upstage Document Parse 응답 구조:
     *   { "elements": [ { "page": 1, "content": { "text": "...", "markdown": "..." } }, ... ] }
     */
    private String extractWithPageMarkers(JsonNode root) {
        JsonNode elements = root.path("elements");
        if (!elements.isArray() || elements.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        int currentPage = -1;

        for (JsonNode elem : elements) {
            int page = elem.path("page").asInt(-1);

            // content.text → content.markdown 순서로 텍스트 추출
            JsonNode content = elem.path("content");
            String text = "";
            if (content.has("text") && content.get("text").isTextual()) {
                text = content.get("text").asText().trim();
            } else if (content.has("markdown") && content.get("markdown").isTextual()) {
                text = content.get("markdown").asText().trim();
            }
            if (text.isBlank()) continue;

            // 페이지가 바뀔 때만 마커 삽입 (FILE_PAGE = 업로드 파일 내 물리적 순서, 인쇄 페이지 번호와 다를 수 있음)
            if (page > 0 && page != currentPage) {
                sb.append("\n[FILE_PAGE:").append(page).append("]\n");
                currentPage = page;
            }
            sb.append(text).append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * JSON 트리를 타면서 markdown, text, html 필드가 보이면 모두 수집합니다.
     * elements 배열이 없는 구형 Upstage 응답 또는 fallback 용도로 사용됩니다.
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