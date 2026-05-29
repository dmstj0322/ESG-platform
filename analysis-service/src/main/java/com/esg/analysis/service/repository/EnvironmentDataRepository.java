package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.EnvironmentData;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EnvironmentDataRepository extends JpaRepository<EnvironmentData, Long> {

    Optional<EnvironmentData> findByCompanyIdAndYearMonth(Long companyId, String yearMonth);

    List<EnvironmentData> findByCompanyIdOrderByYearMonthAsc(Long companyId);
}
