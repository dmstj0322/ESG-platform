package com.esg.analysis.service.repository;

import com.esg.analysis.dto.CarbonEmissionStatDto;
import java.util.List;

public interface CarbonEmissionRepositoryCustom {
    List<CarbonEmissionStatDto> getMonthlyStats(Long companyId, int year);
}
