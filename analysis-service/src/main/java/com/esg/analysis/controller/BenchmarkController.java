package com.esg.analysis.controller;

import com.esg.analysis.dto.CompanyProfileRequest;
import com.esg.analysis.dto.RegionalBenchmarkDto;
import com.esg.analysis.service.BenchmarkService;
import com.esg.analysis.client.AuthServiceClient;
import com.esg.common.dto.CompanyResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 탄소 배출 지역 벤치마크 API.
 *
 * <p>GET /api/analysis/benchmark          — 직접 파라미터 지정
 * <p>GET /api/analysis/benchmark/company/{companyId} — Company 테이블 자동 조회
 */
@Slf4j
@RestController
@RequestMapping("/benchmark")
@RequiredArgsConstructor
//@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
public class BenchmarkController {

  private final BenchmarkService benchmarkService;
  private final AuthServiceClient authServiceClient;

  /**
   * 기업 지역·업종·임직원 수 프로파일 저장 (UPSERT).
   * 저장 후 /company 엔드포인트를 다시 호출하면 저장된 값으로 벤치마크 조회.
   */
  @PostMapping("/company/profile")
  public ResponseEntity<Void> saveCompanyProfile(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestBody CompanyProfileRequest req) {

    benchmarkService.saveProfile(companyId, req);
    return ResponseEntity.ok().build();
  }

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
   * 로그인한 기업의 회원가입 시 선택한 지역·업종으로 동종업계 벤치마크 조회.
   * auth-service에서 company 프로파일(regionCode, ksicCode, employeeCount)을 가져옴.
   */
  @GetMapping("/company")
  public ResponseEntity<RegionalBenchmarkDto> getBenchmarkByCompany(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestParam(defaultValue = "2025") int year) {

    CompanyResponse company = authServiceClient.getCompanyById(companyId);

    String regionCode    = (company.regionCode()    != null) ? company.regionCode()    : "11";
    String ksicCode      = (company.ksicCode()      != null) ? company.ksicCode()      : "26110";
    int    employeeCount = (company.employeeCount() != null) ? company.employeeCount() : 500;

    // analysis-service 로컬 Company 테이블을 auth-service 최신 정보로 동기화
    benchmarkService.saveProfileRaw(companyId, company.name(), regionCode, ksicCode, employeeCount,
            company.industryName());

    log.info("[BenchmarkByCompany] companyId={} name={} industry={} ksic={} region={} employees={}",
            companyId, company.name(), company.industryName(),
            ksicCode, regionCode, employeeCount);

    RegionalBenchmarkDto result =
      benchmarkService.getBenchmark(companyId, year, regionCode, ksicCode, employeeCount);
    return ResponseEntity.ok(result.toBuilder().companyName(company.name()).build());
  }
}
