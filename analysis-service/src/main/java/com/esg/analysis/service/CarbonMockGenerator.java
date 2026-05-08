package com.esg.analysis.service;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * 기업 탄소 배출량 및 지역 평균 Mock 데이터 생성기.
 *
 * <p>단순 고정값이 아닌 다음 요소를 반영하여 현실감 있는 데이터를 생성합니다.
 * <ul>
 *   <li>지역별 산업 에너지 밀도 차이 (울산 중화학 > 서울 서비스)</li>
 *   <li>업종 가중치 (반도체/화학 > IT/금융)</li>
 *   <li>계절성: 여름(7~8월) 냉방 전기↑, 겨울(12~2월) 난방 가스↑</li>
 *   <li>임직원 수 기반 규모 스케일</li>
 *   <li>기업별 성과 계수: companyId 기반으로 결정 — 우수/평균/미흡 3구간 분포</li>
 *   <li>회사 데이터: ±15% 노이즈 (개별 운영 편차 반영)</li>
 *   <li>지역 평균: ±10% 노이즈 (모집단 평균이므로 변동 작음)</li>
 * </ul>
 */
@Component
public class CarbonMockGenerator {

    // 시도별 임직원 1인당 월 기준 배출량 (tCO2eq) — 한국 에너지통계연보 기반 추정
    private static final Map<String, Double> REGIONAL_BASE_PER_EMPLOYEE = new HashMap<>();
    static {
        REGIONAL_BASE_PER_EMPLOYEE.put("11", 0.075); // 서울 – 서비스 중심
        REGIONAL_BASE_PER_EMPLOYEE.put("26", 0.085); // 부산 – 복합
        REGIONAL_BASE_PER_EMPLOYEE.put("27", 0.088); // 대구 – 섬유·기계
        REGIONAL_BASE_PER_EMPLOYEE.put("28", 0.090); // 인천 – 항만·제조
        REGIONAL_BASE_PER_EMPLOYEE.put("29", 0.078); // 광주 – 자동차
        REGIONAL_BASE_PER_EMPLOYEE.put("30", 0.080); // 대전 – R&D
        REGIONAL_BASE_PER_EMPLOYEE.put("31", 0.150); // 울산 – 중화학공업 최고
        REGIONAL_BASE_PER_EMPLOYEE.put("36", 0.076); // 세종 – 행정
        REGIONAL_BASE_PER_EMPLOYEE.put("41", 0.095); // 경기 – 반도체·IT
        REGIONAL_BASE_PER_EMPLOYEE.put("42", 0.100); // 강원 – 시멘트
        REGIONAL_BASE_PER_EMPLOYEE.put("43", 0.105); // 충북 – 배터리
        REGIONAL_BASE_PER_EMPLOYEE.put("44", 0.125); // 충남 – 발전소·석유화학
        REGIONAL_BASE_PER_EMPLOYEE.put("45", 0.090); // 전북 – 자동차
        REGIONAL_BASE_PER_EMPLOYEE.put("46", 0.088); // 전남 – 철강·석유
        REGIONAL_BASE_PER_EMPLOYEE.put("47", 0.112); // 경북 – 철강·섬유
        REGIONAL_BASE_PER_EMPLOYEE.put("48", 0.132); // 경남 – 조선·기계
        REGIONAL_BASE_PER_EMPLOYEE.put("50", 0.072); // 제주 – 관광·서비스
    }

    // 업종 배출 가중치 (ksicCode 앞 2자리 기준)
    private static final Map<String, Double> INDUSTRY_MULTIPLIER = new HashMap<>();
    static {
        INDUSTRY_MULTIPLIER.put("26", 1.8);  // 전자·반도체
        INDUSTRY_MULTIPLIER.put("24", 2.5);  // 1차 금속 (고로)
        INDUSTRY_MULTIPLIER.put("20", 2.2);  // 화학제품
        INDUSTRY_MULTIPLIER.put("23", 2.0);  // 비금속 광물 (시멘트)
        INDUSTRY_MULTIPLIER.put("29", 1.3);  // 기계
        INDUSTRY_MULTIPLIER.put("30", 1.2);  // 자동차
        INDUSTRY_MULTIPLIER.put("13", 1.1);  // 섬유·의류
        INDUSTRY_MULTIPLIER.put("10", 1.0);  // 식품
        INDUSTRY_MULTIPLIER.put("62", 0.6);  // SW·IT 서비스
        INDUSTRY_MULTIPLIER.put("64", 0.5);  // 금융·보험
        INDUSTRY_MULTIPLIER.put("56", 0.7);  // 음식·숙박
    }

    // 전기 계절 지수 (index 0 = 1월 ~ index 11 = 12월)
    // 여름(7~8월) 냉방 피크, 겨울(1월) 조명·난방 보조 전기
    private static final double[] ELEC_SEASONAL = {
            1.20, 1.10, 1.00, 0.88, 0.88, 1.10,
            1.42, 1.45, 1.00, 0.88, 1.00, 1.28
    };

    // 가스 계절 지수 — 겨울(1~2월) 난방 피크, 여름 최저
    private static final double[] GAS_SEASONAL = {
            2.00, 1.80, 1.30, 0.80, 0.60, 0.50,
            0.45, 0.45, 0.60, 0.80, 1.30, 1.90
    };

