package com.esg.analysis.service;

import com.esg.analysis.dto.CarbonEmissionStatDto;
import com.esg.analysis.dto.CompanyProfileRequest;
import com.esg.analysis.dto.RegionalBenchmarkDto;
import com.esg.analysis.dto.RegionalBenchmarkDto.MonthlyData;
import com.esg.analysis.service.repository.CompanyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * [내 기업 vs 동종업계 평균] 탄소 배출 벤치마크 서비스.
 *
 * 비교 대상 산출 방법:
 *   전기: 한국에너지공단 「업종별 에너지 원단위」 통계 (임직원당 kWh/년) × 지역 보정계수
 *   가스: 한국에너지공단 「에너지통계연보 2023」 산업용 월별 소비량 × 지역 비중 배분
 *   출처 명시: 두 항목 모두 공식 통계 기반 추정치이며 개별 기업의 실측값이 아님
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BenchmarkService {

    private final CarbonMockGenerator mockGenerator;
    private final ExternalDataService externalDataService;
    private final CompanyRepository   companyRepository;

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

    // ── 전기 통계 테이블 ─────────────────────────────────────────────────────

    /**
     * KSIC 앞 2자리 → 임직원 1인당 연간 전력 소비량 (kWh/인/년).
     * 출처: 한국에너지공단 「업종별 에너지 원단위 통계 2023」
     */
    private static final Map<String, Double> INDUSTRY_KWH_PER_EMPLOYEE = Map.ofEntries(
            Map.entry("26", 25_000.0),  // 전자·반도체 (클린룸·정밀공정)
            Map.entry("24", 35_000.0),  // 1차금속 (용광로·압연)
            Map.entry("20", 30_000.0),  // 화학제품
            Map.entry("23", 28_000.0),  // 비금속광물 (시멘트·유리)
            Map.entry("29", 15_000.0),  // 기계장비
            Map.entry("30", 12_000.0),  // 자동차
            Map.entry("13", 12_000.0),  // 섬유·의류
            Map.entry("10", 10_000.0),  // 식품
            Map.entry("62",  3_600.0),  // 소프트웨어 (사무실·서버실)
            Map.entry("63",  4_000.0),  // 정보서비스
            Map.entry("64",  2_400.0),  // 금융·보험 (사무실)
            Map.entry("45",  1_800.0),  // 도매
            Map.entry("46",  1_800.0),  // 소매
            Map.entry("47",  1_800.0),  // 소매(기타)
            Map.entry("56",  4_800.0)   // 숙박·음식점
    );

    /**
     * 월별 전력 소비 계절 변동 인수 (합계 = 12.0).
     * 한국 전력 수요 패턴: 하계(7~8월) 냉방 피크, 동계(1~2월) 난방 피크.
     * 출처: 한국전력공사 전력통계속보 2023
     */
    private static final double[] MONTHLY_ELEC_FACTOR = {
        1.07, 1.02, 0.92, 0.87, 0.90, 0.97,
        1.17, 1.22, 0.97, 0.90, 0.94, 1.04
    }; // 1월~12월, 합계 = 11.99 ≈ 12.0

    /**
     * 지역별 전력 소비 보정 계수 (전국 평균 = 1.0).
     * 중공업 집적 지역은 높고, 서비스업 중심 도시는 낮음.
     * 출처: 에너지경제연구원 「지역에너지통계연보」 기반 추정
     */
    private static final Map<String, Double> REGION_ELEC_FACTOR = Map.ofEntries(
            Map.entry("11", 0.75), // 서울   – 서비스·금융 중심
            Map.entry("26", 0.95), // 부산
            Map.entry("27", 0.90), // 대구
            Map.entry("28", 1.05), // 인천   – 항만·제조
            Map.entry("29", 0.80), // 광주
            Map.entry("30", 0.80), // 대전   – IT·서비스
            Map.entry("31", 1.30), // 울산   – 석유화학·조선
            Map.entry("36", 0.75), // 세종
            Map.entry("41", 1.05), // 경기   – 복합 산업
            Map.entry("42", 0.85), // 강원
            Map.entry("43", 1.00), // 충북
            Map.entry("44", 1.20), // 충남   – 발전·화학
            Map.entry("45", 0.85), // 전북
            Map.entry("46", 1.20), // 전남   – 철강·석유
            Map.entry("47", 1.20), // 경북   – 철강
            Map.entry("48", 1.10), // 경남   – 조선·기계
            Map.entry("50", 0.70)  // 제주
    );

    // ── 가스 통계 테이블 ─────────────────────────────────────────────────────

    /**
     * 지역별 산업용 가스 소비 비중 (합계 = 1.00).
     * 출처: 에너지경제연구원 「지역에너지통계연보」 기반 추정
     */
    private static final Map<String, Double> REGION_GAS_SHARE = Map.ofEntries(
            Map.entry("11", 0.050), Map.entry("26", 0.030),
            Map.entry("27", 0.020), Map.entry("28", 0.060),
            Map.entry("29", 0.020), Map.entry("30", 0.020),
            Map.entry("31", 0.070), Map.entry("36", 0.010),
            Map.entry("41", 0.230), Map.entry("42", 0.030),
            Map.entry("43", 0.040), Map.entry("44", 0.130),
            Map.entry("45", 0.030), Map.entry("46", 0.100),
            Map.entry("47", 0.090), Map.entry("48", 0.080),
            Map.entry("50", 0.010)
    );

    /** 지역별 산업용 가스 사용 사업체 수 추정 */
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

    /**
     * 전국 산업용 도시가스 월별 소비량 (단위: 백만 MJ).
     * 출처: 한국에너지공단 「에너지통계연보 2023」
     */
    private static final double[] NATIONAL_INDUSTRIAL_GAS_MJ = {
        9_800, 8_700, 7_600, 6_800, 6_500, 6_300,
        6_400, 6_300, 6_600, 7_200, 8_100, 9_500
    }; // 1월~12월 (백만 MJ)

    // ── 공개 API ─────────────────────────────────────────────────────────────

    @Transactional
    @CacheEvict(value = "benchmark", allEntries = true)
    public void saveProfile(Long companyId, CompanyProfileRequest req) {
        String regionKey    = (req.getRegionCode() != null && req.getRegionCode().length() >= 2)
                ? req.getRegionCode().substring(0, 2) : "11";
        String regionName   = REGION_NAMES.getOrDefault(regionKey, "전국 평균");
        String industryName = resolveIndustryName(req.getKsicCode());
        int    employees    = req.getEmployeeCount() != null ? req.getEmployeeCount() : 500;

        companyRepository.upsertProfile(
                companyId, req.getRegionCode(), regionName,
                req.getKsicCode(), industryName, employees);

        log.info("기업 {} 프로파일 저장 완료 — 지역:{} 업종:{} 임직원:{}",
                companyId, regionName, industryName, employees);
    }

    @Cacheable(value = "benchmark", key = "#companyId + '_' + #year + '_' + #regionCode")
    public RegionalBenchmarkDto getBenchmark(Long companyId, int year,
                                              String regionCode, String ksicCode,
                                              int employeeCount) {

        String regionKey    = (regionCode != null && regionCode.length() >= 2)
                ? regionCode.substring(0, 2) : "11";
        String regionName   = REGION_NAMES.getOrDefault(regionKey, "전국 평균");
        String industryName = resolveIndustryName(ksicCode);

        double[][] myData     = resolveCompanyEmissions(companyId, year, regionCode, ksicCode, employeeCount);
        double[][] regionData = resolveIndustryStatAverage(year, regionKey, ksicCode, employeeCount);
        // [0]=합산, [1]=전기, [2]=가스

        List<MonthlyData> monthly = buildMonthlyData(myData, regionData);

        double myTotal     = Arrays.stream(myData[0]).sum();
        double regionTotal = Arrays.stream(regionData[0]).sum();
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

    /** @return [0]=합산, [1]=전기, [2]=가스 (tCO2eq/월) */
    private double[][] resolveCompanyEmissions(Long companyId, int year, String regionCode,
                                               String ksicCode, int employeeCount) {
        try {
            List<CarbonEmissionStatDto> stats =
                    externalDataService.getIntegratedMonthlyStats(companyId, year);

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

    // ── 동종업계 통계 평균 ────────────────────────────────────────────────────

    /**
     * 전기·가스 모두 통계 기반으로 산출하므로 항상 12개월 데이터가 채워짐.
     *
     * @return [0]=합산, [1]=전기, [2]=가스 (tCO2eq/월)
     */
    private double[][] resolveIndustryStatAverage(int year, String metroCd,
                                                   String ksicCode, int employeeCount) {
        double[] elec = calcIndustryElecTco2(metroCd, ksicCode, employeeCount);
        double[] gas  = calcIndustryGasTco2(metroCd, employeeCount);

        double[] total = new double[12];
        for (int m = 0; m < 12; m++) total[m] = round1(elec[m] + gas[m]);

        log.info("동종업계 통계 평균 산출 완료 — 지역:{} 업종:{} 임직원:{} 연간합산:{}tCO2",
                metroCd, ksicCode, employeeCount,
                round1(Arrays.stream(total).sum()));
        return new double[][]{ total, elec, gas };
    }

    /**
     * 업종별 임직원당 연간 전력 원단위 × 지역 보정 × 월별 계절 인수 → tCO2eq/월.
     * 출처: 한국에너지공단 「업종별 에너지 원단위 통계 2023」
     */
    private double[] calcIndustryElecTco2(String metroCd, String ksicCode, int employeeCount) {
        String prefix              = (ksicCode != null && ksicCode.length() >= 2) ? ksicCode.substring(0, 2) : "";
        double annualKwhPerEmployee = INDUSTRY_KWH_PER_EMPLOYEE.getOrDefault(prefix, 8_000.0);
        double regionFactor        = REGION_ELEC_FACTOR.getOrDefault(metroCd, 1.0);

        double[] result = new double[12];
        for (int m = 0; m < 12; m++) {
            // 임직원수 × 연간원단위 / 12 × 계절인수 × 지역보정 → kWh → tCO2eq
            double monthlyKwh = employeeCount * annualKwhPerEmployee / 12.0
                                * MONTHLY_ELEC_FACTOR[m] * regionFactor;
            result[m] = round1((monthlyKwh / 1000.0) * 0.4781);
        }

        log.info("전기 통계 기반 — 업종:{} 원단위:{}kWh/인 지역보정:{} 1월:{}tCO2",
                prefix, annualKwhPerEmployee, regionFactor, result[0]);
        return result;
    }

    /**
     * 전국 산업용 가스 소비량 × 지역 비중 배분 × 사업체당 규모 보정 → tCO2eq/월.
     * 출처: 한국에너지공단 「에너지통계연보 2023」
     */
    private double[] calcIndustryGasTco2(String metroCd, int employeeCount) {
        double regionShare         = REGION_GAS_SHARE.getOrDefault(metroCd, 0.05);
        int    industrialCustomers = REGION_GAS_INDUSTRIAL_CUSTOMERS.getOrDefault(metroCd, 3_000);

        double[] result = new double[12];
        for (int m = 0; m < 12; m++) {
            double nationalMj    = NATIONAL_INDUSTRIAL_GAS_MJ[m] * 1_000_000.0;
            double regionalMj    = nationalMj * regionShare;
            double perCustomerMj = regionalMj / industrialCustomers;
            double scaledMj      = perCustomerMj * (employeeCount / 100.0);
            result[m] = round1(scaledMj * 0.0561 / 1000.0);
        }

        log.info("가스 통계 기반 — 지역:{} 비중:{} 1월:{}tCO2",
                metroCd, regionShare, result[0]);
        return result;
    }

    // ── 유틸 ─────────────────────────────────────────────────────────────────

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
