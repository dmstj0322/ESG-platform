package com.esg.marketservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderFacade {
  private final RedissonClient redissonClient;
  private final OrderService orderService;

  public Long createOrder(Long memberId, Long companyId, Long productId, int count) {
    String lockKey = "lock:product:" + productId;
    RLock lock = redissonClient.getLock(lockKey);

    try {
      // 락 획득 시도
      boolean isLocked = lock.tryLock(5, TimeUnit.SECONDS);

      if (!isLocked) {
        log.info("락 획득 실패 - productId: {}", productId);
        throw new RuntimeException("현재 주문이 많아 잠시 후 다시 시도해주세요.");
      }
      log.info("락 획득 성공 - productId: {}", productId);

      // 🚨 락을 쥔 상태에서 트랜잭션이 걸린 서비스 로직을 호출! (완전히 끝나고 커밋될 때까지 기다림)
      return orderService.createOrder(memberId, companyId, productId, count);

    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RuntimeException("시스템 오류가 발생했습니다.");
    } finally {
      // 완전히 DB 커밋이 끝난 후에 안전하게 락 해제
      if (lock.isHeldByCurrentThread()) {
        lock.unlock();
        log.info("락 해제 완료 - productId: {}", productId);
      }
    }
  }
}
