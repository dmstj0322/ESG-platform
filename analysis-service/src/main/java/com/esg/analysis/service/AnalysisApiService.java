package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.AnalysisResultResponse;
import com.esg.analysis.service.domain.AnalysisReport;
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

    private final AsyncAnalysisProcessor asyncProcessor;
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

        // ── 3. Company 정보 ──────────────────────────────────────────────────
        Company company    = companyRepository.findById(report.getCompanyId()).orElse(null);
        String  companyName = company != null ? company.getName() : "기업 #" + report.getCompanyId();
        String  industry    = (company != null && company.getIndustryName() != null)
                ? company.getIndustryName() : "미분류";

        // ── 4. Evidence Matches (DB) — pageNumber/-1 → null, confidenceLevel null → "LOW" ──
        Map<String, String> indicatorTitleMap = esgIndicatorRepository.findAll().stream()
                .collect(Collectors.toMap(ESGIndicator::getCode, ESGIndicator::getTitle));

        List<ESGEvidenceMatch> matches = evidenceMatchRepository.findByAnalysisId(analysisId);
        List<AnalysisResultResponse.EvidenceMatchDto> evidenceMatchDtos = matches.stream()
                .map(m -> AnalysisResultResponse.EvidenceMatchDto.builder()
                        .indicatorCode(m.getIndicatorCode())
                        .indicatorTitle(indicatorTitleMap.getOrDefault(m.getIndicatorCode(), m.getIndicatorCode()))
                        .evidenceText(m.getEvidenceText())
                        .finalScore(m.getFinalScore())
                        .retrievalRank(m.getRetrievalRank())
                        .isValidEvidence(m.getIsValidEvidence())
                        .confidenceLevel(m.getConfidenceLevel() != null ? m.getConfidenceLevel().name() : "LOW")
                        .pageNumber(m.getPageNumber() != null && m.getPageNumber() > 0 ? m.getPageNumber() : null)
                        .sourceFile(m.getSourceFile())
                        .numericMatchLevel(m.getNumericMatchLevel())
                        .numericDiffPercent(m.getNumericDiffPercent())
                        .build())
                .collect(Collectors.toList());

        // ── 5. 벤치마크 비교 (metrics 배열 포함) ─────────────────────────────
        AnalysisResultResponse.BenchmarkComparisonDto benchmarkComparison = null;
        if (company != null) {
            try {
                int    empCount = company.getEmployeeCount() != null ? company.getEmployeeCount() : 100;
                String ksicCode = company.getKsicCode() != null ? company.getKsicCode() : "DEFAULT";

                // environment_data 테이블이 없어도 죽지 않도록 별도 try-catch
                EnvironmentBenchmarkService.EnvironmentValues companyVals;
                try {
                    companyVals = environmentBenchmarkService.getActualOrBenchmark(
                            report.getCompanyId(), ksicCode, empCount);
                } catch (Exception e) {
                    log.warn("[Result] environment_data 조회 실패 → benchmark fallback analysisId={}: {}", analysisId, e.getMessage());
                    companyVals = environmentBenchmarkService.getBenchmarkScaled(ksicCode, empCount);
                }

                EnvironmentBenchmarkService.EnvironmentValues industryVals =
                        environmentBenchmarkService.getBenchmarkScaled(ksicCode, empCount);

                if (!"NONE".equals(industryVals.getSource())) {
                    benchmarkComparison = AnalysisResultResponse.BenchmarkComparisonDto.builder()
                            .industry(company.getIndustryName())
                            .regionName(company.getRegionName())
                            .companyDataSource(companyVals.getSource())
                            .companyElectricityKwh(companyVals.getElectricityKwh())
                            .industryAvgElectricityKwh(industryVals.getElectricityKwh())
                            .companyGasMj(companyVals.getGasMj())
                            .industryAvgGasMj(industryVals.getGasMj())
                            .companyCarbonTco2(companyVals.getCarbonTco2())
                            .industryAvgCarbonTco2(industryVals.getCarbonTco2())
                            .companyWasteKg(companyVals.getWasteKg())
                            .industryAvgWasteKg(industryVals.getWasteKg())
                            .companyWaterM3(companyVals.getWaterM3())
                            .industryAvgWaterM3(industryVals.getWaterM3())
                            .metrics(buildBenchmarkMetrics(companyVals, industryVals))
                            .build();
                } else {
                    // 업종 벤치마크 DB도 없으면 임직원 수 기반 mock 사용
                    log.warn("[Result] 업종 벤치마크 없음 → mock 사용 analysisId={}", analysisId);
                    benchmarkComparison = buildMockBenchmark(
                            company.getIndustryName(), company.getRegionName(), empCount);
                }
            } catch (Exception e) {
                log.warn("[Result] 벤치마크 조회 실패 analysisId={}: {}", analysisId, e.getMessage());
            }
        }

        // ── 6. 차트 전용 구조 빌드 ──────────────────────────────────────────
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
                .build();
    }

    // ── analyzedAt 정규화 ─────────────────────────────────────────────────────
    // LocalDateTime.now().toString() → "2026-05-14T10:30:00.123456789" (나노 포함)
    // 19자로 자르면 "2026-05-14T10:30:00" (ISO-8601 초 단위)
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

    // ── 벤치마크 차트용 metrics 배열 빌드 ────────────────────────────────────
    private List<AnalysisResultResponse.BenchmarkComparisonDto.BenchmarkMetricDto> buildBenchmarkMetrics(
            EnvironmentBenchmarkService.EnvironmentValues co,
            EnvironmentBenchmarkService.EnvironmentValues ind) {
        return List.of(
                metricOf("전력 사용량",  "kWh",  co.getElectricityKwh(), ind.getElectricityKwh()),
                metricOf("가스 사용량",  "MJ",   co.getGasMj(),          ind.getGasMj()),
                metricOf("탄소 배출량",  "tCO₂", co.getCarbonTco2(),     ind.getCarbonTco2()),
                metricOf("폐기물 발생량", "kg",   co.getWasteKg(),        ind.getWasteKg()),
                metricOf("용수 사용량",  "m³",   co.getWaterM3(),        ind.getWaterM3())
        );
    }

    private AnalysisResultResponse.BenchmarkComparisonDto.BenchmarkMetricDto metricOf(
            String name, String unit, Double company, Double industryAvg) {
        return AnalysisResultResponse.BenchmarkComparisonDto.BenchmarkMetricDto.builder()
                .name(name).unit(unit).company(company).industryAvg(industryAvg).build();
    }

    /** environment_data / benchmark 테이블 모두 없을 때 임직원 수 비례 mock 반환 */
    private AnalysisResultResponse.BenchmarkComparisonDto buildMockBenchmark(
            String industryName, String regionName, int employeeCount) {
        double s = Math.max(employeeCount, 1) / 100.0;
        double cElec  = s * 145_000, iElec  = s * 150_000;
        double cGas   = s * 490,     iGas   = s * 500;
        double cCarb  = s * 28,      iCarb  = s * 30;
        double cWaste = s * 1_900,   iWaste = s * 2_000;
        double cWater = s * 780,     iWater = s * 800;
        return AnalysisResultResponse.BenchmarkComparisonDto.builder()
                .industry(industryName != null ? industryName : "기타 업종")
                .regionName(regionName)
                .companyDataSource("MOCK")
                .companyElectricityKwh(cElec).industryAvgElectricityKwh(iElec)
                .companyGasMj(cGas).industryAvgGasMj(iGas)
                .companyCarbonTco2(cCarb).industryAvgCarbonTco2(iCarb)
                .companyWasteKg(cWaste).industryAvgWasteKg(iWaste)
                .companyWaterM3(cWater).industryAvgWaterM3(iWater)
                .metrics(List.of(
                        metricOf("전력 사용량",   "kWh",  cElec,  iElec),
                        metricOf("가스 사용량",   "MJ",   cGas,   iGas),
                        metricOf("탄소 배출량",   "tCO₂", cCarb,  iCarb),
                        metricOf("폐기물 발생량", "kg",   cWaste, iWaste),
                        metricOf("용수 사용량",   "m³",   cWater, iWater)))
                .build();
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

    /**
     * 분석 시작 진입점.
     * 파일 복사 → 검증 → PENDING DB 저장 → 202 반환.
     * Upstage 호출과 Kafka 발행은 AsyncAnalysisProcessor에서 백그라운드 처리.
     */
    public Long initiateAnalysis(Long userId, Long companyId, MultipartFile file) {

        // ── 0. 파일 바이트를 요청 스레드에서 즉시 복사 ─────────────────────
        // MultipartFile 스트림은 요청 범위(request-scoped)이므로 비동기 스레드에서
        // 접근하면 이미 닫혀 있다. 여기서 byte[]로 복사해야 한다.
        byte[] fileBytes;
        try {
            fileBytes = file.getBytes();
        } catch (Exception e) {
            throw new RuntimeException("파일을 읽는 중 오류가 발생했습니다.");
        }
        String filename    = file.getOriginalFilename();
        String contentType = file.getContentType();

        // ── 1. API 쿼터 체크 ──────────────────────────────────────────────
        Bucket bucket = resolveBucket(companyId);
        if (!bucket.tryConsume(1)) {
            log.warn("★쿼터 초과★ 기업 ID: {}", companyId);
            throw new RuntimeException("오늘 분석 가능한 횟수(5회)를 초과하였습니다. 내일 다시 시도해주세요.");
        }

        // ── 2. 파일 해시 생성 ─────────────────────────────────────────────
        String fileHash;
        try {
            fileHash = FileHashUtil.calculateChecksum(file);
        } catch (Exception e) {
            bucket.addTokens(1);
            throw new RuntimeException("파일 해시 계산 중 오류가 발생했습니다.");
        }

        // ── 3. Redis 캐시 확인 (동일 파일 재분석 방지) ────────────────────
        AnalysisResultCache cachedResult = (AnalysisResultCache)
                redisTemplate.opsForValue().get(CACHE_PREFIX + fileHash);
        if (cachedResult != null) {
            log.info("[Cache Hit] 동일 파일 hash={}", fileHash);
            AnalysisReport savedReport = transactionTemplate.execute(status -> {
                AnalysisReport report = AnalysisReport.builder()
                        .memberId(userId)
                        .companyId(companyId)
                        .status("COMPLETED")
                        .reportContent(serializeToJson(cachedResult))
                        .grade(cachedResult.getFinalGrade())
                        .build();
                return analysisReportRepository.save(report);
            });
            // WS COMPLETE 통보는 비동기로 (HTTP 스레드 블로킹 제거)
            asyncProcessor.notifyCompleteAfterDelay(companyId);
            return savedReport.getId();
        }

        // ── 4. Cooldown 체크 ──────────────────────────────────────────────
        if (Boolean.TRUE.equals(redisTemplate.hasKey(COOLDOWN_PREFIX + companyId))) {
            bucket.addTokens(1);
            throw new RuntimeException("잦은 분석은 금지! 1분 뒤에 새로운 파일을 올려주세요.");
        }

        // ── 5. 이미 진행 중인 분석 존재 여부 확인 ────────────────────────
        // PENDING: DB 저장 후 Kafka 발행 전 / PROCESSING: Consumer가 처리 중
        if (analysisReportRepository.existsByCompanyIdAndStatusIn(
                companyId, List.of("PENDING", "PROCESSING"))) {
            bucket.addTokens(1);
            throw new RuntimeException("현재 분석이 이미 진행 중입니다. 완료 후 다시 시도해주세요.");
        }

        // ── 6. 분산 락 (같은 파일 동시 중복 방지) ────────────────────────
        String lockKey = "analysis:lock:" + companyId + ":" + fileHash;
        RLock lock = redissonClient.getLock(lockKey);
        try {
            if (!lock.tryLock(0, 10, TimeUnit.SECONDS)) {
                log.warn("★중복 분석 요청 차단★ 기업 ID: {}", companyId);
                bucket.addTokens(1);
                throw new RuntimeException("동일 문서에 대한 분석이 이미 접수되었습니다.");
            }

            // ── 7. point-service 호출 ─────────────────────────────────────
            Long userPoints = 0L;
            try {
                userPoints = pointServiceClient.getMemberPointBalance(userId);
            } catch (Exception e) {
                log.error("[point-service] 호출 실패 → 0점으로 진행: {}", e.getMessage());
            }

            // ── 8. PENDING 레코드 DB 저장 ────────────────────────────────
            final Long finalUserPoints = userPoints;
            AnalysisReport savedReport = transactionTemplate.execute(status -> {
                AnalysisReport analysis = AnalysisReport.builder()
                        .memberId(userId)
                        .companyId(companyId)
                        .status("PENDING")
                        .reportContent("분석이 예약되었습니다. 곧 시작됩니다...")
                        .build();
                return analysisReportRepository.save(analysis);
            });
            log.info("PENDING 저장 완료. analysisId={}", savedReport.getId());

            // ── 9. Cooldown 키 설정 (1분) ────────────────────────────────
            redisTemplate.opsForValue().set(COOLDOWN_PREFIX + companyId, "1", Duration.ofMinutes(1));

            // ── 10. 비동기 처리 위임 (Upstage + Kafka) ───────────────────
            asyncProcessor.processAsync(
                    savedReport.getId(), companyId,
                    fileBytes, filename, contentType,
                    fileHash, finalUserPoints);

            return savedReport.getId();  // 202 Accepted

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            bucket.addTokens(1);
            throw new RuntimeException("작업이 중단되었습니다.");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
