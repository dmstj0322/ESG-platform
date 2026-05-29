package com.esg.analysis.service;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IndicatorKeywordGate — cluster AND-match 방식 검증.
 *
 * <p>Spring 컨텍스트 불필요 — 순수 단위 테스트.
 * 검증 항목:
 * <ol>
 *   <li>G-303 띄어쓰기 변형 (ESG위원회 / ESG 위원회 / ESG 운영 위원회)</li>
 *   <li>G-302 동의어 변형 (익명 신고 / 내부 제보 채널 / 윤리 신고 제도)</li>
 *   <li>S-204 자연어 문장 (봉사 프로그램 / 사회공헌 참여)</li>
 *   <li>False positive 방지 — 관련 없는 문장 BLOCK 확인</li>
 *   <li>Similarity relaxed mode 경계값</li>
 *   <li>원본 PDF 문장 이슈 재현</li>
 * </ol>
 */
class IndicatorKeywordGateTest {

    private IndicatorKeywordGate gate;

    // ── 출력 구분선 ─────────────────────────────────────────────────────
    private static final String LINE = "─".repeat(60);

    @BeforeEach
    void setUp() {
        gate = new IndicatorKeywordGate();
    }

    // ─────────────────────────────────────────────────────────────────────
    // 공통 헬퍼: 결과 포맷 출력 + 반환값
    // ─────────────────────────────────────────────────────────────────────

    private boolean check(String indicator, String text, double rawSim, boolean expected) {
        boolean result = gate.passes(indicator, text, rawSim);
        String preview = text.length() > 55 ? text.substring(0, 55) + "…" : text;
        System.out.printf(
                "%n[KeywordGate]%n" +
                "  indicator = %-8s  rawSim = %.2f%n" +
                "  text      = %s%n" +
                "  result    = %-5s  (expected: %s) %s%n",
                indicator, rawSim,
                preview,
                result ? "PASS" : "BLOCK",
                expected ? "PASS" : "BLOCK",
                result == expected ? "✓" : "✗ MISMATCH"
        );
        return result;
    }

    // ═════════════════════════════════════════════════════════════════════
    // Group 1 — G-303 : 띄어쓰기 변형
    // ═════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Group 1 ▶ G-303 ESG 담당 조직 — 띄어쓰기 변형")
    class G303SpacingVariation {

        @BeforeEach
        void header() {
            System.out.println("\n" + LINE);
            System.out.println("Group 1 : G-303 띄어쓰기 변형 테스트");
            System.out.println(LINE);
        }

