package com.esg.analysis.service;

import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.domain.ESGIndicator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Evidence Retrieval 결과를 기반으로 Confidence Score를 계산합니다.
 *
 * <pre>
 * confidence = similarity         × 0.4
 *            + keywordMatchScore  × 0.3
 *            + consistency        × 0.2
 *            + sourceReliability  × 0.1
 *
 * consistency      : valid evidence 개수 기반 (0.0 / 0.4 / 0.7 / 1.0)
 * sourceReliability: sourceFile 보유 evidence 비율 (0.0~1.0)
 * </pre>
 *
 * 반환값은 0~100 정수 퍼센트입니다.
 * Retrieval threshold({@link ReportRagService#EVIDENCE_THRESHOLD})와 연계하여
 * isValidEvidence 기반 consistency 계산에 활용됩니다.
 */
@Slf4j
@Service
public class ConfidenceService {

    /**
     * @param indicator ESGIndicator (로그 출력용)
     * @param evidences Retrieval 결과 목록
     * @return confidence score 0~100
     */
    public int calculate(ESGIndicator indicator, List<EvidenceResult> evidences) {
        if (evidences.isEmpty()) return 0;

        double avgSim        = evidences.stream().mapToDouble(EvidenceResult::getSimilarity).average().orElse(0.0);
        double avgKw         = evidences.stream().mapToDouble(EvidenceResult::getKeywordMatchScore).average().orElse(0.0);
        double consistency   = computeConsistency(evidences);
        double reliability   = computeSourceReliability(evidences);

        double raw   = avgSim * 0.4 + avgKw * 0.3 + consistency * 0.2 + reliability * 0.1;
        int    score = Math.min((int) Math.round(raw * 100), 100);

        log.debug("[Confidence] indicator={} sim={} kw={} cons={} src={} → {}점",
                indicator.getCode(),
                String.format("%.3f", avgSim), String.format("%.3f", avgKw),
                String.format("%.2f", consistency), String.format("%.2f", reliability),
                score);

        return score;
    }

    /** valid evidence 개수 기반 일관성 점수 (0.0~1.0) */
    private double computeConsistency(List<EvidenceResult> evidences) {
        long validCount = evidences.stream().filter(EvidenceResult::isValidEvidence).count();
        if (validCount >= 3) return 1.0;
        if (validCount >= 2) return 0.7;
        if (validCount >= 1) return 0.4;
        return 0.0;
    }

    /** sourceFile이 있는 evidence 비율 (0.0~1.0) */
    private double computeSourceReliability(List<EvidenceResult> evidences) {
        long withSource = evidences.stream()
                .filter(e -> e.getSourceFile() != null && !e.getSourceFile().isBlank())
                .count();
        return (double) withSource / evidences.size();
    }
}
