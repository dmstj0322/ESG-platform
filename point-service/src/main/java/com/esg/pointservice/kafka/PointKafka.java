package com.esg.pointservice.kafka;

import com.esg.pointservice.event.PostCreatedEvent;
import com.esg.pointservice.service.PointService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class PointKafka {
  private final PointService pointService;

  @KafkaListener(topics = "point-payment-topic", groupId = "point-service-group")
  public void consume(PostCreatedEvent event) {
    try {
      log.info("Kafka 이벤트 수신 성공! 포인트 지급 시작: Post ID {}", event.postId());

      String description = String.format("ESG 활동 인증 성공: [%s] 활동으로 100 포인트 지급",
        event.activityType().getDescription());
      pointService.earnPoints(event.memberId(), event.companyId(), 100L, description, event.postId());

    } catch (Exception e) {
      log.error("포인트 지급 비즈니스 로직 처리 중 에러 발생: Post ID {}", event.postId(), e);
      throw new RuntimeException(e);
    }
  }
}
