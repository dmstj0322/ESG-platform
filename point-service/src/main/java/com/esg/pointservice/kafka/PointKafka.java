package com.esg.pointservice.kafka;

import com.esg.common.domain.ActivityType;
import com.esg.pointservice.event.PostCreatedEvent;
import com.esg.pointservice.event.PostDeletedEvent;
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

      int earnedCo2 = event.activityType().getCo2ReductionGram();
      Long pointAmount = 100L;

      pointService.earnPoints(event.memberId(), event.companyId(), pointAmount, description, event.postId(), earnedCo2);

    } catch (Exception e) {
      log.error("포인트 지급 비즈니스 로직 처리 중 에러 발생: Post ID {}", event.postId(), e);
      throw new RuntimeException(e);
    }
  }

  @KafkaListener(topics = "post-deleted-topic", groupId = "point-service-group")
  public void consumeDeleted(PostDeletedEvent event) {
    try {
      log.info("Kafka 회수 이벤트 수신! 포인트/탄소 회수 시작: Post ID {}", event.postId());

      ActivityType type = event.activityType();

      // 🌟 회수할 탄소량도 Enum에서 산출
      int co2Amount = type.getCo2ReductionGram();
      Long pointAmount = 100L;

      // 서비스의 회수 전용 메서드 호출
      pointService.cancelPoints(event.memberId(), event.companyId(), pointAmount, co2Amount, event.postId());
    } catch (Exception e) {
      log.error("보상 회수 처리 중 에러 발생: Post ID {}", event.postId(), e);
      throw new RuntimeException(e);
    }
  }
}
