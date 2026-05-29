package com.esg.analysis.service;

import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.domain.ESGIndicator;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * ESGIndicator와 RAG Evidence를 기반으로 Rule-based ESG 점수를 산출합니다.
 *
 * - 수치 공시 지표(E): evidence similarity 수준에 따라 30~80점
 * - 여부 지표(S/G): evidence 존재 여부 + similarity 수준에 따라 40~80점
 */
@Component
public class ESGScoreCalculator {

    public int calculate(ESGIndicator indicator, List<EvidenceResult> evidences) {
        if (evidences.isEmpty()) {
            return isBinaryIndicator(indicator) ? 40 : 30;
        }

        double maxSimilarity = evidences.stream()
                .mapToDouble(EvidenceResult::getSimilarity)
                .max().orElse(0.0);

        if (isBinaryIndicator(indicator)) {
            // 정책·시스템·조직 존재 여부: 관련 텍스트 발견 여부가 핵심
            if (maxSimilarity >= 0.6) return 80;
            if (maxSimilarity >= 0.4) return 70;
            return 40;
        } else {
            // 에너지·배출량·폐기물 등 수치 공시 지표
            if (maxSimilarity >= 0.7) return 80;
            if (maxSimilarity >= 0.5) return 65;
            if (maxSimilarity >= 0.3) return 50;
            return 30;
        }
    }

    public int deriveConfidenceScore(List<EvidenceResult> evidences) {
        if (evidences.isEmpty()) return 0;
        double avg = evidences.stream()
                .mapToDouble(EvidenceResult::getSimilarity)
                .average().orElse(0.0);
        if (avg >= 0.7) return 85;
        if (avg >= 0.5) return 65;
        return 40;
    }

    private boolean isBinaryIndicator(ESGIndicator indicator) {
        return indicator.getTitle().endsWith("여부");
    }
}
