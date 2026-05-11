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
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisApiService {

    private final UpstageService upstageService;
    private final AnalysisReportRepository analysisReportRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final RedissonClient redissonClient;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final PointServiceClient pointServiceClient;
    private final SimpMessagingTemplate messagingTemplate;

    private static final String TOPIC = "esg-analysis-requests";
    private static final String CACHE_PREFIX = "analysis:cache:";

    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();

    private Bucket resolveBucket(Long companyId) {
        return buckets.computeIfAbsent(companyId, id ->
                Bucket4j.builder()
                        .addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofDays(1))))
                        .build()
        );
    }

    private String serializeToJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            log.error("직렬화 실패", e);
            return "{}";
        }
    }

    public Object initiateAnalysis(Long userId, Long companyId, MultipartFile file) {

        // 1. [F-204] API 쿼터 체크
        Bucket bucket = resolveBucket(companyId);
        if (!bucket.tryConsume(1)) {
            log.warn("★쿼터 초과★ 기업 ID: {}", companyId);
            throw new RuntimeException("오늘 분석 가능한 횟수(5회)를 초과하였습니다. 내일 다시 시도해주세요.");
        }
        log.info("★쿼터 확인 완료★ 남은 횟수: {}", bucket.getAvailableTokens());

        // 2. [F-301] 파일 해시 생성
        String fileHash;
        try {
            fileHash = FileHashUtil.calculateChecksum(file);
        } catch (Exception e) {
            log.error("파일 해시 계산 오류", e);
            throw new RuntimeException("파일을 읽는 중 오류가 발생했습니다.");
        }

        // 3. [F-301] Redis 캐시 확인
        String cacheKey = CACHE_PREFIX + fileHash;
        AnalysisResultCache cachedResult = (AnalysisResultCache) redisTemplate.opsForValue().get(cacheKey);

        if (cachedResult != null) {
            log.info(">>>> [F-301 Cache Hit] 중복 파일. Hash: {}", fileHash);

            // DB 저장 먼저
            transactionTemplate.execute(status -> {
                AnalysisReport report = AnalysisReport.builder()
                        .memberId(userId)
                        .companyId(companyId)
                        .status("COMPLETED")
                        .reportContent(serializeToJson(cachedResult))
                        .grade(cachedResult.getFinalGrade())
                        .build();
                return analysisReportRepository.save(report);
            });
            log.info(">>>> [Cache Hit] DB 저장 완료. 등급: {}", cachedResult.getFinalGrade());

            // 프론트 WS 구독 완료 대기 후 바로 COMPLETE 전송
            try {
                Thread.sleep(1500);
                messagingTemplate.convertAndSend("/topic/analysis/" + companyId, "COMPLETE");
                log.info(">>>> [Cache Hit] COMPLETE 전송 완료");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            return cachedResult;
        }

        // 4. [F-302] Cooldown 체크
        String cooldownKey = "analysis:cooldown:" + companyId;
        if (Boolean.TRUE.equals(redisTemplate.hasKey(cooldownKey))) {
            bucket.addTokens(1);
            throw new RuntimeException("잦은 분석은 금지! 5분 뒤에 새로운 파일을 올려주세요.");
        }

        // 5. [F-103] 분산 락
        String lockKey = "analysis:lock:" + companyId + ":" + fileHash;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            if (!lock.tryLock(0, 30, TimeUnit.SECONDS)) {
                log.warn("★중복 분석 요청 차단★ 기업 ID: {}", companyId);
                throw new RuntimeException("현재 해당 문서에 대한 분석이 이미 진행 중입니다.");
            }

            log.info("★락 획득 성공★ 기업 ID: {}", companyId);

            // 6. Upstage 호출
            String markdownContent;
            try {
                markdownContent = upstageService.parsePdfToMarkdown(file);
            } catch (IOException e) {
                log.error("Upstage 오류", e);
                throw new RuntimeException("문서 처리 중 서버 오류가 발생했습니다.");
            }

            // 7. [F-401] point-service 호출
            log.info(">>>> [F-401] point-service 호출 (memberId: {})", userId);
            Long userPoints = 0L;
            try {
                userPoints = pointServiceClient.getMemberPointBalance(userId);
                log.info(">>>> [F-401] 포인트 연동 성공: {}", userPoints);
            } catch (Exception e) {
                log.error(">>>> [F-401] point-service 호출 실패 → 0점으로 진행", e);
            }

            // 8. DB 저장 (PENDING)
            AnalysisReport savedAnalysis = transactionTemplate.execute(status -> {
                AnalysisReport analysis = AnalysisReport.builder()
                        .memberId(userId)
                        .companyId(companyId)
                        .status("PENDING")
                        .reportContent("분석이 예약되었습니다. 곧 시작됩니다...")
                        .build();
                return analysisReportRepository.save(analysis);
            });

            log.info("DB 저장 완료. Analysis ID: {}", savedAnalysis.getId());

            // 9. [F-104] Kafka 발행
            try {
                Map<String, Object> kafkaMessage = new HashMap<>();
                kafkaMessage.put("analysisId", savedAnalysis.getId());
                kafkaMessage.put("companyId", companyId);
                kafkaMessage.put("content", markdownContent);
                kafkaMessage.put("fileHash", fileHash);
                kafkaMessage.put("userPoints", userPoints);

                String jsonMessage = objectMapper.writeValueAsString(kafkaMessage);
                kafkaTemplate.send(TOPIC, String.valueOf(companyId), jsonMessage);
                log.info("Kafka 전송 완료. 포인트: {}", userPoints);
            } catch (Exception e) {
                log.error("Kafka 발행 에러", e);
                throw new RuntimeException("분석 대기열 등록에 실패했습니다.");
            }

            return savedAnalysis.getId();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("작업이 중단되었습니다.");
        } finally {
            if (lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.info("★락 해제★ 기업 ID: {}", companyId);
            }
        }
    }
}