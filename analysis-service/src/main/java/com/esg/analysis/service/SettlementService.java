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

    @Transactional
    public void finalizePerformance(Long companyId, Long memberId) {
        // 친구의 API를 통해 현재 잔액을 긁어옵니다.
        Long totalPoints = pointServiceClient.getMemberPointBalance(memberId);

        EsgScore score = esgScoreRepository.findByCompanyId(companyId)
                .orElse(new EsgScore(companyId));

        // 총 포인트를 기반으로 점수 최종 확정
        score.updateSocialScore(totalPoints / 100.0); // 1,000점 만점에 10점식 환산 예시
        esgScoreRepository.save(score);
    }
}