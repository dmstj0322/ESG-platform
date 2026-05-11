package com.esg.communityservice.service;

import com.esg.communityservice.domain.*;
import com.esg.communityservice.event.PostCreatedEvent;
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
  private final KafkaTemplate<String, PostCreatedEvent> kafkaTemplate;

  @Transactional
  public void approvePost(Long postId) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if ((post.getAiStatus() == AIStatus.PROCESSING)) {
      throw new IllegalStateException("AI 분석이 완료되지 않았습니다. 잠시만 기다려주세요.");
    }

    if (post.getAdminStatus() != AdminStatus.WAITING) {
      throw new IllegalStateException("대기 중인 게시글만 승인 가능합니다.");
    }

    post.approve();

    postRepository.save(post);

    ActivityType activityType = ActivityType.valueOf(post.getAiResult());

    List<String> imageUrls = post.getImages().stream()
      .map(ImageFile::getS3Url)
      .toList();

    PostCreatedEvent postCreatedEvent = new PostCreatedEvent(
      post.getId(), post.getMemberId(), post.getCompanyId(), imageUrls, activityType);
    kafkaTemplate.send("point-payment-topic", postCreatedEvent);
    log.info("관리자 승인 완료 및 포인트 지급 이벤트 발행: {}", postId);
  }

  @Transactional
  public void rejectPost(Long postId, String reason) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if (post.getAdminStatus() != AdminStatus.WAITING) {
      throw new IllegalStateException("대기 중인 게시글만 거절 가능합니다.");
    }

    post.reject(reason);
  }
}
