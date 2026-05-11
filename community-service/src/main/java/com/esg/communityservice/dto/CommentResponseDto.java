package com.esg.communityservice.dto;

import com.esg.communityservice.domain.Comment;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public record CommentResponseDto(
  Long id, Long postId, Long memberId, String nickname, String content,
  LocalDateTime createdDate, LocalDateTime lastModifiedDate,
  List<CommentResponseDto> replies
) {
  public static CommentResponseDto from(Comment comment) {
    return new CommentResponseDto(
      comment.getId(),
      comment.getPost().getId(),
      comment.getMemberId(),
      comment.getNickname(),
      comment.getContent(),
      comment.getCreatedDate(),
      comment.getModifiedDate(),
      new ArrayList<>()
    );
  }
}
