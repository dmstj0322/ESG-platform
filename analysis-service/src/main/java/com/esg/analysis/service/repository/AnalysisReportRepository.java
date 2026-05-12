package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.AnalysisReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;

public interface AnalysisReportRepository extends JpaRepository<AnalysisReport, Long>, AnalysisReportRepositoryCustom {

    Optional<AnalysisReport> findFirstByCompanyIdAndStatusOrderByIdDesc(Long companyId, String status);

    long countByCompanyAndStatus(Long companyId, String status);

    /** 중복 분석 요청 차단: PENDING 또는 PROCESSING 상태가 이미 존재하면 true */
    boolean existsByCompanyIdAndStatusIn(Long companyId, Collection<String> statuses);

    /** 서버 재시작 시 고아 상태 레코드를 FAILED로 일괄 전환 */
    @Modifying
    @Query("UPDATE AnalysisReport r SET r.status = 'FAILED' WHERE r.status IN :statuses")
    int bulkFailByStatusIn(@Param("statuses") Collection<String> statuses);
}
