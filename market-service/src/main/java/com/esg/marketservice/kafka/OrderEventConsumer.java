package com.esg.marketservice.kafka;

import com.esg.marketservice.domain.Category;
import com.esg.marketservice.event.OrderCreatedEvent;
import com.esg.marketservice.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@RequiredArgsConstructor
public class OrderEventConsumer {
  private final EmailService emailService;

  @KafkaListener(topics = "order-events", groupId = "market-group")
  public void consume(OrderCreatedEvent event) {
    if ("AUTO_SEND_BY_ADMIN".equals(event.eventType())) {
      if (event.category() == Category.GIFTICON) {
        log.info("기프티콘 발송: 회원={}, 상품={}", event.memberId(), event.productName());
        emailService.sendVoucherEmail(
          event.adminEmail(),
          event.userEmail(),
          event.productName(),
          event.donationCertUrl() // detailLink 필드
        );
      }

      else if (event.category() == Category.DONATION) {
        log.info("기부 접수 완료: 회원={}, 기부처={}", event.memberId(), event.productName());
        emailService.sendDonationCertEmail(
          event.adminEmail(),
          event.userEmail(),
          event.productName(),
          event.donationCertUrl()
        );
      }
    }
    else if ("CANCELED_BY_ADMIN".equals(event.eventType())) {
      // ✅ 관리자 취소 이벤트
      log.info("관리자 취소 처리 완료: 회원={}, 상품={}, 환불액={}", event.memberId(), event.productName(), event.totalPrice());
    } else if ("CANCELED_BY_MEMBER".equals(event.eventType())) {
      // ✅ 회원 취소 이벤트
      log.info("회원 취소 처리 완료: 회원={}, 상품={}, 환불액={}", event.memberId(), event.productName(), event.totalPrice());
    }
    else {
      // ✅ 예상치 못한 이벤트 타입
      log.warn("알 수 없는 이벤트 타입: {}", event.eventType());
    }
  }
}