        @ParameterizedTest(name = "[{index}] {0}")
        @ValueSource(strings = {
                "사내 ESG위원회를 통해 주요 안건을 결정합니다",
                "ESG 위원회를 설치하여 분기별 리스크 검토를 수행하고 있습니다",
                "ESG 운영 위원회에서 지속가능경영 안건을 심의합니다",
        })
        @DisplayName("cluster [ESG,위원회] — 모두 PASS")
        void allSpacingVariantsShouldPass(String text) {
            assertThat(check("G-303", text, 0.80, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [지속가능경영,위원회] — PASS")
        void sustainabilityCommitteeShouldPass() {
            assertThat(check("G-303",
                    "지속가능경영위원회를 분기별로 개최하여 ESG 이슈를 검토합니다", 0.82, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [ESG,담당] — PASS")
        void esgDeptShouldPass() {
            assertThat(check("G-303",
                    "ESG 담당 부서를 신설하여 전략을 총괄합니다", 0.79, true)).isTrue();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Group 2 — G-302 : 동의어 변형
    // ═════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Group 2 ▶ G-302 내부 신고 시스템 — 동의어 변형")
    class G302SynonymVariation {

        @BeforeEach
        void header() {
            System.out.println("\n" + LINE);
            System.out.println("Group 2 : G-302 동의어 변형 테스트");
            System.out.println(LINE);
        }

        @Test
        @DisplayName("cluster [익명,신고] — '익명 신고 시스템' PASS")
        void anonymousReportShouldPass() {
            assertThat(check("G-302",
                    "사내 인권 보호 정책과 익명 신고 시스템을 운영하고 있습니다", 0.88, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [내부,제보] — '내부 제보 채널' PASS")
        void internalTipChannelShouldPass() {
            assertThat(check("G-302",
                    "내부 제보 채널을 운영하며 직원 보호를 강화합니다", 0.84, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [제보,채널] — '제보 채널 운영' PASS")
        void tipChannelShouldPass() {
            assertThat(check("G-302",
                    "임직원이 활용할 수 있는 제보 채널을 별도 운영합니다", 0.81, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [윤리,신고] — '윤리 신고 제도' PASS")
        void ethicsReportSystemShouldPass() {
            assertThat(check("G-302",
                    "윤리 신고 제도를 통해 내부 부정을 방지합니다", 0.83, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [핫라인] — '핫라인' PASS")
        void hotlineShouldPass() {
            assertThat(check("G-302",
                    "24시간 운영되는 핫라인을 통해 신고를 접수합니다", 0.76, true)).isTrue();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Group 3 — S-204 : 자연어 문장
    // ═════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Group 3 ▶ S-204 임직원 참여 프로그램 — 자연어 문장")
    class S204NaturalLanguage {

        @BeforeEach
        void header() {
            System.out.println("\n" + LINE);
            System.out.println("Group 3 : S-204 자연어 문장 테스트");
            System.out.println(LINE);
        }

        @Test
        @DisplayName("cluster [임직원,참여] — '임직원 자율 참여형 봉사 프로그램' PASS")
        void volunteerProgramShouldPass() {
            assertThat(check("S-204",
                    "임직원 자율 참여형 봉사 프로그램을 운영합니다", 0.78, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [사회공헌,참여] — '사회공헌 참여 활동 지원' PASS")
        void socialContributionShouldPass() {
            assertThat(check("S-204",
                    "사회공헌 참여 활동을 적극 지원합니다", 0.75, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [봉사활동,참여] — '봉사활동 참여 인원 340명' PASS (원본 이슈)")
        void bonusaActivityOriginalIssueShouldPass() {
            assertThat(check("S-204",
                    "지역사회 봉사활동 참여 인원은 연간 340명입니다", 0.82, true)).isTrue();
        }

        @Test
        @DisplayName("cluster [참여율] — '임직원 참여율 92%' PASS")
        void participationRateShouldPass() {
            assertThat(check("S-204",
                    "임직원 참여율은 92%로 전년 대비 3%p 상승하였습니다", 0.80, true)).isTrue();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Group 4 — False Positive 방지 (BLOCK 확인)
    // ═════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Group 4 ▶ False Positive 방지 — BLOCK 케이스")
    class FalsePositivePrevention {

        @BeforeEach
        void header() {
            System.out.println("\n" + LINE);
            System.out.println("Group 4 : False Positive 방지 테스트");
            System.out.println(LINE);
        }

        @Test
        @DisplayName("G-303: ESG만 있고 조직/위원회 없으면 BLOCK")
        void g303BlockEsgAlone() {
            assertThat(check("G-303",
                    "이번 연도 ESG 보고서를 제출하였습니다", 0.65, false)).isFalse();
        }

        @Test
        @DisplayName("G-302: '보건 신고 절차'는 내부고발 관련 cluster 없으므로 BLOCK")
        void g302BlockHealthReport() {
            assertThat(check("G-302",
                    "보건 당국에 신고 절차를 안내합니다", 0.60, false)).isFalse();
        }

        @Test
        @DisplayName("S-202: '봉사활동 참여 340명'은 산업재해 지표에서 BLOCK")
        void s202BlockBonusaActivity() {
            assertThat(check("S-202",
                    "지역사회 봉사활동 참여 인원은 연간 340명입니다", 0.55, false)).isFalse();
        }

        @Test
        @DisplayName("G-301: 환경 감축 목표 문장은 윤리경영 지표에서 BLOCK")
        void g301BlockEnvText() {
            assertThat(check("G-301",
                    "온실가스 감축 목표를 설정하고 추진합니다", 0.60, false)).isFalse();
        }

        @Test
        @DisplayName("S-204: '직원들이 열심히 일합니다'는 참여 cluster 없으므로 BLOCK")
        void s204BlockGenericWork() {
            assertThat(check("S-204",
                    "직원들이 열심히 일하고 있습니다", 0.58, false)).isFalse();
        }

        @Test
        @DisplayName("S-204: generic 단어 '참여'만 단독 존재 시 BLOCK")
        void s204BlockGenericParticipation() {
            // '참여'는 GENERIC_TOKENS — 단독 단일토큰 cluster 없으므로 BLOCK
            assertThat(check("S-204",
                    "모든 직원이 참여합니다", 0.62, false)).isFalse();
        }

        @Test
        @DisplayName("G-302: '제보' 단독 (채널/시스템 없음)은 BLOCK")
        void g302BlockTipAlone() {
            assertThat(check("G-302",
                    "문제를 제보해 주시기 바랍니다", 0.61, false)).isFalse();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Group 5 — Similarity Relaxed Mode
    // ═════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Group 5 ▶ Similarity Relaxed Mode (rawSim >= 0.85)")
    class RelaxedMode {

        @BeforeEach
        void header() {
            System.out.println("\n" + LINE);
            System.out.println("Group 5 : Similarity Relaxed Mode 경계값 테스트");
            System.out.println(LINE);
        }

        @Test
        @DisplayName("단일 비제네릭 토큰 '참여율' — sim 무관 PASS")
        void singleNonGenericTokenAlwaysPasses() {
            // '참여율'은 GENERIC_TOKENS에 없는 단일 cluster → sim 낮아도 PASS
            assertThat(check("S-204", "임직원 참여율 91%", 0.50, true)).isTrue();
        }

        @Test
        @DisplayName("미정의 지표 E-999 — 항상 PASS")
        void undefinedIndicatorAlwaysPasses() {
            assertThat(check("E-999",
                    "임의의 텍스트가 들어와도 gate 없는 지표는 통과합니다", 0.30, true)).isTrue();
        }

        @Test
        @DisplayName("미정의 지표 E-101 — gate 정의 없으면 항상 PASS")
        void e101UndefinedPassesAlways() {
            assertThat(check("E-101",
                    "전력 사용량은 12,500 MWh 입니다", 0.88, true)).isTrue();
        }

        @Test
        @DisplayName("G-302 sim=0.90 고유사도 — cluster 매칭 유지 검증")
        void g302HighSimClusterStillRequired() {
            // sim이 높아도 cluster AND-match는 동일하게 적용됨
            assertThat(check("G-302",
                    "익명 신고 채널 운영 현황입니다", 0.90, true)).isTrue();
        }

        @Test
        @DisplayName("hasGate: G-302·G-303·S-204는 true, E-999는 false")
        void hasGateCheck() {
            assertThat(gate.hasGate("G-302")).isTrue();
            assertThat(gate.hasGate("G-303")).isTrue();
            assertThat(gate.hasGate("S-204")).isTrue();
            assertThat(gate.hasGate("E-999")).isFalse();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Group 6 — 원본 PDF 문장 이슈 재현
    // ═════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Group 6 ▶ 실제 PDF 문장 — 이슈 리포트 재현")
    class RealPdfSentences {

        @BeforeEach
        void header() {
            System.out.println("\n" + LINE);
            System.out.println("Group 6 : 원본 PDF 문장 이슈 재현 테스트");
            System.out.println(LINE);
        }

        @Test
        @DisplayName("G-302 이슈: '사내 인권 보호 정책과 익명 신고 시스템' → PASS")
        void g302OriginalIssue() {
            assertThat(check("G-302",
                    "사내 인권 보호 정책과 익명 신고 시스템을 운영하고 있습니다", 0.88, true)).isTrue();
        }

        @Test
        @DisplayName("G-303 이슈: 'ESG 위원회를 설치하여 분기별 리스크 검토' → PASS")
        void g303OriginalIssue() {
            assertThat(check("G-303",
                    "ESG 위원회를 설치하여 분기별 리스크 검토를 수행하고 있습니다", 0.85, true)).isTrue();
        }

        @Test
        @DisplayName("S-204 이슈: '지역사회 봉사활동 참여 인원은 연간 340명' → PASS")
        void s204OriginalIssue() {
            assertThat(check("S-204",
                    "지역사회 봉사활동 참여 인원은 연간 340명입니다", 0.82, true)).isTrue();
        }

        @Test
        @DisplayName("S-202 교차검증: 같은 봉사활동 문장이 S-202에서는 BLOCK")
        void s202CrossCheck() {
            assertThat(check("S-202",
                    "지역사회 봉사활동 참여 인원은 연간 340명입니다", 0.82, false)).isFalse();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 전체 요약 출력
    // ═════════════════════════════════════════════════════════════════════

    @AfterAll
    static void summary() {
        System.out.println("\n" + "═".repeat(60));
        System.out.println("IndicatorKeywordGate 검증 완료");
        System.out.println("  Group 1 — G-303 띄어쓰기 변형  : 5 cases");
        System.out.println("  Group 2 — G-302 동의어 변형    : 5 cases");
        System.out.println("  Group 3 — S-204 자연어 문장    : 4 cases");
        System.out.println("  Group 4 — False Positive 방지  : 7 cases");
        System.out.println("  Group 5 — Relaxed Mode         : 5 cases");
        System.out.println("  Group 6 — 원본 PDF 이슈 재현   : 4 cases");
        System.out.println("  Total                          : 30 cases");
        System.out.println("═".repeat(60));
    }
}
