package com.esg.communityservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class SlackNotificationService {
  private final RestTemplate restTemplate = new RestTemplate();

  @Value("${slack.webhook.url}")
  private String slackWebhookUrl;

  public void sendAiRejectReport(Long postId, String activityType, double score, String labels, String imageUrl) {
    try {
      // 1. 슬랙에 보낼 기본 메시지
      Map<String, Object> payload = new HashMap<>();
      payload.put("text", "🚨 *AI 활동 인증 반려 리포트*");

      // 2. 예쁘게 꾸며줄 첨부(Attachment) 데이터 생성
      Map<String, Object> attachment = new HashMap<>();
      attachment.put("color", "#ff0000"); // 빨간색 테두리
      attachment.put("title", "Post ID: " + postId + " (" + activityType + ")");
      attachment.put("text", String.format("AI 분석 점수: %.2f\n감지된 라벨:\n%s", score, labels));

      // 사진 URL이 있으면 슬랙에 사진을 띄움
      if (imageUrl != null && !imageUrl.isBlank()) {
        attachment.put("image_url", imageUrl);
      }

      payload.put("attachments", List.of(attachment));

      // 3. 슬랙 채널로 쏘기!
      restTemplate.postForEntity(slackWebhookUrl, payload, String.class);
      log.info("슬랙으로 AI 반려 리포트를 전송했습니다. PostId: {}", postId);

    } catch (Exception e) {
      log.error("슬랙 알림 전송 중 오류 발생", e);
    }
  }
}
