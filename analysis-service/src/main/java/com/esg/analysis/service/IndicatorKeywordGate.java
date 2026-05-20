package com.esg.analysis.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;
import java.util.Collection;

/**
 * 지표별 keyword gating — cluster AND-match 방식으로 false negative 감소.
 *
 * <pre>
 * 통과 조건:
 *   KEYWORD_CLUSTERS 중 하나라도 cluster 내 모든 토큰이 text에 존재하면 PASS (OR across clusters).
 *   단일 토큰 cluster는 GENERIC_TOKENS 필터 적용 (similarity >= 0.85 시 완화).
 *   복합 cluster(size >= 2)는 조합 자체가 식별력 → generic 필터 없음.
 *   미정의 지표(E-10x 등)는 gate 없이 항상 PASS.
 * </pre>
 */
@Slf4j
@Service
public class IndicatorKeywordGate {

    // 0.75 → 0.88: false positive 방지 강화 — 단일·복합 cluster relaxed 허용은 0.88 이상 고신뢰도 구간으로 제한
    private static final double RELAXED_SIMILARITY_THRESHOLD = 0.88;

    private static final Set<String> GENERIC_TOKENS = Set.of(
            "참여", "운영", "활동", "진행", "실시", "현황", "실적", "추진", "도입", "발생"
    );

    /**
     * 지표 코드 → keyword cluster 목록.
     * cluster 내 모든 토큰이 normalized text에 있어야 해당 cluster 매칭.
     * cluster 간 OR → 하나라도 완전 매칭 시 PASS.
     */
    private static final Map<String, List<List<String>>> KEYWORD_CLUSTERS = new LinkedHashMap<>();

