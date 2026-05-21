package com.esg.communityservice.dto;

import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.AdminStatus;
import com.esg.communityservice.domain.ImageFile;
import com.esg.communityservice.domain.Post;

import java.time.LocalDateTime;
import java.util.List;

public record PostResponseDto(
  Long id,
  Long companyId,
  Long memberId,
  String nickname,
  String title,
  String content,
  List<String> imageUrls,
  int viewCount,
  boolean isLiked,
  int likeCount,
  int commentCount,
  LocalDateTime createdDate,
  LocalDateTime lastModifiedDate,
  Double aiScore,
  String aiResult,
  AIStatus aiStatus,
  AdminStatus adminStatus,
  String rejectionReason
  ) {
  public static PostResponseDto of(Post post, boolean isLiked) {
    return new PostResponseDto(
      post.getId(),
      post.getCompanyId(),
      post.getMemberId(),
      post.getNickname(),
      post.getTitle(),
      post.getContent(),
      post.getImages().stream().map(ImageFile::getS3Url).toList(),
      post.getViewCount(),
      isLiked,
      post.getLikeCount(),
      post.getComments() != null ? post.getComments().size() : 0,
      post.getCreatedDate(),
      post.getModifiedDate(),
      post.getAiScore(),
      post.getAiResult(),
      post.getAiStatus(),
      post.getAdminStatus(),
      post.getRejectionReason()
    );
  }
}
