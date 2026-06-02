package com.esg.communityservice.service;

import com.esg.communityservice.domain.Comment;
import com.esg.communityservice.kafka.NotificationProducer;
import com.esg.communityservice.repository.CommentRepository;
import com.esg.communityservice.domain.Post;
import com.esg.communityservice.repository.PostRepository;
import com.esg.communityservice.dto.CommentRequestDto;
import com.esg.communityservice.dto.CommentResponseDto;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CommentService {
  private final CommentRepository commentRepository;
  private final PostRepository postRepository;
  private final NotificationProducer notificationProducer;

  @Transactional
  public CommentResponseDto createComment(Long postId, Long memberId, Long companyId, CommentRequestDto requestDto) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    if (companyId != 0L && !post.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("다른 회사의 게시글에는 댓글을 작성할 수 없습니다.");
    }

    Comment comment = commentRepository.save(Comment.builder()
      .post(post)
      .memberId(memberId)
      .companyId(companyId)
      .nickname(requestDto.nickname())
      .content(requestDto.content())
      .build());

    if (!memberId.equals(post.getMemberId())) {
      notificationProducer.send(
        post.getMemberId(),
        String.format("💬 [%s] 글에 새 댓글이 달렸습니다: %s", post.getTitle(), requestDto.content()),
        "COMMENT_RECEIVED",
        postId
      );
    }

    return CommentResponseDto.from(comment);
  }

  @Transactional(readOnly = true)
  public Page<CommentResponseDto> getComments(Long postId, Long companyId, Pageable pageable) {
    Page<Comment> parentComments;

    if (companyId == 0L) {
      parentComments = commentRepository.findByPostIdAndParentIsNullOrderByCreatedDateAsc(postId, pageable);
    } else {
      parentComments = commentRepository.findByCompanyIdAndPostIdAndParentIsNullOrderByCreatedDateAsc(companyId, postId, pageable);
    }

    List<Comment> parentList = parentComments.getContent();
    List<Comment> allReplies = commentRepository.findByParentInOrderByCreatedDateAsc(parentList);

    return parentComments.map(parent -> {
      CommentResponseDto parentDto = CommentResponseDto.from(parent);
      List<CommentResponseDto> replies = allReplies.stream()
        .filter(reply -> reply.getParent().getId().equals(parent.getId()))
        .map(CommentResponseDto::from)
        .collect(Collectors.toList());
      parentDto.replies().addAll(replies);
      return parentDto;
    });
  }

  @Transactional
  public CommentResponseDto updateComment(Long commentId, Long memberId, Long companyId, CommentRequestDto requestDto) {
    Comment comment = commentRepository.findById(commentId)
      .orElseThrow(() -> new IllegalArgumentException("댓글을 찾을 수 없습니다."));

    if (companyId != 0L && !comment.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    if (!comment.getMemberId().equals(memberId)) {
      throw new IllegalArgumentException("수정 권한이 없습니다.");
    }

    comment.update(requestDto.content());
    return CommentResponseDto.from(comment);
  }

  @Transactional
  public void deleteComment(Long commentId, Long memberId, Long companyId) {
    Comment comment = commentRepository.findById(commentId)
      .orElseThrow(() -> new IllegalArgumentException("댓글을 찾을 수 없습니다."));

    if (companyId != 0L && !comment.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    if (!comment.getMemberId().equals(memberId)) {
      throw new IllegalArgumentException("삭제 권한이 없습니다.");
    }

    commentRepository.delete(comment);
  }

  @Transactional
  public CommentResponseDto createReply(Long postId, Long parentId, Long memberId, Long companyId, CommentRequestDto requestDto) {
    Post post = postRepository.findById(postId)
      .orElseThrow(() -> new IllegalArgumentException("게시글을 찾을 수 없습니다."));

    Comment parentComment = commentRepository.findById(parentId)
      .orElseThrow(() -> new IllegalArgumentException("부모 댓글을 찾을 수 없습니다."));

    if (!parentComment.getPost().getId().equals(postId)) {
      throw new IllegalArgumentException("잘못된 요청입니다.");
    }

    if (companyId != 0L && !parentComment.getCompanyId().equals(companyId)) {
      throw new IllegalArgumentException("접근 권한이 없습니다.");
    }

    Comment reply = commentRepository.save(Comment.builder()
      .post(post)
      .parent(parentComment)
      .memberId(memberId)
      .companyId(companyId)
      .nickname(requestDto.nickname())
      .content(requestDto.content())
      .build());

    if (!memberId.equals(parentComment.getMemberId())) {
      notificationProducer.send(
        parentComment.getMemberId(),
        String.format("↪️ 댓글에 답글이 달렸습니다: %s", requestDto.content()),
        "REPLY_RECEIVED", // NotificationType
        postId // targetId
      );
    }

    return CommentResponseDto.from(reply);
  }

  @Transactional(readOnly = true)
  public Page<CommentResponseDto> getMyComments(Long memberId, Long companyId, Pageable pageable) {
    return commentRepository.findByMemberIdAndCompanyIdOrderByCreatedDateDesc(memberId, companyId, pageable)
      .map(CommentResponseDto::from);
  }
}
