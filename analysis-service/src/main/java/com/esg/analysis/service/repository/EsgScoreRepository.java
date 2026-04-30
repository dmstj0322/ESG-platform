package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.EsgScore;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface EsgScoreRepository extends JpaRepository<EsgScore, Long> {
    // 기업 ID로 기존 점수 레코드를 찾는 메서드
    Optional<EsgScore> findByCompanyId(Long companyId);
}
