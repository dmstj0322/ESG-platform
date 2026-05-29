package com.esg.pointservice.service;

import com.esg.common.dto.EsgPoolResponse;
import com.esg.pointservice.domain.*;
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
  private final PointBalanceRepository   pointBalanceRepository;
  private final PointHistoryRepository   pointHistoryRepository;
  private final CompanyEsgPoolRepository companyEsgPoolRepository;
  private final ProcessedEventRepository processedEventRepository;

  /**
   * Kafka ESG 활동 이벤트 기반 포인트 적립.
   * - eventId(postId) 중복 체크 → 이미 처리된 이벤트는 무시.
   * - 개인 point_balance 적립.
   * - activityType.isEsgPoolEligible() == true 인 경우에만 company_esg_pool 적립.
   */
  @Transactional
  public void earnEsgActivityPoints(Long eventId, Long memberId, Long companyId,
                                    Long amount, ActivityType activityType, String description) {
    // ① 중복 이벤트 차단 (Kafka retry / duplicate consume 방지)
    if (processedEventRepository.existsById(eventId)) {
      log.warn("[ESG-POOL-EARN-DUPLICATE] eventId={} memberId={} companyId={} — 이미 처리된 이벤트, 중복 적립 차단",
          eventId, memberId, companyId);
      return;
    }
    processedEventRepository.save(new ProcessedEvent(eventId));

    // ② 개인 point_balance 적립
    PointBalance balance = pointBalanceRepository.findById(memberId)
        .orElse(new PointBalance(memberId, companyId, 0L));
    balance.add(amount);
    pointBalanceRepository.save(balance);

    // ③ ESG Pool 적립 — ESG 활동 타입(TUMBLER, TRANSPORT, RECYCLE 등)만 대상
    long beforePool = 0L;
    long afterPool  = 0L;
    boolean poolUpdated = false;
    if (companyId != null && activityType != null && activityType.isEsgPoolEligible()) {
      CompanyEsgPool pool = companyEsgPoolRepository.findById(companyId)
          .orElse(new CompanyEsgPool(companyId));
      beforePool = pool.getEsgPoints();
      pool.add(amount);
      companyEsgPoolRepository.save(pool);
      afterPool    = pool.getEsgPoints();
      poolUpdated  = true;
    }

    // ④ 이력 기록
    pointHistoryRepository.save(PointHistory.builder()
        .memberId(memberId)
        .companyId(companyId)
        .amount(amount)
        .type(PointType.EARN)
        .description(description)
        .build());

    // ⑤ 로그
    if (poolUpdated) {
      log.info("[ESG-POOL-EARN] eventId={} memberId={} companyId={} earnedPoints={} beforePool={} afterPool={}",
          eventId, memberId, companyId, amount, beforePool, afterPool);
    } else {
      log.info("[ESG-POOL-EARN-SKIP] eventId={} memberId={} activityType={} — pool 적립 제외 (비ESG 활동 또는 companyId 없음)",
          eventId, memberId, activityType);
    }
  }

  /**
   * 일반 포인트 적립 (관리자 지급, 비ESG 보상 등).
   * company_esg_pool 에는 영향 없음.
   */
  @Transactional
  public void earnPoints(Long memberId, Long companyId, Long amount, String description) {
    PointBalance balance = pointBalanceRepository.findById(memberId)
        .orElse(new PointBalance(memberId, companyId, 0L));
    balance.add(amount);
    pointBalanceRepository.save(balance);

    pointHistoryRepository.save(PointHistory.builder()
        .memberId(memberId)
        .companyId(companyId)
        .amount(amount)
        .type(PointType.EARN)
        .description(description)
        .build());
  }

  /** 개인 쇼핑·ESG 마켓 포인트 사용. ESG Pool 에는 영향 없음. */
  @Transactional
  public void usePoints(Long memberId, Long companyId, Long amount, String description) {
    PointBalance balance = pointBalanceRepository.findById(memberId)
        .orElseThrow(() -> new IllegalArgumentException("잔액 정보가 없습니다."));
    balance.use(amount);
    pointBalanceRepository.save(balance);

    pointHistoryRepository.save(PointHistory.builder()
        .memberId(memberId)
        .companyId(companyId)
        .amount(-amount)
        .type(PointType.USE)
        .description(description)
        .build());
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

  public Long getBalance(Long memberId) {
    return pointBalanceRepository.findById(memberId).map(PointBalance::getBalance).orElse(0L);
  }

  @Transactional(readOnly = true)
  public Page<PointHistory> getPointHistory(Long memberId, Pageable pageable) {
    return pointHistoryRepository.findByMemberIdOrderByCreatedDateDesc(memberId, pageable);
  }
}
