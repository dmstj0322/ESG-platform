package com.esg.analysis.controller;

import com.esg.analysis.service.ExternalDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/analysis/external")
@RequiredArgsConstructor
public class ExternalDataController {

    private final ExternalDataService externalDataService;

    /**
     * Postman 테스트용: 특정 기업의 월별 데이터를 수집하고 저장합니다.
     * POST http://localhost:8081/api/analysis/external/collect?companyId=1&year=2024&month=03
     */
    @PostMapping("/collect")
    public ResponseEntity<String> collectData(
            @RequestParam Long companyId,
            @RequestParam String year,
            @RequestParam String month) {

        externalDataService.collectAndSaveEmission(companyId, year, month);
        return ResponseEntity.ok(year + "년 " + month + "월 데이터 수집 및 탄소 배출량 계산 완료");
    }
}