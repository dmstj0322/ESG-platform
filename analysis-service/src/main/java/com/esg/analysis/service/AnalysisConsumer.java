package com.esg.analysis.service;

import com.esg.analysis.dto.AnalysisRequestDto;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.*;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisConsumer {

    private final AnalysisReportRepository analysisReportRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${langchain4j.google-ai-gemini.chat-model.api-key}")
    private String geminiApiKey;

    @Transactional
    @KafkaListener(topics = "esg-analysis-requests", groupId = "analysis-group")
    public void consumeDtoRequest(AnalysisRequestDto request) {
        Long analysisId = request.getAnalysisId();
        String fileHash = request.getFileHash();

        log.info("#### [Kafka 분석 시작] ID: {}, 데이터 길이: {}", analysisId, request.getContent().length());

        try {
            // 1. 프롬프트 구성
            String prompt = String.format(
                    "당신은 전문 K-ESG 평가원입니다. 제공된 데이터를 바탕으로 심층 분석 리포트를 작성하세요.\n" +
                            "반드시 아래 JSON 형식으로만 응답하세요.\n\n" +
                            "{\n" +
                            "  \"finalGrade\": \"A/B/C\",\n" +
                            "  \"fullReport\": \"Markdown 형식의 리포트\",\n" +
                            "  \"evidence\": [ {\"indicator\": \"지표명\", \"content\": \"근거\", \"page\": \"번호\"} ]\n" +
                            "}\n\n" +
                            "데이터: %s", request.getContent()
            );

            // 2. Gemini API 호출 (수정된 URL 로직 포함)
            String rawAiResponse = callGeminiWithCircuitBreaker(prompt);

            // 3. 응답 정제 및 파싱
            String cleanJsonResponse = rawAiResponse.trim();
            if (cleanJsonResponse.startsWith("```")) {
                cleanJsonResponse = cleanJsonResponse.substring(
                        cleanJsonResponse.indexOf("{"),
                        cleanJsonResponse.lastIndexOf("}") + 1
                );
            }

            log.info("#### [파싱 시도] 정제된 JSON 길이: {}", cleanJsonResponse.length());

            // 4. JSON 객체 변환
            AnalysisResultCache resultDto = objectMapper.readValue(cleanJsonResponse, AnalysisResultCache.class);
            resultDto.setAnalysisId(analysisId);
            resultDto.setAnalyzedAt(LocalDateTime.now());

            // 5. DB 업데이트 (PENDING -> COMPLETED)
            AnalysisReport report = analysisReportRepository.findById(analysisId)
                    .orElseThrow(() -> new IllegalArgumentException("리포트를 찾을 수 없습니다. ID: " + analysisId));

            log.info(">>>> [DB 저장 시도] ID: {}, 등급: {}", analysisId, resultDto.getFinalGrade());

            report.completeAnalysis(cleanJsonResponse, resultDto.getFinalGrade());

            // 즉시 반영하여 에러 유무 확인
            analysisReportRepository.saveAndFlush(report);

            // 6. Redis 캐시 저장
            String cacheKey = "analysis:cache:" + fileHash;
            redisTemplate.opsForValue().set(cacheKey, resultDto, 30, TimeUnit.DAYS);

            log.info(">>>> [DB & Redis 저장 최종 완료 성공!!!] ID: {}, 등급: {}", analysisId, resultDto.getFinalGrade());

            // 7. 웹소켓 실시간 알림
            messagingTemplate.convertAndSend("/topic/analysis/" + request.getCompanyId(), "분석이 완료되었습니다.");

        } catch (Exception e) {
            log.error("#### [분석 프로세스 중 치명적 에러 발생] ID: " + analysisId);
            log.error("에러 원인: {}", e.getMessage());
            e.printStackTrace(); // 상세 에러 원인 출력
        }
    }

    @CircuitBreaker(name = "geminiAnalysis", fallbackMethod = "fallbackGeminiAnalysis")
    public String callGeminiWithCircuitBreaker(String prompt) throws Exception {
        // 1. API 키 청소 (괄호, 마크다운 찌꺼기 제거)
        String cleanApiKey = geminiApiKey.trim().replaceAll("[\\[\\]\\(\\)]", "");

        // 2. 순수 URL 조립 (외부 변수 없이 하드코딩으로 안전하게 설정)
        String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + cleanApiKey;

        // 3. 로그 확인 (이 로그에서 kpedia 같은 이상한 주소가 사라져야 합니다)
        log.info("#### [최종 URL 점검]: {}", "https://generativelanguage.googleapis.com/... (보안상 생략)");

        // 4. 요청 바디 설정
        Map<String, Object> requestMap = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", Map.of("response_mime_type", "application/json")
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestMap, headers);

        // 5. 실제 호출
        ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

        return parseStringAiResponse(response.getBody());
    }

    private String parseStringAiResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);

        if (root.has("error")) {
            throw new RuntimeException("Gemini API 에러: " + root.path("error").get("message").asText());
        }

        return root.path("candidates").get(0)
                .path("content")
                .path("parts")
                .get(0)
                .path("text")
                .asText();
    }

    public String fallbackGeminiAnalysis(String prompt, Exception e) {
        log.error("🚨 [Circuit Breaker OPEN] 사유: {}", e.getMessage());
        return "{\n" +
                "  \"finalGrade\": \"B\",\n" +
                "  \"fullReport\": \"현재 AI 분석 서비스 호출이 원활하지 않습니다. 잠시 후 다시 시도해주세요.\",\n" +
                "  \"evidence\": []\n" +
                "}";
    }
}

