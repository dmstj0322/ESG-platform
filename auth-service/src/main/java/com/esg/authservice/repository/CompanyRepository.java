package com.esg.authservice.repository;

import com.esg.authservice.domain.Company;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CompanyRepository extends JpaRepository<Company, Long> {
  Optional<Company> findByEmailDomain(String emailDomain);
}
