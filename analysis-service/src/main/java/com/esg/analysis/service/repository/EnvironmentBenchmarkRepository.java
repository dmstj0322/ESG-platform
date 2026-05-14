package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.EnvironmentBenchmark;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EnvironmentBenchmarkRepository extends JpaRepository<EnvironmentBenchmark, Long> {

    Optional<EnvironmentBenchmark> findByKsicCodeAndBaseYear(String ksicCode, String baseYear);

    boolean existsByKsicCodeAndBaseYear(String ksicCode, String baseYear);
}
