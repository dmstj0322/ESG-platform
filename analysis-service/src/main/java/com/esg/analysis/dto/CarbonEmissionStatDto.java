package com.esg.analysis.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class CarbonEmissionStatDto {
    private int month;            // 월
    private Double totalUsage;    // 총 사용량
    private Double carbonAmount;  // 탄소 배출량
    private String energySource;  // 에너지원
}