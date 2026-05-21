package com.esg.notificationservice.kafka.config;

import com.esg.common.event.NotificationEvent;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableKafka
public class NotificationConsumerConfig {
  @Value("${spring.kafka.bootstrap-servers}")
  private String bootstrapServers;

  @Bean
  public ConsumerFactory<String, NotificationEvent> consumerFactory() {
    Map<String, Object> props = new HashMap<>();
    props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
    props.put(ConsumerConfig.GROUP_ID_CONFIG, "notification-group");

    JsonDeserializer<NotificationEvent> deserializer = new JsonDeserializer<>(NotificationEvent.class);
    deserializer.addTrustedPackages("*");

    return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), deserializer);
  }

  @Bean
  public DefaultErrorHandler errorHandler(KafkaTemplate<String, NotificationEvent> template) {
    FixedBackOff backOff = new FixedBackOff(2000L, 3L); // 2초 간격 3회 재시도
    DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template);
    return new DefaultErrorHandler(recoverer, backOff);
  }

  @Bean
  public ConcurrentKafkaListenerContainerFactory<String, NotificationEvent> kafkaListenerContainerFactory(
    ConsumerFactory<String, NotificationEvent> consumerFactory,
    DefaultErrorHandler errorHandler) {
    ConcurrentKafkaListenerContainerFactory<String, NotificationEvent> factory = new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(consumerFactory);
    factory.setCommonErrorHandler(errorHandler);
    return factory;
  }
}
