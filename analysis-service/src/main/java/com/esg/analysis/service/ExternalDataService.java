package com.esg.analysis.service;

import com.esg.analysis.client.KepcoClient;
import com.esg.analysis.client.KogasClient;
import com.esg.analysis.service.domain.CarbonEmission;
import com.esg.analysis.dto.CarbonEmissionStatDto;
import com.esg.analysis.dto.external.KepcoResponseDto;
import com.esg.analysis.dto.external.KogasResponseDto;
import com.esg.analysis.service.repository.CarbonEmissionRepository;
import com.esg.analysis.service.repository.CarbonEmissionRepositoryCustom;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExternalDataService {

    private final KepcoClient kepcoClient;
    private final KogasClient kogasClient;
    private final CarbonEmissionRepository emissionRepository;
    private final CarbonEmissionRepositoryCustom carbonEmissionRepositoryCustomImpl;

    @Value("${external-api.kepco.key}")
    private String kepcoApiKey;

    @Value("${external-api.kogas.key}")
    private String kogasServiceKey;

    private static final double ELECTRIC_COEFFICIENT = 0.4781;
    private static final double GAS_COEFFICIENT = 0.0561;

    @Transactional
    public void collectAndSaveEmission(Long companyId, String year, String month) {
        try {
            String formattedMonth = (month.length() == 1) ? "0" + month : month;
            String yearMonth = year + formattedMonth;

            // --- 1. 한전(ELECTRIC) 데이터 수집 및 저장 ---
            KepcoResponseDto powerRes = kepcoClient.getPowerUsage(year, formattedMonth, kepcoApiKey, "json");
            List<KepcoResponseDto.KepcoData> kepcoList = (powerRes != null) ? powerRes.getActualData() : null;

            if (kepcoList != null && !kepcoList.isEmpty()) {
                double usage = kepcoList.get(0).getPowerUsage();
                double amount = (usage / 1000.0) * ELECTRIC_COEFFICIENT;

                saveEmission(companyId, yearMonth, usage, amount, "ELECTRIC");
                log.info("▶ [CHECK] 한전 데이터 DB 저장 완료: {}년 {}월", year, formattedMonth);
            }

            // --- 2. 가스공사(GAS) 데이터 수집 및 저장 (구조 수정 반영) ---
            // dataType 파라미터는 명세서에 따라 대문자 "JSON"으로 전달
            KogasResponseDto gasRes = kogasClient.getGasUsage(year, formattedMonth, kogasServiceKey, "JSON");

            // 가공 API의 최상위 response 키부터 순차적으로 체크
            if (gasRes != null && gasRes.getResponse() != null && gasRes.getResponse().getBody() != null) {
                List<KogasResponseDto.KogasData> gasItems = gasRes.getResponse().getBody().getItems().getItem();

                if (gasItems != null && !gasItems.isEmpty()) {
                    // "합계" 데이터가 있으면 합계를 쓰고, 없으면 리스트의 첫 번째 데이터를 사용
                    KogasResponseDto.KogasData targetData = gasItems.stream()
                            .filter(item -> "합계".equals(item.getCompanyName()))
                            .findFirst()
                            .orElse(gasItems.get(0));

                    double heatValue = Double.parseDouble(targetData.getMinMj());
                    double gasAmount = heatValue * GAS_COEFFICIENT;

                    saveEmission(companyId, yearMonth, heatValue, gasAmount, "GAS");
                    log.info("▶ [CHECK] 가스 데이터 DB 저장 완료: {}년 {}월 (출처: {})", year, formattedMonth, targetData.getCompanyName());
                } else {
                    log.warn("▶ 가스 데이터 리스트(item)가 비어있습니다.");
                }
            } else {
                // 이 로그가 찍힌다면 KogasResponseDto의 @JsonProperty("response") 계층 구성을 다시 확인해야 함
                log.warn("▶ 가스 API 응답 구조가 올바르지 않습니다. (response/body가 null입니다)");
            }

        } catch (Exception e) {
            log.error("▶ [ERROR] 데이터 수집 중 치명적 오류 발생: {}", e.getMessage());
            throw e;
        }
    }

    // 공통 저장 메서드
    private void saveEmission(Long companyId, String ym, double usage, double amount, String source) {
        CarbonEmission entity = CarbonEmission.builder()
                .companyId(companyId)
                .yearMonth(ym)
                .totalUsage(usage)
                .carbonAmount(amount)
                .energySource(source)
                .build();

        emissionRepository.saveAndFlush(entity);
        log.info("▶ Hibernate 실행: {} 소스 저장됨 (ym: {})", source, ym);
    }

    @Transactional(readOnly = true)
    public List<CarbonEmissionStatDto> getIntegratedMonthlyStats(Long companyId, int year) {
        List<CarbonEmissionStatDto> rawStats = carbonEmissionRepositoryCustomImpl.getMonthlyStats(companyId, year);
        Map<Integer, CarbonEmissionStatDto> integratedMap = new LinkedHashMap<>();

        for (CarbonEmissionStatDto stat : rawStats) {
            int month = stat.getMonth();
            if (integratedMap.containsKey(month)) {
                CarbonEmissionStatDto existing = integratedMap.get(month);
                integratedMap.put(month, new CarbonEmissionStatDto(
                        month,
                        existing.getTotalUsage() + stat.getTotalUsage(),
                        existing.getCarbonAmount() + stat.getCarbonAmount(),
                        "TOTAL (E+G)"));
            } else {
                integratedMap.put(month, stat);
            }
        }
        return new ArrayList<>(integratedMap.values());
    }
}