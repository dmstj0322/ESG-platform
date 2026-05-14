package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.ESGIndicator;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ESGIndicatorRepository extends JpaRepository<ESGIndicator, Long> {

    boolean existsByCode(String code);

    Optional<ESGIndicator> findByCode(String code);

    List<ESGIndicator> findAllByOrderByCategoryAscCodeAsc();
}