    static {
        // ── S (사회) ──────────────────────────────────────────────────────────

        // S-201: 산업안전 교육
        KEYWORD_CLUSTERS.put("S-201", List.of(
                // 복합 cluster (AND-match / relaxed 모드에서 partial 허용)
                List.of("산업안전", "교육"),
                List.of("안전보건", "교육"),
                List.of("재해예방", "교육"),
                // 단일 토큰 — indicator.getKeywords() vocabulary 동기화
                List.of("안전교육"),
                List.of("안전보건교육"),
                List.of("안전 교육"),
                List.of("교육시간"),      // 1인당 교육시간 N시간
                List.of("산업안전"),      // 산업안전 standalone
                List.of("안전보건"),      // 안전보건 standalone
                List.of("재해예방"),      // 재해예방 standalone
                List.of("이수율"),        // 교육 이수율
                List.of("안전관리"),      // 안전관리 체계
                List.of("안전 훈련")      // safety training
        ));

        // S-202: 산업재해 발생 여부
        KEYWORD_CLUSTERS.put("S-202", List.of(
                List.of("산업재해"),
                List.of("LTIR"),
                List.of("재해율"),
                List.of("재해건수"),
                List.of("산재"),
                List.of("사망재해"),
                List.of("무재해"),
                List.of("무사고"),
                List.of("사고율"),
                List.of("안전사고"),
                List.of("사고건수"),
                List.of("사고", "건수"),
                List.of("안전사고", "발생"),
                List.of("재해", "발생"),
                List.of("사고 없음"),
                List.of("산업재해 없음"),
                List.of("재해 발생 없음"),
                List.of("LTIR 0")
        ));

        // S-203: ESG 교육 실시 여부
        KEYWORD_CLUSTERS.put("S-203", List.of(
                List.of("ESG", "교육"),
                List.of("지속가능경영", "교육"),
                List.of("윤리", "교육"),
                List.of("임직원교육"),
                List.of("ESG역량")
        ));

        // S-204: 임직원 참여 프로그램
        // "봉사활동 참여 인원은 연간 340명" → ["봉사활동","참여"]
        // "사회공헌 참여 활동 지원"         → ["사회공헌","참여"]
        KEYWORD_CLUSTERS.put("S-204", List.of(
                List.of("임직원", "참여"),
                List.of("봉사활동", "참여"),
                List.of("사회공헌", "참여"),
                List.of("참여", "프로그램"),
                List.of("사내", "캠페인"),
                List.of("캠페인", "참여"),
                List.of("참여율"),
                List.of("참여비율")
        ));

        // ── G (지배구조) ──────────────────────────────────────────────────────

        // G-301: 윤리경영 정책
        KEYWORD_CLUSTERS.put("G-301", List.of(
                // 복합 cluster
                List.of("컴플라이언스", "정책"),
                List.of("윤리경영", "방침"),
                // 단일 토큰 — indicator keywords 동기화
                List.of("윤리경영"),
                List.of("행동강령"),
                List.of("반부패"),
                List.of("윤리헌장"),
                List.of("준법경영"),      // 준법경영 체계
                List.of("준법"),          // 준법 standalone
                List.of("청렴"),          // 청렴 활동
                List.of("컴플라이언스"),  // 컴플라이언스 standalone
                List.of("윤리"),          // 윤리 standalone
                List.of("윤리 정책"),     // 윤리 정책 (space-normalized 포함)
                List.of("윤리 방침")      // 윤리 방침
        ));

        // G-302: 내부 신고 시스템
        // 동의어 변형 대응:
        //   "익명 신고 시스템"  → ["익명","신고"]
        //   "내부 제보 채널"    → ["내부","제보"] / ["제보","채널"]
        //   "윤리 신고 제도"    → ["윤리","신고"]
        //   "whistleblowing 시스템" / "hotline" 영문 표현 포함
        KEYWORD_CLUSTERS.put("G-302", List.of(
                List.of("내부제보"),
                List.of("익명신고"),
                List.of("신고시스템"),
                List.of("내부", "신고"),
                List.of("익명", "신고"),
                List.of("내부", "제보"),
                List.of("제보", "채널"),
                List.of("윤리", "신고"),
                List.of("제보", "시스템"),
                List.of("신고", "시스템"),
                List.of("제보센터"),
                List.of("신고센터"),
                List.of("whistleblowing"),
                List.of("whistle", "blowing"),
                List.of("hotline"),
                List.of("핫라인"),
                List.of("신고채널"),
                List.of("신고", "채널"),
                List.of("내부고발"),
                List.of("내부 신고"),
                List.of("신고 시스템"),
                List.of("내부신고시스템"),
                List.of("신고 운영"),
                List.of("제보 채널")
        ));

        // G-303: ESG 담당 조직
        // "ESG 위원회를 설치하여" → ["ESG","위원회"] cluster 추가
        KEYWORD_CLUSTERS.put("G-303", List.of(
                List.of("ESG", "위원회"),
                List.of("ESG", "조직"),
                List.of("ESG", "담당"),
                List.of("ESG", "TF"),
                List.of("전담", "조직"),
                List.of("지속가능경영", "위원회"),
                List.of("ESG팀"),
                List.of("ESG전담"),
                List.of("ESG 담당부서")
        ));

        // S-205: 지역사회 공헌 활동
        KEYWORD_CLUSTERS.put("S-205", List.of(
                List.of("지역사회", "봉사"),
                List.of("지역사회", "기여"),
                List.of("지역사회", "공헌"),
                List.of("사회공헌", "활동"),
                List.of("봉사활동"),
                List.of("지역사회봉사"),
                List.of("사회공헌"),
                List.of("CSR", "활동"),
                List.of("지역기부"),
                List.of("지역", "기부"),
                List.of("지역사회투자")
        ));

        // G-304: 외부 감사 체계
        KEYWORD_CLUSTERS.put("G-304", List.of(
                List.of("외부감사"),
                List.of("외부", "감사"),
                List.of("감사인"),
                List.of("공인회계사"),
                List.of("회계감사"),
                List.of("감사보고서"),
                List.of("감사", "보고서"),
                List.of("독립감사"),
                List.of("외부감사인"),
                List.of("외부 감사인")
        ));

        // G-305: 이사회 독립성
        KEYWORD_CLUSTERS.put("G-305", List.of(
                List.of("사외이사"),
                List.of("독립이사"),
                List.of("이사회", "독립"),
                List.of("이사회", "구성"),
                List.of("이사회", "독립성"),
                List.of("독립", "이사"),
                List.of("사외이사비율"),
                List.of("비상임이사"),
                List.of("사외", "이사"),
                List.of("이사회독립성")
        ));
    }

    private record ClusterMatchResult(boolean matched, boolean normalizeMatch, String reason) {}

    public boolean passes(String indicatorCode, String text) {
        return passes(indicatorCode, text, 0.0);
    }

    public boolean passes(String indicatorCode, String text, double similarity) {
        String match = describeMatch(indicatorCode, text, similarity);
        if ("NO_GATE".equals(match)) return true;
        boolean passed = !"BLOCKED".equals(match);
        if (passed) {
            log.info("[KeywordGate] PASS indicator={} cluster=[{}] sim={}",
                    indicatorCode, match, String.format("%.3f", similarity));
        }
        return passed;
    }