    // 전기:가스 배출 비중 (일반 제조업 기준)
    private static final double ELEC_WEIGHT = 0.70;
    private static final double GAS_WEIGHT  = 0.30;

    /**
     * 우리 기업의 월별 탄소 배출량 Mock 생성 (tCO2eq).
     * companyId 기반으로 성과 계수를 결정하여 기업마다 다른 배출 프로필을 가집니다.
     * - 우수(companyId % 20 < 8):  지역 평균 대비 70~90% (절감)
     * - 평균(companyId % 20 < 15): 지역 평균 대비 90~110% (보통)
     * - 미흡(companyId % 20 >= 15): 지역 평균 대비 110~135% (초과)
     */
    public double[] generateCompanyData(Long companyId, int year, String regionCode,
                                         String ksicCode, int employeeCount) {
        double base = calcBase(regionCode, ksicCode, employeeCount);
        double perf = derivePerformanceFactor(companyId);
        Random rng  = new Random(companyId * 7919L + (long) year * 1_000 + employeeCount);
        double[] result = new double[12];
        for (int m = 0; m < 12; m++) {
            double seasonal = ELEC_SEASONAL[m] * ELEC_WEIGHT + GAS_SEASONAL[m] * GAS_WEIGHT;
            double noise    = 0.85 + rng.nextDouble() * 0.30; // ±15% 개별 변동
            result[m] = round2(base * seasonal * noise * perf);
        }
        return result;
    }

    /** 우리 기업 전기 기여분만 반환 (합산의 ELEC_WEIGHT 비율). */
    public double[] generateCompanyElec(Long companyId, int year, String regionCode,
                                         String ksicCode, int employeeCount) {
        double base = calcBase(regionCode, ksicCode, employeeCount);
        double perf = derivePerformanceFactor(companyId);
        Random rng  = new Random(companyId * 7919L + (long) year * 1_000 + employeeCount);
        double[] result = new double[12];
        for (int m = 0; m < 12; m++) {
            double noise = 0.85 + rng.nextDouble() * 0.30;
            result[m] = round2(base * ELEC_SEASONAL[m] * ELEC_WEIGHT * noise * perf);
        }
        return result;
    }

    /**
     * companyId 기반으로 기업별 고유 성과 계수를 결정합니다.
     * 같은 기업은 항상 같은 값을 반환하며, 호출할 때마다 바뀌지 않습니다.
     */
    private double derivePerformanceFactor(Long companyId) {
        int bucket = (int)(companyId % 20);
        if (bucket < 0) bucket += 20; // 음수 방어
        if (bucket < 8)  return 0.70 + (bucket / 8.0)        * 0.20; // 0.70~0.90 우수
        if (bucket < 15) return 0.90 + ((bucket - 8) / 7.0)  * 0.20; // 0.90~1.10 평균
        return              1.10 + ((bucket - 15) / 5.0) * 0.25; // 1.10~1.35 미흡
    }

    /** 지역 평균 전기 기여분만 반환. */
    public double[] generateRegionalElec(int year, String regionCode,
                                          String ksicCode, int employeeCount) {
        double base = calcBase(regionCode, ksicCode, employeeCount);
        // 지역 평균은 기업 고유값과 무관하게 지역+업종 기준 고정 시드 사용
        Random rng = new Random((long) year * 999 + regionCode.hashCode() + 12_345L);
        double[] result = new double[12];
        for (int m = 0; m < 12; m++) {
            double noise = 0.90 + rng.nextDouble() * 0.20;
            result[m] = round2(base * ELEC_SEASONAL[m] * ELEC_WEIGHT * noise);
        }
        return result;
    }

    /**
     * 동일 지역·업종 기업들의 월별 평균 탄소 배출량 Mock 생성 (tCO2eq).
     * 모집단 평균이므로 노이즈를 ±10%로 제한.
     */
    public double[] generateRegionalAverage(int year, String regionCode,
                                             String ksicCode, int employeeCount) {
        double base = calcBase(regionCode, ksicCode, employeeCount);
        Random rng = new Random((long) year * 999 + regionCode.hashCode() + 12_345L);
        double[] result = new double[12];
        for (int m = 0; m < 12; m++) {
            double seasonal = ELEC_SEASONAL[m] * ELEC_WEIGHT + GAS_SEASONAL[m] * GAS_WEIGHT;
            double noise    = 0.90 + rng.nextDouble() * 0.20; // ±10% 노이즈
            result[m] = round2(base * seasonal * noise);
        }
        return result;
    }

    private double calcBase(String regionCode, String ksicCode, int employeeCount) {
        String regionKey = (regionCode != null && regionCode.length() >= 2)
                ? regionCode.substring(0, 2) : "11";
        double regionalBase = REGIONAL_BASE_PER_EMPLOYEE.getOrDefault(regionKey, 0.090);

        String industryCd = (ksicCode != null && ksicCode.length() >= 2)
                ? ksicCode.substring(0, 2) : "26";
        double industryMult = INDUSTRY_MULTIPLIER.getOrDefault(industryCd, 1.0);

        return regionalBase * industryMult * employeeCount;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
