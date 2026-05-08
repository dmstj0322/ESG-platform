package com.esg.communityservice.controller;

import com.esg.common.security.AuthUser;
import com.esg.communityservice.dto.CommentRequestDto;
import com.esg.communityservice.dto.CommentResponseDto;
import com.esg.communityservice.service.CommentService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/posts/{postId}/comments")
public class CommentController {
  private final CommentService commentService;

  @PostMapping
  public ResponseEntity<CommentResponseDto> createComment(
    @PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser, @RequestBody CommentRequestDto commentDto) {
    return ResponseEntity.status(HttpStatus.CREATED)
      .body(commentService.createComment(postId, authUser.memberId(), authUser.companyId(), commentDto));
  }

  @GetMapping
  public ResponseEntity<Page<CommentResponseDto>> getComments(@PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser,
                                                              @PageableDefault(size = 10, sort = "createdDate", direction = Sort.Direction.DESC) Pageable pageable) {
    return ResponseEntity.ok(commentService.getComments(postId, authUser.companyId(), pageable));
  }

  @PutMapping("/{commentId}")
  public ResponseEntity<CommentResponseDto> updateComment(@PathVariable Long commentId, @AuthenticationPrincipal AuthUser authUser, @RequestBody CommentRequestDto commentDto) {
    return ResponseEntity.ok(commentService.updateComment(commentId, authUser.memberId(), authUser.companyId(), commentDto));
  }

  @DeleteMapping("/{commentId}")
  public ResponseEntity<String> deleteComment(@PathVariable Long commentId, @AuthenticationPrincipal AuthUser authUser) {
    commentService.deleteComment(commentId, authUser.memberId(), authUser.companyId());
    return ResponseEntity.ok("댓글이 삭제되었습니다.");
  }

  @PostMapping("/{parentId}/replies")
  public ResponseEntity<CommentResponseDto> createReply(@PathVariable Long postId, @PathVariable Long parentId,
    @AuthenticationPrincipal AuthUser authUser, @RequestBody CommentRequestDto commentDto) {

    return ResponseEntity.status(HttpStatus.CREATED)
      .body(commentService.createReply(postId, parentId, authUser.memberId(), authUser.companyId(), commentDto));
  }
}
