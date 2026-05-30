package com.esg.pointservice.kafka;

import com.esg.common.event.NotificationEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationProducer {
  private final KafkaTemplate<String, Object> kafkaTemplate;
  private final String TOPIC = "notification-topic";

  public void send(Long memberId, String message, String type, Long targetId) {
    NotificationEvent event = new NotificationEvent(memberId, message, type, targetId);
    kafkaTemplate.send(TOPIC, String.valueOf(memberId), event);
    log.info("알림 전송: 유저={}, 타입={}", memberId, type);
  }
}
