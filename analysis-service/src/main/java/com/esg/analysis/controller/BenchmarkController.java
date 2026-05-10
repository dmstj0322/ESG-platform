package com.esg.analysis.controller;

import com.esg.analysis.dto.RegionalBenchmarkDto;
import com.esg.analysis.service.BenchmarkService;
import com.esg.analysis.service.domain.Company;
import com.esg.analysis.service.repository.CompanyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 탄소 배출 지역 벤치마크 API.
 *
 * <p>GET /api/analysis/benchmark          — 직접 파라미터 지정
 * <p>GET /api/analysis/benchmark/company/{companyId} — Company 테이블 자동 조회
 */
@RestController
@RequestMapping("/benchmark")
@RequiredArgsConstructor
//@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
public class BenchmarkController {

  private final BenchmarkService benchmarkService;
  private final CompanyRepository companyRepository;

  /**
   * 직접 파라미터 방식 (기존 API 유지)
   */
  @GetMapping
  public ResponseEntity<RegionalBenchmarkDto> getBenchmark(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestParam(defaultValue = "2025") int year,
    @RequestParam(defaultValue = "11") String regionCode,
    @RequestParam(defaultValue = "26110") String ksicCode,
    @RequestParam(defaultValue = "500") int employeeCount) {

    return ResponseEntity.ok(
      benchmarkService.getBenchmark(companyId, year, regionCode, ksicCode, employeeCount));
  }

  /**
   * Company 테이블 기반 자동 조회 엔드포인트.
   * company.regionCode / ksicCode / employeeCount 를 DB 에서 읽어 벤치마크 산출.
   * 등록된 기업 정보가 없으면 서울·반도체·500명 기본값 적용.
   */
  @GetMapping("/company")
  public ResponseEntity<RegionalBenchmarkDto> getBenchmarkByCompany(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestParam(defaultValue = "2025") int year) {

    Company company = companyRepository.findById(companyId).orElse(null);

    String regionCode = (company != null && company.getRegionCode() != null) ? company.getRegionCode() : "11";
    String ksicCode = (company != null && company.getKsicCode() != null) ? company.getKsicCode() : "26110";
    int employeeCount = (company != null && company.getEmployeeCount() != null) ? company.getEmployeeCount() : 500;

    return ResponseEntity.ok(
      benchmarkService.getBenchmark(companyId, year, regionCode, ksicCode, employeeCount));
  }
}
