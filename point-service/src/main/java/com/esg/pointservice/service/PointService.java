package com.esg.pointservice.service;

import com.esg.common.dto.EsgPoolResponse;
import com.esg.pointservice.dto.PointDashboardDto;
import com.esg.pointservice.domain.*;
import com.esg.pointservice.kafka.NotificationProducer;
import com.esg.pointservice.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointService {
  private final PointBalanceRepository pointBalanceRepository;
  private final PointHistoryRepository pointHistoryRepository;
  private final CompanyEsgPoolRepository companyEsgPoolRepository;
  private final NotificationProducer notificationProducer;

  /**
   * Kafka ESG 활동 이벤트 기반 포인트 적립.
   * - eventId(postId) 중복 체크 → 이미 처리된 이벤트는 무시.
   * - 개인 point_balance 적립.
   * - activityType.isEsgPoolEligible() == true 인 경우에만 company_esg_pool 적립.
   */
  // @Transactional
  // public void earnEsgActivityPoints(Long eventId, Long memberId, Long companyId,
  //                                   Long amount, ActivityType activityType, String description) {
  //   // ① 중복 이벤트 차단 (Kafka retry / duplicate consume 방지)
  //   if (processedEventRepository.existsById(eventId)) {
  //     log.warn("[ESG-POOL-EARN-DUPLICATE] eventId={} memberId={} companyId={} — 이미 처리된 이벤트, 중복 적립 차단",
  //         eventId, memberId, companyId);
  //     return;
  //   }
  //   processedEventRepository.save(new ProcessedEvent(eventId));

  //   // ② 개인 point_balance 적립
  //   PointBalance balance = pointBalanceRepository.findById(memberId)
  //       .orElse(new PointBalance(memberId, companyId, 0L));
  //   balance.add(amount);
  //   pointBalanceRepository.save(balance);

  //   // ③ ESG Pool 적립 — ESG 활동 타입(TUMBLER, TRANSPORT, RECYCLE 등)만 대상
  //   long beforePool = 0L;
  //   long afterPool  = 0L;
  //   boolean poolUpdated = false;
  //   if (companyId != null && activityType != null && activityType.isEsgPoolEligible()) {
  //     CompanyEsgPool pool = companyEsgPoolRepository.findById(companyId)
  //         .orElse(new CompanyEsgPool(companyId));
  //     beforePool = pool.getEsgPoints();
  //     pool.add(amount);
  //     companyEsgPoolRepository.save(pool);
  //     afterPool    = pool.getEsgPoints();
  //     poolUpdated  = true;
  //   }

  //   // ④ 이력 기록
  //   pointHistoryRepository.save(PointHistory.builder()
  //       .memberId(memberId)
  //       .companyId(companyId)
  //       .amount(amount)
  //       .type(PointType.EARN)
  //       .description(description)
  //       .build());

  //   // ⑤ 로그
  //   if (poolUpdated) {
  //     log.info("[ESG-POOL-EARN] eventId={} memberId={} companyId={} earnedPoints={} beforePool={} afterPool={}",
  //         eventId, memberId, companyId, amount, beforePool, afterPool);
  //   } else {
  //     log.info("[ESG-POOL-EARN-SKIP] eventId={} memberId={} activityType={} — pool 적립 제외 (비ESG 활동 또는 companyId 없음)",
  //         eventId, memberId, activityType);
  //   }
  // }

  @Transactional
  public void earnPoints(Long memberId, Long companyId, Long amount, String description, Long targetId, int earnedCo2) {
    if (pointHistoryRepository.existsByTargetIdAndType(targetId, PointType.EARN)) {
      log.warn("[POINT-EARN-DUPLICATE] targetId={} memberId={} 이미 처리된 이벤트", targetId, memberId);
      return;
    }

    PointBalance balance = pointBalanceRepository.findById(memberId)
      .orElse(new PointBalance(memberId, companyId, 0L));

    balance.add(amount);
    balance.addCo2Reduction(earnedCo2);
    pointBalanceRepository.save(balance);

    PointHistory history = PointHistory.builder()
      .memberId(memberId)
      .companyId(companyId)
      .amount(amount)
      .type(PointType.EARN)
      .description(description)
      .balance(balance.getBalance())
      .targetId(targetId)
      .build();
    pointHistoryRepository.save(history);

    if (companyId != null) {
      CompanyEsgPool pool = companyEsgPoolRepository.findById(companyId)
          .orElse(new CompanyEsgPool(companyId));

      long beforePool = pool.getEsgPoints();
      pool.add(amount);
      companyEsgPoolRepository.save(pool);
      long afterPool = pool.getEsgPoints();

      log.info("[ESG-POOL-EARN] companyId={} amount={} beforePool={} afterPool={}",
        companyId, amount, beforePool, afterPool);
    }

    notificationProducer.send(
      memberId,
      String.format("💰 %d 포인트가 적립되었습니다. (%s)", amount, description),
      "POINT_EARNED", targetId
    );
  }

  @Transactional
  public void usePoints(Long memberId, Long companyId, Long amount, String description, Long targetId) {
    PointBalance balance = pointBalanceRepository.findById(memberId)
      .orElseThrow(() -> new IllegalArgumentException("잔액 정보가 없습니다."));

    balance.use(amount);
    pointBalanceRepository.save(balance);

    PointHistory history = PointHistory.builder()
      .memberId(memberId)
      .companyId(companyId)
      .amount(-amount)
      .type(PointType.USE)
      .description(description)
      .balance(balance.getBalance())
      .targetId(targetId)
      .build();
    pointHistoryRepository.save(history);

    notificationProducer.send(
      memberId,
      String.format("💸 %d 포인트를 사용했습니다. (%s)", amount, description),
      "POINT_USED", targetId
    );
  }

  @Transactional
  public void refundPoints(Long memberId, Long companyId, Long amount, String description, Long targetId) {
    PointBalance balance = pointBalanceRepository.findById(memberId)
      .orElseThrow(() -> new IllegalArgumentException("잔액 정보가 없습니다."));

    // 환불 금액만큼 잔액 회복
    balance.add(amount);
    pointBalanceRepository.save(balance);

    // 포인트 히스토리에 플러스(+) 금액으로 환불 내역 적재
    PointHistory history = PointHistory.builder()
      .memberId(memberId)
      .companyId(companyId)
      .amount(amount)
      .type(PointType.REFUND)
      .description(description)
      .balance(balance.getBalance())
      .targetId(targetId)
      .build();
    pointHistoryRepository.save(history);

    // 사용자에게 환불 완료 SSE 알림 발송
    notificationProducer.send(
      memberId,
      String.format("🔄 %d 포인트가 환불 처리되었습니다. (%s)", amount, description),
      "POINT_REFUNDED", targetId
    );

    log.info("포인트 환불 완료 - 유저 ID: {}, 환불 금액: {} P", memberId, amount);
  }

  /**
   * ESG 분석 성공 후 company_esg_pool 에서만 차감.
   * 개인 point_balance 는 절대 차감하지 않는다.
   */
  @Transactional
  public void consumeEsgPool(Long companyId, Long amount, String description) {
    CompanyEsgPool pool = companyEsgPoolRepository.findById(companyId)
      .orElseThrow(() -> new IllegalArgumentException("ESG Pool이 없습니다. companyId=" + companyId));

    long beforePool = pool.getEsgPoints();
    pool.consume(amount);
    companyEsgPoolRepository.save(pool);
    long afterPool = pool.getEsgPoints();

    log.info("[COMPANY-ESG-CONSUME] companyId={} usedPoints={} beforePool={} afterPool={}",
      companyId, amount, beforePool, afterPool);
  }

  /** 회사 ESG Pool 조회. */
  public EsgPoolResponse getCompanyEsgPool(Long companyId) {
    long esgPoints = companyEsgPoolRepository.findById(companyId)
      .map(CompanyEsgPool::getEsgPoints)
      .orElse(0L);
    log.info("[COMPANY-ESG-POOL] companyId={} esgPoints={}EP", companyId, esgPoints);
    return new EsgPoolResponse(companyId, esgPoints);
  }

  @Transactional(readOnly = true)
  public PointDashboardDto getPointDashboard(Long memberId) {
    PointBalance balance = pointBalanceRepository.findById(memberId)
      .orElse(new PointBalance(memberId, null, 0L));
    return new PointDashboardDto(balance.getBalance(), balance.getTotalCo2Reduction());
  }

  @Transactional(readOnly = true)
  public Long getBalance(Long memberId) {
    return pointBalanceRepository.findById(memberId).map(PointBalance::getBalance).orElse(0L);
  }

  @Transactional(readOnly = true)
  public Page<PointHistory> getPointHistory(Long memberId, Pageable pageable) {
    return pointHistoryRepository.findByMemberIdOrderByCreatedDateDesc(memberId, pageable);
  }


  @Transactional
  public void cancelPoints(Long memberId, Long companyId, Long amount, int co2Amount, Long targetId) {
    PointBalance balance = pointBalanceRepository.findById(memberId)
      .orElseThrow(() -> new IllegalArgumentException("잔액 정보가 없습니다."));

    // 1. 개인 잔액 & 탄소량 차감
    balance.use(amount);
    balance.addCo2Reduction(-co2Amount);
    pointBalanceRepository.save(balance);

    // 2. 회사 ESG Pool 차감 (지급했던 회사 통계도 원상복구)
    if (companyId != null) {
      companyEsgPoolRepository.findById(companyId).ifPresent(pool -> {
        pool.consume(amount);
        companyEsgPoolRepository.save(pool);
      });
    }

    // 3. 차감 내역 히스토리 저장
    String description = "게시글 삭제로 인한 보상 회수";
    PointHistory history = PointHistory.builder()
      .memberId(memberId)
      .companyId(companyId)
      .amount(-amount)
      .type(PointType.CANCEL)
      .description(description)
      .balance(balance.getBalance())
      .targetId(targetId)
      .build();
    pointHistoryRepository.save(history);

    // 4. 회수 알림 전송
    notificationProducer.send(
      memberId,
      String.format("⚠️ 게시글 삭제로 인해 %d 포인트와 탄소 절감 내역이 회수되었습니다.", amount),
      "POINT_CANCELED", targetId
    );

    log.info("[REWARD-CANCEL] targetId={} memberId={} 회수포인트={} 회수탄소량={}", targetId, memberId, amount, co2Amount);
  }
}
