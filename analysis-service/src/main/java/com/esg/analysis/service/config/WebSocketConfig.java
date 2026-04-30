package com.esg.analysis.service.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // 클라이언트가 연결할 엔드포인트: /ws-esg
        registry.addEndpoint("/ws-esg").setAllowedOriginPatterns("*").withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 서버가 클라이언트에게 메시지를 보낼 때 (구독 경로)
        registry.enableSimpleBroker("/topic");
        // 클라이언트가 서버로 메시지를 보낼 때 (보내는 경로)
        registry.setApplicationDestinationPrefixes("/app");
    }
}