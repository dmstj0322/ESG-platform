package com.esg.communityservice.controller;

import com.esg.communityservice.dto.BadgeDashboardDto;
import com.esg.communityservice.service.BadgeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/badges")
public class BadgeController {
  private final BadgeService badgeService;

  @GetMapping("/{memberId}/dashboard")
  public ResponseEntity<BadgeDashboardDto> getPointDashboard(@PathVariable Long memberId) {
    return ResponseEntity.ok(badgeService.getBadgeDashboard(memberId));
  }

  @PutMapping("/{memberId}/representative/{badgeId}")
  public ResponseEntity<Void> setRepresentativeBadge(
    @PathVariable Long memberId,
    @PathVariable Long badgeId) {
    badgeService.setRepresentativeBadge(memberId, badgeId);
    return ResponseEntity.ok().build();
  }
}
