package com.esg.analysis.service.domain; // 패키지 경로는 프로젝트에 맞게 수정하세요

import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Table(name = "carbon_emission")
public class CarbonEmission {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long companyId;

    @Column(name = "`year_month`", length = 10) // 백틱 추가로 SQL 에러 방지
    private String yearMonth;

    private Double totalUsage;
    private Double carbonAmount;
    private String energySource;
}