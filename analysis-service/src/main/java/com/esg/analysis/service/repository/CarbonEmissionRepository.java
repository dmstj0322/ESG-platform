package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.CarbonEmission; // 경로 확인!
import org.springframework.data.jpa.repository.JpaRepository;

public interface CarbonEmissionRepository extends JpaRepository<CarbonEmission, Long>, CarbonEmissionRepositoryCustom {
}