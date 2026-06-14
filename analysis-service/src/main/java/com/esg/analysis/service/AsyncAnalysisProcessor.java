//package com.esg.analysis.service;
//
//import com.esg.analysis.service.repository.AnalysisReportRepository;
//import com.fasterxml.jackson.databind.ObjectMapper;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.kafka.core.KafkaTemplate;
//import org.springframework.messaging.simp.SimpMessagingTemplate;
//import org.springframework.scheduling.annotation.Async;
//import org.springframework.stereotype.Component;
//import org.springframework.transaction.support.TransactionTemplate;
//
//import java.util.HashMap;
//import java.util.Map;
//
///**
// * HTTP 요청 스레드와 분리된 비동기 처리기.
// * Upstage PDF 파싱(수십 초) + Kafka 발행을 백그라운드에서 실행한다.
// * Spring @Async는 같은 빈 내부 호출 시 프록시가 우회되므로 별도 컴포넌트로 분리.
// */
//@Slf4j
//@Component
//@RequiredArgsConstructor
//public class AsyncAnalysisProcessor {
//
//    private final UpstageService upstageService;
//    private final KafkaTemplate<String, Object> kafkaTemplate;
//    private final ObjectMapper objectMapper;
//    private final SimpMessagingTemplate messagingTemplate;
//    private final AnalysisReportRepository analysisReportRepository;
//    private final TransactionTemplate transactionTemplate;
//
//    private static final String TOPIC = "esg-analysis-requests";
//
//    /**
//     * Upstage 파싱 → Kafka 발행을 비동기 실행.
//     * 실패 시 DB 상태를 FAILED로 갱신하고 WS FAILED 이벤트를 발송한다.
//     */
//    @Async("analysisExecutor")
//    public void processAsync(Long analysisId, Long companyId,
//                             byte[] fileBytes, String filename, String contentType,
//                             String fileHash, Long userPoints) {
//
//        log.info("[AsyncProcessor] Upstage 파싱 시작 analysisId={} companyId={}", analysisId, companyId);
//        try {
//            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "OCR_PROCESSING");
//            String markdownContent = upstageService.parsePdfToMarkdown(fileBytes, filename, contentType);
//
//            Map<String, Object> kafkaMsg = new HashMap<>();
//            kafkaMsg.put("analysisId",  analysisId);
//            kafkaMsg.put("companyId",   companyId);
//            kafkaMsg.put("content",     markdownContent);
//            kafkaMsg.put("fileHash",    fileHash);
//            kafkaMsg.put("userPoints",  userPoints);
//
//            kafkaTemplate.send(TOPIC, String.valueOf(companyId), objectMapper.writeValueAsString(kafkaMsg));
//            log.info("[AsyncProcessor] Kafka 전송 완료 analysisId={}", analysisId);
//
//        } catch (Exception e) {
//            log.error("[AsyncProcessor] 처리 실패 analysisId={} 원인={}", analysisId, e.getMessage(), e);
//            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "FAILED");
//            transactionTemplate.execute(status -> {
//                analysisReportRepository.findById(analysisId).ifPresent(report -> {
//                    report.failAnalysis();
//                    analysisReportRepository.save(report);
//                });
//                return null;
//            });
//        }
//    }
//
//    /**
//     * 캐시 히트 시 WS COMPLETE 통보.
//     * HTTP 스레드를 블로킹하지 않도록 비동기 실행.
//     */
//    @Async("analysisExecutor")
//    public void notifyCompleteAfterDelay(Long companyId) {
//        try {
//            // 프런트가 WS를 구독한 뒤 메시지를 받을 수 있도록 짧은 대기
//            Thread.sleep(1200);
//            messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETED");
//        } catch (InterruptedException e) {
//            Thread.currentThread().interrupt();
//        }
//    }
//}
