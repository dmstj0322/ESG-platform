package com.esg.marketservice.kafka;

import com.esg.marketservice.event.OrderCreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OrderEventProducer {
  private final KafkaTemplate<String, OrderCreatedEvent> kafkaTemplate;
  private static final String TOPIC = "order-events";

  public void sendOrderEvent(OrderCreatedEvent event) {
    kafkaTemplate.send(TOPIC, String.valueOf(event.orderId()), event);
  }
}
