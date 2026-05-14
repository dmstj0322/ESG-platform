package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.ESGEvidenceMatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ESGEvidenceMatchRepository extends JpaRepository<ESGEvidenceMatch, Long> {

    List<ESGEvidenceMatch> findByAnalysisId(Long analysisId);

    List<ESGEvidenceMatch> findByAnalysisIdAndIndicatorCode(Long analysisId, String indicatorCode);

    /** isValidEvidence=true인 Evidence만 조회 (UI Evidence Table 필터링용) */
    List<ESGEvidenceMatch> findByAnalysisIdAndIsValidEvidenceTrue(Long analysisId);

    /** 테스트 세션 전체 삭제 — DELETE /test/retrieval/session 호출 시 사용 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ESGEvidenceMatch e WHERE e.analysisId = :analysisId")
    void deleteByAnalysisId(@Param("analysisId") Long analysisId);

    /** 지표 단위 교체 저장 — GET /test/retrieval/{code} 재호출 시 이전 결과 제거 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ESGEvidenceMatch e WHERE e.analysisId = :analysisId AND e.indicatorCode = :indicatorCode")
    void deleteByAnalysisIdAndIndicatorCode(
            @Param("analysisId") Long analysisId,
            @Param("indicatorCode") String indicatorCode);
}
