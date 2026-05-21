package com.esg.communityservice.service;

import com.esg.common.event.NotificationEvent;
import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.ActivityType;
import com.esg.communityservice.domain.Post;
import com.esg.communityservice.event.PostCreatedEvent;
import com.esg.communityservice.kafka.NotificationProducer;
import com.esg.communityservice.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AsyncVerificationService {
  private final AIVisionService aiVisionService;
  private final PostRepository postRepository;
  private final KafkaTemplate<String, Object> kafkaTemplate;
  private final NotificationProducer notificationProducer;

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void processVerification(PostCreatedEvent event) {
    log.info("비동기 검증 스레드 시작 - Post ID: {}", event.postId());
    Post post = postRepository.findById(event.postId())
      .orElseThrow(() -> new RuntimeException("게시글을 찾을 수 없습니다. ID: " + event.postId()));

    log.info("AI 검증 시작 - 활동 유형: {}, 파일 개수: {}", event.activityType(), event.imageUrls().size());
    post.updateAiStatus(AIStatus.PROCESSING);
    postRepository.save(post);

    try {
      double score = aiVisionService.getMaxConfidenceScore(event.activityType(), event.imageUrls());

      if (score >= 0.8) {
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.SUCCESS);
        post.approve(); // 승인 처리

        kafkaTemplate.send("point-payment-topic", event);
        String message = String.format("🤖 AI 분석으로 [%s] 활동이 인증되어 포인트가 자동 적립되었습니다!", event.activityType().getDescription());
//        sendNotification(post, message, "POINT_EARNED");
        notificationProducer.send(post.getMemberId(), message, "POINT_EARNED", event.postId());

        log.info("AI 자동 승인 완료 및 포인트 지급 이벤트 발행: Post ID {}", event.postId());

      } else if (event.activityType() == ActivityType.FAIL) {
        // ✅ 활동 인식 자체 불가 → 즉시 반려
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.FAIL);
        post.autoReject("이미지에서 활동을 인식할 수 없습니다.");

//        sendNotification(post, "⚠️ AI 분석 결과 인증이 반려되었습니다. 사유: 이미지에서 활동을 인식할 수 없습니다.", "ACTIVITY_REJECTED");
        notificationProducer.send(post.getMemberId(),
          "⚠️ AI 분석 결과 인증이 반려되었습니다. 사유: 이미지에서 활동을 인식할 수 없습니다.",
          "ACTIVITY_REJECTED", event.postId());
        log.info("AI 자동 반려 완료 (활동 인식 불가): Post ID {}", event.postId());

      } else if (score <= 0.0) {
        // ✅ 부적절 항목 감지 → 즉시 반려
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.FAIL);
        post.autoReject("부적절한 항목(일회용품 등)이 감지되었습니다.");

//        sendNotification(post, "⚠️ AI 분석 결과 인증이 반려되었습니다. 사유: 부적절한 항목(일회용품 등)이 감지되었습니다.", "ACTIVITY_REJECTED");
        notificationProducer.send(post.getMemberId(),
          "⚠️ AI 분석 결과 인증이 반려되었습니다. 사유: 부적절한 항목(일회용품 등)이 감지되었습니다.",
          "ACTIVITY_REJECTED", event.postId());
        log.info("AI 자동 반려 완료 (부적절 항목 감지): Post ID {}", event.postId());

      } else if (score < 0.3) { // 3. 🌟 점수가 너무 낮음 (자동 반려)
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.FAIL);
        post.autoReject("이미지 분석 신뢰도가 너무 낮아 인증이 거부되었습니다.");

//        sendNotification(post, "⚠️ 인증 사진이 불분명하여 AI가 반려 처리하였습니다.", "ACTIVITY_REJECTED");
        notificationProducer.send(post.getMemberId(),
          "⚠️ 인증 사진이 불분명하여 AI가 반려 처리하였습니다.",
          "ACTIVITY_REJECTED", event.postId());
        log.info("AI 신뢰도 미달 반려 완료: Post ID {}, 점수: {}", event.postId(), score);

      } else {
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.PENDING);
        log.info("점수 미달로 인한 관리자 검토 대기 상태 전환: ID {}, 점수: {}", post.getId(), score);
      }
    } catch (Exception e) {
      log.error("AI 검증 중 시스템 오류: {}", e.getMessage());
      post.updateAiStatus(AIStatus.FAIL);
    }
    postRepository.save(post);
  }

  private void sendNotification(Post post, String msg, String type) {
    kafkaTemplate.send("notification-topic", new NotificationEvent(post.getMemberId(), msg, type, post.getId()));
  }
}
