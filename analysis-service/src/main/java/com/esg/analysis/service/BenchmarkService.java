package com.esg.analysis.service;

import com.esg.analysis.client.KepcoRegionalClient;
import com.esg.analysis.client.KogasClient;
import com.esg.analysis.dto.CarbonEmissionStatDto;
import com.esg.analysis.dto.RegionalBenchmarkDto;
import com.esg.analysis.dto.RegionalBenchmarkDto.MonthlyData;
import com.esg.analysis.dto.external.KepcoRegionalResponseDto;
import com.esg.analysis.dto.external.KogasResponseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * [내 기업 vs 지역 평균] 탄소 배출 벤치마크 서비스.
 *
 * <p>지역 평균 산출 방법:
 * <ul>
 *   <li>전기: 한전 city.do API → 시도별 고객당 전력 → tCO2eq</li>
 *   <li>가스: Kogas API 전국 산업용 총량 × 시도별 소비 비중 → tCO2eq
 *       (Kogas API는 용도별 전국 집계만 제공하므로 지역 비중으로 배분)</li>
 *   <li>전기·가스 API 모두 실패 시 → CarbonMockGenerator Fallback</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BenchmarkService {

    private final CarbonMockGenerator  mockGenerator;
    private final KepcoRegionalClient  kepcoRegionalClient;
    private final KogasClient          kogasClient;
    private final ExternalDataService  externalDataService;

    @Value("${external-api.kepco.key}")
    private String kepcoApiKey;

    @Value("${external-api.kogas.key}")
    private String kogasServiceKey;

    // ── 정적 참조 테이블 ─────────────────────────────────────────────────────

    private static final Map<String, String> REGION_NAMES = Map.ofEntries(
            Map.entry("11", "서울특별시"), Map.entry("26", "부산광역시"),
            Map.entry("27", "대구광역시"), Map.entry("28", "인천광역시"),
            Map.entry("29", "광주광역시"), Map.entry("30", "대전광역시"),
            Map.entry("31", "울산광역시"), Map.entry("36", "세종특별자치시"),
            Map.entry("41", "경기도"),     Map.entry("42", "강원도"),
            Map.entry("43", "충청북도"),   Map.entry("44", "충청남도"),
            Map.entry("45", "전라북도"),   Map.entry("46", "전라남도"),
            Map.entry("47", "경상북도"),   Map.entry("48", "경상남도"),
            Map.entry("50", "제주특별자치도")
    );

    /**
     * 지역별 산업용 가스 소비 비중.
     * 출처: 에너지경제연구원 「지역에너지통계연보」 기반 추정.
     * 합계 = 1.00
     */
    private static final Map<String, Double> REGION_GAS_SHARE = Map.ofEntries(
            Map.entry("11", 0.050), // 서울   – 서비스 중심
            Map.entry("26", 0.030), // 부산
            Map.entry("27", 0.020), // 대구
            Map.entry("28", 0.060), // 인천   – 항만·제조
            Map.entry("29", 0.020), // 광주
            Map.entry("30", 0.020), // 대전
            Map.entry("31", 0.070), // 울산   – 석유화학·조선
            Map.entry("36", 0.010), // 세종
            Map.entry("41", 0.230), // 경기   – 전국 최대 산업 집적
            Map.entry("42", 0.030), // 강원
            Map.entry("43", 0.040), // 충북
            Map.entry("44", 0.130), // 충남   – 발전·화학
            Map.entry("45", 0.030), // 전북
            Map.entry("46", 0.100), // 전남   – 철강·석유
            Map.entry("47", 0.090), // 경북   – 철강
            Map.entry("48", 0.080), // 경남   – 조선·기계
            Map.entry("50", 0.010)  // 제주
    );

    /**
     * 지역별 산업용 가스 사용 사업체 수 추정 (중소 제조업 기준).
     * 고객당 평균 사용량 산출에 활용.
     */
    private static final Map<String, Integer> REGION_GAS_INDUSTRIAL_CUSTOMERS = Map.ofEntries(
            Map.entry("11",  8_000), Map.entry("26",  3_000),
            Map.entry("27",  2_500), Map.entry("28",  4_000),
            Map.entry("29",  1_800), Map.entry("30",  2_000),
            Map.entry("31",    900), Map.entry("36",    500),
            Map.entry("41", 18_000), Map.entry("42",  1_200),
            Map.entry("43",  2_500), Map.entry("44",  3_500),
            Map.entry("45",  1_800), Map.entry("46",  1_600),
            Map.entry("47",  2_800), Map.entry("48",  4_500),
            Map.entry("50",    600)
    );

    // ── 공개 API ─────────────────────────────────────────────────────────────

    @Cacheable(value = "benchmark", key = "#companyId + '_' + #year + '_' + #regionCode")
    public RegionalBenchmarkDto getBenchmark(Long companyId, int year,
                                              String regionCode, String ksicCode,
                                              int employeeCount) {

        String regionKey    = (regionCode != null && regionCode.length() >= 2)
                ? regionCode.substring(0, 2) : "11";
        String regionName   = REGION_NAMES.getOrDefault(regionKey, "전국 평균");
        String industryName = resolveIndustryName(ksicCode);

        double[][] myData     = resolveCompanyEmissions(companyId, year, regionCode, ksicCode, employeeCount);
        double[][] regionData = resolveRegionalAverage(year, regionKey, regionCode, ksicCode, employeeCount);
        // [0]=합산, [1]=전기, [2]=가스

        List<MonthlyData> monthly = buildMonthlyData(myData, regionData);

        double[] myEmissions = myData[0];
        double[] regionAvg   = regionData[0];

        double myTotal     = Arrays.stream(myEmissions).sum();
        double regionTotal = Arrays.stream(regionAvg).sum();
        double reduction   = regionTotal > 0
                ? (regionTotal - myTotal) / regionTotal * 100.0 : 0.0;

        return RegionalBenchmarkDto.builder()
                .regionName(regionName)
                .industryName(industryName)
                .annualMyTotal(round1(myTotal))
                .annualRegionAvgTotal(round1(regionTotal))
                .annualReductionPercent(round1(reduction))
                .isBetterThanAverage(myTotal <= regionTotal)
                .monthlyData(monthly)
                .build();
    }

    // ── 우리 기업 실측 데이터 ─────────────────────────────────────────────────

    /** @return [0]=합산, [1]=전기, [2]=가스 (모두 tCO2eq/월) */
    private double[][] resolveCompanyEmissions(Long companyId, int year, String regionCode,
                                               String ksicCode, int employeeCount) {
        try {
            List<CarbonEmissionStatDto> stats =
                    externalDataService.getIntegratedMonthlyStats(companyId, year);

            // ELECTRIC: (kWh/1000)*0.4781 → tCO2eq  |  GAS: MJ*0.0561 → kgCO2eq → /1000 → tCO2eq
            double[] elec = new double[12];
            double[] gas  = new double[12];

            for (CarbonEmissionStatDto s : stats) {
                if (s.getCarbonAmount() == null || s.getMonth() < 1 || s.getMonth() > 12) continue;
                int idx = s.getMonth() - 1;
                if      ("ELECTRIC".equals(s.getEnergySource())) elec[idx] = s.getCarbonAmount();
                else if ("GAS".equals(s.getEnergySource()))      gas[idx]  = s.getCarbonAmount() / 1000.0;
            }

            double[] total = new double[12];
            for (int i = 0; i < 12; i++) total[i] = round1(elec[i] + gas[i]);

            long filled = Arrays.stream(total).filter(v -> v > 0).count();
            if (filled >= 1) {
                log.info("기업 {} DB 실측치 {}개월 사용", companyId, filled);
                return new double[][]{ total, elec, gas };
            }
        } catch (Exception e) {
            log.warn("기업 DB 조회 실패 — Mock 대체: {}", e.getMessage());
        }
        double[] total = mockGenerator.generateCompanyData(companyId, year, regionCode, ksicCode, employeeCount);
        double[] elec  = mockGenerator.generateCompanyElec(companyId, year, regionCode, ksicCode, employeeCount);
        double[] gas   = new double[12];
        for (int i = 0; i < 12; i++) gas[i] = round1(total[i] - elec[i]);
        return new double[][]{ total, elec, gas };
    }

    // ── 지역 평균 데이터 ─────────────────────────────────────────────────────

    /** @return [0]=합산, [1]=전기, [2]=가스 (모두 tCO2eq/월) */
    private double[][] resolveRegionalAverage(int year, String metroCd, String regionCode,
                                              String ksicCode, int employeeCount) {
        try {
            double[] elec = fetchRegionalElecTco2(year, metroCd, employeeCount);
            double[] gas  = fetchRegionalGasTco2(year, metroCd, employeeCount);

            long elecFilled = Arrays.stream(elec).filter(v -> v > 0).count();
            long gasFilled  = Arrays.stream(gas).filter(v -> v > 0).count();

            if (elecFilled >= 6 && gasFilled >= 6) {
                double[] total = new double[12];
                for (int m = 0; m < 12; m++) total[m] = round1(elec[m] + gas[m]);
                log.info("지역 API 사용 (전기 {}개월, 가스 {}개월, metroCd={})", elecFilled, gasFilled, metroCd);
                return new double[][]{ total, elec, gas };
            }
            log.warn("지역 API 데이터 부족 (전기 {}개월, 가스 {}개월) — Mock Fallback", elecFilled, gasFilled);
        } catch (Exception e) {
            log.warn("지역 API 호출 실패 — Mock Fallback: {}", e.getMessage());
        }
        double[] total = mockGenerator.generateRegionalAverage(year, regionCode, ksicCode, employeeCount);
        double[] elec  = mockGenerator.generateRegionalElec(year, regionCode, ksicCode, employeeCount);
        double[] gas   = new double[12];
        for (int i = 0; i < 12; i++) gas[i] = round1(total[i] - elec[i]);
        return new double[][]{ total, elec, gas };
    }

    /**
     * 한전 city.do API → 시도별 고객당 전력 → 기업 규모 보정 → tCO2eq/월
     */
    private double[] fetchRegionalElecTco2(int year, String metroCd, int employeeCount) {
        double[] result = new double[12];
        for (int m = 1; m <= 12; m++) {
            try {
                String month = String.format("%02d", m);
                KepcoRegionalResponseDto res = kepcoRegionalClient.getRegionalPowerUsage(
                        String.valueOf(year), month, metroCd, kepcoApiKey, "json");

                if (res == null || res.getActualData().isEmpty()) continue;
                KepcoRegionalResponseDto.CityData d = res.getActualData().get(0);
                if (d.getPowerUsage() == null || d.getCustCnt() == null || d.getCustCnt() == 0) continue;

                // 고객당 kWh × 규모 보정 → (kWh/1000) * 0.4781 tCO2/MWh = tCO2
                double avgKwh = (d.getPowerUsage() / d.getCustCnt()) * (employeeCount / 10.0);
                result[m - 1] = round1((avgKwh / 1000.0) * 0.4781);
            } catch (Exception e) {
                log.debug("Kepco city.do {}월 호출 실패: {}", m, e.getMessage());
            }
        }
        return result;
    }

    /**
     * Kogas API 전국 산업용 총량 × 시도 소비 비중 → 사업체당 가스 → tCO2eq/월
     *
     * <p>Kogas API는 지역 필터 파라미터가 없어 전국 집계만 제공합니다.
     * 「지역에너지통계연보」 기반 시도별 산업용 소비 비중으로 지역 몫을 배분합니다.
     */
    private double[] fetchRegionalGasTco2(int year, String metroCd, int employeeCount) {
        double[] result = new double[12];
        double regionShare = REGION_GAS_SHARE.getOrDefault(metroCd, 0.05);
        int industrialCustomers = REGION_GAS_INDUSTRIAL_CUSTOMERS.getOrDefault(metroCd, 3_000);

        for (int m = 1; m <= 12; m++) {
            try {
                String month = String.format("%02d", m);
                KogasResponseDto gasRes = kogasClient.getGasUsage(
                        String.valueOf(year), month, kogasServiceKey, "JSON");

                if (gasRes == null || gasRes.getResponse() == null
                        || gasRes.getResponse().getBody() == null) continue;

                List<KogasResponseDto.KogasData> items =
                        gasRes.getResponse().getBody().getItems().getItem();
                if (items == null || items.isEmpty()) continue;

                // "산업용" 전국 총량(MJ) 추출
                double nationalIndustrialMj = items.stream()
                        .filter(it -> "산업용".equals(it.getCompanyName()))
                        .mapToDouble(it -> {
                            try { return Double.parseDouble(it.getMinMj()); }
                            catch (NumberFormatException ex) { return 0.0; }
                        })
                        .findFirst().orElse(0.0);

                if (nationalIndustrialMj <= 0) continue;

                // 지역 몫 배분 → 사업체당 → 기업 규모 보정 → tCO2eq
                // MJ * kgCO2/MJ / 1000 = tCO2
                double regionalMj      = nationalIndustrialMj * regionShare;
                double perCustomerMj   = regionalMj / industrialCustomers;
                double scaledMj        = perCustomerMj * (employeeCount / 100.0);
                result[m - 1] = round1(scaledMj * 0.0561 / 1000.0);

            } catch (Exception e) {
                log.debug("Kogas API {}월 호출 실패: {}", m, e.getMessage());
            }
        }
        return result;
    }

    // ── 유틸 ─────────────────────────────────────────────────────────────────

    /** myData/regionData: [0]=합산, [1]=전기, [2]=가스 */
    private List<MonthlyData> buildMonthlyData(double[][] myData, double[][] regionData) {
        List<MonthlyData> list = new ArrayList<>();
        for (int m = 0; m < 12; m++) {
            double mine = myData[0][m];
            double avg  = regionData[0][m];
            double reduction = avg > 0 ? (avg - mine) / avg * 100.0 : 0.0;
            list.add(MonthlyData.builder()
                    .month(m + 1)
                    .monthLabel((m + 1) + "월")
                    .myEmissionTco2(mine)
                    .myElecEmissionTco2(myData[1][m])
                    .myGasEmissionTco2(myData[2][m])
                    .regionAvgEmissionTco2(avg)
                    .regionAvgElecTco2(regionData[1][m])
                    .regionAvgGasTco2(regionData[2][m])
                    .reductionPercent(round1(reduction))
                    .isBetterThanAverage(mine <= avg)
                    .build());
        }
        return list;
    }

    private String resolveIndustryName(String ksicCode) {
        if (ksicCode == null || ksicCode.length() < 2) return "기타";
        return switch (ksicCode.substring(0, 2)) {
            case "26" -> "전자·반도체"; case "24" -> "1차 금속";
            case "20" -> "화학제품";   case "23" -> "비금속 광물";
            case "29" -> "기계장비";   case "30" -> "자동차";
            case "13" -> "섬유·의류"; case "10" -> "식품";
            case "62" -> "소프트웨어"; case "64" -> "금융·보험";
            case "56" -> "음식·숙박";
            default   -> "제조업";
        };
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
