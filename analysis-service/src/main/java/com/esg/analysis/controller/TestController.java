package com.esg.analysis.controller;

import com.esg.analysis.service.ExternalDataService;
import com.esg.analysis.dto.CarbonEmissionStatDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class TestController {

    private final ExternalDataService externalDataService;

    /**
     * 외부 API로부터 데이터를 강제 수집하여 DB에 저장하는 테스트
     * 호출 예시: http://localhost:8080/test/collect?companyId=1&year=2024&month=03
     */
    @GetMapping("/test/collect")
    public String testCollect(
            @RequestParam Long companyId,
            @RequestParam String year,
            @RequestParam String month) {

        externalDataService.collectAndSaveEmission(companyId, year, month);
        return "수집 완료! DB를 확인해 보세요.";
    }

    /**
     * DB에 저장된 데이터를 QueryDSL로 합산하여 조회하는 테스트
     * 호출 예시: http://localhost:8080/test/stats?companyId=1&year=2024
     */
    @GetMapping("/test/stats")
    public List<CarbonEmissionStatDto> testStats(
            @RequestParam Long companyId,
            @RequestParam int year) {

        return externalDataService.getIntegratedMonthlyStats(companyId, year);
    }
}