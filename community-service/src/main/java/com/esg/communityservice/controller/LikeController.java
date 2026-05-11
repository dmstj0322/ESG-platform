package com.esg.communityservice.controller;

import com.esg.common.security.AuthUser;
import com.esg.communityservice.dto.LikeStatusDto;
import com.esg.communityservice.service.LikeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/posts/{postId}/likes")
public class LikeController {
  private final LikeService likeService;

  @PostMapping
  public ResponseEntity<LikeStatusDto> toggleLike(@PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser) {
    LikeStatusDto status = likeService.toggleLike(postId, authUser.memberId(), authUser.companyId());

    return ResponseEntity.ok(status);
  }

  @GetMapping
  public ResponseEntity<LikeStatusDto> getLikeStatus(@PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser) {
    boolean liked = likeService.isLiked(postId, authUser.memberId(), authUser.companyId());
    int count = likeService.getLikeCount(postId);

    return ResponseEntity.ok(new LikeStatusDto(liked, count));
  }
}
