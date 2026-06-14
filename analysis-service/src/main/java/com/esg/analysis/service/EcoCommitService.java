package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBucket;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
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
    private final ObjectMapper objectMapper;
    private final EcoPointConverter converter;
    private static final String SETTLED_KEY_PREFIX = "eco:settled:";
    private static final String LOCK_KEY_PREFIX    = "eco:commit:lock:";

    public Map<String, Object> getPreview(Long companyId) {
        Long ecoPoints = 0L;
        try {
            ecoPoints = pointServiceClient.getCompanyEsgPool(companyId).esgPoints();
        } catch (Exception e) {
            log.warn("[EcoPreview] point-service 호출 실패 → 0으로 처리: {}", e.getMessage());
        }
        Map<String, Object> result = buildEcoData(ecoPoints);
        result.put("isSettled", redissonClient.getBucket(SETTLED_KEY_PREFIX + companyId).isExists());
        return result;
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
