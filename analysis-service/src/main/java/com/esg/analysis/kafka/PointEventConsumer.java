//package com.esg.analysis.kafka;
//
//import com.esg.analysis.service.EcoPointConverter;
//import com.esg.analysis.service.domain.EsgScore;
//import com.esg.analysis.service.repository.EsgScoreRepository;
//import com.fasterxml.jackson.databind.JsonNode;
//import com.fasterxml.jackson.databind.ObjectMapper;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.kafka.annotation.KafkaListener;
//import org.springframework.stereotype.Component;
//import org.springframework.transaction.annotation.Transactional;
//
//@Slf4j
//@Component
//@RequiredArgsConstructor
//public class PointEventConsumer {
//
//    private final EsgScoreRepository esgScoreRepository;
//    private final ObjectMapper objectMapper;
//    private final EcoPointConverter converter;
//
//    @Transactional
//    @KafkaListener(topics = "point-payment-topic", groupId = "analysis-service-group")
//    public void consume(String message) {
//        try {
//            JsonNode jsonNode = objectMapper.readTree(message);
//
//            Long companyId = jsonNode.get("companyId").asLong();
//            // 메시지에 earnedPoints 필드가 있으면 사용, 없으면 기본값 100 (하위 호환)
//            long earnedPoints = jsonNode.has("earnedPoints")
//                    ? jsonNode.get("earnedPoints").asLong()
//                    : 100L;
//
//            log.info("[PointEvent] 기업:{} 수신포인트:{}", companyId, earnedPoints);
//
//            EsgScore esgScore = esgScoreRepository.findByCompanyId(companyId)
//                    .orElseGet(() -> new EsgScore(companyId));
//
//            esgScore.addSocialPoints(converter.toSocialScoreIncrement(earnedPoints));
//            esgScoreRepository.save(esgScore);
//
//            log.info("[PointEvent] 기업:{} S점수 갱신 완료", companyId);
//
//        } catch (Exception e) {
//            log.error("[PointEvent] 처리 오류: {}", e.getMessage());
//        }
//    }
//}
