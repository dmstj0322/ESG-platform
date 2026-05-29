package com.esg.communityservice.controller;

import com.esg.common.domain.ActivityType;
import com.esg.common.security.AuthUser;
import com.esg.communityservice.dto.CommentResponseDto;
import com.esg.communityservice.dto.PostRequestDto;
import com.esg.communityservice.dto.PostResponseDto;
import com.esg.communityservice.service.AIVisionService;
import com.esg.communityservice.service.CommentService;
import com.esg.communityservice.service.PostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/posts")
@Slf4j
public class PostController {
  private final PostService postService;
  private final AIVisionService aiVisionService;
  private final CommentService commentService;

  @PostMapping("/analyze-image")
  public ResponseEntity<ActivityType> analyzeImage(@RequestParam("files") List<MultipartFile> files) throws IOException {
    ActivityType inferredType = aiVisionService.analyzeActivityType(files);
    log.info("AI가 추천한 활동 유형: {}", inferredType);
    return ResponseEntity.ok(inferredType);
  }

  @PostMapping(consumes = {MediaType.APPLICATION_JSON_VALUE, MediaType.MULTIPART_FORM_DATA_VALUE})
  public ResponseEntity<PostResponseDto> createPost(@AuthenticationPrincipal AuthUser authUser, @RequestPart("dto") PostRequestDto requestDto,
                                                    @RequestPart(value = "files", required = false) List<MultipartFile> files) throws IOException {
    log.info("파일 개수: {}", files != null ? files.size() : "파일 없음");

    return ResponseEntity.status(HttpStatus.CREATED)
      .body(postService.createPost(requestDto, authUser.memberId(), authUser.companyId(), files));
  }

  @GetMapping("/{postId}")
  public ResponseEntity<PostResponseDto> getPost(@PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser) {
    return ResponseEntity.ok(postService.getPost(postId, authUser.memberId(), authUser.companyId()));
  }

  @GetMapping
  public ResponseEntity<Page<PostResponseDto>> getPosts(@PageableDefault(size = 10, sort = "createdDate", direction = Sort.Direction.DESC) Pageable pageable,
                                                        @AuthenticationPrincipal AuthUser authUser) {
    return ResponseEntity.ok(postService.getPosts(authUser.memberId(), authUser.companyId(), authUser.role(), pageable));
  }

  @PutMapping("/{postId}")
  public ResponseEntity<PostResponseDto> updatePost(@PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser, @RequestBody PostRequestDto requestDto) {
    return ResponseEntity.ok(postService.updatePost(postId, authUser.memberId(), authUser.companyId(), requestDto));
  }

  @DeleteMapping("/{postId}")
  public ResponseEntity<Void> deletePost(@PathVariable Long postId, @AuthenticationPrincipal AuthUser authUser) {
    postService.deletePost(postId, authUser.memberId(), authUser.companyId());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/search")
  public ResponseEntity<Page<PostResponseDto>> searchPosts(
    @RequestParam(value = "keyword") String keyword,
    @PageableDefault(size = 10, sort = "createdDate", direction = Sort.Direction.DESC) Pageable pageable,
    @AuthenticationPrincipal AuthUser authUser) {
    return ResponseEntity.ok(postService.searchPosts(authUser.memberId(), authUser.companyId(), keyword, pageable));
  }

  @GetMapping("/my-posts")
  public ResponseEntity<Page<PostResponseDto>> getMyPosts(
    @AuthenticationPrincipal AuthUser authUser,
    @PageableDefault(size = 10, sort = "createdDate", direction = Sort.Direction.DESC) Pageable pageable) {

    return ResponseEntity.ok(postService.getMyPosts(authUser.memberId(), authUser.companyId(), pageable));
  }

  @GetMapping("/my-likes")
  public ResponseEntity<Page<PostResponseDto>> getMyLikedPosts(
    @AuthenticationPrincipal AuthUser authUser,
    @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(postService.getLikedPosts(authUser.memberId(), authUser.companyId(), pageable));
  }

  @GetMapping("/my-comments")
  public ResponseEntity<Page<CommentResponseDto>> getMyComments(
    @AuthenticationPrincipal AuthUser authUser,
    @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(commentService.getMyComments(authUser.memberId(), authUser.companyId(), pageable));
  }
}
