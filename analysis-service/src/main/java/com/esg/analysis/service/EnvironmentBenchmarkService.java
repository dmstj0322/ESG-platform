package com.esg.analysis.service;

import com.esg.analysis.service.domain.EnvironmentBenchmark;
import com.esg.analysis.service.domain.EnvironmentData;
import com.esg.analysis.service.repository.EnvironmentBenchmarkRepository;
import com.esg.analysis.service.repository.EnvironmentDataRepository;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * K-ESG E 지표(E-101~E-105) 업종 벤치마크 조회 서비스.
 *
 * <p>우선순위:
 * <ol>
 *   <li>기업이 CSV로 업로드한 {@link EnvironmentData} (최근 월 기준)</li>
 *   <li>KSIC 코드 매핑 {@link EnvironmentBenchmark}</li>
 *   <li>"DEFAULT" 폴백 벤치마크</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EnvironmentBenchmarkService {

    private static final String BASE_YEAR = "2023";

    private final EnvironmentBenchmarkRepository benchmarkRepository;
    private final EnvironmentDataRepository      environmentDataRepository;

    // ──────────────────────────────────────────────────────────────────────────
    // 공개 API
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 기업의 실측 데이터(최신 월) 또는 업종 벤치마크를 반환합니다.
     * employeeCount로 per-employee 벤치마크를 회사 규모에 맞게 스케일링합니다.
     */
    public EnvironmentValues getActualOrBenchmark(Long companyId, String ksicCode, int employeeCount) {
        // 1. 실측 데이터 우선 (최신 월)
        Optional<EnvironmentData> latestActual =
                environmentDataRepository.findByCompanyIdOrderByYearMonthAsc(companyId)
                        .stream()
                        .reduce((first, second) -> second); // 마지막 = 최신

        if (latestActual.isPresent()) {
            EnvironmentData d = latestActual.get();
            log.info("[EnvBenchmark] 실측 데이터 사용 companyId={} yearMonth={}", companyId, d.getYearMonth());
            return EnvironmentValues.fromActual(d);
        }

        // 2. 업종 벤치마크 (스케일링)
        return getBenchmarkScaled(ksicCode, employeeCount);
    }

    /**
     * 업종 벤치마크를 임직원 수 기준으로 스케일링하여 반환합니다.
     * 기업 가입 시 자동 조회용.
     */
    // 한국어 업종명 → KSIC 2자리 코드 매핑 (회사 프로필에 텍스트로 저장된 경우 대응)
    private static final Map<String, String> INDUSTRY_NAME_TO_KSIC;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        // IT·소프트웨어
        m.put("소프트웨어",    "62"); m.put("it서비스",      "62"); m.put("it서비스업",    "62");
        m.put("정보통신",      "63"); m.put("it",            "62"); m.put("sw",           "62");
        m.put("정보기술",      "62"); m.put("소프트웨어개발", "62"); m.put("플랫폼",        "62");
        m.put("인터넷",        "63"); m.put("통신",          "61"); m.put("통신업",        "61");
        // 제조업
        m.put("제조업",        "10"); m.put("제조",          "10"); m.put("전자",          "26");
        m.put("반도체",        "26"); m.put("화학",          "20"); m.put("철강",          "24");
        m.put("자동차",        "30"); m.put("기계",          "29"); m.put("식품",          "10");
        m.put("섬유",          "13"); m.put("의류",          "13");
        // 금융·서비스
        m.put("금융",          "64"); m.put("보험",          "65"); m.put("증권",          "64");
        m.put("도소매",        "45"); m.put("유통",          "45"); m.put("건설",          "41");
        m.put("숙박",          "56"); m.put("음식",          "56"); m.put("음식업",        "56");
        // 에너지
        m.put("에너지",        "35"); m.put("전력",          "35"); m.put("가스공급",       "35");
        INDUSTRY_NAME_TO_KSIC = Collections.unmodifiableMap(m);
    }

    /** ksicCode에서 2자리 숫자 prefix 추출. 숫자 아니면 한국어 업종명 매핑 시도. */
    private String resolveKsicPrefix(String ksicCode) {
        if (ksicCode == null || ksicCode.isBlank()) return "";
        // 숫자 시작 → 앞 2자리 사용
        if (Character.isDigit(ksicCode.charAt(0))) {
            return ksicCode.length() >= 2 ? ksicCode.substring(0, 2) : ksicCode;
        }
        // 한국어/영문 업종명 → 소문자 정규화 후 키워드 매핑
        String lower = ksicCode.toLowerCase().replaceAll("[\\s·_\\-/]+", "");
        for (Map.Entry<String, String> e : INDUSTRY_NAME_TO_KSIC.entrySet()) {
            if (lower.contains(e.getKey())) return e.getValue();
        }
        log.warn("[EnvBenchmark] ksicCode 매핑 실패 '{}' → DEFAULT 사용", ksicCode);
        return "";
    }

    public EnvironmentValues getBenchmarkScaled(String ksicCode, int employeeCount) {
        String prefix = resolveKsicPrefix(ksicCode);
        EnvironmentBenchmark bm = benchmarkRepository.findByKsicCodeAndBaseYear(prefix, BASE_YEAR)
                .or(() -> benchmarkRepository.findByKsicCodeAndBaseYear("DEFAULT", BASE_YEAR))
                .orElse(null);

        if (bm == null) {
            log.warn("[EnvBenchmark] 벤치마크 없음 ksicCode={}", ksicCode);
            return EnvironmentValues.empty();
        }

        int emp = Math.max(employeeCount, 1);
        log.info("[EnvBenchmark] 공공 통계 기반 업종 벤치마크 적용 ksic={} 업종={} 임직원={} / 전력출처={}",
                prefix, bm.getIndustryName(), emp, bm.getElectricitySource());

        return EnvironmentValues.fromBenchmark(bm, emp);
    }

    /**
     * E 지표 코드(metric key)에 해당하는 업종 평균값 반환 (임직원 수 스케일링 적용).
     * 벤치마크 없으면 null 반환.
     *
     * @param metric "electricity" | "gas" | "carbon" | "waste" | "water"
     */
    /**
     * getBenchmarkScaled()는 월간 총량을 반환하므로 ×12 해서 연간 기준으로 변환.
     * E 지표 입력값이 연간 기준(ESG 보고 관행)이므로 동일 단위로 맞춤.
     */
    public Double getIndustryAvgForMetric(String ksicCode, int employeeCount, String metric) {
        EnvironmentValues vals = getBenchmarkScaled(ksicCode, employeeCount);
        if ("NONE".equals(vals.getSource())) return null;
        Double monthly = null;
        switch (metric.toLowerCase()) {
            case "electricity": monthly = vals.getElectricityKwh(); break;
            case "gas":         monthly = vals.getGasMj();          break;
            case "carbon":      monthly = vals.getCarbonTco2();     break;
            case "waste":       monthly = vals.getWasteKg();        break;
            case "water":       monthly = vals.getWaterM3();        break;
            default:            return null;
        }
        return monthly != null ? monthly * 12.0 : null;  // 월 → 연간 환산
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 값 홀더 (향후 DTO 변환 기준점)
    // ──────────────────────────────────────────────────────────────────────────

    @Getter
    public static class EnvironmentValues {
        private final Double electricityKwh;
        private final Double gasMj;
        private final Double carbonTco2;
        private final Double wasteKg;
        private final Double waterM3;

        /** 데이터 출처 구분: "ACTUAL" (기업 실측) / "BENCHMARK" (공공 통계 기반) / "NONE" */
        private final String source;

        // 단위 (벤치마크에서 전달, 실측 시 표준 단위 사용)
        private final String electricityUnit;
        private final String gasUnit;
        private final String carbonUnit;
        private final String wasteUnit;
        private final String waterUnit;

        // 지표별 데이터 출처 (UI/PDF 표시용)
        private final String electricitySource;
        private final String gasSource;
        private final String carbonSource;
        private final String wasteSource;
        private final String waterSource;

        private EnvironmentValues(Double elec, Double gas, Double carbon, Double waste, Double water,
                                  String source,
                                  String electricityUnit, String gasUnit, String carbonUnit,
                                  String wasteUnit, String waterUnit,
                                  String electricitySource, String gasSource, String carbonSource,
                                  String wasteSource, String waterSource) {
            this.electricityKwh   = elec;
            this.gasMj            = gas;
            this.carbonTco2       = carbon;
            this.wasteKg          = waste;
            this.waterM3          = water;
            this.source           = source;
            this.electricityUnit  = electricityUnit;
            this.gasUnit          = gasUnit;
            this.carbonUnit       = carbonUnit;
            this.wasteUnit        = wasteUnit;
            this.waterUnit        = waterUnit;
            this.electricitySource = electricitySource;
            this.gasSource         = gasSource;
            this.carbonSource      = carbonSource;
            this.wasteSource       = wasteSource;
            this.waterSource       = waterSource;
        }

        static EnvironmentValues fromActual(EnvironmentData d) {
            return new EnvironmentValues(
                    d.getElectricityKwh(), d.getGasMj(), d.getCarbonTco2(),
                    d.getWasteKg(), d.getWaterM3(), "ACTUAL",
                    "kWh", "Nm³", "tCO₂", "kg", "m³",
                    "기업 제출 실측 데이터", "기업 제출 실측 데이터", "기업 제출 실측 데이터",
                    "기업 제출 실측 데이터", "기업 제출 실측 데이터");
        }

        static EnvironmentValues fromBenchmark(EnvironmentBenchmark bm, int employeeCount) {
            return new EnvironmentValues(
                    scale(bm.getElectricityPerEmployee(), employeeCount),
                    scale(bm.getGasPerEmployee(),         employeeCount),
                    scale(bm.getCarbonPerEmployee(),      employeeCount),
                    scale(bm.getWastePerEmployee(),       employeeCount),
                    scale(bm.getWaterPerEmployee(),       employeeCount),
                    "BENCHMARK",
                    bm.getElectricityUnit(), bm.getGasUnit(), bm.getCarbonUnit(),
                    bm.getWasteUnit(), bm.getWaterUnit(),
                    bm.getElectricitySource(), bm.getGasSource(), bm.getCarbonSource(),
                    bm.getWasteSource(), bm.getWaterSource());
        }

        static EnvironmentValues empty() {
            return new EnvironmentValues(null, null, null, null, null, "NONE",
                    null, null, null, null, null,
                    null, null, null, null, null);
        }

        private static Double scale(Double perEmployee, int count) {
            return perEmployee != null ? perEmployee * count : null;
        }
    }
}
