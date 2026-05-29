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
 * confidence = similarity         × 0.30
 *            + keywordMatchScore  × 0.20
 *            + consistency        × 0.20
 *            + evidenceRichness   × 0.25  ← multi-evidence aggregation (KPI richness 강조)
 *            + sourceReliability  × 0.05
 *
 * evidenceRichness : valid evidence 수 + page 다양성 + keyword coverage 조합
 * consistency      : valid evidence 개수 기반 (0.0 / 0.4 / 0.7 / 1.0)
 * sourceReliability: sourceFile 보유 evidence 비율 (0.0~1.0)
 *
 * S-201 특화: 안전교육·인증·운영체계·KPI 복수 cluster 커버리지 보너스
 * S-202 특화: 개선조치·예방·재발방지 표현 존재 시 패널티 완화
 * G-305 특화: 사외이사·이사회 수치 존재 시 confidence 상향
 * </pre>
 *
 * 반환값은 0~100 정수 퍼센트입니다.
 */
@Slf4j
@Service
public class ConfidenceService {

    // S-201: 안전교육 관련 coverage cluster 키워드
    private static final List<List<String>> S201_COVERAGE_CLUSTERS = List.of(
            List.of("안전교육", "안전 교육", "안전보건교육", "교육시간", "교육 시간"),
            List.of("ISO45001", "iso 45001", "안전보건 인증", "안전보건경영"),
            List.of("안전관리", "안전보건", "안전관리체계", "안전보건 체계"),
            List.of("협력사", "협력업체", "공급망 안전", "파트너 안전"),
            List.of("VR 안전", "vr 교육", "가상현실 안전", "체험 안전교육"),
            List.of("이수율", "교육이수율", "교육 이수율")
    );

    // S-202: KPI + 개선조치 coverage cluster — 충분한 positive evidence 조합 시 richness 보너스
    private static final List<List<String>> S202_KPI_CLUSTERS = List.of(
            List.of("중대재해", "0건", "zero"),
            List.of("trir", "ltir", "재해율", "사고율"),
            List.of("재발방지", "예방체계", "개선조치", "개선 완료"),
            List.of("업계 평균", "산업 평균", "평균 대비"),
            List.of("무재해", "무사고")
    );

    // S-203: ESG 교육 운영 coverage cluster — 정책 문서 없이 운영 evidence만으로 richness 보너스
    private static final List<List<String>> S203_COVERAGE_CLUSTERS = List.of(
            List.of("esg 교육 이수율", "교육 이수율", "이수율"),
            List.of("온보딩", "신입 교육", "신규 교육"),
            List.of("관리자 심화", "심화 교육", "심화 과정"),
            List.of("esg 전략", "esg 공시", "esg 역량"),
            List.of("교육 모듈", "교육과정", "교육 프로그램", "교육 시행")
    );

    // S-205: 지역사회 공헌 KPI + 실행 coverage cluster
    private static final List<List<String>> S205_COVERAGE_CLUSTERS = List.of(
            List.of("자원봉사 시간", "봉사 시간", "봉사시간"),
            List.of("참여 인원", "참여인원", "봉사 참여"),
            List.of("사회공헌 투자", "사회공헌 금액", "사회공헌 실적"),
            List.of("교육 지원", "stem 교육", "취학 지원"),
            List.of("취약계층", "복지 지원", "에너지 복지"),
            List.of("esg 캠페인", "사회공헌 캠페인", "나눔 캠페인")
    );

    // S-202: 개선조치/예방 표현 — 패널티 완화 신호
    private static final List<String> S202_MITIGATION_SIGNALS = List.of(
            "발생하지 않", "재발방지", "개선조치", "개선 완료", "후속조치",
            "예방체계", "예방 활동", "예방교육", "무재해", "zero",
            "감소", "저감", "사고율 개선", "안전관리 강화", "관리 완료",
            "trir", "ltir", "0건", "업계 평균"
    );

    // G-305: 이사회 독립성 수치 증빙 표현
    private static final List<String> G305_BOARD_EVIDENCE = List.of(
            "사외이사", "사외 이사", "독립이사", "이사회 독립", "비상임이사",
            "사외이사 비율", "이사회 구성", "여성 이사", "이사회 독립성"
    );

