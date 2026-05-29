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
    PostCreatedEvent event = null;
    try {
      event = objectMapper.readValue(message, PostCreatedEvent.class);
    } catch (Exception e) {
      log.error("[ESG-KAFKA] 메시지 역직렬화 실패: {}", message, e);
      return;
    }

    final Long eventId    = event.postId();
    final Long memberId   = event.memberId();
    final Long companyId  = event.companyId();

    if (eventId == null || memberId == null) {
      log.warn("[ESG-KAFKA] 필수 필드 누락 — eventId={} memberId={} 메시지 무시", eventId, memberId);
      return;
    }

    log.info("[ESG-KAFKA] 이벤트 수신 eventId={} memberId={} companyId={} activityType={}",
        eventId, memberId, companyId, event.activityType());

    String description = String.format("ESG 활동 인증: [%s] 100 포인트 지급",
        event.activityType() != null ? event.activityType().getDescription() : "알 수 없음");

    try {
      pointService.earnEsgActivityPoints(eventId, memberId, companyId, 100L,
          event.activityType(), description);
    } catch (Exception e) {
      log.error("[ESG-KAFKA] 포인트 적립 실패 eventId={} memberId={}: {}", eventId, memberId, e.getMessage(), e);
    }
  }
}
