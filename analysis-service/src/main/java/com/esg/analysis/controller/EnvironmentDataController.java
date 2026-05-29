package com.esg.analysis.controller;

import com.esg.analysis.dto.EnvironmentUploadResult;
import com.esg.analysis.service.EnvironmentBenchmarkService;
import com.esg.analysis.service.EnvironmentBenchmarkService.EnvironmentValues;
import com.esg.analysis.service.EnvironmentCsvService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * Environment(E) 정량 데이터 업로드 및 벤치마크 조회 API.
 *
 * <pre>
 * POST /environment/upload          — CSV 업로드 (multipart/form-data, file 파트)
 * GET  /environment/benchmark       — 업종 벤치마크 조회 (스케일링 포함)
 * GET  /environment/actual-or-bench — 실측 vs 벤치마크 우선 조회
 * </pre>
 */
@Slf4j
@RestController
@RequestMapping("/environment")
@RequiredArgsConstructor
public class EnvironmentDataController {

    private final EnvironmentCsvService         csvService;
    private final EnvironmentBenchmarkService   benchmarkService;

    // ──────────────────────────────────────────────────────────────────────────
    // CSV 업로드
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Environment 정량 데이터 CSV 업로드.
     *
     * <pre>
     * curl -X POST "http://localhost:8082/environment/upload" \
     *      -H "X-Company-Id: 1" \
     *      -F "file=@environment_data.csv"
     *
     * CSV 포맷:
     *   month,electricity_kwh,gas_mj,carbon_tco2,waste_kg,water_m3
     *   2026-01,1200,530,0.8,500,5000
     * </pre>
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EnvironmentUploadResult> uploadCsv(
            @RequestHeader("X-Company-Id") Long companyId,
            @RequestPart("file") MultipartFile file) {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(EnvironmentUploadResult.failed("파일이 비어 있습니다."));
        }

        log.info("[EnvUpload] companyId={} fileName={} size={}bytes",
                companyId, file.getOriginalFilename(), file.getSize());

        EnvironmentUploadResult result = csvService.upload(companyId, file);

        return "FAILED".equals(result.getStatus())
                ? ResponseEntity.badRequest().body(result)
                : ResponseEntity.ok(result);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 벤치마크 조회
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 업종 벤치마크를 임직원 수 기준으로 스케일링하여 반환합니다.
     * 기업 가입 시 E 지표 기준값 자동 세팅에 활용합니다.
     *
     * <pre>
     * curl "http://localhost:8082/environment/benchmark?ksicCode=26110&employeeCount=500"
     * </pre>
     */
    @GetMapping("/benchmark")
    public ResponseEntity<EnvironmentValues> getBenchmark(
            @RequestParam String ksicCode,
            @RequestParam(defaultValue = "500") int employeeCount) {

        return ResponseEntity.ok(benchmarkService.getBenchmarkScaled(ksicCode, employeeCount));
    }

    /**
     * 실측 데이터(업로드된 경우 우선) 또는 벤치마크를 반환합니다.
     * source 필드로 "ACTUAL" / "BENCHMARK" 구분 가능합니다.
     *
     * <pre>
     * curl -H "X-Company-Id: 1" \
     *      "http://localhost:8082/environment/actual-or-bench?ksicCode=26110&employeeCount=500"
     * </pre>
     */
    @GetMapping("/actual-or-bench")
    public ResponseEntity<EnvironmentValues> getActualOrBenchmark(
            @RequestHeader("X-Company-Id") Long companyId,
            @RequestParam String ksicCode,
            @RequestParam(defaultValue = "500") int employeeCount) {

        return ResponseEntity.ok(
                benchmarkService.getActualOrBenchmark(companyId, ksicCode, employeeCount));
    }
}
