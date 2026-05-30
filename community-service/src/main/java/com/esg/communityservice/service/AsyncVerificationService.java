package com.esg.communityservice.service;

import com.esg.communityservice.domain.AIStatus;
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
  private final BadgeService badgeService;

  private static final double AUTO_APPROVE_THRESHOLD = 0.8;

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

      if (score >= AUTO_APPROVE_THRESHOLD) {
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.SUCCESS);
        post.approve(); // 승인 처리

        post.setActivityType(event.activityType());

        badgeService.checkAndUnlockBadge(post.getMemberId(), event.activityType());

        kafkaTemplate.send("point-payment-topic", event);

        notificationProducer.send(
          post.getMemberId(),
          String.format("🤖 AI 분석으로 [%s] 활동이 인증되었습니다!", event.activityType().getDescription()),
          "ACTIVITY_APPROVED", event.postId()
        );
//        notificationProducer.send(
//          post.getMemberId(),
//          String.format("💰 [%s] 활동으로 포인트가 지급되었습니다!", event.activityType().getDescription()),
//          "POINT_EARNED",
//          event.postId()
//        );

        log.info("AI 자동 승인 완료 이벤트 발행: Post ID {}", event.postId());

      } else {
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.REVIEW_NEEDED);
//        post.autoReject("이미지에서 활동을 인식할 수 없습니다.");

//        sendNotification(post, "⚠️ AI 분석 결과 인증이 반려되었습니다. 사유: 이미지에서 활동을 인식할 수 없습니다.", "ACTIVITY_REJECTED");
        notificationProducer.send(
          post.getMemberId(),
          "⏳ 사진 확인을 위해 관리자가 검토 중입니다. 조금만 기다려주세요!",
          "ACTIVITY_PENDING",
          event.postId()
        );
        log.info("관리자 검토 대기(WAITING) 상태로 전환: ID {}, AI 점수: {}", post.getId(), score);
      }
    } catch (Exception e) {
      log.error("AI 검증 중 시스템 오류: {}", e.getMessage());
      post.updateAiStatus(AIStatus.REVIEW_NEEDED);
      notificationProducer.send(
        post.getMemberId(),
        "⏳ 시스템 확인을 위해 관리자가 검토 중입니다.",
        "ACTIVITY_PENDING",
        event.postId()
      );
    }
    postRepository.save(post);
  }
}
