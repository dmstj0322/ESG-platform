package com.esg.communityservice.kafka;

import com.esg.communityservice.event.PostCreatedEvent;
import com.esg.communityservice.service.AsyncVerificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class PostKafka {
  private final AsyncVerificationService asyncVerificationService;

  @KafkaListener(topics = "post-created-topic", groupId = "community-group")
  public void consume(PostCreatedEvent event) {
    try {
      log.info("Kafka 이벤트 수신, 비동기 처리 시작: Post ID {}", event.postId());
      asyncVerificationService.processVerification(event);
    } catch (Exception e) {
      log.error("비동기 처리 중 치명적 오류 발생: Post ID {}, Error: {}", event.postId(), e.getMessage());
      throw e;
    }
  }
}
