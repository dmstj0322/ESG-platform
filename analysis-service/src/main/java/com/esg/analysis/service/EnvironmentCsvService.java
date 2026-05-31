package com.esg.analysis.service;

import com.esg.analysis.dto.EnvironmentDataRow;
import com.esg.analysis.dto.EnvironmentUploadResult;
import com.esg.analysis.service.domain.EnvironmentData;
import com.esg.analysis.service.domain.EnvironmentDataSource;
import com.esg.analysis.service.repository.EnvironmentDataRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Environment CSV 파일을 파싱·검증·저장합니다.
 *
 * <pre>
 * 지원 포맷 (헤더 필수):
 *   month,electricity_kwh,gas_nm3,carbon_tco2,waste_kg,water_m3
 *   2026-01,1200,300,0.8,500,5000
 *
 * - month: YYYY-MM 형식 필수
 * - 나머지 컬럼: 선택 (없으면 null 저장)
 * - 모든 수치는 0 이상
 * - 동일 companyId+yearMonth 데이터는 UPSERT (덮어쓰기)
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EnvironmentCsvService {

    private static final Pattern YEAR_MONTH_PATTERN = Pattern.compile("^\\d{4}-(0[1-9]|1[0-2])$");

    private final EnvironmentDataRepository environmentDataRepository;

    @Transactional
    public EnvironmentUploadResult upload(Long companyId, MultipartFile file) {
        // 업로드 배치 고유 식별자 — 같은 파일의 모든 월 데이터가 동일한 sessionId를 공유
        String uploadSessionId  = UUID.randomUUID().toString();
        String originalFileName = file.getOriginalFilename();

        List<EnvironmentDataRow> rows;
        try {
            rows = parseCsv(file);
        } catch (Exception e) {
            log.error("[EnvCSV] 파싱 실패 companyId={} 원인={}", companyId, e.getMessage());
            return EnvironmentUploadResult.failed("CSV 파싱 실패: " + e.getMessage());
        }

        List<String> errors = new ArrayList<>();
        int saved = 0;

        for (int i = 0; i < rows.size(); i++) {
            EnvironmentDataRow row = rows.get(i);
            List<String> rowErrors = validate(row, i + 2); // 헤더 포함 → 실제 줄번호 = i+2
            if (!rowErrors.isEmpty()) {
                errors.addAll(rowErrors);
                continue;
            }
            save(companyId, row, uploadSessionId, originalFileName);
            saved++;
        }

        log.info("[EnvCSV] 업로드 완료 companyId={} session={} 처리={} 저장={} 오류={}건",
                companyId, uploadSessionId, rows.size(), saved, errors.size());

        String status = errors.isEmpty() ? "SUCCESS" : (saved > 0 ? "PARTIAL" : "FAILED");
        return EnvironmentUploadResult.builder()
                .rowsProcessed(rows.size())
                .rowsSaved(saved)
                .errors(errors)
                .status(status)
                .uploadSessionId(uploadSessionId)
                .build();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CSV 파싱
    // ──────────────────────────────────────────────────────────────────────────

    List<EnvironmentDataRow> parseCsv(MultipartFile file) throws Exception {
        List<EnvironmentDataRow> rows = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            String headerLine = reader.readLine();
            if (headerLine == null) throw new IllegalArgumentException("빈 파일");

            String[] headers = headerLine.trim().split(",");
            int[] colIdx = resolveColumnIndices(headers);

            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isBlank()) continue;
                String[] cols = line.split(",", -1);
                rows.add(parseRow(cols, colIdx));
            }
        }
        return rows;
    }

    private int[] resolveColumnIndices(String[] headers) {
        // [0]=month, [1]=electricity_kwh, [2]=gas_nm3(Nm³), [3]=carbon_tco2, [4]=waste_kg, [5]=water_m3
        // gas는 Nm³ 단위 단일 표준: gas_nm3 컬럼만 공식 지원, 변환 없이 그대로 저장
        int[] idx = {-1, -1, -1, -1, -1, -1, 0};
        for (int i = 0; i < headers.length; i++) {
            String h = headers[i].trim().toLowerCase();
            switch (h) {
                case "month"           -> idx[0] = i;
                case "electricity_kwh" -> idx[1] = i;
                case "gas_nm3", "gas_nm³" -> { idx[2] = i; idx[6] = 1; }  // Nm³ 단위
                case "gas_mj"          -> { idx[2] = i; idx[6] = 0; }  // 레거시 MJ 컬럼 호환
                case "carbon_tco2"     -> idx[3] = i;
                case "waste_kg"        -> idx[4] = i;
                case "water_m3"        -> idx[5] = i;
            }
        }
        if (idx[0] == -1) throw new IllegalArgumentException("헤더에 'month' 컬럼이 없습니다.");
        return idx;
    }

    private EnvironmentDataRow parseRow(String[] cols, int[] idx) {
        Double rawGas = getDouble(cols, idx[2]);
        // idx[6]=0 이면 레거시 gas_mj 컬럼 → MJ를 Nm³로 환산 (÷38.4)
        // idx[6]=1 이면 gas_nm3 컬럼 → Nm³ 값 그대로 저장
        Double gasNm3 = (rawGas != null && idx[6] == 0) ? rawGas / 38.4 : rawGas;
        return EnvironmentDataRow.builder()
                .month(        getString(cols, idx[0]))
                .electricityKwh(getDouble(cols, idx[1]))
                .gasMj(         gasNm3)
                .carbonTco2(    getDouble(cols, idx[3]))
                .wasteKg(       getDouble(cols, idx[4]))
                .waterM3(       getDouble(cols, idx[5]))
                .build();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 검증
    // ──────────────────────────────────────────────────────────────────────────

    List<String> validate(EnvironmentDataRow row, int lineNumber) {
        List<String> errors = new ArrayList<>();
        String prefix = lineNumber + "행: ";

        if (row.getMonth() == null || !YEAR_MONTH_PATTERN.matcher(row.getMonth()).matches()) {
            errors.add(prefix + "month 형식 오류 (YYYY-MM 필요): " + row.getMonth());
        }
        checkNonNegative(row.getElectricityKwh(), prefix + "electricity_kwh", errors);
        checkNonNegative(row.getGasMj(),          prefix + "gas_mj",          errors);
        checkNonNegative(row.getCarbonTco2(),      prefix + "carbon_tco2",     errors);
        checkNonNegative(row.getWasteKg(),         prefix + "waste_kg",        errors);
        checkNonNegative(row.getWaterM3(),         prefix + "water_m3",        errors);
        return errors;
    }

    private void checkNonNegative(Double value, String field, List<String> errors) {
        if (value != null && value < 0) errors.add(field + " 값은 0 이상이어야 합니다: " + value);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 저장 (UPSERT)
    // ──────────────────────────────────────────────────────────────────────────

    private void save(Long companyId, EnvironmentDataRow row,
                      String uploadSessionId, String originalFileName) {
        EnvironmentData data = environmentDataRepository
                .findByCompanyIdAndYearMonth(companyId, row.getMonth())
                .map(existing -> overwrite(existing, row, uploadSessionId, originalFileName))
                .orElseGet(() -> EnvironmentData.builder()
                        .companyId(companyId)
                        .yearMonth(row.getMonth())
                        .electricityKwh(row.getElectricityKwh())
                        .gasMj(row.getGasMj())
                        .carbonTco2(row.getCarbonTco2())
                        .wasteKg(row.getWasteKg())
                        .waterM3(row.getWaterM3())
                        .dataSource(EnvironmentDataSource.CSV)
                        .uploadSessionId(uploadSessionId)
                        .originalFileName(originalFileName)
                        .build());
        environmentDataRepository.save(data);
    }

    /**
     * 기존 레코드를 새 업로드 값으로 덮어씁니다.
     * 수치는 null이면 기존 값 유지, dataSource/sessionId/fileName은 항상 최신 값으로 갱신합니다.
     */
    private EnvironmentData overwrite(EnvironmentData existing, EnvironmentDataRow row,
                                      String uploadSessionId, String originalFileName) {
        return EnvironmentData.builder()
                .id(existing.getId())
                .companyId(existing.getCompanyId())
                .yearMonth(existing.getYearMonth())
                .electricityKwh(row.getElectricityKwh() != null ? row.getElectricityKwh() : existing.getElectricityKwh())
                .gasMj(         row.getGasMj()          != null ? row.getGasMj()          : existing.getGasMj())
                .carbonTco2(    row.getCarbonTco2()      != null ? row.getCarbonTco2()      : existing.getCarbonTco2())
                .wasteKg(       row.getWasteKg()         != null ? row.getWasteKg()         : existing.getWasteKg())
                .waterM3(       row.getWaterM3()         != null ? row.getWaterM3()         : existing.getWaterM3())
                .dataSource(EnvironmentDataSource.CSV)
                .uploadSessionId(uploadSessionId)
                .originalFileName(originalFileName)
                .build();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 유틸
    // ──────────────────────────────────────────────────────────────────────────

    private String getString(String[] cols, int idx) {
        if (idx < 0 || idx >= cols.length) return null;
        String val = cols[idx].trim();
        return val.isEmpty() ? null : val;
    }

    private Double getDouble(String[] cols, int idx) {
        if (idx < 0 || idx >= cols.length) return null;
        String val = cols[idx].trim();
        if (val.isEmpty()) return null;
        try {
            return Double.parseDouble(val);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
