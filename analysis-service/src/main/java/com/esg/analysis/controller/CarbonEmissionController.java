//package com.esg.analysis.controller;
//
//import com.esg.analysis.dto.CarbonEmissionStatDto;
//import com.esg.analysis.service.ExternalDataService;
//import lombok.RequiredArgsConstructor;
//import org.springframework.http.ResponseEntity;
//import org.springframework.web.bind.annotation.*;
//
//import java.util.List;
//
//@RestController
//@RequestMapping("/api/analysis/carbon")
//@RequiredArgsConstructor
//@CrossOrigin(origins = "http://localhost:3000") // 프론트 연동 대비
//public class CarbonEmissionController {
//
//    private final ExternalDataService externalDataService;
//
//    /**
//     * 1. 데이터 수집 실행 (F-201)
//     * POST http://localhost:8081/api/analysis/carbon/collect?companyId=1&year=2024&month=03
//     */
//    @PostMapping("/collect")
//    public ResponseEntity<String> collectData(
//            @RequestParam Long companyId,
//            @RequestParam String year,
//            @RequestParam String month) {
//
//        // 이 부분에서 에러가 난다면 ExternalDataService에 이 이름의 메서드가 있는지 재확인!
//        externalDataService.collectAndSaveEmission(companyId, year, month);
//        return ResponseEntity.ok(year + "년 " + month + "월 탄소 배출 데이터 수집 완료");
//    }
//
//    /**
//     * 2. 월별 통합 탄소 배출량 통계 조회 (F-203 연동)
//     * GET http://localhost:8081/api/analysis/carbon/stats?companyId=1&year=2024
//     */
//    @GetMapping("/stats")
//    public ResponseEntity<List<CarbonEmissionStatDto>> getMonthlyStats(
//            @RequestParam Long companyId,
//            @RequestParam int year) {
//
//        List<CarbonEmissionStatDto> stats = externalDataService.getIntegratedMonthlyStats(companyId, year);
//        return ResponseEntity.ok(stats);
//    }
//}

package com.esg.analysis.controller;

import com.esg.analysis.dto.CarbonEmissionStatDto;
//import com.esg.analysis.dto.IndustryAvgDto;
import com.esg.analysis.service.ExternalDataService;
//import com.esg.analysis.service.IndustryAnalysisService; // 이전 대화에서 만든 서비스
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

//import java.util.HashMap;
import java.util.List;
//import java.util.Map;

@RestController
@RequestMapping("/carbon")
@RequiredArgsConstructor
//@CrossOrigin(origins = "http://localhost:3000")
public class CarbonEmissionController {

  private final ExternalDataService externalDataService;
//  private final IndustryAnalysisService industryAnalysisService;

  /**
   * [수정 반영] PDF 리포트용 통합 데이터 조회
   * 우리 회사 통계 + 공공 API 업종 평균을 한 번에 Map으로 묶어서 반환합니다.
   */
//  @GetMapping("/report-data")
//  public ResponseEntity<Map<String, Object>> getReportData(
//
//
//    @RequestHeader("X-Company-Id") Long companyId,
//    @RequestParam String year,
//    @RequestParam String month,
//    @RequestParam(required = false, defaultValue = "26110") String ksicCode) {
//
//    System.out.println("🔥 [TEST] GET /carbon/report-data 호출됨");
//    Map<String, Object> response = new HashMap<>();
//
//    // 1. 우리 회사 데이터 (DB 조회)
//    List<CarbonEmissionStatDto> myStats = externalDataService.getIntegratedMonthlyStats(companyId, Integer.parseInt(year));
//
//    // 2. 업종 평균 데이터 (공공 API 호출 및 계산)
////    IndustryAvgDto avgData = industryAnalysisService.getIndustryAverage(ksicCode, year, month);
//
//    response.put("myStats", myStats);
//    response.put("avgData", avgData); // 프론트의 publicApiData가 될 부분
//
//    return ResponseEntity.ok(response);
//  }

  /**
   * 월별 통합 탄소 배출량 통계 조회 (Dashboard.jsx 연동)
   * GET /api/analysis/carbon/stats?companyId=9&year=2025
   */
  @GetMapping("/stats")
  public ResponseEntity<List<CarbonEmissionStatDto>> getMonthlyStats(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestParam int year) {
    List<CarbonEmissionStatDto> stats = externalDataService.getIntegratedMonthlyStats(companyId, year);
    return ResponseEntity.ok(stats);
  }

//  @PostMapping("/collect")
//  public ResponseEntity<String> collectData(@RequestHeader("X-Company-Id") Long companyId, @RequestParam String year, @RequestParam String month) {
//
//    System.out.println("🔥 [TEST] POST /carbon/collect 호출됨");
//    externalDataService.collectAndSaveEmission(companyId, year, month);
//    return ResponseEntity.ok(year + "년 " + month + "월 데이터 수집 완료");
//  }
}