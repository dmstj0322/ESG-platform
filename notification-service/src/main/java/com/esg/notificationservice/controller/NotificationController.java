package com.esg.notificationservice.controller;

import com.esg.notificationservice.domain.Notification;
import com.esg.notificationservice.repository.NotificationRepository;
import com.esg.notificationservice.service.SseService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequiredArgsConstructor
@RequestMapping("/notification")
public class NotificationController {
  private final SseService sseService;
  private final NotificationRepository notificationRepository;

  @GetMapping(value = "/subscribe/{memberId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter subscribe(@PathVariable Long memberId) {
    return sseService.subscribe(memberId);
  }

  @GetMapping("/unread-exists")
  public ResponseEntity<Boolean> hasUnread(@RequestHeader("X-Member-Id") Long memberId) {
    return ResponseEntity.ok(notificationRepository.existsByMemberIdAndIsReadFalse(memberId));
  }

//  @GetMapping
//  public ResponseEntity<Page<Notification>> getNotifications(@RequestHeader("X-Member-Id") Long memberId, Pageable pageable) {
//    return ResponseEntity.ok(notificationRepository.findByMemberIdOrderByCreatedDateDesc(memberId, pageable));
//  }

  @Transactional
  @PatchMapping("/{id}/read")
  public ResponseEntity<Void> markAsRead(@PathVariable Long id) {
    notificationRepository.findById(id).ifPresent(notification -> {
      notification.markAsRead();
      notificationRepository.save(notification);
    });
    return ResponseEntity.ok().build();
  }

  @Transactional
  @PatchMapping("/read-all")
  public ResponseEntity<Void> readAll(@RequestHeader("X-Member-Id") Long memberId) {
    notificationRepository.markAllAsReadByMemberId(memberId);
    return ResponseEntity.ok().build();
  }

  @GetMapping("/count")
  public ResponseEntity<Long> getUnreadCount(@RequestHeader("X-Member-Id") Long memberId) {
    return ResponseEntity.ok(notificationRepository.countByMemberIdAndIsReadFalse(memberId));
  }

  // 알림 목록 조회 (필터 및 페이징 적용)
  @GetMapping
  public ResponseEntity<Page<Notification>> getNotifications(
    @RequestHeader("X-Member-Id") Long memberId,
    @RequestParam(required = false, defaultValue = "ALL") String type,
    Pageable pageable) {

    String keyword = null;
    if ("POINT".equals(type)) keyword = "포인트";
    else if ("ACTIVITY".equals(type)) keyword = "인증"; // 승인/반려 포함

    return ResponseEntity.ok(notificationRepository.findByMemberIdAndFilter(memberId, keyword, pageable));
  }
}
