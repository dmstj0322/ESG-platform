package com.esg.analysis.service;

import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.AnalysisResultCache.EvidenceMappingDto;
import com.esg.analysis.dto.AnalysisResultCache.SectionDto;
import com.esg.analysis.dto.AnalysisResultCache.SubIndicatorDto;
import com.esg.analysis.dto.IndicatorResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AnalysisScoreAggregator {

    public String scoreToGrade(int score) {
        if (score >= 90) return "A";
        if (score >= 70) return "B";
        if (score >= 50) return "C";
        return "D";
    }

    private int computeOverallConfidence(List<IndicatorResult> results) {
        if (results == null || results.isEmpty()) return 0;
        return (int) Math.round(results.stream()
                .mapToInt(IndicatorResult::getConfidenceScore)
                .average().orElse(0));
    }

    private int computeAvgScore(List<IndicatorResult> results) {
        if (results == null || results.isEmpty()) return 30;
        return (int) Math.round(results.stream().mapToInt(IndicatorResult::getScore).average().orElse(30));
    }

    /** 지표 결과를 집계하여 AnalysisResultCache를 반환합니다. */
    public AnalysisResultCache aggregate(List<IndicatorResult> results, long socialBonus) {
        Map<String, List<IndicatorResult>> grouped = groupByCategory(results);

        int eScore    = computeAvgScore(grouped.get("E"));
        int rawSScore = computeAvgScore(grouped.get("S"));
        long cappedBonus = Math.min(socialBonus, EcoPointConverter.MAX_S_BONUS);
        int sScore    = (int) Math.min((long) rawSScore + cappedBonus, 100L);
        int gScore    = computeAvgScore(grouped.get("G"));
        log.info("[ESG-SCORE-AGGREGATOR] rawSScore={} socialBonus={} cappedBonus={} finalSScore={} eScore={} gScore={}",
                rawSScore, socialBonus, cappedBonus, sScore, eScore, gScore);

        String eGrade = scoreToGrade(eScore);
        String sGrade = scoreToGrade(sScore);
        String gGrade = scoreToGrade(gScore);

        int finalScore = (int) Math.round(eScore * 0.4 + sScore * 0.3 + gScore * 0.3);
        String finalGrade = scoreToGrade(finalScore);

        String overallOpinion   = buildOverallOpinion(eScore, eGrade, sScore, sGrade, rawSScore,
                gScore, gGrade, finalScore, finalGrade, cappedBonus);
        String indicatorSection = buildIndicatorDiagnosis(results);
        String riskOpportunity  = buildRiskOpportunity(results);

        String fullReport = "## [종합 소견]\n\n" + overallOpinion
                + "\n\n---\n\n## [지표별 정밀 진단]\n\n" + indicatorSection
                + "\n---\n\n## [Risk & Opportunity]\n\n" + riskOpportunity;

        List<SectionDto> sections = List.of(
                buildSection("Environment", eScore, eGrade, grouped.get("E")),
                buildSection("Social",      sScore, sGrade, grouped.get("S")),
                buildSection("Governance",  gScore, gGrade, grouped.get("G"))
        );

        AnalysisResultCache cache = new AnalysisResultCache();
        cache.setFinalGrade(finalGrade);
        cache.setFullReport(fullReport);
        cache.setOverallOpinion(overallOpinion);
        cache.setRiskOpportunity(riskOpportunity);
        cache.setSections(sections);
        cache.setEvidenceMapping(buildEvidenceMapping(results));
        cache.setEScore(eScore);
        cache.setSScore(sScore);
        cache.setGScore(gScore);
        cache.setTotalScore(finalScore);
        cache.setOverallConfidence(computeOverallConfidence(results));
        return cache;
    }

    // ── 내부 헬퍼 ────────────────────────────────────────────────────────────

    private Map<String, List<IndicatorResult>> groupByCategory(List<IndicatorResult> results) {
        Map<String, List<IndicatorResult>> grouped = new LinkedHashMap<>();
        grouped.put("E", new ArrayList<>());
        grouped.put("S", new ArrayList<>());
        grouped.put("G", new ArrayList<>());
        for (IndicatorResult r : results) {
            String prefix = r.getKey().isEmpty() ? "E" : r.getKey().substring(0, 1);
            grouped.getOrDefault(prefix, grouped.get("E")).add(r);
        }
        return grouped;
    }

    private SectionDto buildSection(String category, int score, String grade, List<IndicatorResult> indicators) {
        String diagnosisStatus = score >= 90 ? "지표 관리 상태 최우수"
                : score >= 70 ? "지표 관리 상태 양호"
                : score >= 50 ? "전략적 보완 필요"
                : "정량적 공시 수준 미흡";

        String topComment = indicators.stream()
                .filter(r -> !r.getComment().contains("오류가 발생"))
                .sorted(Comparator.comparingInt(IndicatorResult::getScore).reversed())
                .map(IndicatorResult::getComment)
                .limit(2)
                .collect(Collectors.joining(" "));
        if (topComment.isBlank() && !indicators.isEmpty()) topComment = indicators.get(0).getComment();

        String cleanedComment = topComment
                .replaceAll("\\[(현황[^\\]]*|가이드라인\\s*준수\\s*여부|준수\\s*여부|성과\\s*평가|성과|개선\\s*제언|개선)\\]\\s*", "")
                .replaceAll("\\s+", " ").trim();

        String categoryComment = "[현황 분석] " + category + " 영역 평균 " + score + "점(" + grade + "등급) — " + diagnosisStatus + ". "
                + "[가이드라인 준수 여부] K-ESG 기준 " + grade + "등급 수준으로 평가됨. "
                + "[성과 평가] " + (cleanedComment.isBlank() ? "세부 지표 분석 결과를 참고하세요." : cleanedComment) + " "
                + "[개선 제언] 세부 지표별 권고사항을 참고하세요.";

        String recommendation = indicators.stream()
                .filter(r -> r.getScore() < 70 && r.getRecommendation() != null && !r.getRecommendation().isBlank())
                .map(IndicatorResult::getRecommendation)
                .findFirst()
                .orElse(category + " 영역의 현재 성과를 유지하고, 미달 지표를 중심으로 지속적 개선을 권고합니다.");

        List<SubIndicatorDto> subIndicators = indicators.stream()
                .map(r -> new SubIndicatorDto(
                        r.getKey().contains("_") ? r.getKey().split("_", 2)[1] : r.getKey(),
                        r.getKesgCode(),
                        r.getScore(),
                        r.getGrade(),
                        r.getComment(),
                        r.getConfidenceScore(),
                        r.getEvidenceText(),
                        r.getPageNumber() > 0 ? r.getPageNumber() : null
                ))
                .collect(Collectors.toList());

        return new SectionDto(category, score, grade, categoryComment, recommendation, subIndicators);
    }

    private List<EvidenceMappingDto> buildEvidenceMapping(List<IndicatorResult> results) {
        return results.stream()
                .map(r -> {
                    String name = r.getKey().contains("_") ? r.getKey().split("_", 2)[1] : r.getKey();
                    String consistency = r.getConfidenceScore() >= 80 ? "High"
                            : r.getConfidenceScore() >= 60 ? "Medium" : "Low";
                    return new EvidenceMappingDto(
                            name,
                            r.getKesgCode(),
                            (r.getEvidenceText() != null && !r.getEvidenceText().isBlank()) ? r.getEvidenceText() : null,
                            r.getPageNumber() > 0 ? r.getPageNumber() : null,
                            consistency,
                            r.getConfidenceScore(),
                            r.getScore(),
                            r.getGrade()
                    );
                })
                .collect(Collectors.toList());
    }

    private String buildOverallOpinion(int eScore, String eGrade, int sScore, String sGrade, int rawSScore,
                                       int gScore, String gGrade, int finalScore, String finalGrade, long cappedBonus) {
        String assessment = switch (finalGrade) {
            case "A" -> "전반적인 ESG 공시 수준이 우수하며, 지표 관리 상태가 양호합니다. 업계 선도적 수준으로 지속 유지를 권고합니다.";
            case "B" -> "핵심 지표 공시는 충실하나, 일부 영역에서 전략적 보완이 필요합니다. 미달 지표 집중 개선 시 A등급 달성이 가능합니다.";
            case "C" -> "정량적 공시 수준이 미흡한 영역이 다수 확인됩니다. 중장기 ESG 전략 수립 및 공시 체계 강화가 시급합니다.";
            default  -> "ESG 관련 공시 데이터가 현저히 부족하여 체계적 관리 시스템 구축이 필요합니다. 즉각적인 개선 조치를 강력히 권고합니다.";
        };

        StringBuilder sb = new StringBuilder();
        sb.append(String.format(
                "본 기업의 ESG 경영 체력을 K-ESG 가이드라인(산업통상자원부, 2021) 기준으로 정밀 진단한 결과, "
                        + "환경(E) **%d점(%s등급)**, 사회(S) **%d점(%s등급)**, 지배구조(G) **%d점(%s등급)**으로, "
                        + "가중평균(E×40%% + S×30%% + G×30%%) 적용 종합 **%d점(%s등급)**으로 평가됩니다.\n\n%s",
                eScore, eGrade, sScore, sGrade, gScore, gGrade, finalScore, finalGrade, assessment));

        if (cappedBonus > 0) {
            String preSGrade = scoreToGrade(rawSScore);
            int preFinalScore = (int) Math.round(eScore * 0.4 + rawSScore * 0.3 + gScore * 0.3);
            sb.append(String.format(
                    "\n\n**[에코포인트 가산 효과 — 투명성 공시]** 임직원 에코포인트 활동으로 "
                            + "사회(S) 순수 분석점수 %d점(%s등급)에 **+%d점** 가산 반영되었습니다. "
                            + "포인트 가산 전 종합 **%s등급** → 가산 후 **%s등급**으로 평가 변화.",
                    rawSScore, preSGrade, cappedBonus, scoreToGrade(preFinalScore), finalGrade));
        }
        return sb.toString();
    }

    private String buildIndicatorDiagnosis(List<IndicatorResult> results) {
        StringBuilder sb = new StringBuilder();
        for (IndicatorResult r : results) {
            String name = r.getKey().contains("_") ? r.getKey().split("_", 2)[1] : r.getKey();
            sb.append(String.format("**[%s] %s** — %d점 (%s등급, 신뢰도 %d%%)\n",
                    r.getKesgCode(), name, r.getScore(), r.getGrade(), r.getConfidenceScore()));
            sb.append(r.getComment()).append("\n");
            if (r.getEvidenceText() != null && !r.getEvidenceText().isBlank()) {
                String pageRef = r.getPageNumber() > 0 ? " (p." + r.getPageNumber() + ")" : "";
                sb.append(String.format("> 📄 원문 근거: \"%s\"%s\n", r.getEvidenceText(), pageRef));
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private String buildRiskOpportunity(List<IndicatorResult> results) {
        StringBuilder sb = new StringBuilder();
        sb.append("### 🔴 즉시 조치 필요 항목\n\n");
        List<IndicatorResult> redFlags = results.stream()
                .filter(r -> r.getScore() < 50)
                .sorted(Comparator.comparingInt(IndicatorResult::getScore))
                .collect(Collectors.toList());
        if (redFlags.isEmpty()) {
            sb.append("- 즉시 조치가 필요한 D등급 지표가 없습니다. 현재 수준 유지를 권고합니다.\n");
        } else {
            redFlags.forEach(r -> {
                String name = r.getKey().contains("_") ? r.getKey().split("_", 2)[1] : r.getKey();
                String kpiRec = buildKpiRecommendation(r.getKesgCode(), r.getScore());
                sb.append(String.format("- **[%s] %s** (%d점): %s\n",
                        r.getKesgCode(), name, r.getScore(),
                        kpiRec.isBlank() ? r.getRecommendation() : kpiRec));
            });
        }
        sb.append("\n### 🟡 K-ESG 기준 대비 보완 필요 KPI\n\n");
        List<IndicatorResult> opportunities = results.stream()
                .filter(r -> r.getScore() >= 50 && r.getScore() < 75)
                .sorted(Comparator.comparingInt(IndicatorResult::getScore))
                .collect(Collectors.toList());
        if (opportunities.isEmpty()) {
            sb.append("- C등급 지표 없음. 상위 등급 달성을 위한 KPI 고도화를 권고합니다.\n");
        } else {
            opportunities.forEach(r -> {
                String name = r.getKey().contains("_") ? r.getKey().split("_", 2)[1] : r.getKey();
                String kpiRec = buildKpiRecommendation(r.getKesgCode(), r.getScore());
                sb.append(String.format("- **[%s] %s** (%d점 → B등급 목표): %s\n",
                        r.getKesgCode(), name, r.getScore(),
                        kpiRec.isBlank() ? r.getRecommendation() : kpiRec));
            });
        }
        sb.append("\n### 🟢 ESG 선도 수준 달성을 위한 고도화 과제\n\n");
        // 높은 점수이더라도 ESG 선도 기준 관점에서 추가 개선 과제 제시
        sb.append(buildAdvancedKpiTasks(results));
        return sb.toString();
    }

    /**
     * K-ESG 지표 코드별 구체적 KPI 기반 개선 권고 생성.
     * 단순 "근거 부족" 대신 실질적 ESG 고도화 관점의 처방을 제공합니다.
     */
    private String buildKpiRecommendation(String kesgCode, int score) {
        if (kesgCode == null) return "";
        return switch (kesgCode) {
            case "E-101" -> "전력 사용량 절감 목표(연도별 kWh 감축률)와 재생에너지 전환 계획을 정량 공시하세요. RE100 로드맵 수립 권고.";
            case "E-102" -> "가스 사용량 Scope1 배출계수 기반 실측 데이터를 연도별로 공시하고, 감축 목표치를 설정하세요.";
            case "E-103" -> "Scope1·2 탄소 배출량 정량 공시 강화 및 Scope3 장기 감축 목표를 수립하세요. 탄소중립 로드맵 공개를 권고합니다.";
            case "E-104" -> "폐기물 발생량 대비 재활용률 목표(%)를 설정하고, 유해폐기물 별도 관리 실적을 공시하세요.";
            case "E-105" -> "용수 사용량 절감 목표와 재이용률 지표를 수립하고, 수자원 리스크 대응 계획을 공시하세요.";
            case "S-201" -> "산업안전 교육 1인당 연간 이수 시간(시간/인), 교육 이수율(%)을 K-ESG 기준으로 정량 공시하세요.";
            case "S-202" -> "LTIR(근로손실재해율) 및 TRIR(총재해율)을 업종 평균 대비 수치로 공시하고, 무재해 달성 목표를 설정하세요.";
            case "S-203" -> "ESG 교육 이수율(%), 교육 시간(h/인), 교육 참여자 수를 연도별 추이 포함하여 공시하세요.";
            case "S-204" -> "임직원 ESG 참여율(%), 참여 프로그램 종류와 운영 현황을 정량 KPI로 공시하세요.";
            case "S-205" -> "지역사회 기여금액(원), 봉사시간(시간), 수혜자 수 등 사회공헌 정량 실적을 공시하세요.";
            case "G-301" -> "윤리경영 위반 건수(0건 목표), 반부패 교육 이수율(%), 컴플라이언스 정책 개정 주기를 공시하세요.";
            case "G-302" -> "내부 신고 접수 건수 및 처리 현황(처리율, 처리기간)을 투명하게 공시하세요. 제보자 보호 정책도 함께 공개하세요.";
            case "G-303" -> "ESG 위원회 구성(위원 수·전문성·독립성), 연간 개최 횟수, 주요 의결 사항을 공시하세요.";
            case "G-304" -> "외부 감사인 선임 기준, 감사 의견, 비감사 서비스 제한 여부를 공시하고 ESG 정보 제3자 검증을 도입하세요.";
            case "G-305" -> "사외이사 비율(%), 여성 이사 비율(%), 이사회 출석률(%)을 연도별로 공시하고 다양성 목표를 설정하세요.";
            default -> "";
        };
    }

    /**
     * 높은 점수 지표에 대해서도 ESG 선도 수준 달성을 위한 추가 고도화 과제를 제시합니다.
     */
    private String buildAdvancedKpiTasks(List<IndicatorResult> results) {
        StringBuilder sb = new StringBuilder();
        boolean hasE = results.stream().anyMatch(r -> r.getKesgCode() != null && r.getKesgCode().startsWith("E"));
        boolean hasS = results.stream().anyMatch(r -> r.getKesgCode() != null && r.getKesgCode().startsWith("S"));
        boolean hasG = results.stream().anyMatch(r -> r.getKesgCode() != null && r.getKesgCode().startsWith("G"));
        if (hasE) {
            sb.append("- **[환경 E]** Scope3 가치사슬 전체 배출량 측정 및 장기 감축 목표 공시, 공급망 ESG 정량 KPI 요구 체계 구축\n");
            sb.append("- **[환경 E]** 탄소중립 SBTi(과학기반 감축목표) 설정 및 CDP(탄소정보공개프로젝트) 참여 검토\n");
        }
        if (hasS) {
            sb.append("- **[사회 S]** 여성 임원 비율 장기 목표 및 다양성·형평성·포용(DEI) 정책 수립 공시\n");
            sb.append("- **[사회 S]** 인권 실사(Human Rights Due Diligence) 프로세스 구축 및 공급망 노동 기준 점검 체계 도입\n");
        }
        if (hasG) {
            sb.append("- **[지배구조 G]** 이사회 ESG 전문성 강화(ESG 전문가 이사 선임) 및 CEO 보수와 ESG KPI 연동 검토\n");
            sb.append("- **[지배구조 G]** 윤리 위반 재발방지 KPI, 내부통제 실효성 측정 지표 수립 및 공시\n");
        }
        if (sb.isEmpty()) sb.append("- 현재 ESG 성과를 유지하며 K-ESG Plus 수준의 고도화 전략을 수립하세요.\n");
        return sb.toString();
    }
}
