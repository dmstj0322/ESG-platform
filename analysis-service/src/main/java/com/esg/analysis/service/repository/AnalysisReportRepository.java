package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.AnalysisReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AnalysisReportRepository extends JpaRepository<AnalysisReport, Long>, AnalysisReportRepositoryCustom {

    // ✅ createdDate → id 기준으로 변경 (동일 시각 저장 시 순서 보장)
    Optional<AnalysisReport> findFirstByCompanyIdAndStatusOrderByIdDesc(Long companyId, String status);

    long countByCompanyAndStatus(Long companyId, String status);
}