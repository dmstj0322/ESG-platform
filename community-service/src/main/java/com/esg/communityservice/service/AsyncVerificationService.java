package com.esg.communityservice.service;

import com.esg.common.client.PointClient;
import com.esg.common.dto.PointRequest;
import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.Post;
import com.esg.communityservice.event.PostCreatedEvent;
import com.esg.communityservice.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AsyncVerificationService {
  private final AIVisionService aiVisionService;
  private final PointClient pointClient;
  private final PostRepository postRepository;

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
        earnPointsWithRetry(event);
      } else {
        post.updateAiAnalysis(score, event.activityType().name(), AIStatus.FAIL);
        log.info("점수 미달로 인한 대기 상태 유지: ID {}, 점수: {}", post.getId(), score);
      }
    } catch (Exception e) {
      log.error("AI 검증 중 시스템 오류: {}", e.getMessage());
      post.updateAiStatus(AIStatus.FAIL);
    }
    postRepository.save(post);
  }

  @Retryable(value = {Exception.class}, maxAttempts = 3, backoff = @Backoff(delay = 2000))
  public void earnPointsWithRetry(PostCreatedEvent event) {
    String detailedReason = String.format("ESG 활동 인증 성공: [%s] 활동으로 100 포인트 지급",
      event.activityType().getDescription());

    pointClient.earnPoints(new PointRequest(
      event.memberId(),
      event.companyId(),
      100L,
      detailedReason
    ));
    log.info("포인트 지급 완료: Post ID {}, 사유: {}", event.postId(), detailedReason);
  }
}
