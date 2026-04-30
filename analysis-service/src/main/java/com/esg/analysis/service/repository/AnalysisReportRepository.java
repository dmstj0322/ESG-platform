package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.AnalysisReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AnalysisReportRepository extends JpaRepository<AnalysisReport, Long>, AnalysisReportRepositoryCustom {
    // 이제 JpaRepository의 기본 기능과 QueryDSL의 커스텀 기능을 한 번에 사용합니다.
}