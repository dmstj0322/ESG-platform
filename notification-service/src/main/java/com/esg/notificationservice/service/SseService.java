package com.esg.notificationservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class SseService {
  private final Map<Long, SseEmitter> emitters = new ConcurrentHashMap<>();

  // 프론트엔드에서 최초 연결(구독) 시 호출
  public SseEmitter subscribe(Long memberId) {
    SseEmitter emitter = new SseEmitter(60L * 1000 * 60); // 1시간 타임아웃
    emitters.put(memberId, emitter);

    // 연결이 끊기거나 타임아웃 시 맵에서 안전하게 제거
    emitter.onCompletion(() -> emitters.remove(memberId));
    emitter.onTimeout(() -> emitters.remove(memberId));
    emitter.onError((e) -> {
      log.error("SSE 오류 발생 (memberId: {})", memberId, e);
      emitters.remove(memberId);
    });

    // 503 에러 방지용 더미 데이터 전송
    try {
      emitter.send(SseEmitter.event().name("connect").data("connected!"));
    } catch (IOException e) {
      emitters.remove(memberId);
    }
    return emitter;
  }

  // 알림 컨슈머에서 호출하여 특정 유저에게 데이터를 쏨
  public void send(Long memberId, Object data) {
    if (emitters.containsKey(memberId)) {
      try {
        // 프론트엔드에서는 "notification"이라는 이벤트명으로 리슨
        emitters.get(memberId).send(SseEmitter.event().name("notification").data(data));
      } catch (IOException e) {
        emitters.remove(memberId);
        log.warn("알림 전송 실패 및 연결 제거 (memberId: {})", memberId);
      }
    }
  }
}
