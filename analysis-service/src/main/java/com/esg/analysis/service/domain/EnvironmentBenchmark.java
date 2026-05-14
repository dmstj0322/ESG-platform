package com.esg.analysis.service.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * K-ESG E 지표(E-101~E-105)에 대한 업종 평균 벤치마크.
 * 임직원 1인당 월 사용량으로 저장하여 기업 규모에 따라 스케일링합니다.
 *
 * <p>출처: 한국에너지공단 「업종별 에너지 원단위 통계 2023」 등 공개 통계 기반 추정치.
 *
 * <p>다년도 지원: ksicCode + baseYear 복합 unique → 연도별 벤치마크 관리 가능.
 * {@code findByKsicCodeAndBaseYear("26", "2024")} 형태로 조회합니다.
 *
 * <p>단위(unit) 필드: 지표별 측정 단위를 엔티티에 명시하여 자기 기술적(self-describing) 구조를 유지합니다.
 * 업종이나 연도에 따라 단위가 달라질 경우 직접 override 가능합니다.
 */
@Entity
@Table(name = "environment_benchmarks", uniqueConstraints = {
        @UniqueConstraint(name = "uk_eb_ksic_year", columnNames = {"ksic_code", "base_year"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EnvironmentBenchmark {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** KSIC 앞 2자리, 또는 "DEFAULT" (폴백용) */
    @Column(name = "ksic_code", nullable = false, length = 10)
    private String ksicCode;

    @Column(nullable = false)
    private String industryName;

    // ── 측정값 (1인당 월) ──────────────────────────────────────────────────────

    /** E-101: 임직원 1인당 월 전력 사용량 */
    @Column(name = "electricity_per_employee")
    private Double electricityPerEmployee;

    /** E-102: 임직원 1인당 월 가스 사용량 */
    @Column(name = "gas_per_employee")
    private Double gasPerEmployee;

    /** E-103: 임직원 1인당 월 탄소 배출량 */
    @Column(name = "carbon_per_employee")
    private Double carbonPerEmployee;

    /** E-104: 임직원 1인당 월 폐기물 발생량 */
    @Column(name = "waste_per_employee")
    private Double wastePerEmployee;

    /** E-105: 임직원 1인당 월 수자원 사용량 */
    @Column(name = "water_per_employee")
    private Double waterPerEmployee;

    // ── 단위 (지표별, 연도·업종에 따라 변경 가능) ──────────────────────────────

    /** E-101 단위 (기본: "kWh/인/월") */
    @Column(name = "electricity_unit", length = 20)
    private String electricityUnit;

    /** E-102 단위 (기본: "m³/인/월") */
    @Column(name = "gas_unit", length = 20)
    private String gasUnit;

    /** E-103 단위 (기본: "tCO2-eq/인/월") */
    @Column(name = "carbon_unit", length = 20)
    private String carbonUnit;

    /** E-104 단위 (기본: "kg/인/월") */
    @Column(name = "waste_unit", length = 20)
    private String wasteUnit;

    /** E-105 단위 (기본: "m³/인/월") */
    @Column(name = "water_unit", length = 20)
    private String waterUnit;

    // ── 메타 ──────────────────────────────────────────────────────────────────

    /** 기준 연도. ksicCode와 복합 unique → 연도별 벤치마크 병존 가능 */
    @Column(name = "base_year", nullable = false, length = 4)
    private String baseYear;
}
