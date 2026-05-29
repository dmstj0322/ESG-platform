package com.esg.analysis.dto;

import lombok.Builder;
import lombok.Getter;

/**
 * Environment CSV 파일의 단일 행을 매핑하는 DTO.
 *
 * <pre>
 * 헤더 예시:
 *   month,electricity_kwh,gas_mj,carbon_tco2,waste_kg,water_m3
 * 데이터 예시:
 *   2026-01,1200,530,0.8,500,5000
 * </pre>
 *
 * 수치 필드는 null 허용 (해당 컬럼이 없거나 빈 셀인 경우).
 */
@Getter
@Builder
public class EnvironmentDataRow {

    /** 측정 연월 — YYYY-MM 형식 필수 (예: "2026-01") */
    private final String month;

    /** E-101: 전력 사용량 (kWh) */
    private final Double electricityKwh;

    /** E-102: 가스 사용량 (MJ) */
    private final Double gasMj;

    /** E-103: 탄소 배출량 (tCO2-eq) */
    private final Double carbonTco2;

    /** E-104: 폐기물 발생량 (kg) */
    private final Double wasteKg;

    /** E-105: 수자원 사용량 (m³) */
    private final Double waterM3;
}
