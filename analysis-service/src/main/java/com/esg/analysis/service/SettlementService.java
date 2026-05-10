package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.service.domain.EsgScore;
import com.esg.analysis.service.repository.EsgScoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SettlementService {

    private final PointServiceClient pointServiceClient;
    private final EsgScoreRepository esgScoreRepository;
    private final EcoPointConverter converter;

    @Transactional
    public void finalizePerformance(Long companyId, Long memberId) {
        Long totalPoints = pointServiceClient.getMemberPointBalance(memberId);

        EsgScore score = esgScoreRepository.findByCompanyId(companyId)
                .orElse(new EsgScore(companyId));

        // EcoPointConverter 기준: toSBonus 최대 5점, toEBonus 최대 10점
        double sScore = converter.toSBonus(totalPoints);
        score.updateSocialScore(sScore);
        esgScoreRepository.save(score);
    }
}
