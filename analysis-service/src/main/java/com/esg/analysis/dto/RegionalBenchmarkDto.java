package com.esg.analysis.dto;

import lombok.*;

import java.util.List;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegionalBenchmarkDto {

    private String regionName;           // "서울특별시"
    private String industryName;         // "전자·반도체"
    private double annualMyTotal;        // 우리 기업 연간 합계 tCO2eq
    private double annualRegionAvgTotal; // 지역 평균 연간 합계 tCO2eq
    /** 양수 = 평균보다 적게 배출(절감), 음수 = 초과 */
    private double annualReductionPercent;
    private boolean isBetterThanAverage;
    private List<MonthlyData> monthlyData;

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MonthlyData {
        private int month;
        private String monthLabel;             // "1월"

        // 우리 기업
        private double myEmissionTco2;         // 합산 (전기+가스)
        private double myElecEmissionTco2;     // 전기만
        private double myGasEmissionTco2;      // 가스만

        // 지역 평균
        private double regionAvgEmissionTco2;  // 합산 (전기+가스)
        private double regionAvgElecTco2;      // 전기만
        private double regionAvgGasTco2;       // 가스만

        private double reductionPercent;
        private boolean isBetterThanAverage;
    }
}
