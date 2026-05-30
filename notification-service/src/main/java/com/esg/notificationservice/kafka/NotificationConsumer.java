package com.esg.notificationservice.kafka;

import com.esg.common.event.NotificationEvent;
import com.esg.notificationservice.domain.Notification;
import com.esg.notificationservice.domain.NotificationType;
import com.esg.notificationservice.repository.NotificationRepository;
import com.esg.notificationservice.service.SseService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationConsumer {
  private final NotificationRepository notificationRepository;
  private final SseService sseService;

  @KafkaListener(topics = {"notification-topic"}, groupId = "notification-group")
  public void consume(NotificationEvent event) {
    log.info("알림 이벤트 수신: 대상 유저={}, 타입={}", event.memberId(), event.type());

    NotificationType typeEnum;
    try {
      typeEnum = NotificationType.valueOf(event.type());
    } catch (IllegalArgumentException e) {
      log.warn("알 수 없는 알림 타입 수신: {}", event.type());
      typeEnum = NotificationType.UNKNOWN;
    }

    try {
      Notification notification = notificationRepository.save(Notification.builder()
        .memberId(event.memberId())
        .message(event.message())
        .type(typeEnum)
        .targetId(event.targetId())
        .isRead(false)
        .build());

      // 2. SSE를 통해 접속 중인 프론트엔드로 실시간 전송
      sseService.send(event.memberId(), notification);

    } catch (Exception e) {
      log.error("알림 처리 중 에러 발생: {}", event.memberId(), e);
      throw e;
    }
  }
}
