package com.esg.pointservice.controller;

import com.esg.common.dto.EsgPoolResponse;
import com.esg.common.dto.PointRequest;
import com.esg.pointservice.domain.PointHistory;
import com.esg.pointservice.service.PointService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/points")
public class PointController {
  private final PointService pointService;

  /** 친환경 활동 포인트 적립 — 개인 balance + 회사 ESG Pool 동시 증가 */
  @PostMapping("/earn")
  public ResponseEntity<Void> earnPoints(@RequestBody PointRequest pointRequest) {
    pointService.earnPoints(pointRequest.memberId(), pointRequest.companyId(),
        pointRequest.amount(), pointRequest.description());
    return ResponseEntity.ok().build();
  }

  /** 개인 쇼핑/ESG 마켓 포인트 사용 — 개인 balance 만 차감, ESG Pool 영향 없음 */
  @PostMapping("/use")
  public ResponseEntity<Void> usePoints(@RequestBody PointRequest pointRequest) {
    pointService.usePoints(pointRequest.memberId(), pointRequest.companyId(),
        pointRequest.amount(), pointRequest.description());
    return ResponseEntity.ok().build();
  }

  /** ESG 분석 후 회사 ESG Pool 차감 — 개인 balance 절대 차감 금지 */
  @PostMapping("/company/{companyId}/consume-esg-pool")
  public ResponseEntity<Void> consumeEsgPool(
      @PathVariable Long companyId,
      @RequestParam Long amount,
      @RequestParam(required = false, defaultValue = "") String description) {
    log.info("[CONSUME-ENDPOINT-HIT] companyId={} amount={}EP description={}", companyId, amount, description);
    pointService.consumeEsgPool(companyId, amount, description);
    log.info("[CONSUME-ENDPOINT-DONE] companyId={} amount={}EP", companyId, amount);
    return ResponseEntity.ok().build();
  }

  /** 회사 ESG Pool 조회 */
  @GetMapping("/company/{companyId}/esg-pool")
  public ResponseEntity<EsgPoolResponse> getCompanyEsgPool(@PathVariable Long companyId) {
    return ResponseEntity.ok(pointService.getCompanyEsgPool(companyId));
  }

  @GetMapping("/{memberId}/balance")
  public ResponseEntity<Long> getBalance(@PathVariable Long memberId) {
    return ResponseEntity.ok(pointService.getBalance(memberId));
  }

  @GetMapping("/{memberId}/history")
  public ResponseEntity<Page<PointHistory>> getPointHistory(
      @PathVariable Long memberId,
      @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(pointService.getPointHistory(memberId, pageable));
  }
}
