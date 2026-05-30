package com.esg.communityservice.service;

import com.esg.communityservice.domain.Post;
import com.esg.communityservice.domain.PostLike;
import com.esg.communityservice.dto.LikeStatusDto;
import com.esg.communityservice.repository.PostLikeRepository;
import com.esg.communityservice.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LikeService {
  private final PostRepository postRepository;
  private final PostLikeRepository postLikeRepository;

  @Transactional(readOnly = true)
  public boolean isLiked(Long postId, Long memberId, Long companyId) {
    return postLikeRepository.existsByCompanyIdAndPostIdAndMemberId(companyId, postId, memberId);
  }

  @Transactional(readOnly = true)
  public int getLikeCount(Long postId) {
    return postRepository.findById(postId).map(Post::getLikeCount).orElse(0);
  }

  @Transactional
  public LikeStatusDto toggleLike(Long postId, Long memberId, Long companyId) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if (!post.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    boolean isLiked;
    if (postLikeRepository.existsByCompanyIdAndPostIdAndMemberId(companyId, postId, memberId)) {
      postLikeRepository.deleteByCompanyIdAndPostIdAndMemberId(companyId, postId, memberId);
      post.decreaseLikeCount();
      isLiked = false;
    } else {
      PostLike like = PostLike.builder()
        .post(post)
        .memberId(memberId)
        .companyId(companyId)
        .build();
      postLikeRepository.save(like);
      post.increaseLikeCount();
      isLiked = true;
    }
    return new LikeStatusDto(isLiked, post.getLikeCount());
  }
}
