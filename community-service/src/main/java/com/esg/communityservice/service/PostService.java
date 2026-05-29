package com.esg.communityservice.service;

import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.AdminStatus;
import com.esg.communityservice.domain.ImageFile;
import com.esg.communityservice.domain.Post;
import com.esg.communityservice.dto.PostRequestDto;
import com.esg.communityservice.dto.PostResponseDto;
import com.esg.communityservice.event.PostCreatedEvent;
import com.esg.communityservice.repository.MemberBadgeRepository;
import com.esg.communityservice.repository.PostLikeRepository;
import com.esg.communityservice.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PostService {
  private final PostRepository postRepository;
  private final PostLikeRepository postLikeRepository;
  private final ImageUploadService imageUploadService;
  private final KafkaTemplate<String, Object> kafkaTemplate;
  private final MemberBadgeRepository memberBadgeRepository;

  private String getRepresentativeBadgeEmoji(Long memberId) {
    return memberBadgeRepository.findByMemberIdAndIsRepresentativeTrue(memberId)
      .map(mb -> mb.getBadge().getName())
      .orElse(null);
  }

  private Map<Long, String> getBadgeMap(Page<Post> posts) {
    Set<Long> memberIds = posts.stream().map(Post::getMemberId).collect(Collectors.toSet());
    return memberBadgeRepository.findByMemberIdInAndIsRepresentativeTrue(memberIds)
      .stream().collect(Collectors.toMap(mb -> mb.getMemberId(), mb -> mb.getBadge().getName()));
  }

  @Transactional
  public PostResponseDto createPost(PostRequestDto requestDto, Long memberId, Long companyId, List<MultipartFile> files) throws IOException {
    if (files == null || files.isEmpty()) {
      throw new IllegalArgumentException("인증사진은 필수입니다. 활동을 인증해주세요!");
    }

    List<String> imageUrls = new ArrayList<>();
    List<ImageFile> imageFiles = new ArrayList<>();

    for (MultipartFile file : files) {
      ImageFile imageFile = imageUploadService.uploadImage(file, memberId, requestDto.activityType());
      imageFiles.add(imageFile);
      imageUrls.add(imageFile.getS3Url());
    }

    Post post = Post.builder()
      .memberId(memberId)
      .companyId(companyId)
      .nickname(requestDto.nickname())
      .title(requestDto.title())
      .content(requestDto.content())
      .aiScore(0.0)
      .aiResult(requestDto.activityType().name())
      .aiStatus(AIStatus.PENDING)
      .adminStatus(AdminStatus.WAITING)
      .viewCount(0)
      .build();

    for (ImageFile imageFile : imageFiles) {
      post.addImage(imageFile);
    }

    postRepository.save(post);

    PostCreatedEvent event = new PostCreatedEvent(
      post.getId(), memberId, companyId, imageUrls, requestDto.activityType()
    );

    if (TransactionSynchronizationManager.isActualTransactionActive()) {
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCommit() {
          log.info("DB 커밋 완료! 이제 카프카로 이벤트를 보냅니다. Post ID: {}", post.getId());
          kafkaTemplate.send("post-created-topic", event);
        }
      });
    }

    String badgeEmoji = getRepresentativeBadgeEmoji(memberId);
    return PostResponseDto.of(post, false, badgeEmoji);
  }

  @Transactional
  public PostResponseDto getPost(Long id, Long memberId, Long companyId) {
    Post post = postRepository.findById(id)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다. postId: " + id));

    if (!post.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    boolean isLiked = postLikeRepository.existsByPostIdAndMemberId(id, memberId);
    post.increaseViewCount();

    String badgeEmoji = getRepresentativeBadgeEmoji(post.getMemberId());
    return PostResponseDto.of(post, isLiked, badgeEmoji);
  }

  @Transactional(readOnly = true)
  public Page<PostResponseDto> getPosts(Long memberId, Long companyId, String role, Pageable pageable) {
    Page<Post> posts = postRepository.findAllByCompanyIdOrderByCreatedDateDesc(companyId, pageable);

    Map<Long, String> badgeMap = getBadgeMap(posts);

    return posts.map(post -> {
      boolean isLiked = postLikeRepository.existsByPostIdAndMemberId(post.getId(), memberId);
      return PostResponseDto.of(post, isLiked, badgeMap.get(post.getMemberId()));
    });
  }

  @Transactional
  public PostResponseDto updatePost(Long postId, Long memberId, Long companyId, PostRequestDto requestDto) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if (!post.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    if (!post.getMemberId().equals(memberId)) {
      throw new IllegalArgumentException("수정 권한이 없습니다.");
    }

    post.update(requestDto.title(), requestDto.content());

    boolean isLiked = postLikeRepository.existsByPostIdAndMemberId(postId, memberId);

    String badgeEmoji = getRepresentativeBadgeEmoji(post.getMemberId());
    return PostResponseDto.of(post, isLiked, badgeEmoji);
  }

  @Transactional
  public void deletePost(Long postId, Long memberId, Long companyId) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if (!post.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    if (!post.getMemberId().equals(memberId)) {
      throw new IllegalArgumentException("삭제 권한이 없습니다.");
    }

    postRepository.delete(post);
  }

  @Transactional(readOnly = true)
  public Page<PostResponseDto> searchPosts(Long memberId, Long companyId, String keyword, Pageable pageable) {
    Page<Post> posts = postRepository.findByCompanyIdAndTitleContainingOrContentContaining(companyId, keyword, keyword, pageable);

    Map<Long, String> badgeMap = getBadgeMap(posts);

    return posts.map(post -> {
      boolean isLiked = postLikeRepository.existsByPostIdAndMemberId(post.getId(), memberId);
      return PostResponseDto.of(post, isLiked, badgeMap.get(post.getMemberId()));
    });
  }

  @Transactional(readOnly = true)
  public Page<PostResponseDto> getMyPosts(Long memberId, Long companyId, Pageable pageable) {
    // 본인 작성 게시글 조회
    Page<Post> posts = postRepository.findAllByMemberIdAndCompanyIdOrderByCreatedDateDesc(memberId, companyId, pageable);
    Map<Long, String> badgeMap = getBadgeMap(posts);
    return posts.map(post -> PostResponseDto.of(post, true, badgeMap.get(post.getMemberId())));
  }

  @Transactional(readOnly = true)
  public Page<PostResponseDto> getLikedPosts(Long memberId, Long companyId, Pageable pageable) {
    // 좋아요 리포지토리를 통해 본인이 좋아요 누른 게시글 목록 조회
    Page<Post> posts = postLikeRepository.findPostsByMemberIdAndCompanyId(memberId, companyId, pageable);
    Map<Long, String> badgeMap = getBadgeMap(posts);
    return posts.map(post -> PostResponseDto.of(post, true, badgeMap.get(post.getMemberId())));  }

  @Transactional(readOnly = true)
  public Page<PostResponseDto> getAdminPosts(Long companyId, String status, Pageable pageable) {
    AdminStatus enumStatus = null;
    if (status != null && !status.equalsIgnoreCase("ALL") && !status.trim().isEmpty()) {
      try {
        enumStatus = AdminStatus.valueOf(status.toUpperCase());
      } catch (IllegalArgumentException e) {
        log.warn("올바르지 않은 관리자 상태 Enum 요청 수신: {}", status);
      }
    }

    Page<Post> posts;
    if (enumStatus == null) {
      posts = postRepository.findAllByCompanyIdOrderByCreatedDateDesc(companyId, pageable);
    } else {
      posts = postRepository.findAllByCompanyIdAndAdminStatusOrderByCreatedDateDesc(companyId, enumStatus, pageable);
    }

    Map<Long, String> badgeMap = getBadgeMap(posts);

    return posts.map(post -> {
      return PostResponseDto.of(post, false, badgeMap.get(post.getMemberId()));
    });
  }
}
