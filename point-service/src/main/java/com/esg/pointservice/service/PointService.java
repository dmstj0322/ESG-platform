package com.esg.pointservice.service;

import com.esg.pointservice.domain.PointBalance;
import com.esg.pointservice.domain.PointHistory;
import com.esg.pointservice.domain.PointType;
import com.esg.pointservice.repository.PointBalanceRepository;
import com.esg.pointservice.repository.PointHistoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PointService {
  private final PointBalanceRepository pointBalanceRepository;
  private final PointHistoryRepository pointHistoryRepository;

  @Transactional
  public void earnPoints(Long memberId, Long companyId, Long amount, String description) {
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
      .build();
    pointHistoryRepository.save(history);
  }

  @Transactional
  public void usePoints(Long memberId, Long companyId, Long amount, String description) {
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
      .build();
    pointHistoryRepository.save(history);
  }

  public Long getBalance(Long memberId) {
    return pointBalanceRepository.findById(memberId).map(PointBalance::getBalance)
      .orElse(0L);
  }

  @Transactional(readOnly = true)
  public Page<PointHistory> getPointHistory(Long memberId, Pageable pageable) {
    return pointHistoryRepository.findByMemberIdOrderByCreatedDateDesc(memberId, pageable);
  }
}
