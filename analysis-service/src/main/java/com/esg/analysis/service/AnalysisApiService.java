package com.esg.analysis.service;

import com.esg.analysis.client.AuthServiceClient;
import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.AnalysisResultResponse;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.common.dto.CompanyResponse;
import com.esg.analysis.service.domain.Company;
import com.esg.analysis.service.domain.ESGEvidenceMatch;
import com.esg.analysis.service.domain.ESGIndicator;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.esg.analysis.service.repository.CompanyRepository;
import com.esg.analysis.service.repository.ESGEvidenceMatchRepository;
import com.esg.analysis.service.repository.ESGIndicatorRepository;
import com.esg.analysis.util.FileHashUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.Refill;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisApiService {

    private final AnalysisReportRepository analysisReportRepository;
    private final RedissonClient redissonClient;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final PointServiceClient pointServiceClient;
    private final ESGEvidenceMatchRepository evidenceMatchRepository;
    private final CompanyRepository companyRepository;
    private final ESGIndicatorRepository esgIndicatorRepository;
    private final EnvironmentBenchmarkService environmentBenchmarkService;
    private final AuthServiceClient authServiceClient;
    private final BenchmarkService benchmarkService;

    private static final String CACHE_PREFIX    = "analysis:cache:";
    private static final String COOLDOWN_PREFIX = "analysis:cooldown:";

    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();

    // ═══════════════════════════════════════════════════════════════════════
    // 결과 조회
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * 분석 결과를 React 프론트 렌더링 전용 DTO로 반환합니다.
     * - null 필드는 @JsonInclude(NON_NULL)로 JSON에서 제거됩니다.
     * - 구버전 캐시(eScore 등 null)는 0으로 기본값 처리됩니다.
     * - pageNumber = -1은 null로 변환됩니다.
     * - analyzedAt은 초 단위(19자) ISO-8601로 정규화됩니다.
     * - esgChart로 차트 전용 구조를 제공합니다.
     */
    public AnalysisResultResponse getAnalysisResult(Long analysisId) {
        AnalysisReport report = analysisReportRepository.findById(analysisId)
                .orElseThrow(() -> new IllegalArgumentException("분석 결과 없음: " + analysisId));

        // PENDING / PROCESSING 상태에서 조회 시 404 반환 — 폴링 fallback이 오조기 이동하는 버그 방지
        if (!"COMPLETED".equals(report.getStatus())) {
            throw new IllegalArgumentException("분석이 완료되지 않았습니다 (상태: " + report.getStatus() + ")");
        }

        // ── 1. reportContent JSON 역직렬화 ──────────────────────────────────
        AnalysisResultCache cache = new AnalysisResultCache();
        if (report.getReportContent() != null && !report.getReportContent().isBlank()) {
            try {
                cache = objectMapper.readValue(report.getReportContent(), AnalysisResultCache.class);
            } catch (Exception e) {
                log.warn("[Result] reportContent JSON 파싱 실패 analysisId={}: {}", analysisId, e.getMessage());
            }
        }

        // ── 2. null-safe 스칼라 기본값 처리 ─────────────────────────────────
        int     eScore           = cache.getEScore()           != null ? cache.getEScore()           : 0;
        int     sScore           = cache.getSScore()           != null ? cache.getSScore()           : 0;
        int     gScore           = cache.getGScore()           != null ? cache.getGScore()           : 0;
        int     totalScore       = cache.getTotalScore()       != null ? cache.getTotalScore()       : 0;
        int     overallConf      = cache.getOverallConfidence() != null ? cache.getOverallConfidence() : 0;
        String  finalGrade       = cache.getFinalGrade()       != null ? cache.getFinalGrade()       : "N/A";
        // analyzedAt: 나노초 제거 → "2026-05-14T10:30:00" (19자 ISO-8601)
        String  analyzedAt       = normalizeAnalyzedAt(cache.getAnalyzedAt());
        // ecoPoints null → 0 (에코포인트 미참여 기업)
        long    ecoPoints        = report.getEcoPoints()        != null ? report.getEcoPoints()        : 0L;
        double  carbonKg         = report.getCarbonReductionKg() != null ? report.getCarbonReductionKg() : 0.0;
        double  trees            = report.getEquivalentTrees()   != null ? report.getEquivalentTrees()   : 0.0;

        // ── 3. Company 정보 — auth-service 최신 데이터 동기화 ───────────────
        // auth-service를 우선 조회하여 직접 사용. 실패 시 로컬 Company 테이블로 폴백.
        Company company = companyRepository.findById(report.getCompanyId()).orElse(null);

        String syncedName       = null;
        String syncedIndustry   = null;
        String syncedKsicCode   = null;
        String syncedRegionCode = null;
        String syncedRegionName = null;
        Integer syncedEmployees = null;

        try {
            CompanyResponse authCo = authServiceClient.getCompanyById(report.getCompanyId());
            log.info("[CompanySync] auth-service RAW 응답 — companyId={} name='{}' industryName='{}' ksicCode='{}' regionCode='{}' regionName='{}' employeeCount={}",
                    report.getCompanyId(),
                    authCo != null ? authCo.name()          : "null(응답 없음)",
                    authCo != null ? authCo.industryName()  : "null",
                    authCo != null ? authCo.ksicCode()      : "null",
                    authCo != null ? authCo.regionCode()    : "null",
                    authCo != null ? authCo.regionName()    : "null",
                    authCo != null ? authCo.employeeCount() : "null");
            if (authCo != null) {
                syncedName       = authCo.name();
                syncedIndustry   = authCo.industryName();
                syncedKsicCode   = authCo.ksicCode()      != null ? authCo.ksicCode()      : "DEFAULT";
                syncedRegionCode = authCo.regionCode()    != null ? authCo.regionCode()    : "11";
                syncedRegionName = authCo.regionName();
                syncedEmployees  = authCo.employeeCount() != null ? authCo.employeeCount() : 100;

                // 로컬 Company 테이블을 auth-service 최신값으로 덮어쓰기
                benchmarkService.saveProfileRaw(report.getCompanyId(),
                        syncedName, syncedRegionCode, syncedKsicCode, syncedEmployees, syncedIndustry);

                log.info("[CompanySync] auth-service 동기화 완료 — companyId={} name={} industry={} ksic={} region={} employees={}",
                        report.getCompanyId(), syncedName, syncedIndustry,
                        syncedKsicCode, syncedRegionCode, syncedEmployees);
            }
        } catch (Exception e) {
            log.warn("[CompanySync] auth-service 조회 실패 — 로컬 Company 데이터 사용 companyId={}: {}",
                    report.getCompanyId(), e.getMessage());
            if (company != null) {
                syncedName       = company.getName();
                syncedIndustry   = company.getIndustryName();
                syncedKsicCode   = company.getKsicCode();
                syncedRegionCode = company.getRegionCode();
                syncedRegionName = company.getRegionName();
                syncedEmployees  = company.getEmployeeCount();
                log.info("[CompanySync] 로컬 데이터 사용 — companyId={} name={} industry={} ksic={} region={} employees={}",
                        report.getCompanyId(), syncedName, syncedIndustry,
                        syncedKsicCode, syncedRegionCode, syncedEmployees);
            }
        }

        // auth-service 값 우선, 로컬 Company 폴백, 최종 기본값 순
        String companyName = syncedName     != null ? syncedName
                : (company != null ? company.getName() : "기업 #" + report.getCompanyId());
        String industry    = syncedIndustry != null ? syncedIndustry
                : (company != null && company.getIndustryName() != null ? company.getIndustryName() : "미분류");

        // ── 4. Evidence Matches (DB) — pageNumber/-1 → null, confidenceLevel null → "LOW" ──
        Map<String, String> indicatorTitleMap = esgIndicatorRepository.findAll().stream()
                .collect(Collectors.toMap(ESGIndicator::getCode, ESGIndicator::getTitle));

        List<ESGEvidenceMatch> matches = evidenceMatchRepository.findByAnalysisId(analysisId);
        List<AnalysisResultResponse.EvidenceMatchDto> evidenceMatchDtos = matches.stream()
                .map(m -> AnalysisResultResponse.EvidenceMatchDto.builder()
                        .indicatorCode(m.getIndicatorCode())
                        .indicatorTitle(indicatorTitleMap.getOrDefault(m.getIndicatorCode(), m.getIndicatorCode()))
                        .evidenceText(m.getEvidenceText())
                        .similarity(m.getSimilarity())
                        .finalScore(m.getFinalScore())
                        .retrievalRank(m.getRetrievalRank())
                        .isValidEvidence(m.getIsValidEvidence())
                        .confidenceLevel(m.getConfidenceLevel() != null ? m.getConfidenceLevel().name() : "LOW")
                        .pageNumber(m.getPageNumber() != null && m.getPageNumber() > 0 ? m.getPageNumber() : null)
                        .sourceFile(m.getSourceFile())
                        .numericMatchLevel(m.getNumericMatchLevel())
                        .numericDiffPercent(m.getNumericDiffPercent())
                        .inputValue(m.getInputValue())
                        .extractedValue(m.getExtractedValue())
                        .unit(m.getUnit())
                        .build())
                .collect(Collectors.toList());

        // ── 5. 벤치마크 비교 ────────────────────────────────────────────────────
        // company 값 우선순위: (1) 현재 세션 사용자 수동 입력 > (2) environment_data CSV
        // benchmark는 업종 평균 비교 전용 — 추정/mock 값을 company 값으로 절대 사용하지 않음.
        AnalysisResultResponse.BenchmarkComparisonDto benchmarkComparison = null;
        int    empCount      = syncedEmployees  != null ? syncedEmployees
                : (company != null && company.getEmployeeCount() != null ? company.getEmployeeCount() : 100);
        String ksicCode      = syncedKsicCode   != null ? syncedKsicCode
                : (company != null && company.getKsicCode()      != null ? company.getKsicCode()      : "DEFAULT");
        String regionDisplay = syncedRegionName != null ? syncedRegionName
                : (company != null ? company.getRegionName() : null);

        // Priority 1: 현재 분석 세션의 사용자 입력값 (evidenceMatches.inputValue)
        Map<String, Double> userInputMetrics = extractUserInputMetrics(evidenceMatchDtos);

        if (syncedName != null || company != null || !userInputMetrics.isEmpty()) {
            try {
                EnvironmentBenchmarkService.EnvironmentValues industryVals =
                        environmentBenchmarkService.getBenchmarkScaled(ksicCode, empCount);

                if (!"NONE".equals(industryVals.getSource())) {
                    Double compElec, compGas, compCarb, compWaste, compWater;
                    String dataSource;

                    if (!userInputMetrics.isEmpty()) {
                        // Priority 1: 사용자가 직접 입력한 값 사용 (없는 항목은 extractedValue fallback 포함)
                        compElec  = userInputMetrics.get("electricity");
                        compGas   = userInputMetrics.get("gas");
                        compCarb  = userInputMetrics.get("carbon");
                        compWaste = userInputMetrics.get("waste");
                        compWater = userInputMetrics.get("water");
                        dataSource = "USER_INPUT";
                        log.debug("[BenchmarkCompany] water={} (null이면 벤치마크 미표시)", compWater);
                        log.info("[BenchmarkCompany] 사용자 입력값 사용 analysisId={} keys={}", analysisId, userInputMetrics.keySet());
                    } else {
                        // Priority 2: environment_data 테이블 (CSV 업로드 기반 실측 데이터)
                        EnvironmentBenchmarkService.EnvironmentValues companyVals;
                        try {
                            companyVals = environmentBenchmarkService.getActualOrBenchmark(
                                    report.getCompanyId(), ksicCode, empCount);
                        } catch (Exception inner) {
                            companyVals = EnvironmentBenchmarkService.EnvironmentValues.empty();
                            log.warn("[BenchmarkCompany] environment_data 조회 실패 → company null analysisId={}", analysisId);
                        }
                        if ("ACTUAL".equals(companyVals.getSource())) {
                            compElec  = companyVals.getElectricityKwh();
                            compGas   = companyVals.getGasMj();
                            compCarb  = companyVals.getCarbonTco2();
                            compWaste = companyVals.getWasteKg();
                            compWater = companyVals.getWaterM3();
                            dataSource = "ACTUAL";
                            log.info("[BenchmarkCompany] environment_data 실측값 사용 analysisId={}", analysisId);
                        } else {
                            // 실제 company 데이터 없음 → 추정값 사용 금지, null 유지
                            compElec = compGas = compCarb = compWaste = compWater = null;
                            dataSource = "NONE";
                            log.info("[BenchmarkCompany] 사용자 데이터 없음 → company 값 null (비교 불가) analysisId={}", analysisId);
                        }
                    }

                    // USER_INPUT은 연간 기준, getBenchmarkScaled()는 월간 기준 → 연간 환산 필요
                    // ACTUAL(CSV 실측)은 월간 기준끼리 비교 → 환산 불필요
                    final double annualFactor = "USER_INPUT".equals(dataSource) ? 12.0 : 1.0;
                    Double indElec  = industryVals.getElectricityKwh() != null ? industryVals.getElectricityKwh()  * annualFactor : null;
                    Double indGas   = industryVals.getGasMj()          != null ? industryVals.getGasMj()           * annualFactor : null;
                    Double indCarb  = industryVals.getCarbonTco2()     != null ? industryVals.getCarbonTco2()      * annualFactor : null;
                    Double indWaste = industryVals.getWasteKg()        != null ? industryVals.getWasteKg()         * annualFactor : null;
                    Double indWater = industryVals.getWaterM3()        != null ? industryVals.getWaterM3()         * annualFactor : null;
                    log.info("[BenchmarkAnnual] dataSource={} annualFactor={} indElec={} indGas={} indCarb={} indWaste={} indWater={}",
                            dataSource, annualFactor, indElec, indGas, indCarb, indWaste, indWater);

                    benchmarkComparison = AnalysisResultResponse.BenchmarkComparisonDto.builder()
                            .industry(industry)
                            .regionName(regionDisplay)
                            .companyDataSource(dataSource)
                            .companyElectricityKwh(compElec).industryAvgElectricityKwh(indElec)
                            .companyGasMj(compGas).industryAvgGasMj(indGas)
                            .companyCarbonTco2(compCarb).industryAvgCarbonTco2(indCarb)
                            .companyWasteKg(compWaste).industryAvgWasteKg(indWaste)
                            .companyWaterM3(compWater).industryAvgWaterM3(indWater)
                            .metrics(buildBenchmarkMetrics(
                                    compElec, compGas, compCarb, compWaste, compWater,
                                    indElec, indGas, indCarb, indWaste, indWater, industryVals))
                            .build();
                } else {
                    log.warn("[BenchmarkIndustry] 업종 벤치마크 없음 — 비교 생략 analysisId={}", analysisId);
                }
            } catch (Exception e) {
                log.warn("[BenchmarkFail] 벤치마크 조회 실패 — 비교 생략 analysisId={}: {}", analysisId, e.getMessage());
            }
        }

        // ── 6. Confidence Penalty & Grade Adjustment ─────────────────────────
        boolean isBenchmarkFb = benchmarkComparison != null
                && !"ACTUAL".equals(benchmarkComparison.getCompanyDataSource());

        long eEvidenceCount = evidenceMatchDtos.stream()
                .filter(e -> e.getIndicatorCode() != null && e.getIndicatorCode().startsWith("E"))
                .count();
        long totalValidEvidenceCount = evidenceMatchDtos.stream()
                .filter(e -> Boolean.TRUE.equals(e.getIsValidEvidence()))
                .count();
        long sgEvidenceCount = totalValidEvidenceCount - eEvidenceCount;

        boolean eExtractionFailure = eEvidenceCount == 0;
        // 실제 분석 실패: E evidence 없고 S/G evidence도 3건 미만 → retrieval 자체가 실패한 경우
        boolean actualRetrievalFailure = eExtractionFailure && totalValidEvidenceCount < 3;

        log.info("[ConfidencePenalty] analysisId={} benchmarkFallback={} eEvidence={} sgEvidence={}" +
                        " totalEvidence={} actualRetrievalFailure={}",
                analysisId, isBenchmarkFb, eEvidenceCount, sgEvidenceCount,
                totalValidEvidenceCount, actualRetrievalFailure);

        boolean carbonEvidence      = evidenceMatchDtos.stream().anyMatch(e -> "E-103".equals(e.getIndicatorCode()));
        boolean electricityEvidence = evidenceMatchDtos.stream().anyMatch(e -> "E-101".equals(e.getIndicatorCode()));
        boolean gasEvidence         = evidenceMatchDtos.stream().anyMatch(e -> "E-102".equals(e.getIndicatorCode()));
        boolean wasteEvidence       = evidenceMatchDtos.stream().anyMatch(e -> "E-104".equals(e.getIndicatorCode()));
        boolean waterEvidence       = evidenceMatchDtos.stream().anyMatch(e -> "E-105".equals(e.getIndicatorCode()));
        String dataSource = benchmarkComparison != null ? benchmarkComparison.getCompanyDataSource() : "null";
        log.info("[E-BENCHMARK-FALLBACK] analysisId={} isBenchmarkFb={} companyDataSource={}" +
                        " carbon={} electricity={} gas={} waste={} water={}",
                analysisId, isBenchmarkFb, dataSource,
                carbonEvidence, electricityEvidence, gasEvidence, wasteEvidence, waterEvidence);

        // ── 6a. Session-level numeric verification override ──────────────────
        // DB의 environment_data 테이블이 아닌, 현재 분석 세션의 실제 검증 결과로 판단.
        // MANUAL 모드(isAutoSimulation=false) + E 지표 numericMatchLevel 존재 = 실측 데이터 검증 성공.
        boolean sessionHasActualNumericVerification =
                !Boolean.TRUE.equals(cache.getIsAutoSimulation()) &&
                evidenceMatchDtos.stream().anyMatch(e ->
                        e.getIndicatorCode() != null &&
                        e.getIndicatorCode().startsWith("E") &&
                        e.getNumericMatchLevel() != null);

        if (sessionHasActualNumericVerification && isBenchmarkFb) {
            isBenchmarkFb = false;
            // benchmarkComparison의 companyDataSource도 ACTUAL로 재설정
            // → 프론트의 "Estimated" 레이블 및 "Benchmark Estimation Applied" 경고 제거
            if (benchmarkComparison != null) {
                benchmarkComparison = AnalysisResultResponse.BenchmarkComparisonDto.builder()
                        .industry(benchmarkComparison.getIndustry())
                        .regionName(benchmarkComparison.getRegionName())
                        .companyDataSource("ACTUAL")
                        .companyElectricityKwh(benchmarkComparison.getCompanyElectricityKwh())
                        .industryAvgElectricityKwh(benchmarkComparison.getIndustryAvgElectricityKwh())
                        .companyGasMj(benchmarkComparison.getCompanyGasMj())
                        .industryAvgGasMj(benchmarkComparison.getIndustryAvgGasMj())
                        .companyCarbonTco2(benchmarkComparison.getCompanyCarbonTco2())
                        .industryAvgCarbonTco2(benchmarkComparison.getIndustryAvgCarbonTco2())
                        .companyWasteKg(benchmarkComparison.getCompanyWasteKg())
                        .industryAvgWasteKg(benchmarkComparison.getIndustryAvgWasteKg())
                        .companyWaterM3(benchmarkComparison.getCompanyWaterM3())
                        .industryAvgWaterM3(benchmarkComparison.getIndustryAvgWaterM3())
                        .metrics(benchmarkComparison.getMetrics())
                        .build();
            }
            String matchedIndicators = evidenceMatchDtos.stream()
                    .filter(e -> e.getIndicatorCode() != null && e.getIndicatorCode().startsWith("E")
                            && e.getNumericMatchLevel() != null)
                    .map(e -> e.getIndicatorCode() + ":" + e.getNumericMatchLevel())
                    .collect(Collectors.joining(","));
            log.info("[BenchmarkFallback] OVERRIDE analysisId={} reason=session_numeric_verification_success" +
                    " verified=[{}] → isBenchmarkFb=false companyDataSource=ACTUAL",
                    analysisId, matchedIndicators);
        }

        // benchmark 데이터는 비교 분석 전용 — ESG 등급 산정에 개입하지 않음.
        // isBenchmarkFb, actualRetrievalFailure는 로그/UI 참고용으로만 유지.
        log.info("[GradePolicy] analysisId={} benchmark=비교전용 grade={} isBenchmarkFb={} actualRetrievalFailure={}",
                analysisId, finalGrade, isBenchmarkFb, actualRetrievalFailure);

        // ── 7. 차트 전용 구조 빌드 ──────────────────────────────────────────
        AnalysisResultResponse.EsgChartDto esgChart =
                buildEsgChart(cache.getSections(), eScore, sScore, gScore, totalScore, finalGrade);

        return AnalysisResultResponse.builder()
                .analysisId(analysisId)
                .companyName(companyName)
                .industry(industry)
                .finalGrade(finalGrade)
                .eScore(eScore)
                .sScore(sScore)
                .gScore(gScore)
                .totalScore(totalScore)
                .overallConfidence(overallConf)
                .analyzedAt(analyzedAt)
                .ecoPoints(ecoPoints > 0 ? ecoPoints : null)
                .carbonReductionKg(carbonKg > 0 ? carbonKg : null)
                .equivalentTrees(trees > 0 ? trees : null)
                .ecoSBonus(cache.getEcoSBonus() != null && cache.getEcoSBonus() > 0 ? cache.getEcoSBonus() : null)
                .esgPoolBefore(cache.getEsgPoolBefore() != null && cache.getEsgPoolBefore() > 0 ? cache.getEsgPoolBefore() : null)
                .ecoUsedPoints(cache.getEcoUsedPoints() != null && cache.getEcoUsedPoints() > 0 ? cache.getEcoUsedPoints() : null)
                .esgPoolAfter(cache.getEsgPoolAfter() != null ? cache.getEsgPoolAfter() : null)
                .fullReport(cache.getFullReport())
                .overallOpinion(cache.getOverallOpinion())
                .riskOpportunity(cache.getRiskOpportunity())
                .esgChart(esgChart)
                .sections(cache.getSections())
                .evidenceMapping(cache.getEvidenceMapping())
                .evidenceMatches(evidenceMatchDtos.isEmpty() ? null : evidenceMatchDtos)
                .benchmarkComparison(benchmarkComparison)
                .lowMismatchCount(cache.getLowMismatchCount())
                .gradeCeilingApplied(cache.getGradeCeilingApplied())
                .isBenchmarkFallback(benchmarkComparison != null
                        && !"ACTUAL".equals(benchmarkComparison.getCompanyDataSource())
                        ? true : null)
                .isAutoSimulation(cache.getIsAutoSimulation())
                .build();
    }

    // ── analyzedAt 정규화 ─────────────────────────────────────────────────────
    // LocalDateTime.now().toString() → "2026-05-14T10:30:00.123456789" (나노 포함)
    // 19자로 자르면 "2026-05-14T10:30:00" (ISO-8601 초 단위)
    private String oneStepDowngrade(String grade) {
        return switch (grade) {
            case "S" -> "A";
            case "A" -> "B";
            case "B" -> "C";
            case "C" -> "D";
            default  -> grade;
        };
    }

    private String normalizeAnalyzedAt(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return raw.length() > 19 ? raw.substring(0, 19) : raw;
    }

    // ── React 차트 전용 구조 빌드 ─────────────────────────────────────────────
    private AnalysisResultResponse.EsgChartDto buildEsgChart(
            List<AnalysisResultCache.SectionDto> sections,
            int eScore, int sScore, int gScore, int totalScore, String totalGrade) {

        if (sections == null || sections.isEmpty()) return null;

        Map<String, String> labels = Map.of(
                "Environment", "환경", "Social", "사회", "Governance", "지배구조");
        Map<String, String> shorts = Map.of(
                "Environment", "E", "Social", "S", "Governance", "G");
        Map<String, Integer> scores = Map.of("Environment", eScore, "Social", sScore, "Governance", gScore);

        List<AnalysisResultResponse.EsgChartDto.RadarPointDto> radar = sections.stream()
                .map(s -> AnalysisResultResponse.EsgChartDto.RadarPointDto.builder()
                        .category(shorts.getOrDefault(s.getCategory(), s.getCategory()))
                        .label(labels.getOrDefault(s.getCategory(), s.getCategory()))
                        .score(scores.getOrDefault(s.getCategory(), s.getScore()))
                        .grade(s.getGrade())
                        .build())
                .collect(Collectors.toList());

        List<AnalysisResultResponse.EsgChartDto.IndicatorBreakdownDto> breakdown = sections.stream()
                .flatMap(s -> s.getSubIndicators() == null ? Stream.empty()
                        : s.getSubIndicators().stream()
                                .map(sub -> AnalysisResultResponse.EsgChartDto.IndicatorBreakdownDto.builder()
                                        .kesgCode(sub.getKesgCode())
                                        .title(sub.getTitle())
                                        .score(sub.getScore())
                                        .grade(sub.getGrade())
                                        .confidence(sub.getConfidenceScore())
                                        .build()))
                .collect(Collectors.toList());

        return AnalysisResultResponse.EsgChartDto.builder()
                .radar(radar)
                .totalScore(totalScore)
                .totalGrade(totalGrade)
                .breakdown(breakdown.isEmpty() ? null : breakdown)
                .build();
    }

    // ── 사용자 입력값 추출: evidenceMatches.inputValue (E 지표) ──────────────
    // 반환 키: electricity / gas / carbon / waste / water
    private Map<String, Double> extractUserInputMetrics(
            List<AnalysisResultResponse.EvidenceMatchDto> dtos) {
        Map<String, String> CODE_TO_METRIC = Map.of(
                "E-101", "electricity", "E-102", "gas",  "E-103", "carbon",
                "E-104", "waste",       "E-105", "water");
        Map<String, Double> result = new java.util.HashMap<>();
        for (AnalysisResultResponse.EvidenceMatchDto dto : dtos) {
            String metric = CODE_TO_METRIC.get(dto.getIndicatorCode());
            if (metric == null) continue;
            if (dto.getInputValue() != null && dto.getInputValue() > 0) {
                result.putIfAbsent(metric, dto.getInputValue());
            } else if (dto.getExtractedValue() != null && dto.getExtractedValue() > 0) {
                // inputValue 미입력 시 OCR 추출값으로 벤치마크 비교에만 사용 (fallback)
                result.putIfAbsent(metric, dto.getExtractedValue());
            }
        }
        return result;
    }

    // ── 벤치마크 차트용 metrics 배열 빌드 ────────────────────────────────────
    // company 값은 사용자 실제 입력 또는 CSV 실측값. null이면 해당 지표 비교 미표시.
    private List<AnalysisResultResponse.BenchmarkComparisonDto.BenchmarkMetricDto> buildBenchmarkMetrics(
            Double cElec, Double cGas, Double cCarb, Double cWaste, Double cWater,
            Double iElec, Double iGas, Double iCarb, Double iWaste, Double iWater,
            EnvironmentBenchmarkService.EnvironmentValues ind) {
        return List.of(
                metricOf("전력 사용량",   "kWh",  cElec,  iElec,  ind.getElectricitySource()),
                metricOf("가스 사용량",   "Nm³",  cGas,   iGas,   ind.getGasSource()),
                metricOf("탄소 배출량",   "tCO₂", cCarb,  iCarb,  ind.getCarbonSource()),
                metricOf("폐기물 발생량", "kg",   cWaste, iWaste, ind.getWasteSource()),
                metricOf("용수 사용량",   "m³",   cWater, iWater, ind.getWaterSource())
        );
    }

    private AnalysisResultResponse.BenchmarkComparisonDto.BenchmarkMetricDto metricOf(
            String name, String unit, Double company, Double industryAvg, String source) {
        return AnalysisResultResponse.BenchmarkComparisonDto.BenchmarkMetricDto.builder()
                .name(name).unit(unit).company(company).industryAvg(industryAvg).source(source).build();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 내부 헬퍼
    // ═══════════════════════════════════════════════════════════════════════

    private Bucket resolveBucket(Long companyId) {
        return buckets.computeIfAbsent(companyId, id ->
                Bucket4j.builder()
                        .addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofDays(1))))
                        .build());
    }

    private String serializeToJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); }
        catch (Exception e) { log.error("직렬화 실패", e); return "{}"; }
    }
}
