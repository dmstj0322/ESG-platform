package com.esg.analysis.controller;

import com.esg.analysis.dto.AnalysisResultResponse;
import com.esg.analysis.dto.CategoryAnalysisResponse;
import com.esg.analysis.dto.FinalReportRequest;
import com.esg.analysis.dto.GradeStatDto;
import com.esg.analysis.service.AnalysisApiService;
import com.esg.analysis.service.CategoryAnalysisService;
import com.esg.analysis.service.EsgGuidelineService;
import com.esg.analysis.service.FinalReportService;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping
//@CrossOrigin(origins = "http://localhost:5173")
@RequiredArgsConstructor
public class AnalysisController {

    private final AnalysisApiService analysisApiService;
    private final AnalysisReportRepository analysisReportRepository;
    private final EsgGuidelineService esgGuidelineService;
    private final FinalReportService finalReportService;
    private final CategoryAnalysisService categoryAnalysisService;
    private final ObjectMapper objectMapper;

    /**
     * [GET] 최신 완료 리포트 조회
     */
    @GetMapping("/latest")
    public ResponseEntity<?> getLatestReport(@RequestHeader("X-Company-Id") Long companyId) {
        log.info(">>>> [API 호출] 기업 ID {}의 최신 COMPLETED 리포트 조회", companyId);

        return analysisReportRepository
                // ✅ id DESC 기준으로 변경
                .findFirstByCompanyIdAndStatusOrderByIdDesc(companyId, "COMPLETED")
                .map(report -> {
                    log.info(">>>> [조회 성공] 리포트 ID: {}, 등급: {}", report.getId(), report.getGrade());

                    Map<String, Object> response = new HashMap<>();
                    response.put("analysisId", report.getId());
                    response.put("finalGrade", report.getGrade());
                    response.put("analysisResult", report.getReportContent());

                    return ResponseEntity.ok(response);
                })
                .orElseGet(() -> {
                    log.warn(">>>> [조회 결과 없음] 완료된 리포트 없음 (기업 ID: {})", companyId);
                    return ResponseEntity.noContent().build();
                });
    }

    /**
     * [GET] 완료된 분석 이력 목록 조회 (최신 20건)
     */
    @GetMapping("/history")
    public ResponseEntity<?> getAnalysisHistory(@RequestHeader("X-Company-Id") Long companyId) {
        log.info(">>>> [API 호출] 기업 ID {}의 분석 이력 조회", companyId);

        List<?> history = analysisReportRepository
                .findTop20ByCompanyIdAndStatusOrderByIdDesc(companyId, "COMPLETED")
                .stream()
                .map(report -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("analysisId", report.getId());
                    item.put("grade", report.getGrade());
                    item.put("createdAt", report.getCreatedDate() != null
                            ? report.getCreatedDate().toString() : null);

                    // reportContent에서 점수/신뢰도 파싱 (있을 때만)
                    String content = report.getReportContent();
                    if (content != null && content.startsWith("{")) {
                        try {
                            Map<String, Object> parsed = objectMapper.readValue(
                                    content, new TypeReference<Map<String, Object>>() {});
                            if (parsed.containsKey("totalScore"))       item.put("totalScore",       parsed.get("totalScore"));
                            if (parsed.containsKey("overallConfidence")) item.put("overallConfidence", parsed.get("overallConfidence"));
                            // E/S/G: 최상위 키 우선 (null 방어 포함), 없거나 null이면 sections[] fallback
                            boolean eFromTop = parsed.containsKey("eScore") && parsed.get("eScore") != null;
                            boolean sFromTop = parsed.containsKey("sScore") && parsed.get("sScore") != null;
                            boolean gFromTop = parsed.containsKey("gScore") && parsed.get("gScore") != null;
                            if (eFromTop) item.put("eScore", parsed.get("eScore"));
                            if (sFromTop) item.put("sScore", parsed.get("sScore"));
                            if (gFromTop) item.put("gScore", parsed.get("gScore"));
                            // 하나라도 최상위에서 못 가져왔으면 sections[] 에서 보완
                            if (!eFromTop || !sFromTop || !gFromTop) {
                                Object sectionsObj = parsed.get("sections");
                                if (sectionsObj instanceof java.util.List<?> sectionList) {
                                    for (Object sObj : sectionList) {
                                        if (sObj instanceof Map<?, ?> sec) {
                                            Object cat = sec.get("category");
                                            Object sc  = sec.get("score");
                                            if (sc == null) continue;
                                            if (!eFromTop && "Environment".equals(cat)) item.put("eScore", sc);
                                            else if (!sFromTop && "Social".equals(cat)) item.put("sScore", sc);
                                            else if (!gFromTop && "Governance".equals(cat)) item.put("gScore", sc);
                                        }
                                    }
                                }
                            }
                        } catch (Exception ignored) {}
                    }
                    log.debug("[History] id={} grade={} eScore={} sScore={} gScore={} totalScore={}",
                            item.get("analysisId"), item.get("grade"),
                            item.get("eScore"), item.get("sScore"), item.get("gScore"), item.get("totalScore"));
                    return item;
                })
                .collect(Collectors.toList());

