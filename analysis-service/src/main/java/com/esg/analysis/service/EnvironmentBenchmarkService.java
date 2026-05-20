package com.esg.analysis.service;

import com.esg.analysis.service.domain.EnvironmentBenchmark;
import com.esg.analysis.service.domain.EnvironmentData;
import com.esg.analysis.service.repository.EnvironmentBenchmarkRepository;
import com.esg.analysis.service.repository.EnvironmentDataRepository;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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
    public EnvironmentValues getBenchmarkScaled(String ksicCode, int employeeCount) {
        String prefix = (ksicCode != null && ksicCode.length() >= 2) ? ksicCode.substring(0, 2) : "";
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
                    "kWh", "MJ", "tCO₂", "kg", "m³",
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
