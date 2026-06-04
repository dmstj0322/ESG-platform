package com.esg.communityservice.service;

import com.esg.common.domain.ActivityType;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;

@Service
@Profile("load-test")
@Primary
public class MockAIVisionService extends AIVisionService {
  public MockAIVisionService() throws IOException {
    super(null);
  }

  @Override
  public AiResult getMaxConfidenceScore(ActivityType type, List<String> imageUrls) {
    // 1. 진짜 구글 API 호출 대신 0.5초(500ms) 동안 스레드를 대기시킴 (구글 서버 지연시간 시뮬레이션)
    try {
      Thread.sleep(500);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }

    // 2. 구글에서 무조건 성공 점수(0.9점)를 받았다고 가짜 응답을 던짐
    String dummyUrl = (imageUrls != null && !imageUrls.isEmpty()) ? imageUrls.get(0) : "dummy-url";
    return new AiResult(0.9, "mock_success(0.9)", dummyUrl);
  }
}
