package com.esg.analysis.service.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * CSV 업로드 또는 벤치마크 기반으로 생성된 기업 환경 데이터 (월 단위).
 * EnvironmentBenchmarkService에서 벤치마크 대신 이 값을 우선 사용합니다.
 *
 * <p>dataSource 필드로 데이터 출처를 구분합니다.
 * uploadSessionId로 동일 CSV 업로드 배치를 그룹핑하고,
 * 향후 PDF evidence와 uploadSessionId를 기준으로 연결할 수 있습니다.
 */
@Entity
@Table(name = "environment_data", uniqueConstraints = {
        @UniqueConstraint(name = "uk_env_company_month", columnNames = {"company_id", "year_month"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EnvironmentData {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    /** 측정 연월 (예: "2026-01") */
    @Column(name = "year_month", nullable = false, length = 7)
    private String yearMonth;

    /** E-101: 전력 사용량 (kWh) */
    @Column(name = "electricity_kwh")
    private Double electricityKwh;

    /** E-102: 가스 사용량 (MJ) */
    @Column(name = "gas_mj")
    private Double gasMj;

    /** E-103: 탄소 배출량 (tCO2-eq) */
    @Column(name = "carbon_tco2")
    private Double carbonTco2;

    /** E-104: 폐기물 발생량 (kg) */
    @Column(name = "waste_kg")
    private Double wasteKg;

    /** E-105: 수자원 사용량 (m³) */
    @Column(name = "water_m3")
    private Double waterM3;

    /**
     * 데이터 입력 출처.
     * CSV 업로드 시 CSV, 벤치마크 자동 생성 시 BENCHMARK, 향후 ERP/MANUAL 확장 가능.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "data_source", nullable = false, length = 15)
    private EnvironmentDataSource dataSource;

    /**
     * 동일 업로드 배치 식별자 (UUID).
     * 같은 CSV 파일에서 저장된 모든 월 데이터가 동일한 sessionId를 공유합니다.
     * 향후 PDF 증빙 연결 시 이 값으로 매핑합니다.
     */
    @Column(name = "upload_session_id", length = 36)
    private String uploadSessionId;

    /** 업로드된 원본 파일명 (추적 및 UI 표시용) */
    @Column(name = "original_file_name", length = 255)
    private String originalFileName;

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private LocalDateTime uploadedAt;

    @PrePersist
    protected void onCreate() {
        this.uploadedAt = LocalDateTime.now();
    }
}
