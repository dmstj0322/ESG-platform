package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.Company;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyRepository extends JpaRepository<Company, Long> {
}
