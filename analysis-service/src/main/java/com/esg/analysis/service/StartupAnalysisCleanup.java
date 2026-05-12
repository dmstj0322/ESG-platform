package com.esg.analysis.service;

import com.esg.analysis.service.repository.AnalysisReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class StartupAnalysisCleanup {

    private final AnalysisReportRepository analysisReportRepository;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void cleanupStaleReports() {
        int updated = analysisReportRepository.bulkFailByStatusIn(List.of("PENDING", "PROCESSING"));
        if (updated > 0) {
            log.warn("[Startup Cleanup] 서버 재시작으로 중단된 분석 {}건을 FAILED 처리했습니다.", updated);
        }
    }
}
