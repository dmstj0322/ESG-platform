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
        // emailService.sendVoucherEmail(...);
        emailService.sendVoucherEmail(
          event.adminEmail(),
          event.userEmail(),
          event.productName(),
          event.donationCertUrl() // detailLink 필드
        );
      }

      else if (event.category() == Category.DONATION) {
        log.info("기부 접수 완료: 회원={}, 기부처={}", event.memberId(), event.productName());
        // donationStatsService.update(event.totalPrice()); (가정)
        emailService.sendDonationCertEmail(
          event.adminEmail(),
          event.userEmail(),
          event.productName(),
          event.donationCertUrl()
        );
      }
    }
  }
}
