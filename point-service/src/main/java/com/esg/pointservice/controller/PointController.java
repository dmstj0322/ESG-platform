package com.esg.pointservice.controller;

import com.esg.common.dto.PointRequest;
import com.esg.pointservice.domain.PointHistory;
import com.esg.pointservice.service.PointService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/points")
public class PointController {
  private final PointService pointService;

  @PostMapping("/earn")
  public ResponseEntity<Void> earnPoints(@RequestBody PointRequest pointRequest) {
    pointService.earnPoints(pointRequest.memberId(), pointRequest.companyId(), pointRequest.amount(), pointRequest.description(), pointRequest.targetId());
    return ResponseEntity.ok().build();
  }

  @PostMapping("/use")
  public ResponseEntity<Void> usePoints(@RequestBody PointRequest pointRequest) {
    pointService.usePoints(pointRequest.memberId(), pointRequest.companyId(), pointRequest.amount(), pointRequest.description(), pointRequest.targetId());
    return ResponseEntity.ok().build();
  }

  @PostMapping("/refund")
  public ResponseEntity<Void> refundPoints(@RequestBody PointRequest pointRequest) {
    pointService.refundPoints(pointRequest.memberId(), pointRequest.companyId(), pointRequest.amount(), pointRequest.description(), pointRequest.targetId());
    return ResponseEntity.ok().build();
  }

  @GetMapping("/{memberId}/balance")
  public ResponseEntity<Long> getBalance(@PathVariable Long memberId) {
    return ResponseEntity.ok(pointService.getBalance(memberId));
  }

  @GetMapping("/{memberId}/history")
  public ResponseEntity<Page<PointHistory>> getPointHistory(@PathVariable Long memberId, @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(pointService.getPointHistory(memberId, pageable));
  }

  @GetMapping("/company/{companyId}/total")
  public ResponseEntity<Long> getCompanyTotalPoints(@PathVariable Long companyId) {
    return ResponseEntity.ok(pointService.getCompanyTotalPoints(companyId));
  }
}
