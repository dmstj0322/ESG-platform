package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.AnalysisReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Optional;

public interface AnalysisReportRepository extends JpaRepository<AnalysisReport, Long>, AnalysisReportRepositoryCustom {

    Optional<AnalysisReport> findFirstByCompanyIdAndStatusOrderByIdDesc(Long companyId, String status);

    java.util.List<AnalysisReport> findTop20ByCompanyIdAndStatusOrderByIdDesc(Long companyId, String status);

    long countByCompanyAndStatus(Long companyId, String status);

    /** 중복 분석 요청 차단: PENDING 또는 PROCESSING 상태가 이미 존재하면 true */
    boolean existsByCompanyIdAndStatusIn(Long companyId, Collection<String> statuses);

    /** 서버 재시작 시 고아 상태 레코드를 FAILED로 일괄 전환 */
    @Modifying
    @Query("UPDATE AnalysisReport r SET r.status = 'FAILED' WHERE r.status IN :statuses")
    int bulkFailByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * 분석 완료 직접 UPDATE — merge 경로(SELECT → UPDATE)를 우회해 단일 UPDATE만 발행.
     * saveAndFlush(detached entity) 시 발생하는 row lock 대기 문제를 방지합니다.
     * 현재 상태(PENDING/PROCESSING/FAILED)에 무관하게 COMPLETED로 전환합니다.
     */
    @Modifying
    @Transactional
    @Query("UPDATE AnalysisReport r SET r.reportContent = :content, r.grade = :grade, r.status = 'COMPLETED' WHERE r.id = :id")
    int completeById(@Param("id") Long id, @Param("content") String content, @Param("grade") String grade);
}
