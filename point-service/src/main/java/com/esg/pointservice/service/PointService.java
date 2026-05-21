package com.esg.pointservice.service;

import com.esg.pointservice.domain.PointBalance;
import com.esg.pointservice.domain.PointHistory;
import com.esg.pointservice.domain.PointType;
import com.esg.pointservice.kafka.NotificationProducer;
import com.esg.pointservice.repository.PointBalanceRepository;
import com.esg.pointservice.repository.PointHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class PointService {
  private final PointBalanceRepository pointBalanceRepository;
  private final PointHistoryRepository pointHistoryRepository;
  private final NotificationProducer notificationProducer;

  @Transactional
  public void earnPoints(Long memberId, Long companyId, Long amount, String description, Long targetId) {
    if (pointHistoryRepository.existsByTargetIdAndType(targetId, PointType.EARN)) {
      log.warn("이미 처리된 포인트 지급 이벤트 - Post ID: {}", targetId);
      return;
    }

    PointBalance balance = pointBalanceRepository.findById(memberId)
      .orElse(new PointBalance(memberId, companyId, 0L));

    balance.add(amount);
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

  @Transactional(readOnly = true)
  public Long getBalance(Long memberId) {
    return pointBalanceRepository.findById(memberId).map(PointBalance::getBalance)
      .orElse(0L);
  }

  public Long getCompanyTotalPoints(Long companyId) {
    Long total = pointBalanceRepository.sumBalanceByCompanyId(companyId);
    return (total != null) ? total : 0L;
  }

  @Transactional(readOnly = true)
  public Page<PointHistory> getPointHistory(Long memberId, Pageable pageable) {
    return pointHistoryRepository.findByMemberIdOrderByCreatedDateDesc(memberId, pageable);
  }
}
