package com.esg.analysis.config;

import com.esg.analysis.service.domain.EnvironmentBenchmark;
import com.esg.analysis.service.repository.EnvironmentBenchmarkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 공공 통계 기반 업종 벤치마크 CSV 로더.
 *
 * <p>CSV 파일: {@code classpath:benchmark/industry_benchmark_2023.csv}
 *
 * <p>데이터 출처:
 * <ul>
 *   <li>E-101 전력: 에너지경제연구원 「업종별 에너지원단위」 2023</li>
 *   <li>E-102 가스: 한국가스공사 도시가스 공급실적 통계 2023</li>
 *   <li>E-103 탄소: 환경부 온실가스종합정보센터(GIR) 국가 온실가스 인벤토리 2023</li>
 *   <li>E-104 폐기물: 환경부 「사업장 폐기물 발생 및 처리 현황」 2022 (2023 발간)</li>
 *   <li>E-105 수자원: K-water 산업용수 수요 통계 2023 / KOSIS 산업용수 이용 현황</li>
 * </ul>
 *
 * <p>기존 Mock Seed 데이터(source 컬럼 NULL) 감지 시 자동 교체합니다.
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class BenchmarkCsvLoader implements CommandLineRunner {

    private static final String BASE_YEAR   = "2023";
    private static final String CSV_PATH    = "benchmark/industry_benchmark_2023.csv";
    private static final int    COL_COUNT   = 18;

    private final EnvironmentBenchmarkRepository repository;

    @Override
    @Transactional
    public void run(String... args) {
        // 이미 통계 기반(source 채워진) 데이터가 존재하면 건너뜀
        if (repository.existsByKsicCodeAndBaseYearAndElectricitySourceIsNotNull("DEFAULT", BASE_YEAR)) {
            log.info("[BenchmarkCsvLoader] 공공 통계 기반 벤치마크 이미 로드됨 — 건너뜀");
            return;
        }

        // 구 Mock/Seed 데이터(source=NULL) 삭제 후 CSV로 교체
        long removed = repository.findAllByBaseYear(BASE_YEAR).stream()
                .filter(b -> b.getElectricitySource() == null).count();
        if (removed > 0) {
            repository.deleteAllByBaseYearAndSourceIsNull(BASE_YEAR);
            log.info("[BenchmarkCsvLoader] 기존 Mock 데이터 {}건 삭제 → 공공 통계 데이터로 교체", removed);
        }

        List<EnvironmentBenchmark> records = loadCsv();
        if (records.isEmpty()) {
            log.error("[BenchmarkCsvLoader] CSV 파싱 결과가 비어있음 — 로드 실패");
            return;
        }

        repository.saveAll(records);
        log.info("[BenchmarkCsvLoader] 공공 통계 기반 업종 벤치마크 {}개 로드 완료 (baseYear={})",
                records.size(), BASE_YEAR);
    }

    // ──────────────────────────────────────────────────────────────────────────

    private List<EnvironmentBenchmark> loadCsv() {
        List<EnvironmentBenchmark> result = new ArrayList<>();
        try {
            ClassPathResource res = new ClassPathResource(CSV_PATH);
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {

                reader.readLine(); // 헤더 스킵
                String line;
                int lineNo = 2;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) { lineNo++; continue; }
                    EnvironmentBenchmark bm = parseLine(line, lineNo);
                    if (bm != null) result.add(bm);
                    lineNo++;
                }
            }
        } catch (Exception e) {
            log.error("[BenchmarkCsvLoader] CSV 로드 실패: {}", e.getMessage(), e);
        }
        return result;
    }

    private EnvironmentBenchmark parseLine(String line, int lineNo) {
        String[] c = line.split(",", -1);
        if (c.length < COL_COUNT) {
            log.warn("[BenchmarkCsvLoader] 컬럼 수 부족 (line={}, cols={}/{}): {}",
                    lineNo, c.length, COL_COUNT, line);
            return null;
        }
        try {
            return EnvironmentBenchmark.builder()
                    .ksicCode(c[0].trim())
                    .industryName(c[1].trim())
                    // E-101 전력
                    .electricityPerEmployee(Double.parseDouble(c[2].trim()))
                    .electricityUnit(c[3].trim())
                    .electricitySource(c[4].trim())
                    // E-102 가스
                    .gasPerEmployee(Double.parseDouble(c[5].trim()))
                    .gasUnit(c[6].trim())
                    .gasSource(c[7].trim())
                    // E-103 탄소
                    .carbonPerEmployee(Double.parseDouble(c[8].trim()))
                    .carbonUnit(c[9].trim())
                    .carbonSource(c[10].trim())
                    // E-104 폐기물
                    .wastePerEmployee(Double.parseDouble(c[11].trim()))
                    .wasteUnit(c[12].trim())
                    .wasteSource(c[13].trim())
                    // E-105 수자원
                    .waterPerEmployee(Double.parseDouble(c[14].trim()))
                    .waterUnit(c[15].trim())
                    .waterSource(c[16].trim())
                    .baseYear(c[17].trim())
                    .build();
        } catch (NumberFormatException e) {
            log.warn("[BenchmarkCsvLoader] 숫자 파싱 실패 (line={}): {}", lineNo, e.getMessage());
            return null;
        }
    }
}
