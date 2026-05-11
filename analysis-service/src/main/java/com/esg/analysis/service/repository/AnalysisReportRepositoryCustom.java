package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.dto.GradeStatDto;
import java.time.LocalDateTime;
import java.util.List;

public interface AnalysisReportRepositoryCustom {
    long countByCompanyAndStatus(Long companyId, String status);
    List<AnalysisReport> findTopReportsByGrade(String grade, int limit);

    List<AnalysisReport> findReportsByComplexCondition(
            Long companyId,
            String status,
            String grade,
            LocalDateTime startDate,
            LocalDateTime endDate
    );

    List<GradeStatDto> getGradeDistribution(Long companyId);
}