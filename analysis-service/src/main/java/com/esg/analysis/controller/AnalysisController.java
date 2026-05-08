package com.esg.analysis.controller;

import com.esg.analysis.dto.GradeStatDto;
import com.esg.analysis.service.AnalysisApiService;
import com.esg.analysis.service.EsgGuidelineService;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/analysis")
@CrossOrigin(origins = "http://localhost:5173")
@RequiredArgsConstructor
public class AnalysisController {

    private final AnalysisApiService analysisApiService;
    private final AnalysisReportRepository analysisReportRepository;
    private final EsgGuidelineService esgGuidelineService;

    /**
     * [GET] 최신 완료 리포트 조회
     */
    @GetMapping("/latest/{companyId}")
    public ResponseEntity<?> getLatestReport(@PathVariable Long companyId) {
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
    @PostMapping("/report")
    public ResponseEntity<?> requestReport(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
            @RequestParam("file") MultipartFile file) {

        log.info("★파일 수신★ 이름: {}, 크기: {} bytes", file.getOriginalFilename(), file.getSize());

        Object result = analysisApiService.initiateAnalysis(userId, companyId, file);

        if (result instanceof Long) {
            return ResponseEntity.accepted().body(result);
        }
        return ResponseEntity.ok(result);
    }

    /**
     * [GET] 등급 분포 통계
     */
    @GetMapping("/stats/{companyId}")
    public ResponseEntity<List<GradeStatDto>> getGradeStats(@PathVariable Long companyId) {
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
     * [GET] QueryDSL 동작 테스트
     */
    @GetMapping("/test/querydsl/{companyId}")
    public String testQueryDsl(@PathVariable Long companyId) {
        long count = analysisReportRepository.countByCompanyAndStatus(companyId, "COMPLETED");
        return "기업 ID [" + companyId + "]의 완료된 분석 리포트: " + count + "개";
    }
}