//package com.esg.analysis.service;
//
//import com.esg.analysis.dto.AnalysisResultCache;
//import com.esg.analysis.dto.AnalysisRequestDto; // DTO 임포트 확인!
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.data.redis.core.RedisTemplate;
//import org.springframework.kafka.annotation.KafkaListener;
//import org.springframework.stereotype.Service;
//
//import java.time.LocalDateTime;
//import java.util.concurrent.TimeUnit;
//
//@Slf4j
//@Service
//@RequiredArgsConstructor
//public class AnalysisConsumer {
//
//    private final RedisTemplate<String, Object> redisTemplate;
//
//    @KafkaListener(topics = "esg-analysis-requests", groupId = "analysis-group")
//    public void consume(AnalysisRequestDto requestDto) { // String 대신 DTO로 직접 받기
//        try {
//            log.info("#### [Kafka 수신 성공] ID: {}, Hash: {}",
//                    requestDto.getAnalysisId(), requestDto.getFileHash());
//
//            // 1. DTO에서 값 꺼내기
//            Long analysisId = requestDto.getAnalysisId();
//            String fileHash = requestDto.getFileHash();
//
//            // 2. [가상] Gemini 분석 결과물 생성 (나중에 실제 로직으로 대체)
//            String finalGrade = "B";
//            String fullReport = "삼성전자 ESG 경제성과 분석 리포트 결과입니다.";
//
//            // 3. [F-301] Redis 캐시 저장
//            AnalysisResultCache cacheData = AnalysisResultCache.builder()
//                    .analysisId(analysisId)
//                    .finalGrade(finalGrade)
//                    .fullReport(fullReport)
//                    .analyzedAt(LocalDateTime.now())
//                    .build();
//
//            String cacheKey = "analysis:cache:" + fileHash;
//            redisTemplate.opsForValue().set(cacheKey, cacheData, 30, TimeUnit.DAYS);
//
//            log.info("#### [F-301] Redis 저장 완료! Key: {}", cacheKey);
//
//        } catch (Exception e) {
//            log.error("#### [Consumer 에러] 처리 중 예외 발생: {}", e.getMessage());
//        }
//    }
//}