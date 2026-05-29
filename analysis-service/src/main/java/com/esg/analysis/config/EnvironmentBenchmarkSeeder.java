package com.esg.analysis.config;

import com.esg.analysis.service.repository.EnvironmentBenchmarkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * [DEPRECATED] BenchmarkCsvLoader로 교체됨.
 * CSV 기반 공공 통계 데이터 로더가 @Order(2)로 실행됩니다.
 * 이 클래스는 하위 호환을 위해 no-op으로 유지됩니다.
 */
@Slf4j
@Component
@Order(3)
@RequiredArgsConstructor
public class EnvironmentBenchmarkSeeder implements CommandLineRunner {

    private final EnvironmentBenchmarkRepository repository;

    @Override
    public void run(String... args) {
        // BenchmarkCsvLoader가 @Order(2)로 선행 실행되므로 아무것도 하지 않음
        log.debug("[EnvBenchmarkSeeder] BenchmarkCsvLoader로 대체됨 — skip");
    }
}
