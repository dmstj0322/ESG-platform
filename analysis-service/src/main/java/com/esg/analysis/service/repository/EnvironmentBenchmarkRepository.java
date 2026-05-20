package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.EnvironmentBenchmark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface EnvironmentBenchmarkRepository extends JpaRepository<EnvironmentBenchmark, Long> {

    Optional<EnvironmentBenchmark> findByKsicCodeAndBaseYear(String ksicCode, String baseYear);

    boolean existsByKsicCodeAndBaseYear(String ksicCode, String baseYear);

    List<EnvironmentBenchmark> findAllByBaseYear(String baseYear);

    /** source 필드가 채워진 최신 통계 기반 데이터가 있는지 확인 */
    boolean existsByKsicCodeAndBaseYearAndElectricitySourceIsNotNull(String ksicCode, String baseYear);

    /** 구 Mock/Seed 데이터 일괄 삭제 (CSV 교체 전 초기화용) */
    @Modifying
    @Query("DELETE FROM EnvironmentBenchmark b WHERE b.baseYear = :baseYear AND b.electricitySource IS NULL")
    void deleteAllByBaseYearAndSourceIsNull(@Param("baseYear") String baseYear);
}
