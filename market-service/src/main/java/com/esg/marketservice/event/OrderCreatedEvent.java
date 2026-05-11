package com.esg.marketservice.event;

import com.esg.marketservice.domain.Category;

public record OrderCreatedEvent (
  Long orderId,
  Long memberId,
  Long companyId,
  String userEmail,
  String adminEmail,
  String productName,
  String voucherUrl,
  String donationCertUrl,
  Long totalPrice,
  String eventType,
  Category category
) {}
