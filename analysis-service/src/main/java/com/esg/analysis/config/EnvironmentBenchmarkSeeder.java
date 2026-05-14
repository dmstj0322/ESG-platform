package com.esg.analysis.config;

import com.esg.analysis.service.domain.EnvironmentBenchmark;
import com.esg.analysis.service.repository.EnvironmentBenchmarkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * K-ESG E 지표(E-101~E-105) 업종 평균 벤치마크 Mock 데이터 초기화.
 *
 * 임직원 1인당 월간 사용량 기준. 출처: 한국에너지공단 통계 2023 기반 추정.
 * 데이터가 이미 존재하면 건너뜁니다.
 *
 * 컬럼 단위:
 *   electricityPerEmployee : kWh/인/월
 *   gasPerEmployee         : m³/인/월
 *   carbonPerEmployee      : tCO2-eq/인/월
 *   wastePerEmployee       : kg/인/월
 *   waterPerEmployee       : m³/인/월
 */
@Slf4j
@Component
@Order(2) // EsgIndicatorSeeder 이후 실행
@RequiredArgsConstructor
public class EnvironmentBenchmarkSeeder implements CommandLineRunner {

    private static final String BASE_YEAR = "2023";

    private final EnvironmentBenchmarkRepository repository;

    @Override
    public void run(String... args) {
        if (repository.existsByKsicCodeAndBaseYear("DEFAULT", BASE_YEAR)) {
            log.info("[EnvBenchmarkSeeder] 이미 초기화됨 — 건너뜀");
            return;
        }

        List<EnvironmentBenchmark> benchmarks = List.of(
            build("26", "전자·반도체",  2083.0, 8.0,  1.0,  10.0,  5.0),
            build("24", "1차금속",      2917.0, 50.0, 2.2,  50.0,  15.0),
            build("20", "화학제품",     2500.0, 40.0, 1.9,  30.0,  20.0),
            build("23", "비금속광물",   2333.0, 30.0, 1.8,  40.0,  10.0),
            build("29", "기계장비",     1250.0, 15.0, 0.9,  20.0,   8.0),
            build("30", "자동차",       1000.0, 12.0, 0.7,  15.0,   7.0),
            build("13", "섬유·의류",     833.0, 10.0, 0.5,  25.0,   6.0),
            build("10", "식품",          833.0, 12.0, 0.5,  20.0,  12.0),
            build("62", "소프트웨어",    300.0,  1.0, 0.1,   5.0,   2.0),
            build("64", "금융·보험",     200.0,  0.5, 0.1,   3.0,   1.5),
            build("56", "음식·숙박",     400.0,  5.0, 0.2,  10.0,   8.0),
            // 폴백: 일반 제조업
            build("DEFAULT", "기타 제조업", 1000.0, 12.0, 0.7, 20.0, 8.0)
        );

        repository.saveAll(benchmarks);
        log.info("[EnvBenchmarkSeeder] {}개 업종 벤치마크 초기화 완료", benchmarks.size());
    }

    private EnvironmentBenchmark build(String ksicCode, String industryName,
                                       double elec, double gas, double carbon,
                                       double waste, double water) {
        return EnvironmentBenchmark.builder()
                .ksicCode(ksicCode)
                .industryName(industryName)
                .electricityPerEmployee(elec)
                .gasPerEmployee(gas)
                .carbonPerEmployee(carbon)
                .wastePerEmployee(waste)
                .waterPerEmployee(water)
                // 단위: E-101~E-105 기본 단위 명시 (필요 시 업종별 오버라이드 가능)
                .electricityUnit("kWh/인/월")
                .gasUnit("m³/인/월")
                .carbonUnit("tCO2-eq/인/월")
                .wasteUnit("kg/인/월")
                .waterUnit("m³/인/월")
                .baseYear(BASE_YEAR)
                .build();
    }
}
