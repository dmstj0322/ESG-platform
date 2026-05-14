package com.esg.analysis.service;

import com.esg.analysis.service.repository.AnalysisReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class StartupAnalysisCleanup {

    private final AnalysisReportRepository analysisReportRepository;
    private final RedisTemplate<String, Object> redisTemplate;

    private static final String LOCK_PATTERN = "analysis:processing:*";

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void cleanupStaleReports() {
        // 1. DB: 미완료 분석 FAILED 처리
        int updated = analysisReportRepository.bulkFailByStatusIn(List.of("PENDING", "PROCESSING"));
        if (updated > 0) {
            log.warn("[Startup Cleanup] 서버 재시작으로 중단된 분석 {}건을 FAILED 처리했습니다.", updated);
        }

        // 2. Redis: 잔여 분산 락 강제 해제
        // 서버 크래시 시 leaseTime(600s) 만료 전에는 락이 Redis에 남아 신규 분석을 막음
        try {
            Set<String> staleKeys = redisTemplate.keys(LOCK_PATTERN);
            if (staleKeys != null && !staleKeys.isEmpty()) {
                redisTemplate.delete(staleKeys);
                log.warn("[Startup Cleanup] Redis 분산 락 {}건 강제 삭제: {}", staleKeys.size(), staleKeys);
            } else {
                log.info("[Startup Cleanup] 잔여 Redis 분산 락 없음.");
            }
        } catch (Exception e) {
            log.error("[Startup Cleanup] Redis 락 정리 실패 — 수동으로 'redis-cli del analysis:processing:*' 실행 필요. 원인: {}", e.getMessage());
        }
    }
}
