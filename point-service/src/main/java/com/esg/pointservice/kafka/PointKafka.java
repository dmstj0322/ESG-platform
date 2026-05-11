package com.esg.pointservice.kafka;

import com.esg.pointservice.event.PostCreatedEvent;
import com.esg.pointservice.service.PointService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class PointKafka {
  private final PointService pointService;
  private final ObjectMapper objectMapper;

  @KafkaListener(topics = "point-payment-topic", groupId = "point-service-group")
  public void consume(String message) {
    try {
      PostCreatedEvent event = objectMapper.readValue(message, PostCreatedEvent.class);

      log.info("Kafka 이벤트 수신 성공! 포인트 지급 시작: Post ID {}", event.postId());

      String description = String.format("ESG 활동 인증 성공: [%s] 활동으로 100 포인트 지급",
        event.activityType().getDescription());
      pointService.earnPoints(event.memberId(), event.companyId(), 100L, description);

    } catch (Exception e) {
      log.error("메시지 변환 실패: {}", message, e);
    }
  }
}
