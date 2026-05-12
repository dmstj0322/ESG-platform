package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
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

    private static final String CACHE_PREFIX    = "analysis:cache:";
    private static final String COOLDOWN_PREFIX = "analysis:cooldown:";

    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();

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
