package com.esg.communityservice.controller;

import com.esg.communityservice.domain.AdminStatus;
import com.esg.communityservice.domain.Post;
import com.esg.communityservice.dto.PostResponseDto;
import com.esg.communityservice.repository.PostRepository;
import com.esg.communityservice.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
  private final PostRepository postRepository;

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/posts")
  public ResponseEntity<List<PostResponseDto>> getAllPosts(@RequestHeader("X-Company-Id") Long companyId) {
    List<Post> posts;

    if (companyId == 0L) {
      posts = postRepository.findAll();
    } else {
      posts = postRepository.findAllByCompanyIdOrderByCreatedDateDesc(companyId, Pageable.unpaged()).getContent();
    }

    List<PostResponseDto> response = posts.stream()
      .map(post -> PostResponseDto.of(post, false))
      .toList();

    return ResponseEntity.ok(response);
  }

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/posts/waiting")
  public ResponseEntity<List<PostResponseDto>> getWaitingPosts(Pageable pageable) {
    Page<Post> posts = postRepository.findByAdminStatus(AdminStatus.WAITING, pageable);
    return ResponseEntity.ok(posts.stream()
      .map(post -> PostResponseDto.of(post, false)).toList());
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping("/posts/{postId}/approve")
  public ResponseEntity<String> approvePost(@PathVariable Long postId){
    adminService.approvePost(postId);
    return ResponseEntity.ok("승인 완료되었습니다.");
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping("/posts/{postId}/reject")
  public ResponseEntity<Void> rejectPost(@PathVariable Long postId, @RequestBody Map<String, String> request) {
    String reason = request.get("reason");
    adminService.rejectPost(postId, reason);
    return ResponseEntity.ok().build();
  }
}
