package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.dto.EcoCommitRequestDto;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    private static final String ECO_COMMIT_TOPIC    = "esg-eco-commit";
    private static final String SETTLED_KEY_PREFIX  = "eco:settled:";
    private static final double CARBON_PER_POINT    = 1.0 / 1000.0; // 1,000 EP = 1 kg CO2eq
    private static final double SCORE_PER_KG        = 0.02;          // 1 kg = E점수 0.02점
    private static final double MAX_E_BONUS         = 10.0;
    private static final double KG_PER_TREE         = 6.6;           // 소나무 1그루 = 6.6 kg

    // ── 미리보기: 성과 확정 전 예상 수치 반환 ────────────────────
    public Map<String, Object> getPreview(Long companyId) {
        Long ecoPoints = 0L;
        try {
            ecoPoints = pointServiceClient.getCompanyTotalPoints(companyId);
        } catch (Exception e) {
            log.warn("[EcoPreview] point-service 호출 실패 → 0으로 처리: {}", e.getMessage());
        }
        Map<String, Object> result = calculateEcoData(ecoPoints);
        result.put("isSettled", redissonClient.getBucket(SETTLED_KEY_PREFIX + companyId).isExists());
        return result;
    }

    // ── 성과 확정 시작 ────────────────────────────────────────────
    public Long initiateEcoCommit(Long userId, Long companyId) {
        if (redissonClient.getBucket(SETTLED_KEY_PREFIX + companyId).isExists()) {
            throw new RuntimeException("이미 이번 분기 성과 확정이 완료되었습니다.");
        }

        String lockKey = "eco:commit:lock:" + companyId;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            if (!lock.tryLock(0, 30, TimeUnit.SECONDS)) {
                throw new RuntimeException("이미 성과 확정 처리 중입니다. 잠시 후 다시 시도해주세요.");
            }

            log.info("[EcoCommit] 락 획득 성공 — 기업 ID: {}", companyId);

            // 1. 기업 전체 에코 포인트 합계 조회
            Long ecoPoints = 0L;
            try {
                ecoPoints = pointServiceClient.getCompanyTotalPoints(companyId);
                log.info("[EcoCommit] 기업 포인트 합계: {} EP (기업 ID: {})", ecoPoints, companyId);
            } catch (Exception e) {
                log.error("[EcoCommit] point-service 호출 실패 → 0으로 처리", e);
            }

            // 2. 탄소·점수 계산
            Map<String, Object> ecoData = calculateEcoData(ecoPoints);
            double carbonKg   = (double) ecoData.get("carbonReductionKg");
            double trees      = (double) ecoData.get("equivalentTrees");
            int    eBonus     = (int)    ecoData.get("eBonus");
            int    sBonus     = (int)    ecoData.get("sBonus");

            // 3. 최신 완료 리포트 내용 조회 (AI 재분석 기반 데이터)
            String previousContent = analysisReportRepository
                    .findFirstByCompanyIdAndStatusOrderByIdDesc(companyId, "COMPLETED")
                    .map(AnalysisReport::getReportContent)
                    .orElse("");

            // 4. 새 PENDING 리포트 저장 (eco 필드 포함)
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

            // 5. Kafka 발행
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
            kafkaTemplate.send(ECO_COMMIT_TOPIC, String.valueOf(companyId), jsonMessage);

            // 분기 중복 확정 방지 플래그 (90일 TTL — 분기 이후 자동 만료)
            redissonClient.<Boolean>getBucket(SETTLED_KEY_PREFIX + companyId).set(true, 90, TimeUnit.DAYS);
            log.info("[EcoCommit] Kafka 발행 완료 — analysisId: {}, EP: {}, 탄소: {}kg, 소나무: {}그루",
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
                log.info("[EcoCommit] 락 해제 — 기업 ID: {}", companyId);
            }
        }
    }

    // ── 환산 공식 ─────────────────────────────────────────────────
    private Map<String, Object> calculateEcoData(Long ecoPoints) {
        double carbonKg = ecoPoints * CARBON_PER_POINT;
        double trees    = carbonKg / KG_PER_TREE;
        double eBonusRaw = Math.min(carbonKg * SCORE_PER_KG, MAX_E_BONUS);
        int    eBonus   = (int) Math.round(eBonusRaw);
        int    sBonus   = (int) Math.min(ecoPoints / 10_000.0, 5.0);

        Map<String, Object> result = new HashMap<>();
        result.put("ecoPoints",        ecoPoints);
        result.put("carbonReductionKg", round1(carbonKg));
        result.put("equivalentTrees",   round1(trees));
        result.put("eBonus",            eBonus);
        result.put("sBonus",            sBonus);
        return result;
    }

    private double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
