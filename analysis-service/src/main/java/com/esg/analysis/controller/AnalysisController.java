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

import java.nio.file.Paths;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/analysis")
@CrossOrigin(origins = "http://localhost:5173")
@RequiredArgsConstructor
public class AnalysisController {

    private final AnalysisApiService analysisApiService;
    // private final AnalysisService analysisService; // 사용하지 않아 삭제 (경고 해결)
    private final AnalysisReportRepository analysisReportRepository;
    private final EsgGuidelineService esgGuidelineService;

    /**
     * [POST] K-ESG 가이드라인 학습 API
     */
    @PostMapping("/admin/ingest")
    public ResponseEntity<String> ingestGuideline(@RequestParam String fileName) {
        // 경로 조립을 서비스 내부로 옮겼으므로 파일 이름만 전달합니다.
        esgGuidelineService.ingestGuideline(fileName);
        return ResponseEntity.ok("가이드라인 학습 성공: " + fileName);
    }

    /**
     * [POST] 파일 업로드 및 분석 시작
     */
    @PostMapping("/report")
    public ResponseEntity<?> requestReport(
            @RequestHeader("X-UserId") Long userId,
            @RequestHeader("X-CompanyId") Long companyId,
            @RequestParam("file") MultipartFile file) {

        log.info("★파일 수신 성공★ 이름: {}, 크기: {} bytes", file.getOriginalFilename(), file.getSize());

        Object result = analysisApiService.initiateAnalysis(userId, companyId, file);

        if (result instanceof Long) {
            return ResponseEntity.accepted().body(result);
        }

        return ResponseEntity.ok(result);
    }

    /**
     * [GET] QueryDSL 동작 테스트
     */
    @GetMapping("/test/querydsl/{companyId}")
    public String testQueryDsl(@PathVariable Long companyId) {
        long count = analysisReportRepository.countByCompanyAndStatus(companyId, "COMPLETED");
        return "기업 ID [" + companyId + "]의 완료된 분석 리포트 개수는: " + count + "개 입니다.";
    }

    /**
     * [GET] 기업별 등급 분포 통계 조회
     */
    @GetMapping("/stats/{companyId}")
    public ResponseEntity<List<GradeStatDto>> getGradeStats(@PathVariable Long companyId) {
        List<GradeStatDto> stats = analysisReportRepository.getGradeDistribution(companyId);
        return ResponseEntity.ok(stats);
    }
}