    /**
     * 매칭된 cluster를 "|" 구분 문자열로 반환합니다.
     * 한국어 복합어 띄어쓰기 변형 대응: "신고 시스템" ↔ "신고시스템" 동시 확인.
     *
     * @return 매칭 cluster 토큰 문자열, gate 미정의 시 "NO_GATE", 차단 시 "BLOCKED"
     */
    public String describeMatch(String indicatorCode, String text, double similarity) {
        List<List<String>> clusters = KEYWORD_CLUSTERS.get(indicatorCode);
        if (clusters == null || clusters.isEmpty()) return "NO_GATE";

        String normalized = text.toLowerCase();
        String normalizedNoSpc = normalized.replaceAll("\\s+", "");
        boolean relaxed = similarity >= RELAXED_SIMILARITY_THRESHOLD;

        for (List<String> cluster : clusters) {
            ClusterMatchResult r = evaluateCluster(cluster, normalized, normalizedNoSpc, relaxed);
            if (r.matched()) {
                if (r.normalizeMatch()) {
                    log.info("[KeywordGate] NORMALIZE_MATCH indicator={} cluster=[{}] sim={}",
                            indicatorCode, String.join("|", cluster), String.format("%.3f", similarity));
                }
                return String.join("|", cluster);
            }
        }

        List<String> reasons = new ArrayList<>();
        for (List<String> cluster : clusters) {
            ClusterMatchResult r = evaluateCluster(cluster, normalized, normalizedNoSpc, relaxed);
            reasons.add("[" + String.join("|", cluster) + "→" + r.reason() + "]");
        }
        String summary = reasons.stream().limit(5).collect(Collectors.joining(", "));
        if (reasons.size() > 5) summary += " ...+" + (reasons.size() - 5) + "more";
        log.info("[KeywordGate] BLOCKED indicator={} sim={} relaxed={} detail={}",
                indicatorCode, String.format("%.3f", similarity), relaxed, summary);

        // [INTENT-CHECK] — intent mismatch 진단 로그
        Set<String> allTokens = clusters.stream()
                .flatMap(Collection::stream)
                .map(String::toLowerCase)
                .collect(Collectors.toSet());
        long requiredKwMatched = allTokens.stream()
                .filter(t -> normalized.contains(t) || normalizedNoSpc.contains(t.replaceAll("\\s+", "")))
                .count();
        Set<String> genericSet = Set.of("교육", "정책", "운영", "체계", "관리", "활동", "참여", "시스템");
        boolean genericOnly = requiredKwMatched > 0 && allTokens.stream()
                .filter(t -> normalized.contains(t) || normalizedNoSpc.contains(t.replaceAll("\\s+", "")))
                .allMatch(genericSet::contains);
        boolean intentMismatch = requiredKwMatched == 0 || genericOnly;
        log.info("[INTENT-CHECK] indicator={} requiredKeywordsMatched={} genericOnly={} intentMismatch={} result=BLOCK",
                indicatorCode, requiredKwMatched, genericOnly, intentMismatch);

        return "BLOCKED";
    }

    private ClusterMatchResult evaluateCluster(List<String> cluster, String normalized,
                                                String normalizedNoSpc, boolean relaxed) {
        if (cluster.isEmpty()) return new ClusterMatchResult(false, false, "EMPTY_CLUSTER");

        if (cluster.size() >= 2) {
            // strict pass: all tokens match (AND)
            boolean allMatch = cluster.stream().map(String::toLowerCase)
                    .allMatch(t -> normalized.contains(t)
                            || normalizedNoSpc.contains(t.replaceAll("\\s+", "")));
            if (allMatch) {
                boolean isNorm = cluster.stream().map(String::toLowerCase)
                        .anyMatch(t -> !normalized.contains(t)
                                && normalizedNoSpc.contains(t.replaceAll("\\s+", "")));
                return new ClusterMatchResult(true, isNorm, isNorm ? "NORMALIZE_MATCH" : "MATCH");
            }
            // relaxed pass: sim >= threshold → 1개 이상 token 매칭 시 PARTIAL_MATCH
            // semantic similarity가 이미 충분히 높으므로 vocabulary mismatch 완화
            if (relaxed) {
                boolean anyMatch = cluster.stream().map(String::toLowerCase)
                        .anyMatch(t -> normalized.contains(t)
                                || normalizedNoSpc.contains(t.replaceAll("\\s+", "")));
                if (anyMatch) {
                    return new ClusterMatchResult(true, false, "PARTIAL_MATCH");
                }
            }
            String failToken = cluster.stream().map(String::toLowerCase)
                    .filter(t -> !normalized.contains(t)
                            && !normalizedNoSpc.contains(t.replaceAll("\\s+", "")))
                    .findFirst().orElse("?");
            return new ClusterMatchResult(false, false, "TOKEN_MISMATCH:" + failToken);
        }

        // single-token cluster
        String token = cluster.get(0).toLowerCase();
        String tokenNoSpc = token.replaceAll("\\s+", "");
        boolean matchNormal = normalized.contains(token);
        boolean matchNoSpc = normalizedNoSpc.contains(tokenNoSpc);
        if (!matchNormal && !matchNoSpc) {
            return new ClusterMatchResult(false, false, "TOKEN_MISMATCH:" + token);
        }
        if (!relaxed && GENERIC_TOKENS.contains(token)) {
            return new ClusterMatchResult(false, false, "THRESHOLD_FAIL:" + token);
        }
        boolean isNorm = !matchNormal && matchNoSpc;
        return new ClusterMatchResult(true, isNorm, isNorm ? "NORMALIZE_MATCH" : "MATCH");
    }

    /** 지표에 gate가 정의되어 있는지 확인합니다 (테스트·로그용). */
    public boolean hasGate(String indicatorCode) {
        return KEYWORD_CLUSTERS.containsKey(indicatorCode);
    }
}
