package com.esg.analysis.service;

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
    private final RedisTemplate<String, Object> redisTemplate; // [F-301] 추가
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    private static final String TOPIC = "esg-analysis-requests";
    private static final String CACHE_PREFIX = "analysis:cache:";

    // [F-204] 기업별 호출 제한 버킷 저장소
    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * 기업별 API 호출 제한 버킷 생성/조회 (하루 5회)
     */
    private Bucket resolveBucket(Long companyId) {
        return buckets.computeIfAbsent(companyId, id ->
                Bucket4j.builder()
                        .addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofDays(1))))
                        .build()
        );
    }

    /**
     * 분석 시작 메서드
     */
    public Object initiateAnalysis(Long userId, Long companyId, MultipartFile file) {

        // 1. [F-204] API 쿼터 체크
        Bucket bucket = resolveBucket(companyId);
        if (!bucket.tryConsume(1)) {
            log.warn("★쿼터 초과★ 기업 ID: {}는 오늘의 분석 횟수를 모두 사용함", companyId);
            throw new RuntimeException("오늘 분석 가능한 횟수(5회)를 초과하였습니다. 내일 다시 시도해주세요.");
        }
        log.info("★쿼터 확인 완료★ 남은 횟수: {}", bucket.getAvailableTokens());

        // 2. [F-301] 파일 해시 생성 (기존 유틸리티 활용)
        String fileHash;
        try {
            fileHash = FileHashUtil.calculateChecksum(file);
        } catch (Exception e) {
            log.error("파일 해시 계산 중 오류 발생", e);
            throw new RuntimeException("파일을 읽는 중 오류가 발생했습니다.");
        }



        // 3. [F-301] Redis 캐시 확인 (중복 파일일 경우 즉시 반환)
        String cacheKey = CACHE_PREFIX + fileHash;
        AnalysisResultCache cachedResult = (AnalysisResultCache) redisTemplate.opsForValue().get(cacheKey);

        if (cachedResult != null) {
            log.info(">>>> [F-301 Cache Hit] 중복 파일 발견! 기존 리포트를 즉시 반환합니다. Hash: {}", fileHash);
            return cachedResult; // AI 호출 및 DB 저장 생략
        }

        // 4. [F-302] Cooldown 체크 (★해시 체크 다음, 분석 로직 직전)
        // 캐시에도 없다면 이제 "새로운 분석"을 해야 하는데, 이때 5분 제한을 확인합니다.
        String cooldownKey = "analysis:cooldown:" + companyId;
        if (Boolean.TRUE.equals(redisTemplate.hasKey(cooldownKey))) {
            // 만약 쿨타임 중이라면, 아까 1번에서 깎은 쿼터를 다시 복구해줘야 억울하지 않겠죠?
            bucket.addTokens(1);
            throw new RuntimeException("잦은 분석은 금지! 5분 뒤에 새로운 파일을 올려주세요.");
        }

        // 5. [F-103] 분산 락 설정 (중복 분석 요청 방지)
        String lockKey = "analysis:lock:" + companyId + ":" + fileHash;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            if (!lock.tryLock(0, 30, TimeUnit.SECONDS)) {
                log.warn("★중복 분석 요청 차단★ 기업 ID: {}, 해시: {}", companyId, fileHash);
                throw new RuntimeException("현재 해당 문서에 대한 분석이 이미 진행 중입니다.");
            }

            log.info("★분석 권한(Lock) 획득 성공★ 기업 ID: {}", companyId);

            // 6. Upstage 호출 (PDF -> Markdown 변환)
            String markdownContent;
            try {
                markdownContent = upstageService.parsePdfToMarkdown(file);
            } catch (IOException e) {
                log.error("Upstage 분석 중 IO 오류 발생", e);
                throw new RuntimeException("문서 처리 중 서버 오류가 발생했습니다.");
            }

            if (markdownContent == null || markdownContent.trim().isEmpty()) {
                markdownContent = "분석할 데이터가 부족합니다.";
            }

            // 7. DB 저장 (상태: PENDING)
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

            // 8. [F-104] Kafka 메시지 발행 (Gemini 분석용)
            try {
                Map<String, Object> kafkaMessage = new HashMap<>();
                kafkaMessage.put("analysisId", savedAnalysis.getId());
                kafkaMessage.put("companyId", companyId);
                kafkaMessage.put("content", markdownContent);
                kafkaMessage.put("fileHash", fileHash); // 저장 시 사용할 해시 전달

                String jsonMessage = objectMapper.writeValueAsString(kafkaMessage);
                kafkaTemplate.send(TOPIC, String.valueOf(companyId), jsonMessage);

                log.info("Kafka 요청 전송 완료. 분석 프로세스 시작됨.");
            } catch (Exception e) {
                log.error("Kafka 메시지 발행 에러", e);
                throw new RuntimeException("분석 대기열 등록에 실패했습니다.");
            }

            // 9. 시연용 지연 (10초)
            try {
                log.info(">>>> [시연] 락 유지 중 (10초) <<<<");
                Thread.sleep(10000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            return savedAnalysis.getId();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("작업이 중단되었습니다.");
        } finally {
            // 10. 락 해제
            if (lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.info("★락 해제 완료★ 기업 ID: {}", companyId);
            }
        }
    }
}