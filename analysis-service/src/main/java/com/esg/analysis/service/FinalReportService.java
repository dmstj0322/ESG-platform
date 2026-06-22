package com.esg.analysis.service;

import com.esg.analysis.client.PointServiceClient;
import com.esg.analysis.dto.AnalysisResultCache;
import com.esg.analysis.dto.FinalReportRequest;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.domain.ConfidenceLevel;
import com.esg.analysis.service.domain.ESGEvidenceMatch;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.esg.analysis.service.repository.ESGEvidenceMatchRepository;
import com.esg.common.dto.EsgPoolResponse;
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
import java.util.concurrent.ConcurrentHashMap;

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
    private final PointServiceClient          pointServiceClient;

    // WS ready 이후 실행을 위해 요청 데이터를 단기 메모리 캐싱 (createSession → startSession 사이)
    private final ConcurrentHashMap<Long, FinalReportRequest> pendingRequests = new ConcurrentHashMap<>();

    // ── [Step 1] 세션 생성 — DB 레코드만 저장, 분석 실행 안 함 ──────────────────
    public Long createSession(Long userId, Long companyId, FinalReportRequest req) {
        AnalysisReport saved = transactionTemplate.execute(status ->
                analysisReportRepository.save(
                        AnalysisReport.builder()
                                .memberId(userId)
                                .companyId(companyId)
                                .status("PENDING")
                                .reportContent("분석 대기 중...")
                                .build()
                )
        );
        pendingRequests.put(saved.getId(), req);
        log.info("[Session] 세션 생성 sessionId={} companyId={}", saved.getId(), companyId);
        return saved.getId();
    }

    // ── [Step 2] 분석 실행 — PipelinePage WS 구독 완료 후 호출됨 ──────────────
    public void startSession(Long sessionId, Long companyId) {
        FinalReportRequest req = pendingRequests.remove(sessionId);
        if (req == null) {
            log.error("[Session] 요청 데이터 없음 sessionId={} — 세션 만료 또는 중복 호출", sessionId);
            send(companyId, "FAILED");
            throw new IllegalArgumentException("세션을 찾을 수 없습니다: " + sessionId);
        }
        Long memberId = analysisReportRepository.findById(sessionId)
                .map(AnalysisReport::getMemberId).orElse(null);
        log.info("[Session] 분석 시작 sessionId={} companyId={}", sessionId, companyId);
        processAsync(sessionId, companyId, req, memberId);
    }

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
        processAsync(saved.getId(), companyId, req, userId);
        return saved.getId();
    }

    @Async("analysisExecutor")
    public void processAsync(Long analysisId, Long companyId, FinalReportRequest req, Long memberId) {

        log.error("★★★★★ FinalReportService 실행됨 analysisId={} ★★★★★",
                analysisId);

        try {
            boolean autoSim = req.isAutoSimulation();
            log.info("[PROCESS-ASYNC-START] analysisId={} companyId={} autoSim={} evidenceCount={}",
                    analysisId, companyId, autoSim,
                    req.getEvidences() != null ? req.getEvidences().size() : 0);
            send(companyId, "RULE_BASED_SCORING");
            Thread.sleep(500);

            int eScore  = score(req.getEnvironmentResult());
            int sScore  = score(req.getSocialResult());  // 프론트가 보낸 기본 S 점수 (ecoBonus 미포함)
            int gScore  = score(req.getGovernanceResult());

            // ── 회사 ESG Pool 기반 ecoSBonus 계산 (SUM(balance) 방식 완전 제거) ──
            long esgPoolBefore = 0L;
            if (req.isEcoPointApplied() && companyId != null) {
                try {
                    EsgPoolResponse pool = pointServiceClient.getCompanyEsgPool(companyId);
                    esgPoolBefore = pool.esgPoints() != null ? pool.esgPoints() : 0L;
                    log.info("[COMPANY-ESG-POOL-BEFORE] companyId={} esgPoints={}EP", companyId, esgPoolBefore);
                } catch (Exception ex) {
                    log.warn("[COMPANY-ESG-POOL-BEFORE-FAIL] companyId={} 원인={} → ecoBonus 0으로 처리",
                            companyId, ex.getMessage());
                }
            }
            int ecoSBonusVal = req.isEcoPointApplied()
                    ? (int) Math.min(esgPoolBefore / EcoPointConverter.EP_PER_S_POINT, EcoPointConverter.MAX_S_BONUS)
                    : 0;
            long usedPointsPreview = (long) ecoSBonusVal * EcoPointConverter.EP_PER_S_POINT;
            log.info("[POOL-CONSUME-CHECK] analysisId={} companyId={} ecoPointApplied={} esgPoolBefore={}EP ecoSBonusVal={}점 usedPoints={}EP",
                    analysisId, companyId, req.isEcoPointApplied(), esgPoolBefore, ecoSBonusVal, usedPointsPreview);
            log.info("[POOL-BONUS-DEBUG] companyId={} poolPoints={}EP calculatedBonus={}점 usedPoints={}EP formula='{}EP / 1000 = {}점 (cap 5)'",
                    companyId, esgPoolBefore, ecoSBonusVal, usedPointsPreview, esgPoolBefore, esgPoolBefore / EcoPointConverter.EP_PER_S_POINT);
            int adjS    = Math.min(100, sScore + ecoSBonusVal);
            log.info("[ESG-SCORE-FORMULA] rawSScore={} socialBonus={}EP appliedBonus={}점 finalSScore={}",
                    sScore, esgPoolBefore, ecoSBonusVal, adjS);

            // ── Dynamic Industry Weighting (KSIC 기반) ───────────────────
            double[] w = EsgScoreConstants.getWeights(req.getKsicCode());
            EsgScoreConstants.IndustryType industryType = EsgScoreConstants.getIndustryType(req.getKsicCode());
            log.info("[DynamicWeight] ksic={} industryType={} weights=[E={}, S={}, G={}]",
                    req.getKsicCode(), industryType, w[0], w[1], w[2]);

            int total   = (int) Math.round(eScore * w[0] + adjS * w[1] + gScore * w[2]);
            String grade = req.getFinalGrade() != null ? req.getFinalGrade() : EsgScoreConstants.toGrade(total);
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
            // autoSim 경로 확인 — false이면 buildPrompt() 사용, true이면 callGptSimulation() 사용
            log.info("[GPT-PATH-SELECT] autoSim={} → {}",
                    autoSim, autoSim ? "callGptSimulation (buildPrompt 미사용)" : "callGpt → buildPrompt");
            GptOpinion opinion = autoSim
                    ? callGptSimulation(eScore, adjS, gScore, total, grade, req)
                    : callGptWithMismatch(eScore, adjS, gScore, total, grade, req, lowCount);

            send(companyId, "MERGING_SCORE");
            Thread.sleep(400);

            // ── ESG Pool 차감 (개인 balance 절대 건드리지 않음) ───────────────
            long usedPoints   = (long) ecoSBonusVal * EcoPointConverter.EP_PER_S_POINT;
            long esgPoolAfter = Math.max(0L, esgPoolBefore - usedPoints);

            AnalysisResultCache cache = buildCache(
                    eScore, adjS, gScore, total, grade, conf, opinion, req,
                    lowCount, gradeCeilingApplied, autoSim, ecoSBonusVal,
                    esgPoolBefore, usedPoints, esgPoolAfter);
            String json = objectMapper.writeValueAsString(cache);
            final String finalGrade = grade;

            // ── 리포트 저장 (성공 시에만 pool 차감 진행) ────────────────────
            transactionTemplate.execute(status -> {
                analysisReportRepository.findById(analysisId).ifPresent(r -> {
                    r.completeAnalysis(json, finalGrade);
                    analysisReportRepository.save(r);
                });
                saveEvidences(analysisId, req.getEvidences());
                return null;
            });
            log.info("[ANALYSIS-SUCCESS] analysisId={} companyId={} totalScore={} grade={}",
                    analysisId, companyId, total, finalGrade);

            // ── company_esg_pool 차감 — 분석 성공·리포트 저장 완료 이후에만 실행 ──
            if (companyId != null && ecoSBonusVal > 0) {
                log.info("[POOL-CONSUME-START] analysisId={} companyId={} usedPoints={}EP ecoSBonus={}점",
                        analysisId, companyId, usedPoints, ecoSBonusVal);
                try {
                    pointServiceClient.consumeEsgPool(companyId, usedPoints,
                            "ESG 분석 에코활동 반영 — Social +" + ecoSBonusVal + "점 가산");
                    log.info("[POOL-CONSUME-SUCCESS] analysisId={} companyId={} usedPoints={}EP beforePool={}EP afterPool={}EP",
                            analysisId, companyId, usedPoints, esgPoolBefore, esgPoolAfter);
                } catch (Exception ex) {
                    log.warn("[POOL-CONSUME-FAIL] analysisId={} companyId={} usedPoints={}EP 원인={} — 분석 결과는 유지됨",
                            analysisId, companyId, usedPoints, ex.getMessage());
                }
            } else {
                String skipReason = companyId == null ? "companyId=null"
                        : !req.isEcoPointApplied() ? "ecoPointApplied=false (프론트 미연동)"
                        : "ecoSBonus=0 (pool부족: esgPoolBefore=" + esgPoolBefore + "EP)";
                log.info("[POOL-CONSUME-SKIP] analysisId={} companyId={} reason={} ecoSBonus={} esgPoolBefore={}EP",
                        analysisId, companyId, skipReason, ecoSBonusVal, esgPoolBefore);
            }

            Thread.sleep(400);
            send(companyId, "COMPLETED:" + analysisId);

        } catch (Exception e) {
            log.error("[FinalReport] 처리 실패 analysisId={}: {}", analysisId, e.getMessage(), e);
            log.warn("[POOL-CONSUME-ROLLBACK] analysisId={} companyId={} — 분석 실패로 ESG Pool 차감 미실행",
                    analysisId, companyId);
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

    /**
     * S/G 카테고리 confidence를 구간별 규칙 문구로 변환합니다.
     * GPT가 숫자를 자의적으로 해석("데이터 일치성 낮음" 등)하지 않도록
     * 숫자 대신 도메인 적합 레이블을 프롬프트에 전달합니다.
     */
    private String sgConfLabel(FinalReportRequest.CategoryResult r, String category) {
        int c = conf(r);
        if ("S".equals(category)) {
            if (c < 60) return "근거 검증 수준: 일부 지표에 대한 추가 증빙 자료 확보 필요";
            if (c < 80) return "근거 검증 수준: 전반적으로 양호한 수준의 운영 근거 확인";
            return "근거 검증 수준: 운영 근거 충분히 확인됨";
        } else {
            if (c < 60) return "근거 검증 수준: 일부 운영·공시 근거 신뢰도 개선 필요";
            if (c < 80) return "근거 검증 수준: 전반적으로 양호한 수준의 공시 근거 확인";
            return "근거 검증 수준: 운영·공시 근거 충분히 확인됨";
        }
    }

    /**
     * 사회(S) 영역 확정 문장 — score·grade·sgLabel(sgConfLabel 결과)만 사용.
     * confidence 숫자는 sgConfLabel 내부에서 레이블로 변환 후 소비 → 출력에 미포함.
     */
    private String buildSTemplateSentence(int score, String gradeStr, String sgLabel) {
        String base = "사회(S) 부문은 " + score + "점(" + gradeStr + "등급)으로 평가되었으며, ";
        if (sgLabel.contains("확보 필요")) return base + "일부 지표에 대한 추가 증빙 자료 확보가 필요합니다.";
        if (sgLabel.contains("충분히"))   return base + "운영 근거가 전반적으로 충분히 확인되었습니다.";
        return base + "운영 근거가 전반적으로 확인되었습니다.";
    }

    /**
     * 지배구조(G) 영역 확정 문장 — score·grade·sgLabel(sgConfLabel 결과)만 사용.
     * confidence 숫자는 sgConfLabel 내부에서 레이블로 변환 후 소비 → 출력에 미포함.
     */
    private String buildGTemplateSentence(int score, String gradeStr, String sgLabel) {
        log.info("[G-TEMPLATE-CALLED] score={} grade='{}' sgLabel='{}'", score, gradeStr, sgLabel);
        String base = "지배구조(G) 부문은 " + score + "점(" + gradeStr + "등급)으로 평가되었으며, ";
        String result;
        if (sgLabel.contains("개선 필요")) result = base + "일부 운영·공시 근거의 보완이 권장됩니다.";
        else if (sgLabel.contains("충분히")) result = base + "운영·공시 근거가 전반적으로 충분히 확인되었습니다.";
        else result = base + "운영·공시 근거가 전반적으로 확인되었습니다.";
        log.info("[G-TEMPLATE-RESULT] '{}'", result);
        return result;
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
        java.util.List<String> order = EsgScoreConstants.GRADE_ORDER;
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

    private GptOpinion callGptSimulation(int e, int s, int g, int total, String grade, FinalReportRequest req) {
        String prompt = "[업종 benchmark 기반 사전 진단 모드]\n"
                + "당신은 10년 경력의 ESG 전문 컨설턴트입니다.\n"
                + "아래 결과는 실제 증빙 감사(RAG Audit)가 아닌 업종 평균 benchmark 기반 K-ESG 사전 진단 결과입니다.\n\n"
                + "## 평가 결과 (사전 진단 — 증빙 미검증)\n"
                + "- 환경(E): " + e + "점 / " + grade(req.getEnvironmentResult()) + "등급 (업종 benchmark 기반 추정)\n"
                + "- 사회(S): " + s + "점 / " + grade(req.getSocialResult()) + "등급\n"
                + "- 지배구조(G): " + g + "점 / " + grade(req.getGovernanceResult()) + "등급\n"
                + "- 종합 점수: " + total + "점 / 최종 등급: " + grade + "\n\n"
                + "## 반환 형식 (JSON)\n"
                + "{\n"
                + "  \"overallOpinion\": \"본 결과는 업종 평균 benchmark 기반 ESG 사전 진단이며 실제 증빙 감사는 미수행되었습니다. 200자 내외 진단 의견 포함.\",\n"
                + "  \"riskOpportunity\": \"[리스크] 실제 ESG 감사 미수행으로 인한 투명성 리스크 포함. [기회] 정식 ESG 감사 수행 시 개선 가능 항목.\"\n"
                + "}\n\n"
                + "마케팅 과장 표현 금지. 사전 진단임을 명시하되 건설적인 개선 방향 제시.";
        try {
            String raw = openAiClient.callWithRetry(prompt);
            JsonNode node = objectMapper.readTree(raw);
            String opinion = node.path("overallOpinion").asText(null);
            String risk    = node.path("riskOpportunity").asText(null);
            if (opinion == null || opinion.isBlank()) return fallbackSimulationOpinion(e, s, g, total, grade);
            return new GptOpinion(
                    opinion,
                    risk != null && !risk.isBlank() ? risk : buildSimulationRisk(grade, e, s, g)
            );
        } catch (Exception ex) {
            log.warn("[FinalReport] GPT 사전진단 실패 — 기본 총평 사용: {}", ex.getMessage());
            return fallbackSimulationOpinion(e, s, g, total, grade);
        }
    }

    private GptOpinion fallbackSimulationOpinion(int e, int s, int g, int total, String grade) {
        String opinion = String.format(
                "[업종 benchmark 기반 사전 진단] K-ESG 종합 점수 %d점(%s등급)으로 추정됩니다. "
                + "환경(E) %d점, 사회(S) %d점, 지배구조(G) %d점입니다. "
                + "본 결과는 실제 ESG 증빙 감사(RAG Audit)가 아닌 업종 평균 기반 사전 진단이므로, "
                + "정확한 평가를 위해 증빙 문서를 포함한 정식 분석을 권장합니다.",
                total, grade, e, s, g);
        return new GptOpinion(opinion, buildSimulationRisk(grade, e, s, g));
    }

    private String buildSimulationRisk(String grade, int e, int s, int g) {
        return "[리스크] 실제 ESG 증빙 감사 미수행으로 공시 의무화 대응에 한계가 있을 수 있습니다. "
                + "[기회] 환경(E) 증빙 문서 및 S/G 관련 정책 자료를 제출하면 더 정확한 K-ESG 평가를 받을 수 있습니다.";
    }

    private GptOpinion callGpt(int e, int s, int g, int total, String grade, FinalReportRequest req) {
        String prompt = buildPrompt(e, s, g, total, grade, req);
        // S/G 확정 문장 — sgConfLabel() 레이블 기반 분기 (confidence 숫자 미노출)
        String sLabel    = sgConfLabel(req.getSocialResult(),      "S");
        String gLabel    = sgConfLabel(req.getGovernanceResult(),  "G");
        String sSentence = buildSTemplateSentence(s, grade(req.getSocialResult()),     sLabel);
        String gSentence = buildGTemplateSentence(g, grade(req.getGovernanceResult()), gLabel);
        log.info("[GPT-PROMPT-LEN] promptLen={}", prompt.length());
        log.info("[GPT-PROMPT-PREVIEW] {}", prompt.substring(0, Math.min(1000, prompt.length())).replace("\n", "↵"));
        log.info("[S-TEMPLATE] '{}'", sSentence);
        log.info("[G-TEMPLATE] '{}'", gSentence);
        try {
            String raw = openAiClient.callWithRetry(prompt);
            JsonNode node = objectMapper.readTree(raw);
            String eSentence  = node.path("eSentence").asText(null);
            String risk       = node.path("riskOpportunity").asText(null);
            if (eSentence == null || eSentence.isBlank()) {
                return fallbackOpinion(e, s, g, total, grade, sSentence, gSentence);
            }
            // 종합 결론은 항상 규칙 기반 템플릿 사용 (GPT 환각 방지)
            String conclusion = buildConclusionTemplate(total, grade, req.getSocialResult(), req.getGovernanceResult());
            log.info("[GPT-E-SENTENCE]  '{}'", eSentence);
            log.info("[TMPL-CONCLUSION] '{}'", conclusion);
            // 최종 overallOpinion = E(GPT) + S(템플릿) + G(템플릿) + 종합(템플릿)
            String fullOpinion = eSentence + " " + sSentence + " " + gSentence + " " + conclusion;
            log.info("[FINAL-OPINION] '{}'", fullOpinion);
            return new GptOpinion(
                    fullOpinion,
                    risk != null && !risk.isBlank() ? risk : buildRisk(grade, e, s, g)
            );
        } catch (Exception ex) {
            log.warn("[FinalReport] GPT 실패 — 기본 총평 사용: {}", ex.getMessage());
            return fallbackOpinion(e, s, g, total, grade, sSentence, gSentence);
        }
    }

    private String buildEVerificationStats(FinalReportRequest req) {
        return "";
    }

    private String buildPrompt(int e, int s, int g, int total, String grade, FinalReportRequest req) {
        // ★ 버전 마커 — 이 로그가 보이면 수정된 buildPrompt()가 실행 중
        log.info("[BUILD-PROMPT-VERSION] v2025-FIXED — 하드코딩 예시 제거 버전 실행 중");
        String auditFindings = buildAuditFindings(req);
        return "당신은 ESG 감사 전문가입니다.\n"
                + "아래 K-ESG 감사 결과를 바탕으로 factual audit summary를 JSON으로 반환하세요.\n\n"
                + "## 절대 금지 사항\n"
                + "- '지속가능 경영 강화 필요', '사회적 책임 강화 필요', '투명성 개선 필요', 'ESG 활동 확대 필요'\n"
                + "- 누구에게나 적용 가능한 일반 조언 문장\n"
                + "- 아래 '감사 실측 데이터'에 없는 수치·차이율·지표 코드를 임의로 생성하는 행위\n"
                + "- 실제 검증 결과와 다른 수치 불일치 내용 날조 (예: HIGH 판정인데 15% 차이 주장)\n\n"
                + "## 필수 요구사항\n"
                + "- '감사 실측 데이터' 섹션에 실제로 존재하는 항목만 언급할 것\n"
                + "- 수치 불일치가 없으면([수치 불일치] 항목 없음) 수치 차이 언급 금지\n"
                + "- [증빙 미검출] 지표(evidence 자체 없음): '확인되지 않았습니다' 표현 사용\n"
                + "- [부분 근거] 지표(evidence 존재, 정책 상세 부족): 근거 인정 + 구체적 한계 명시\n"
                + "- 예(부분근거): '[지표명] 관련 운영 근거는 탐지되었으나, 정책 수준의 상세 명시는 제한적이었습니다.'\n"
                + "- 주의: 실측 데이터(TRIR·재해율·KPI 수치 등)가 감사 실측 데이터에 존재하는 지표는 [부분 근거]가 아닌 직접 근거로 서술할 것\n\n"
                + "## 서술 규칙\n"
                + "- 환경(E) 점수는 CSV 환경 데이터를 업종 평균과 비교하여 산정한 환경 성과 등급입니다\n"
                + "- 사회(S)·지배구조(G) 점수는 운영 근거 적합도를 의미합니다\n"
                + "- S·G 부문에서 '신뢰도 X%'·'신뢰도가 X%' 형태로 숫자를 직접 언급하지 말 것\n"
                + "- S·G 근거 수준은 아래 '평가 결과'의 [근거 검증 수준] 레이블로만 서술할 것\n"
                + "- 오차율(%, 수치) 언급 절대 금지 — '최대 오차율', '평균 오차율', '오차율 X%' 등 모든 오차율 수치 사용 금지\n"
                + "- 환경(E) 부문은 CSV 환경 데이터를 업종 평균과 비교한 환경 성과 평가 결과입니다\n"
                + "- 환경(E) 서술은 점수·등급 기반 환경 성과 수준(우수·양호·개선 필요 등)으로 작성할 것\n"
                + "- '데이터 검증', '높은 데이터 신뢰성', 'HIGH/MEDIUM/LOW 검증', '수치 일치', '오차율' 등 검증 관련 표현 절대 금지\n"
                + "\n## G(지배구조)·S(사회) 서술 규칙 (반드시 준수)\n"
                + "- 지배구조(G)·사회(S)는 공시 근거·운영 증빙·정책 이행 여부를 평가하는 영역입니다\n"
                + "- 사용 금지 표현: '데이터 일치성', '수치 일치', '데이터 정합성', '수치 차이', '일치율'\n"
                + "  → 위 표현은 환경(E) 수치 검증 전용입니다. G/S 서술에 절대 사용 금지\n"
                + "- G 신뢰도가 낮은 경우: '공시 자료 보완 필요', '일부 세부 검증 항목의 신뢰도 개선 필요' 형태로 서술\n"
                + "- G 서술 예시: '지배구조 부문은 X점(Y등급)을 획득하였으며, 운영·공시 근거는 확인되었으나 일부 항목의 검증 신뢰도 개선이 필요합니다.'\n"
                + "- S 서술 예시: '사회 부문은 X점(Y등급)으로 평가되었으며, 안전·인권·지역사회 관련 운영 근거가 확인되었습니다.'\n\n"
                + "## 평가 결과\n"
                + "- 환경(E): " + e + "점 / " + grade(req.getEnvironmentResult()) + "등급 (CSV 기반 업종 평균 비교)\n"
                + "- 사회(S): " + s + "점 / " + grade(req.getSocialResult()) + "등급 / " + sgConfLabel(req.getSocialResult(), "S") + "\n"
                + "- 지배구조(G): " + g + "점 / " + grade(req.getGovernanceResult()) + "등급 / " + sgConfLabel(req.getGovernanceResult(), "G") + "\n"
                + "- 종합 점수: " + total + "점 / 최종 등급: " + grade + "\n"
                + auditFindings
                + "\n## 반환 형식 (JSON)\n"
                + "{\n"
                + "  \"eSentence\": \"환경(E) 부문 1문장. CSV 기반 업종 평균 비교를 통한 환경 성과 평가 결과 서술. 점수와 등급 포함. '데이터 검증', '신뢰성', 'HIGH/MEDIUM/LOW', '오차율', '수치 일치' 표현 절대 금지. 사회(S)·지배구조(G) 서술 금지.\",\n"
                + "  \"riskOpportunity\": \"[리스크] 실제 감사 결과 기반 구체적 리스크(에너지 효율·Scope 배출·공시 의무 등). [기회] 개선 가능 항목.\"\n"
                + "}\n\n"
                + "절대 금지: 마케팅 과장 표현, 추상적 조언, GPT 일반 답변 패턴.";
    }

    private String buildAuditFindings(FinalReportRequest req) {
        List<FinalReportRequest.EvidenceItem> items = req.getEvidences();
        if (items == null || items.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\n## 감사 실측 데이터\n");

        // E numeric mismatches
        items.stream()
                .filter(i -> "LOW".equals(i.getNumericMatchLevel()))
                .forEach(i -> sb.append("- [수치 불일치] ").append(i.getIndicatorCode())
                        .append(i.getIndicatorTitle() != null ? " " + i.getIndicatorTitle() : "")
                        .append(": 입력값 ").append(i.getInputValue() != null ? formatAuditVal(i.getInputValue()) : "?")
                        .append(i.getUnit() != null ? " " + i.getUnit() : "")
                        .append(" vs 증빙값 ").append(i.getExtractedValue() != null ? formatAuditVal(i.getExtractedValue()) : "?")
                        .append(i.getUnit() != null ? " " + i.getUnit() : "")
                        .append(i.getNumericDiffPercent() != null ? String.format(" (차이율: %.1f%%)", i.getNumericDiffPercent()) : "")
                        .append("\n"));

        // S/G truly missing evidence (low confidence AND no meaningful similarity)
        items.stream()
                .filter(i -> i.getIndicatorCode() != null
                        && (i.getIndicatorCode().startsWith("S-") || i.getIndicatorCode().startsWith("G-"))
                        && "LOW".equals(i.getConfidenceLevel())
                        && (i.getSimilarity() == null || i.getSimilarity() <= 0.3))
                .forEach(i -> sb.append("- [증빙 미검출] ").append(i.getIndicatorCode())
                        .append(i.getIndicatorTitle() != null ? " " + i.getIndicatorTitle() : "")
                        .append(" — 문서 내 관련 증빙 텍스트 미확인\n"));

        // S/G partial evidence (has similarity > 0.3 but confidence still LOW — indirect/weak evidence)
        // HIGH confidence evidence는 [근거 확인]으로 표시 (GPT 오판 방지)
        items.stream()
                .filter(i -> i.getIndicatorCode() != null
                        && (i.getIndicatorCode().startsWith("S-") || i.getIndicatorCode().startsWith("G-"))
                        && "HIGH".equals(i.getConfidenceLevel())
                        && i.getSimilarity() != null && i.getSimilarity() >= 0.75)
                .forEach(i -> sb.append("- [근거 확인] ").append(i.getIndicatorCode())
                        .append(i.getIndicatorTitle() != null ? " " + i.getIndicatorTitle() : "")
                        .append(" — 직접 근거 확인됨 (similarity=").append(String.format("%.0f%%", i.getSimilarity() * 100)).append(")\n"));

        items.stream()
                .filter(i -> i.getIndicatorCode() != null
                        && (i.getIndicatorCode().startsWith("S-") || i.getIndicatorCode().startsWith("G-"))
                        && "LOW".equals(i.getConfidenceLevel())
                        && i.getSimilarity() != null && i.getSimilarity() > 0.3)
                .forEach(i -> sb.append("- [부분 근거] ").append(i.getIndicatorCode())
                        .append(i.getIndicatorTitle() != null ? " " + i.getIndicatorTitle() : "")
                        .append(" — 연관 정책 근거 탐지, 직접 정책 명시는 제한적\n"));

        return sb.length() > 22 ? sb.toString() : "";
    }

    private String formatAuditVal(double val) {
        if (val >= 1_000_000) return String.format("%.2fM", val / 1_000_000);
        if (val >= 1_000)     return String.format("%.1fK", val / 1_000);
        return String.valueOf((long) val);
    }

    /**
     * 종합 결론 규칙 기반 템플릿 — GPT 미사용, 항상 일관된 결과 보장.
     * grade 구간별 고정 문구 + S/G 취약 영역 힌트 포함.
     */
    private String buildConclusionTemplate(int total, String grade,
                                            FinalReportRequest.CategoryResult sResult,
                                            FinalReportRequest.CategoryResult gResult) {
        String base = String.format("종합 점수는 %d점(%s등급)이며, ", total, grade);
        switch (grade) {
            case "S": return base + "전 영역에서 우수한 ESG 관리 수준이 확인되었습니다.";
            case "A": return base + "전반적으로 우수한 ESG 관리 수준을 유지하고 있습니다.";
            case "B": return base + "일부 영역의 관리 체계 보완을 통해 ESG 성과를 더욱 향상시킬 수 있습니다.";
            case "C": {
                boolean sWeak = conf(sResult) < 60;
                boolean gWeak = conf(gResult) < 60;
                if (sWeak && gWeak)
                    return base + "사회·지배구조 영역의 증빙 자료 및 운영 근거 보완이 권장됩니다.";
                if (sWeak)
                    return base + "사회(S) 영역의 운영 증빙 자료 보완이 우선적으로 권장됩니다.";
                if (gWeak)
                    return base + "지배구조(G) 영역의 공시 근거 보완이 우선적으로 권장됩니다.";
                return base + "지속적인 ESG 지표 관리 및 운영 수준 향상을 통해 등급 개선이 가능합니다.";
            }
            default: return base + "ESG 관리 체계 전반에 대한 체계적인 개선이 필요합니다.";
        }
    }

    private GptOpinion fallbackOpinion(int e, int s, int g, int total, String grade,
                                       String sSentence, String gSentence) {
        String eSentence  = String.format("환경(E) 부문은 %d점으로 평가되었습니다.", e);
        String conclusion = buildConclusionTemplate(total, grade, null, null);
        String opinion    = eSentence + " " + sSentence + " " + gSentence + " " + conclusion;
        return new GptOpinion(opinion, buildRisk(grade, e, s, g));
    }

    private String buildRisk(String grade, int e, int s, int g) {
        int low  = Math.min(e, Math.min(s, g));
        String area = (e == low ? "환경(E)" : s == low ? "사회(S)" : "지배구조(G)");
        String riskDetail;
        if ("환경(E)".equals(area)) {
            riskDetail = "에너지 효율 및 Scope 1/2 탄소 관리 리스크가 존재합니다. 환경 데이터 공시 강화와 탄소비용 증가 대응이 필요합니다.";
        } else if ("사회(S)".equals(area)) {
            riskDetail = "산업안전 및 인적자원 관리 증빙 미흡으로 K-ESG 사회 지표 공시 대응에 한계가 있습니다.";
        } else {
            riskDetail = "이사회 독립성·내부통제·외부감사 관련 공시 미흡으로 기업지배구조 리스크가 존재합니다.";
        }
        return String.format(
                "[리스크] %s 영역(%d점)에서 %s "
                + "[기회] 해당 영역 증빙 자료 보강 및 K-ESG 공시 가이드라인 준수 시 ESG 등급 개선이 기대됩니다.",
                area, low, riskDetail);
    }

    // ── 캐시 빌드 ─────────────────────────────────────────────────────────────

    private AnalysisResultCache buildCache(int e, int s, int g, int total,
                                            String grade, int conf,
                                            GptOpinion opinion,
                                            FinalReportRequest req,
                                            int lowCount, boolean gradeCeilingApplied,
                                            boolean autoSim, int ecoSBonusVal,
                                            long esgPoolBefore, long ecoUsedPoints, long esgPoolAfter) {
        AnalysisResultCache cache = new AnalysisResultCache();
        cache.setEScore(e);
        cache.setSScore(s);
        cache.setGScore(g);
        cache.setTotalScore(total);
        cache.setFinalGrade(grade);
        cache.setOverallConfidence(conf);
        log.info("[DB-SAVE-OPINION] '{}'", opinion.overallOpinion());
        cache.setOverallOpinion(opinion.overallOpinion());
        cache.setRiskOpportunity(opinion.riskOpportunity());
        cache.setFullReport(buildFullReport(e, s, g, total, grade, opinion.overallOpinion()));
        cache.setAnalyzedAt(LocalDateTime.now().toString().substring(0, 19));
        cache.setLowMismatchCount(lowCount > 0 ? lowCount : null);
        cache.setGradeCeilingApplied(gradeCeilingApplied ? true : null);
        cache.setIsAutoSimulation(autoSim ? true : null);
        if (ecoSBonusVal > 0) {
            cache.setEcoSBonus(ecoSBonusVal);
            cache.setEsgPoolBefore(esgPoolBefore > 0 ? esgPoolBefore : null);
            cache.setEcoUsedPoints(ecoUsedPoints > 0 ? ecoUsedPoints : null);
            cache.setEsgPoolAfter(esgPoolAfter >= 0 ? esgPoolAfter : null);
        }
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
                        .inputValue(item.getInputValue())
                        .extractedValue(item.getExtractedValue())
                        .unit(item.getUnit())
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
