package com.esg.analysis.service;

import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.domain.ESGIndicator;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class AnalysisPromptBuilder {

    private static final Map<String, String> KESG_CODE_MAP = Map.ofEntries(
            Map.entry("E1", "E-1-1"), Map.entry("E2", "E-2-1"), Map.entry("E3", "E-3-1"),
            Map.entry("E4", "E-4-1"), Map.entry("E5", "E-5-1"), Map.entry("E6", "E-6-1"),
            Map.entry("S1", "S-1-1"), Map.entry("S2", "S-2-1"), Map.entry("S3", "S-3-1"),
            Map.entry("S4", "S-4-1"), Map.entry("S5", "S-5-1"), Map.entry("S6", "S-6-1"),
            Map.entry("G1", "G-1-1"), Map.entry("G2", "G-2-1"), Map.entry("G3", "G-3-1"),
            Map.entry("G4", "G-4-1"), Map.entry("G5", "G-5-1"), Map.entry("G6", "G-6-1")
    );

    public String resolveKesgCode(String indicatorKey) {
        if (indicatorKey == null || indicatorKey.length() < 2) return "K-ESG";
        return KESG_CODE_MAP.getOrDefault(indicatorKey.substring(0, 2).toUpperCase(), indicatorKey);
    }

    /**
     * @deprecated Rule-based 점수 엔진 도입으로 미사용. {@link #buildSummaryPrompt} 사용.
     */
    @Deprecated
    public String buildIndicatorPrompt(String indicatorKey, String chunk, String kEsgGuidelines) {
        String indicatorName = indicatorKey.contains("_") ? indicatorKey.split("_", 2)[1] : indicatorKey;
        String kesgCode = resolveKesgCode(indicatorKey);
        String chunkText = (chunk == null || chunk.isBlank()) ? "(보고서 내 관련 데이터 미발견)" : chunk;
        String guidelineSnippet = kEsgGuidelines.isBlank()
                ? "(가이드라인 미조회)"
                : (kEsgGuidelines.length() > 400 ? kEsgGuidelines.substring(0, 400) + "..." : kEsgGuidelines);

        return "당신은 15년 경력의 ESG 전문 컨설턴트로서 '종합 진단 결과서'를 작성합니다.\n"
                + "평이한 서술(예: '데이터가 있음')을 금지합니다. "
                + "'지표 관리 상태 양호', '전략적 보완 필요', '정량적 공시 수준 미흡' 등 전문 진단 용어를 사용하세요.\n"
                + "모든 분석 코멘트에는 PDF에서 추출한 수치(tCO2-eq, %, 명, 원, kWh, m³, 톤 등)를 포함해야 합니다. "
                + "수치가 없는 분석은 '(추론)' 표기를 의무화합니다.\n\n"
                + "[수치 비교 오류 방지 — 필수]\n"
                + "두 수치를 비교할 때 반드시 두 값을 나란히 놓고 대소를 확인한 뒤 서술하세요.\n"
                + "예) A=4,443명, B=3,815명 → A>B이므로 여성이 더 많음.\n"
                + "'~에 비해 낮음/높음/적음/많음' 표현은 실제 숫자 계산을 먼저 수행한 후에만 사용하세요.\n"
                + "부정적 평가(미흡·낮음·부족·불균형 등)는 해당 수치가 비교 기준값보다 실제로 작을 때만 허용합니다.\n\n"
                + "[분석 대상 지표]\n"
                + "K-ESG 문항코드: " + kesgCode + "\n"
                + "지표명: " + indicatorName + "\n\n"
                + "[보고서 발췌 — 벡터 검색 결과]\n"
                + "※ 표 데이터가 있다면 수치와 단위를 반드시 분석에 포함하세요. "
                + "숫자가 나열되어 있다면 표의 행/열로 간주하고, 지표 이름과 연결된 수치를 끝까지 찾아내세요.\n"
                + chunkText + "\n\n"
                + "[K-ESG 가이드라인 참조]\n"
                + guidelineSnippet + "\n\n"
                + "[분석 지시사항]\n"
                + "1. 보고서 발췌에서 핵심 수치와 단위를 추출하여 0~100점으로 평가하세요.\n"
                + "2. 발췌가 '미발견'이면 30점.\n"
                + "3. comment는 ① [현황 분석] ② [가이드라인 준수 여부] ③ [성과 평가] ④ [개선 제언] 순서로 작성. "
                + "각 항목에 구체적 수치와 단위를 반드시 포함하세요.\n"
                + "4. 등급: 90+ A, 70~89 B, 50~69 C, 50미만 D\n"
                + "5. evidence_text: 이 지표를 가장 잘 뒷받침하는 원문 문구를 그대로 인용(최대 100자). 없으면 빈 문자열.\n"
                + "6. page_number: 보고서 발췌문에서 evidence_text 위치 직전에 등장하는 [FILE_PAGE:X] 마커의 X 값을 정수로 반환하세요. "
                + "[FILE_PAGE:X] 마커가 없으면 -1을 반환.\n"
                + "7. confidence_score: 원문 수치 기반이면 80~100, 부분 추론이면 50~79, 완전 추론이면 0~49.\n\n"
                + "[출력 규칙]\n"
                + "마크다운 없이 순수 JSON만 반환하세요:\n"
                + "{\"score\": 75, \"grade\": \"B\", "
                + "\"comment\": \"[현황 분석]...[가이드라인 준수 여부]...[성과 평가]...[개선 제언]...\", "
                + "\"recommendation\": \"...\", "
                + "\"evidence_text\": \"원문 인용 문구\", "
                + "\"page_number\": 121, "
                + "\"confidence_score\": 85}";
    }

    /**
     * Rule-based 점수 산출 후 GPT에게 comment/recommendation만 요청하는 프롬프트.
     * score와 grade는 이미 서버에서 계산되었으므로 GPT가 재생성하지 않습니다.
     * confidenceScore를 받아 낮을 경우 부정 평가 금지 지시를 강화합니다.
     */
    public String buildSummaryPrompt(ESGIndicator indicator, List<EvidenceResult> evidences,
                                     int score, String kEsgGuidelines, int confidenceScore) {
        String evidenceText = evidences.isEmpty()
                ? "(보고서 내 관련 데이터 미발견)"
                : evidences.stream()
                        .limit(5)
                        .map(e -> "  • " + e.getEvidenceText())
                        .collect(Collectors.joining("\n"));

        String guidelineSnippet = (kEsgGuidelines == null || kEsgGuidelines.isBlank())
                ? "(가이드라인 미조회)"
                : (kEsgGuidelines.length() > 400 ? kEsgGuidelines.substring(0, 400) + "..." : kEsgGuidelines);

        String confidenceWarning = confidenceScore < 50
                ? "⚠️ 현재 신뢰도=" + confidenceScore + "% (낮음) — 부정적 단정을 금지합니다. 근거 없는 평가는 모두 \"(정보 부족)\"으로 표기하세요.\n"
                : "신뢰도=" + confidenceScore + "%\n";

        return "당신은 15년 경력의 ESG 전문 컨설턴트로서 진단 코멘트를 작성합니다.\n"
                + "ESG 점수는 서버 Rule-based 엔진에서 이미 " + score + "점으로 산출되었습니다.\n"
                + "score와 grade를 직접 생성하지 마세요.\n\n"
                + "[🚨 Hallucination 방지 — 절대 준수]\n"
                + "1. 아래 [보고서 근거 원문]에 존재하지 않는 내용을 사실로 서술하지 마세요.\n"
                + "2. \"없다\", \"미운영\", \"부재\", \"미흡\", \"부족\" 등 부정적 단정은 근거 원문에 명시된 경우에만 허용합니다.\n"
                + "3. 정책·시스템·제도의 부재를 추론하여 단정하지 마세요.\n"
                + "4. 근거 원문에 없는 내용은 반드시 \"(정보 부족)\" 또는 \"(근거 없음)\"으로 표기하세요.\n"
                + "5. " + confidenceWarning
                + "\n"
                + "[분석 대상 지표]\n"
                + indicator.getCode() + " " + indicator.getTitle() + " (산출 점수: " + score + "점)\n\n"
                + "[보고서 근거 원문 — RAG Evidence Retrieval]\n"
                + "※ 아래 evidence만을 근거로 작성하세요. evidence에 없는 내용은 \"(정보 부족)\"으로 표기.\n"
                + "※ 수치와 단위가 있다면 반드시 분석에 포함하세요.\n"
                + evidenceText + "\n\n"
                + "[K-ESG 가이드라인 참조]\n"
                + guidelineSnippet + "\n\n"
                + "[작성 지시사항]\n"
                + "1. comment: ① [현황 분석] ② [가이드라인 준수 여부] ③ [성과 평가] ④ [개선 제언] 순서로 작성.\n"
                + "2. evidence 원문에 있는 수치·단위를 포함하세요. 없으면 \"(정보 부족)\" 표기.\n"
                + "3. recommendation: 실행 가능한 구체적 개선 방향.\n\n"
                + "[출력 규칙]\n"
                + "마크다운 없이 순수 JSON만 반환:\n"
                + "{\"comment\": \"[현황 분석]...[가이드라인 준수 여부]...[성과 평가]...[개선 제언]...\", "
                + "\"recommendation\": \"...\"}";
    }

    public String buildEcoCommitPrompt(Long ecoPoints, double carbonKg, double trees, int eBonus, int sBonus) {
        return String.format(
                "당신은 K-ESG 지침(산업통상자원부, 2021) 전문 ESG 애널리스트입니다.\n\n"
                        + "[임직원 에코 포인트 성과 확정 데이터]\n"
                        + "- 기업 전체 에코 포인트 합계: %,d EP\n"
                        + "- 탄소 절감량 환산 (1,000 EP = 1 kg): %.1f kg CO₂eq\n"
                        + "- 소나무 식재 효과 (6.6 kg = 1그루): %.1f그루\n"
                        + "- 환경(E) 점수 보정: +%d점\n"
                        + "- 사회(S) 점수 보정: +%d점 (임직원 자발적 참여 지표)\n\n"
                        + "[분석 지시사항]\n"
                        + "1. 에코 포인트 성과를 K-ESG 환경(E) 및 사회(S) 공식 성과로 반영하세요.\n"
                        + "2. 환경(E) 점수: 에코포인트 성과 기반 +%d점 가산 (최대 100점).\n"
                        + "3. 사회(S) 점수: 임직원 자발적 참여 지표로 +%d점 가산 (최대 100점).\n"
                        + "4. [현황 분석] → [가이드라인 준수 여부] → [성과 평가] → [개선 제언] 순서로 comment를 작성하세요.\n"
                        + "5. fullReport에 '임직원 에코 포인트 %,d EP → 탄소 %.1f kg 절감 → 소나무 %.1f그루 식재 효과' 문구를 반드시 포함하세요.\n"
                        + "6. fullReport는 '## [종합 소견]', '## [지표별 정밀 진단]', '## [Risk & Opportunity]' 마크다운 섹션 순서로 구성하세요.\n"
                        + "7. finalGrade: E×40%% + S×30%% + G×30%% 가중평균, 등급 기준: 90+ A, 70~89 B, 50~69 C, 50미만 D\n\n"
                        + "[출력 규칙]\n"
                        + "마크다운 코드블록(```json) 없이 순수 JSON만 반환하세요.\n\n"
                        + "[응답 JSON 구조]\n"
                        + "{\n"
                        + "  \"finalGrade\": \"A|B|C|D\",\n"
                        + "  \"fullReport\": \"...\",\n"
                        + "  \"sections\": [\n"
                        + "    {\"category\": \"Environment\", \"score\": 0, \"grade\": \"A|B|C|D\", \"comment\": \"...\", \"recommendation\": \"...\", \"subIndicators\": []},\n"
                        + "    {\"category\": \"Social\",       \"score\": 0, \"grade\": \"A|B|C|D\", \"comment\": \"...\", \"recommendation\": \"...\", \"subIndicators\": []},\n"
                        + "    {\"category\": \"Governance\",   \"score\": 0, \"grade\": \"A|B|C|D\", \"comment\": \"...\", \"recommendation\": \"...\", \"subIndicators\": []}\n"
                        + "  ]\n"
                        + "}",
                ecoPoints, carbonKg, trees, eBonus, sBonus,
                eBonus, sBonus,
                ecoPoints, carbonKg, trees
        );
    }
}