        log.info("[History] 응답 {}건 companyId={}", history.size(), companyId);
        return ResponseEntity.ok(history);
    }

    /**
     * [POST] 파일 업로드 및 분석 시작
     */
    @PostMapping("/api/v1/analysis/report")
    public ResponseEntity<?> requestReport(
            @RequestHeader("X-Member-Id") Long userId,
            @RequestHeader("X-Company-Id") Long companyId,
            @RequestParam("file") MultipartFile file) {

        log.info("★파일 수신★ 이름: {}, 크기: {} bytes", file.getOriginalFilename(), file.getSize());

        Long analysisId = analysisApiService.initiateAnalysis(userId, companyId, file);
        return ResponseEntity.accepted().body(analysisId);
    }

    /**
     * [POST] E / S / G 카테고리 단독 분석 (OCR/RAG + 체크리스트 혼합)
     * multipart/form-data:
     *   - category        : "E" | "S" | "G"
     *   - checklistAnswers: JSON string (예: {"s1":true,"s2":false,...})
     *   - checkedCount    : int (체크된 항목 수)
     *   - totalItems      : int (전체 항목 수)
     *   - file            : PDF (optional)
     *   - eMetrics        : JSON string (E 카테고리 전용, optional)
     *                       예: {"electricity":12000,"gas":500,"carbon":30,"waste":2000,"water":800}
     */
    @PostMapping(value = "/api/v1/analysis/category", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> analyzeCategory(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
            @RequestPart("category") String category,
            @RequestPart("checklistAnswers") String checklistAnswersJson,
            @RequestPart("checkedCount") String checkedCountStr,
            @RequestPart("totalItems") String totalItemsStr,
            @RequestPart(value = "file",      required = false) MultipartFile file,
            @RequestPart(value = "eMetrics",  required = false) String eMetricsJson,
            @RequestPart(value = "ksicCode",      required = false) String ksicCode,
            @RequestPart(value = "envMode",       required = false) String envMode,
            @RequestPart(value = "employeeCount", required = false) String employeeCountStr) {

        log.info("======================================================");
        log.info("[CATEGORY-START] /api/v1/analysis/category RECEIVED");
        log.info("  category={} userId={} companyId={} ksicCode={} envMode={}", category, userId, companyId, ksicCode, envMode);
        log.info("  file={} fileSize={} fileType={}",
                file != null ? file.getOriginalFilename() : "NULL",
                file != null ? file.getSize() : -1,
                file != null ? file.getContentType() : "NULL");
        log.info("  eMetricsJson={}", eMetricsJson != null
                ? eMetricsJson.substring(0, Math.min(200, eMetricsJson.length()))
                : "NULL");
        log.info("======================================================");

        // S/G 카테고리에 CSV 업로드 차단 — Upstage OCR은 CSV를 지원하지 않음
        if (file != null && !file.isEmpty()
                && ("S".equalsIgnoreCase(category) || "G".equalsIgnoreCase(category))) {
            String ct = file.getContentType();
            String fn = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
            boolean isCsv = (ct != null && ct.contains("csv")) || fn.endsWith(".csv");
            if (isCsv) {
                log.warn("[{}-CATEGORY-REJECT] CSV 업로드 차단 file={} contentType={}", category, file.getOriginalFilename(), ct);
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "S/G 분석은 PDF 증빙 파일만 업로드 가능합니다."));
            }
        }

        try {
            Map<String, Boolean> answers = objectMapper.readValue(
                    checklistAnswersJson, new TypeReference<Map<String, Boolean>>() {});
            int checkedCount = Integer.parseInt(checkedCountStr.trim());
            int totalItems   = Integer.parseInt(totalItemsStr.trim());

            Map<String, Double> eMetricInputs = null;
            if (eMetricsJson != null && !eMetricsJson.isBlank()) {
                eMetricInputs = objectMapper.readValue(
                        eMetricsJson, new TypeReference<Map<String, Double>>() {});
                log.info("[Category] E 수치 입력 파싱 완료 metrics={}", eMetricInputs.keySet());
            }

            int employeeCount = 0;
            if (employeeCountStr != null && !employeeCountStr.isBlank()) {
                try { employeeCount = Integer.parseInt(employeeCountStr.trim()); }
                catch (NumberFormatException ignored) {}
            }
            log.info("[Category] employeeCount={} (from request)", employeeCount);

            CategoryAnalysisResponse result =
                    categoryAnalysisService.analyze(category, answers, checkedCount, totalItems,
                            file, eMetricInputs, ksicCode, envMode, employeeCount, companyId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            log.warn("[Category] 요청 거부 category={} 원인={}", category, e.getMessage());
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            log.error("[Category] 분석 실패 category={} 원인={}", category, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "카테고리 분석 중 오류: " + e.getMessage()));
        }
    }

    /**
     * [POST] E/S/G 로컬 결과 집계 → 최종 리포트 생성 (OCR/RAG 없음) — 레거시 유지
     */
    @PostMapping("/api/v1/analysis/final-report")
    public ResponseEntity<?> requestFinalReport(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
            @RequestBody FinalReportRequest request) {

        log.info("★최종 집계 요청 (레거시)★ userId={} companyId={}", userId, companyId);
        Long analysisId = finalReportService.createFinalReport(userId, companyId, request);
        return ResponseEntity.accepted().body(analysisId);
    }

    /**
     * [POST] Step 1 — 세션만 생성, 분석 실행 안 함
     * PipelinePage가 navigate 직전에 호출, sessionId를 받아 /pipeline/:id 로 이동.
     */
    @PostMapping("/api/v1/analysis/session")
    public ResponseEntity<?> createSession(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
            @RequestBody FinalReportRequest request) {

        log.info("[Session] 세션 생성 요청 userId={} companyId={}", userId, companyId);
        Long sessionId = finalReportService.createSession(userId, companyId, request);
        return ResponseEntity.accepted().body(Map.of("sessionId", sessionId));
    }

    /**
     * [POST] Step 2 — 분석 실행 시작 (PipelinePage WebSocket 구독 완료 후 호출)
     * 이 시점에 WebSocket 구독이 보장되므로 첫 이벤트부터 유실 없음.
     */
    @PostMapping("/api/v1/analysis/session/{sessionId}/start")
    public ResponseEntity<?> startSession(
            @PathVariable Long sessionId,
            @RequestHeader("X-CompanyId") Long companyId) {

        log.info("[Session] 분석 시작 요청 sessionId={} companyId={}", sessionId, companyId);
        try {
            finalReportService.startSession(sessionId, companyId);
            return ResponseEntity.accepted().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * [GET] 등급 분포 통계
     */
    @GetMapping("/stats")
    public ResponseEntity<List<GradeStatDto>> getGradeStats(@RequestHeader("X-Company-Id") Long companyId) {
        List<GradeStatDto> stats = analysisReportRepository.getGradeDistribution(companyId);
        return ResponseEntity.ok(stats);
    }

    /**
     * [POST] K-ESG 가이드라인 학습 (Admin)
     */
    @PostMapping("/admin/ingest")
    public ResponseEntity<String> ingestGuideline(@RequestParam String fileName) {
        esgGuidelineService.ingestGuideline(fileName);
        return ResponseEntity.ok("가이드라인 학습 성공: " + fileName);
    }

    /**
     * [GET] 분석 결과 전체 조회 — 사용자 결과 화면 API
     * E/S/G 점수, 신뢰도, 섹션별 진단, Evidence 매핑, 업종 벤치마크 비교를 포함합니다.
     */
    @GetMapping("/api/v1/analysis/{analysisId}/result")
    public ResponseEntity<?> getAnalysisResult(@PathVariable Long analysisId) {
        try {
            AnalysisResultResponse result = analysisApiService.getAnalysisResult(analysisId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * [GET] QueryDSL 동작 테스트
     */
    @GetMapping("/test/querydsl")
    public String testQueryDsl(@RequestHeader("X-Company-Id") Long companyId) {
        long count = analysisReportRepository.countByCompanyAndStatus(companyId, "COMPLETED");
        return "기업 ID [" + companyId + "]의 완료된 분석 리포트: " + count + "개";
    }
}