    /**
     * @param indicator ESGIndicator (로그 출력용)
     * @param evidences Retrieval 결과 목록
     * @return confidence score 0~100
     */
    public int calculate(ESGIndicator indicator, List<EvidenceResult> evidences) {
        if (evidences.isEmpty()) return 0;

        double avgSim      = evidences.stream().mapToDouble(EvidenceResult::getSimilarity).average().orElse(0.0);
        double avgKw       = evidences.stream().mapToDouble(EvidenceResult::getKeywordMatchScore).average().orElse(0.0);
        double consistency = computeConsistency(evidences);
        double reliability = computeSourceReliability(evidences);

        // ── Evidence Richness: multi-evidence aggregation score ──────────────
        double richness = computeEvidenceRichness(indicator, evidences);

        // ── 패널티 계산 ─────────────────────────────────────────────────────
        // (1) 낮은 평균 similarity: 0.62 미만이면 차이에 비례하여 감산 (0.65→0.62 완화)
        double weakSimPenalty = avgSim < 0.62 ? (0.62 - avgSim) * 0.35 : 0.0;

        // (2) keyword 불일치 evidence 비율: semantic-only evidence가 많으면 신뢰도 하락
        //     단, evidence richness가 높으면 semantic-only 패널티 완화
        long semanticOnlyCount = evidences.stream()
                .filter(e -> e.getMatchedKeywords() == null || e.getMatchedKeywords().isEmpty())
                .count();
        double semanticOnlyRatio   = (double) semanticOnlyCount / evidences.size();
        double semanticOnlyPenalty = semanticOnlyRatio * 0.08 * (1.0 - richness * 0.5);  // richness 높을수록 패널티 완화

        // (3) S-202 개선조치 완화: 미티게이션 신호 존재 시 penalty 추가 완화
        // historical disclosure + mitigation = ESG disclosure maturity → 보너스 상향
        double mitigationBonus = 0.0;
        if ("S-202".equals(indicator.getCode())) {
            long mitigationCount = S202_MITIGATION_SIGNALS.stream()
                    .filter(sig -> evidences.stream()
                            .anyMatch(ev -> {
                                String t = (ev.getEvidenceText() != null ? ev.getEvidenceText() : "").toLowerCase();
                                return t.contains(sig.toLowerCase());
                            }))
                    .count();
            if (mitigationCount >= 3) {
                mitigationBonus = 0.12;
                log.info("[CONFIDENCE-MITIGATION] S-202 mitigation signals={} → 강화 bonus={}", mitigationCount, mitigationBonus);
            } else if (mitigationCount >= 1) {
                mitigationBonus = 0.08;
                log.info("[CONFIDENCE-MITIGATION] S-202 mitigation signals={} → bonus={}", mitigationCount, mitigationBonus);
            }
        }

        double raw   = avgSim * 0.30 + avgKw * 0.20 + consistency * 0.20 + richness * 0.25 + reliability * 0.05
                     - weakSimPenalty - semanticOnlyPenalty + mitigationBonus;
        int    score = Math.max(0, Math.min((int) Math.round(raw * 100), 100));

        log.info("[CONFIDENCE-BREAKDOWN] indicator={} avgSim={} avgKw={} consistency={} richness={} reliability={}" +
                        " weakSimPenalty={} semanticOnlyRatio={} mitigationBonus={} → raw={} score={}",
                indicator.getCode(),
                String.format("%.3f", avgSim), String.format("%.3f", avgKw),
                String.format("%.2f", consistency), String.format("%.2f", richness),
                String.format("%.2f", reliability),
                String.format("%.3f", weakSimPenalty), String.format("%.2f", semanticOnlyRatio),
                String.format("%.3f", mitigationBonus),
                String.format("%.3f", raw), score);

        return score;
    }

