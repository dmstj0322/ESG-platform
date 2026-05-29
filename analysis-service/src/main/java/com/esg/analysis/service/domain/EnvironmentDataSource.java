package com.esg.analysis.service.domain;

/**
 * Environment 데이터의 입력 출처.
 *
 * <pre>
 * BENCHMARK : 업종 평균 벤치마크 자동 생성 (EnvironmentBenchmarkSeeder)
 * CSV       : CSV 파일 업로드 (EnvironmentCsvService)
 * ERP       : ERP 시스템 API 연동 (향후)
 * MANUAL    : 관리자/담당자 수동 입력 (향후)
 * </pre>
 */
public enum EnvironmentDataSource {
    BENCHMARK, CSV, ERP, MANUAL
}
