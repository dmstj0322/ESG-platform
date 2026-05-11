package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.dto.EcoCommitRequestDto;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBucket;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class EcoCommitService {

    private final PointServiceClient pointServiceClient;
    private final AnalysisReportRepository analysisReportRepository;
    private final RedissonClient redissonClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final EcoPointConverter converter;

    private static final String ECO_COMMIT_TOPIC   = "esg-eco-commit";
    private static final String SETTLED_KEY_PREFIX = "eco:settled:";
    private static final String LOCK_KEY_PREFIX    = "eco:commit:lock:";

    public Map<String, Object> getPreview(Long companyId) {
        Long ecoPoints = 0L;
        try {
            ecoPoints = pointServiceClient.getCompanyTotalPoints(companyId);
        } catch (Exception e) {
            log.warn("[EcoPreview] point-service 호출 실패 → 0으로 처리: {}", e.getMessage());
        }
        Map<String, Object> result = buildEcoData(ecoPoints);
        result.put("isSettled", redissonClient.getBucket(SETTLED_KEY_PREFIX + companyId).isExists());
        return result;
    }

    public Long initiateEcoCommit(Long userId, Long companyId) {
        RBucket<Boolean> settledFlag = redissonClient.getBucket(SETTLED_KEY_PREFIX + companyId);
        if (settledFlag.isExists()) {
            throw new RuntimeException("이미 이번 분기 성과 확정이 완료되었습니다.");
        }

        RLock lock = redissonClient.getLock(LOCK_KEY_PREFIX + companyId);
        try {
            if (!lock.tryLock(0, 30, TimeUnit.SECONDS)) {
                throw new RuntimeException("이미 성과 확정 처리 중입니다. 잠시 후 다시 시도해주세요.");
            }

            Long ecoPoints = 0L;
            try {
                ecoPoints = pointServiceClient.getCompanyTotalPoints(companyId);
                log.info("[EcoCommit] 기업:{} 포인트합계:{}EP", companyId, ecoPoints);
            } catch (Exception e) {
                log.error("[EcoCommit] point-service 호출 실패 → 0으로 처리", e);
            }

            Map<String, Object> ecoData = buildEcoData(ecoPoints);
            double carbonKg = (double) ecoData.get("carbonReductionKg");
            double trees    = (double) ecoData.get("equivalentTrees");
            int    eBonus   = (int)    ecoData.get("eBonus");
            int    sBonus   = (int)    ecoData.get("sBonus");

            String previousContent = analysisReportRepository
                    .findFirstByCompanyIdAndStatusOrderByIdDesc(companyId, "COMPLETED")
                    .map(AnalysisReport::getReportContent)
                    .orElse("");

            AnalysisReport pending = AnalysisReport.builder()
                    .memberId(userId)
                    .companyId(companyId)
                    .status("PENDING")
                    .reportContent("에코 포인트 성과 확정 AI 재분석 중...")
                    .ecoPoints(ecoPoints)
                    .carbonReductionKg(carbonKg)
                    .equivalentTrees(trees)
                    .build();
            AnalysisReport saved = analysisReportRepository.save(pending);

            EcoCommitRequestDto dto = EcoCommitRequestDto.builder()
                    .pendingAnalysisId(saved.getId())
                    .companyId(companyId)
                    .ecoPoints(ecoPoints)
                    .carbonReductionKg(carbonKg)
                    .equivalentTrees(trees)
                    .eBonus(eBonus)
                    .sBonus(sBonus)
                    .previousReportContent(previousContent)
                    .build();

            String jsonMessage = objectMapper.writeValueAsString(dto);

            // 중복 확정 방지 플래그를 Kafka 발행 전에 세팅
            // → 발행 후 크래시 시 재확정 가능한 TOCTOU 문제 방어
            settledFlag.set(true, 90, TimeUnit.DAYS);

            kafkaTemplate.send(ECO_COMMIT_TOPIC, String.valueOf(companyId), jsonMessage);
            log.info("[EcoCommit] Kafka 발행 완료 — analysisId:{} EP:{} 탄소:{}kg 소나무:{}그루",
                    saved.getId(), ecoPoints, carbonKg, trees);

            return saved.getId();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("작업이 중단되었습니다.");
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("[EcoCommit] 처리 오류", e);
            throw new RuntimeException("성과 확정 처리 중 오류가 발생했습니다: " + e.getMessage());
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    private Map<String, Object> buildEcoData(Long ecoPoints) {
        Map<String, Object> result = new HashMap<>();
        result.put("ecoPoints",         ecoPoints);
        result.put("carbonReductionKg", converter.round1(converter.toCarbonKg(ecoPoints)));
        result.put("equivalentTrees",   converter.round1(converter.toEquivalentTrees(ecoPoints)));
        result.put("eBonus",            converter.toEBonus(ecoPoints));
        result.put("sBonus",            converter.toSBonus(ecoPoints));
        return result;
    }
}