    /**
     * Evidence Richness Score: multi-evidence aggregation.
     * valid evidence 수 + 페이지 다양성 + indicator별 coverage cluster 반영.
     */
    private double computeEvidenceRichness(ESGIndicator indicator, List<EvidenceResult> evidences) {
        long validCount = evidences.stream().filter(EvidenceResult::isValidEvidence).count();

        // 기본 richness: valid evidence 수 기반 (최대 0.7)
        double countScore = validCount >= 4 ? 0.7 : validCount >= 3 ? 0.6 : validCount >= 2 ? 0.45 : validCount >= 1 ? 0.3 : 0.0;

        // 페이지 다양성 보너스 (0~0.15)
        long uniquePages = evidences.stream()
                .filter(e -> e.getPageNumber() > 0)
                .mapToInt(EvidenceResult::getPageNumber)
                .distinct().count();
        double pageBonus = uniquePages >= 3 ? 0.15 : uniquePages >= 2 ? 0.10 : uniquePages >= 1 ? 0.05 : 0.0;

        // S-201/S-202/S-203/S-205 특화: KPI·운영 evidence cluster coverage 보너스 (0~0.20)
        double clusterBonus = 0.0;
        String indCode = indicator.getCode();
        if (indCode != null) {
            String combinedText = evidences.stream()
                    .filter(e -> e.getEvidenceText() != null)
                    .map(e -> e.getEvidenceText().toLowerCase())
                    .collect(java.util.stream.Collectors.joining(" "));

            if (indCode.startsWith("S-201")) {
                long covered = S201_COVERAGE_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combinedText.contains(kw.toLowerCase())))
                        .count();
                clusterBonus = Math.min(0.20, covered * 0.04);
                if (covered >= 3) {
                    log.info("[COVERAGE-CLUSTER] S-201 coverage={}/{} → bonus={}",
                            covered, S201_COVERAGE_CLUSTERS.size(), clusterBonus);
                }
            } else if ("S-202".equals(indCode)) {
                long covered = S202_KPI_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combinedText.contains(kw.toLowerCase())))
                        .count();
                clusterBonus = Math.min(0.20, covered * 0.05);
                if (covered >= 2) {
                    log.info("[COVERAGE-CLUSTER] S-202 KPI coverage={}/{} → bonus={}",
                            covered, S202_KPI_CLUSTERS.size(), clusterBonus);
                }
            } else if ("S-203".equals(indCode)) {
                long covered = S203_COVERAGE_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combinedText.contains(kw.toLowerCase())))
                        .count();
                clusterBonus = Math.min(0.20, covered * 0.05);
                if (covered >= 2) {
                    log.info("[COVERAGE-CLUSTER] S-203 education coverage={}/{} → bonus={}",
                            covered, S203_COVERAGE_CLUSTERS.size(), clusterBonus);
                }
            } else if ("S-205".equals(indCode)) {
                long covered = S205_COVERAGE_CLUSTERS.stream()
                        .filter(cluster -> cluster.stream().anyMatch(kw -> combinedText.contains(kw.toLowerCase())))
                        .count();
                clusterBonus = Math.min(0.20, covered * 0.04);
                if (covered >= 3) {
                    log.info("[COVERAGE-CLUSTER] S-205 community coverage={}/{} → bonus={}",
                            covered, S205_COVERAGE_CLUSTERS.size(), clusterBonus);
                }
            }
        }

        // G-305 특화: 이사회 독립성 수치 존재 시 보너스 (0.10)
        double boardBonus = 0.0;
        if ("G-305".equals(indicator.getCode())) {
            String combinedText = evidences.stream()
                    .filter(e -> e.getEvidenceText() != null)
                    .map(e -> e.getEvidenceText().toLowerCase())
                    .collect(java.util.stream.Collectors.joining(" "));
            long matchedBoardKws = G305_BOARD_EVIDENCE.stream()
                    .filter(kw -> combinedText.contains(kw.toLowerCase())).count();
            if (matchedBoardKws >= 2) {
                boardBonus = 0.10;
                log.info("[BOARD-EVIDENCE] G-305 이사회 구성 수치 확인 keywords={} → bonus={}", matchedBoardKws, boardBonus);
            }
        }

        return Math.min(1.0, countScore + pageBonus + clusterBonus + boardBonus);
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
