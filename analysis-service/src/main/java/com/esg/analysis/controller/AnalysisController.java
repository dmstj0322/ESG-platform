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
import java.util.List;
import java.util.Map;

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
     * [POST] 파일 업로드 및 분석 시작
     */
    @PostMapping("/api/v1/analysis/report")
    public ResponseEntity<?> requestReport(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
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
            @RequestPart(value = "eMetrics",  required = false) String eMetricsJson) {

        log.info("★카테고리 분석★ category={} userId={} companyId={} hasFile={} hasEMetrics={}",
                category, userId, companyId,
                file != null && !file.isEmpty(),
                eMetricsJson != null && !eMetricsJson.isBlank());
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

            CategoryAnalysisResponse result =
                    categoryAnalysisService.analyze(category, answers, checkedCount, totalItems,
                            file, eMetricInputs);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("[Category] 분석 실패 category={} 원인={}", category, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "카테고리 분석 중 오류: " + e.getMessage()));
        }
    }

    /**
     * [POST] E/S/G 로컬 결과 집계 → 최종 리포트 생성 (OCR/RAG 없음)
     */
    @PostMapping("/api/v1/analysis/final-report")
    public ResponseEntity<?> requestFinalReport(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
            @RequestBody FinalReportRequest request) {

        log.info("★최종 집계 요청★ userId={} companyId={}", userId, companyId);
        Long analysisId = finalReportService.createFinalReport(userId, companyId, request);
        return ResponseEntity.accepted().body(analysisId);
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