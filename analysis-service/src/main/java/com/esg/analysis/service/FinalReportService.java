package com.esg.analysis.service;

import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.FinalReportRequest;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.domain.ConfidenceLevel;
import com.esg.analysis.service.domain.ESGEvidenceMatch;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.esg.analysis.service.repository.ESGEvidenceMatchRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * E/S/G 로컬 결과를 받아 종합 리포트를 생성합니다.
 * OCR·RAG 없이 점수 집계 + GPT 총평만 수행합니다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinalReportService {

    private final AnalysisReportRepository    analysisReportRepository;
    private final ESGEvidenceMatchRepository  evidenceMatchRepository;
    private final SimpMessagingTemplate       messagingTemplate;
    private final AnalysisOpenAiClient        openAiClient;
    private final ObjectMapper                objectMapper;
    private final TransactionTemplate         transactionTemplate;

    public Long createFinalReport(Long userId, Long companyId, FinalReportRequest req) {
        AnalysisReport saved = transactionTemplate.execute(status ->
                analysisReportRepository.save(
                        AnalysisReport.builder()
                                .memberId(userId)
                                .companyId(companyId)
                                .status("PENDING")
                                .reportContent("종합 집계 중...")
                                .build()
                )
        );
        processAsync(saved.getId(), companyId, req);
        return saved.getId();
    }

    @Async("analysisExecutor")
    public void processAsync(Long analysisId, Long companyId, FinalReportRequest req) {
        try {
            send(companyId, "RULE_BASED_SCORING");
            Thread.sleep(500);

            int eScore  = score(req.getEnvironmentResult());
            int sScore  = score(req.getSocialResult());
            int gScore  = score(req.getGovernanceResult());
            int adjS    = Math.min(100, sScore + (req.isEcoPointApplied() ? 4 : 0));
            int total   = req.getTotalScore() != null
                    ? req.getTotalScore()
                    : Math.round(eScore * 0.33f + adjS * 0.33f + gScore * 0.34f);
            String grade = req.getFinalGrade() != null ? req.getFinalGrade() : toGrade(total);
            int conf    = req.getConfidence() != null ? req.getConfidence() : avgConf(req);

            // Grade Ceiling (LOW mismatch 개수 기반: ≥1→B, ≥3→C, ≥4→D)
            int lowCount = countLowMismatches(req);
            String gradeCeiling = lowCount >= 4 ? "D" : lowCount >= 3 ? "C" : lowCount >= 1 ? "B" : null;
            boolean gradeCeilingApplied = false;
            if (gradeCeiling != null) {
                String capped = applyGradeCeiling(grade, gradeCeiling);
                gradeCeilingApplied = !capped.equals(grade);
                grade = capped;
            }
            if (lowCount >= 4)      conf = Math.min(conf, 20);
            else if (lowCount >= 1) conf = Math.min(conf, 40);

            send(companyId, "GPT_SUMMARY");
            GptOpinion opinion = callGptWithMismatch(eScore, adjS, gScore, total, grade, req, lowCount);

            send(companyId, "MERGING_SCORE");
            Thread.sleep(400);

            AnalysisResultCache cache = buildCache(
                    eScore, adjS, gScore, total, grade, conf, opinion, req, lowCount, gradeCeilingApplied);
            String json = objectMapper.writeValueAsString(cache);
            final String finalGrade = grade;

            transactionTemplate.execute(status -> {
                analysisReportRepository.findById(analysisId).ifPresent(r -> {
                    r.completeAnalysis(json, finalGrade);
                    analysisReportRepository.save(r);
                });
                // S/G RAG Evidence가 있으면 DB에 저장 (결과 페이지 Evidence 탭 연결)
                saveEvidences(analysisId, req.getEvidences());
                return null;
            });

            Thread.sleep(400);
            send(companyId, "COMPLETED");

        } catch (Exception e) {
            log.error("[FinalReport] 처리 실패 analysisId={}: {}", analysisId, e.getMessage(), e);
            send(companyId, "FAILED");
            transactionTemplate.execute(status -> {
                analysisReportRepository.findById(analysisId).ifPresent(r -> {
                    r.failAnalysis();
                    analysisReportRepository.save(r);
                });
                return null;
            });
        }
    }

    // ── 내부 헬퍼 ────────────────────────────────────────────────────────────

    private void send(Long companyId, String stage) {
        messagingTemplate.convertAndSend("/topic/analysis/" + companyId, stage);
    }

    private int score(FinalReportRequest.CategoryResult r) {
        return r != null && r.getScore() != null ? r.getScore() : 0;
    }

    private String grade(FinalReportRequest.CategoryResult r) {
        return r != null && r.getGrade() != null ? r.getGrade() : "N/A";
    }

    private int conf(FinalReportRequest.CategoryResult r) {
        return r != null && r.getConfidence() != null ? r.getConfidence() : 70;
    }

    private String toGrade(int score) {
        if (score >= 80) return "A";
        if (score >= 65) return "B";
        if (score >= 45) return "C";
        return "D";
    }

    private int avgConf(FinalReportRequest req) {
        int total = 0, cnt = 0;
        for (FinalReportRequest.CategoryResult r : List.of(
                req.getEnvironmentResult(), req.getSocialResult(), req.getGovernanceResult())) {
            if (r != null && r.getConfidence() != null) {
                total += r.getConfidence();
                cnt++;
            }
        }
        return cnt == 0 ? 70 : total / cnt;
    }

    // ── GPT 총평 생성 ─────────────────────────────────────────────────────────

    private record GptOpinion(String overallOpinion, String riskOpportunity) {}

    private int countLowMismatches(FinalReportRequest req) {
        List<FinalReportRequest.EvidenceItem> items = req.getEvidences();
        if (items == null || items.isEmpty()) return 0;
        return (int) items.stream().filter(i -> "LOW".equals(i.getNumericMatchLevel())).count();
    }

    private String applyGradeCeiling(String grade, String ceiling) {
        java.util.List<String> order = java.util.List.of("A", "B", "C", "D");
        int gi = order.indexOf(grade);
        int ci = order.indexOf(ceiling);
        if (gi < 0 || ci < 0) return grade;
        return order.get(Math.max(gi, ci));
    }

    private GptOpinion callGptWithMismatch(int e, int s, int g, int total, String grade,
                                           FinalReportRequest req, int lowCount) {
        GptOpinion base = callGpt(e, s, g, total, grade, req);
        if (lowCount == 0) return base;
        String mismatchRisk = lowCount >= 4
                ? "[리스크] 입력 ESG 데이터와 증빙자료 간 심각한 수치 불일치가 감지되었습니다. (" + lowCount + "개 항목 불일치) 데이터 신뢰성에 심각한 문제가 있으며 즉각적인 검토가 필요합니다."
                : "[리스크] 입력 ESG 데이터와 증빙자료 간 수치 불일치가 감지되었습니다. 제출된 환경 데이터의 신뢰성 검증이 필요합니다.";
        return new GptOpinion(base.overallOpinion(), mismatchRisk + " " + base.riskOpportunity());
    }

    private GptOpinion callGpt(int e, int s, int g, int total, String grade, FinalReportRequest req) {
        String prompt = buildPrompt(e, s, g, total, grade, req);
        try {
            String raw = openAiClient.callWithRetry(prompt);
            JsonNode node = objectMapper.readTree(raw);
            String opinion = node.path("overallOpinion").asText(null);
            String risk    = node.path("riskOpportunity").asText(null);
            if (opinion == null || opinion.isBlank()) {
                return fallbackOpinion(e, s, g, total, grade);
            }
            return new GptOpinion(
                    opinion,
                    risk != null && !risk.isBlank() ? risk : buildRisk(grade, e, s, g)
            );
        } catch (Exception ex) {
            log.warn("[FinalReport] GPT 실패 — 기본 총평 사용: {}", ex.getMessage());
            return fallbackOpinion(e, s, g, total, grade);
        }
    }

    private String buildPrompt(int e, int s, int g, int total, String grade, FinalReportRequest req) {
        return "당신은 10년 경력의 ESG 전문 컨설턴트입니다.\n"
                + "아래 K-ESG 기반 평가 결과를 바탕으로 JSON을 반환하세요.\n\n"
                + "## 평가 결과\n"
                + "- 환경(E): " + e + "점 / " + grade(req.getEnvironmentResult()) + "등급 / 신뢰도 " + conf(req.getEnvironmentResult()) + "%\n"
                + "- 사회(S): " + s + "점 / " + grade(req.getSocialResult()) + "등급 / 신뢰도 " + conf(req.getSocialResult()) + "%\n"
                + "- 지배구조(G): " + g + "점 / " + grade(req.getGovernanceResult()) + "등급 / 신뢰도 " + conf(req.getGovernanceResult()) + "%\n"
                + "- 종합 점수: " + total + "점 / 최종 등급: " + grade + "\n"
                + "- EcoPoint 연동: " + (req.isEcoPointApplied() ? "예" : "아니오") + "\n\n"
                + "## 반환 형식 (JSON)\n"
                + "{\n"
                + "  \"overallOpinion\": \"200자 내외의 전문적 종합 총평. 강점 1~2개, 개선과제 1~2개 포함.\",\n"
                + "  \"riskOpportunity\": \"리스크 1개 + 기회 1개를 각각 [리스크] [기회] 레이블로 구분.\"\n"
                + "}\n\n"
                + "마케팅 과장 표현 금지. 수치 기반 전문 진단 용어 사용.";
    }

    private GptOpinion fallbackOpinion(int e, int s, int g, int total, String grade) {
        String opinion = String.format(
                "K-ESG 종합 점수 %d점(%s등급)으로 평가되었습니다. "
                + "환경(E) %d점, 사회(S) %d점, 지배구조(G) %d점입니다. "
                + "균형 있는 ESG 경영 체계 구축과 지속적인 지표 관리가 권고됩니다.",
                total, grade, e, s, g);
        return new GptOpinion(opinion, buildRisk(grade, e, s, g));
    }

    private String buildRisk(String grade, int e, int s, int g) {
        int low  = Math.min(e, Math.min(s, g));
        String area = (e == low ? "환경(E)" : s == low ? "사회(S)" : "지배구조(G)");
        return String.format(
                "[리스크] %s 영역의 점수가 상대적으로 낮아 ESG 공시 의무화에 따른 규제 리스크가 존재합니다. "
                + "[기회] K-ESG 가이드라인 기반 개선 활동을 통해 투자자 신뢰도 제고 및 금융 비용 절감이 기대됩니다.", area);
    }

    // ── 캐시 빌드 ─────────────────────────────────────────────────────────────

    private AnalysisResultCache buildCache(int e, int s, int g, int total,
                                            String grade, int conf,
                                            GptOpinion opinion,
                                            FinalReportRequest req,
                                            int lowCount, boolean gradeCeilingApplied) {
        AnalysisResultCache cache = new AnalysisResultCache();
        cache.setEScore(e);
        cache.setSScore(s);
        cache.setGScore(g);
        cache.setTotalScore(total);
        cache.setFinalGrade(grade);
        cache.setOverallConfidence(conf);
        cache.setOverallOpinion(opinion.overallOpinion());
        cache.setRiskOpportunity(opinion.riskOpportunity());
        cache.setFullReport(buildFullReport(e, s, g, total, grade, opinion.overallOpinion()));
        cache.setAnalyzedAt(LocalDateTime.now().toString().substring(0, 19));
        cache.setLowMismatchCount(lowCount > 0 ? lowCount : null);
        cache.setGradeCeilingApplied(gradeCeilingApplied ? true : null);
        cache.setSections(List.of(
                toSection("Environment", "환경",     e, grade(req.getEnvironmentResult())),
                toSection("Social",      "사회",     s, grade(req.getSocialResult())),
                toSection("Governance",  "지배구조", g, grade(req.getGovernanceResult()))
        ));
        cache.setEvidenceMapping(List.of());
        return cache;
    }

    private String buildFullReport(int e, int s, int g, int total, String grade, String opinion) {
        return String.format(
                "## [종합 소견]\n%s\n\n"
                + "## [E/S/G 점수 요약]\n"
                + "- 환경(E): %d점\n"
                + "- 사회(S): %d점\n"
                + "- 지배구조(G): %d점\n"
                + "- 종합: %d점 / %s등급\n",
                opinion, e, s, g, total, grade);
    }

    // ── Evidence 영속화 ───────────────────────────────────────────────────────

    private void saveEvidences(Long analysisId, List<FinalReportRequest.EvidenceItem> items) {
        if (items == null || items.isEmpty()) return;
        try {
            List<ESGEvidenceMatch> matches = new ArrayList<>();
            for (FinalReportRequest.EvidenceItem item : items) {
                double confScore = "HIGH".equals(item.getConfidenceLevel())   ? 0.80
                        : "MEDIUM".equals(item.getConfidenceLevel()) ? 0.60 : 0.30;
                matches.add(ESGEvidenceMatch.builder()
                        .analysisId(analysisId)
                        .indicatorCode(item.getIndicatorCode())
                        .evidenceText(item.getEvidenceText())
                        .similarity(item.getSimilarity())
                        .finalScore(item.getFinalScore())
                        .isValidEvidence(item.getFinalScore() != null && item.getFinalScore() >= 0.6)
                        .confidenceScore(confScore)
                        .confidenceLevel(ConfidenceLevel.from(confScore))
                        .retrievalRank(item.getRetrievalRank())
                        .pageNumber(item.getPageNumber())
                        .sourceFile(item.getSourceFile())
                        .numericMatchLevel(item.getNumericMatchLevel())
                        .numericDiffPercent(item.getNumericDiffPercent())
                        .build());
            }
            evidenceMatchRepository.saveAll(matches);
            log.info("[FinalReport] Evidence {} 건 DB 저장 완료 analysisId={}", matches.size(), analysisId);
        } catch (Exception e) {
            log.warn("[FinalReport] Evidence 저장 실패 analysisId={} 원인={}", analysisId, e.getMessage());
        }
    }

    private AnalysisResultCache.SectionDto toSection(String category, String name, int score, String grade) {
        AnalysisResultCache.SectionDto s = new AnalysisResultCache.SectionDto();
        s.setCategory(category);
        s.setScore(score);
        s.setGrade(grade);
        s.setComment(name + " 분야 K-ESG 점수: " + score + "점 / " + grade + "등급");
        s.setRecommendation("K-ESG 가이드라인에 따라 " + name + " 분야 지속 개선을 권고합니다.");
        s.setSubIndicators(List.of());
        return s;
    }
}
