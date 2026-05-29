package com.esg.communityservice.service;

import com.esg.common.domain.ActivityType;
import com.esg.communityservice.domain.*;
import com.esg.communityservice.event.PostCreatedEvent;
import com.esg.communityservice.kafka.NotificationProducer;
import com.esg.communityservice.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminService {
  private final PostRepository postRepository;
  private final KafkaTemplate<String, Object> kafkaTemplate;
  private final NotificationProducer notificationProducer;
  private final BadgeService badgeService;

  @Transactional
  public void approvePost(Long postId, String activityTypeStr) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if ((post.getAiStatus() == AIStatus.PROCESSING)) {
      throw new IllegalStateException("AI 분석이 완료되지 않았습니다. 잠시만 기다려주세요.");
    }

    if (post.getAdminStatus() != AdminStatus.WAITING) {
      throw new IllegalStateException("대기 중인 게시글만 승인 가능합니다.");
    }

    ActivityType activityType = ActivityType.valueOf(activityTypeStr);

    post.approve();
    post.setActivityType(activityType);
    postRepository.save(post);

    List<String> imageUrls = post.getImages().stream()
      .map(ImageFile::getS3Url)
      .toList();

    badgeService.checkAndUnlockBadge(post.getMemberId(), activityType);

    PostCreatedEvent postCreatedEvent = new PostCreatedEvent(
      post.getId(), post.getMemberId(), post.getCompanyId(), imageUrls, activityType);
    kafkaTemplate.send("point-payment-topic", postCreatedEvent);

//    kafkaTemplate.send("notification-topic", new NotificationEvent(post.getMemberId(), message, "POINT_EARNED", postId));
    notificationProducer.send(
      post.getMemberId(),
      String.format("🎉 관리자 승인으로 [%s] 활동 인증이 완료되었습니다.", activityType.getDescription()),
      "ACTIVITY_APPROVED",
      postId
    );

//    notificationProducer.send(
//      post.getMemberId(),
//      String.format("💰 [%s] 활동 포인트가 지급되었습니다!", activityType.getDescription()),
//      "POINT_EARNED",
//      postId
//    );

    log.info("관리자 승인 완료 이벤트 발행: {}", postId);
  }

  @Transactional
  public void rejectPost(Long postId, String reason) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if (post.getAdminStatus() != AdminStatus.WAITING) {
      throw new IllegalStateException("대기 중인 게시글만 거절 가능합니다.");
    }

    post.reject(reason);
    postRepository.save(post);

    String message = String.format("❌ 활동 인증이 반려되었습니다. 사유: %s", reason);
//    kafkaTemplate.send("notification-topic", new NotificationEvent(post.getMemberId(), message, "ACTIVITY_REJECTED", postId));
    notificationProducer.send(post.getMemberId(), message, "ACTIVITY_REJECTED", postId);

    log.info("관리자 거절 완료 및 알림 전송: {}, 사유: {}", postId, reason);
  }

  @Transactional
  public void updatePostType(Long postId, String activityTypeStr) {
    if (activityTypeStr == null) {
      throw new IllegalArgumentException("활동 타입이 누락되었습니다.");
    }

    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    ActivityType newType = ActivityType.valueOf(activityTypeStr);
    post.setActivityType(newType);
    postRepository.save(post);
    badgeService.checkAndUnlockBadge(post.getMemberId(), newType);
    log.info("관리자 타입 수정 완료 및 뱃지 체크: {} -> {}", postId, newType);
  }
}
