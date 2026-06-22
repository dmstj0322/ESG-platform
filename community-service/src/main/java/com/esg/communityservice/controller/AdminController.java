package com.esg.communityservice.controller;

import com.esg.communityservice.dto.EngagementDto;
import com.esg.communityservice.dto.PostResponseDto;
import com.esg.communityservice.service.AdminService;
import com.esg.communityservice.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/admin")
public class AdminController {
  private final AdminService adminService;
  private final PostService postService;

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/posts")
  public ResponseEntity<Page<PostResponseDto>> getAllPosts(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestParam(value = "status", required = false, defaultValue = "ALL") String status,
    @PageableDefault(size = 10, sort = "createdDate", direction = Sort.Direction.DESC) Pageable pageable) {

    Page<PostResponseDto> response = postService.getAdminPosts(companyId, status, pageable);
    return ResponseEntity.ok(response);
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping("/posts/{postId}/approve")
  public ResponseEntity<String> approvePost(@PathVariable Long postId, @RequestBody Map<String, String> request) {
    String activityType = request.get("activityType");
    adminService.approvePost(postId, activityType);
    return ResponseEntity.ok("승인 완료되었습니다.");
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping("/posts/{postId}/reject")
  public ResponseEntity<Void> rejectPost(@PathVariable Long postId, @RequestBody Map<String, String> request) {
    String reason = request.get("reason");
    adminService.rejectPost(postId, reason);
    return ResponseEntity.ok().build();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PatchMapping("/posts/{postId}/type")
  public ResponseEntity<String> updatePostType(
    @PathVariable Long postId, @RequestBody Map<String, String> request) {
    String activityType = request.get("activityType");

    if (activityType == null || activityType.trim().isEmpty()) {
      return ResponseEntity.badRequest().body("activityType 값이 누락되었습니다.");
    }

    adminService.updatePostType(postId, request.get("activityType"));
    return ResponseEntity.ok("타입이 수정되었습니다.");
  }

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/engagement")
  public ResponseEntity<List<EngagementDto>> getEngagementStats(
    @RequestHeader(value = "X-Company-Id", required = false) Long companyId) {

    List<EngagementDto> response = adminService.getEngagementStats(companyId);
    return ResponseEntity.ok(response);
  }
}
