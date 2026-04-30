package com.esg.analysis.controller;

import com.esg.analysis.dto.CarbonEmissionStatDto;
import com.esg.analysis.service.ExternalDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/analysis/carbon")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:3000") // 프론트 연동 대비
public class CarbonEmissionController {

    private final ExternalDataService externalDataService;

    /**
     * 1. 데이터 수집 실행 (F-201)
     * POST http://localhost:8081/api/analysis/carbon/collect?companyId=1&year=2024&month=03
     */
    @PostMapping("/collect")
    public ResponseEntity<String> collectData(
            @RequestParam Long companyId,
            @RequestParam String year,
            @RequestParam String month) {

        // 이 부분에서 에러가 난다면 ExternalDataService에 이 이름의 메서드가 있는지 재확인!
        externalDataService.collectAndSaveEmission(companyId, year, month);
        return ResponseEntity.ok(year + "년 " + month + "월 탄소 배출 데이터 수집 완료");
    }

    /**
     * 2. 월별 통합 탄소 배출량 통계 조회 (F-203 연동)
     * GET http://localhost:8081/api/analysis/carbon/stats?companyId=1&year=2024
     */
    @GetMapping("/stats")
    public ResponseEntity<List<CarbonEmissionStatDto>> getMonthlyStats(
            @RequestParam Long companyId,
            @RequestParam int year) {

        List<CarbonEmissionStatDto> stats = externalDataService.getIntegratedMonthlyStats(companyId, year);
        return ResponseEntity.ok(stats);
    }
}