package com.esg.analysis.service;

import com.esg.analysis.service.domain.CarbonEmission;
import com.esg.analysis.dto.CarbonEmissionStatDto;
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

    private final CarbonEmissionRepository emissionRepository;
    private final CarbonEmissionRepositoryCustom carbonEmissionRepositoryCustomImpl;
    private static final double ELECTRIC_COEFFICIENT = 0.4781;
    private static final double GAS_COEFFICIENT = 0.0561;

    @Transactional

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