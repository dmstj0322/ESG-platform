package com.esg.analysis.service.repository;

import com.esg.analysis.service.domain.Company;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CompanyRepository extends JpaRepository<Company, Long> {

    /**
     * MySQL ON DUPLICATE KEY UPDATE — companyId 기준 UPSERT.
     * 기업이 없으면 INSERT, 있으면 지역/업종/임직원 수만 UPDATE.
     */
    @Modifying
    @Query(value = """
        INSERT INTO company (id, name, region_code, region_name, ksic_code, industry_name, employee_count)
        VALUES (:id, :name, :regionCode, :regionName, :ksicCode, :industryName, :employeeCount)
        ON DUPLICATE KEY UPDATE
          name           = VALUES(name),
          region_code    = VALUES(region_code),
          region_name    = VALUES(region_name),
          ksic_code      = VALUES(ksic_code),
          industry_name  = VALUES(industry_name),
          employee_count = VALUES(employee_count)
        """, nativeQuery = true)
    void upsertProfile(
        @Param("id")            Long    id,
        @Param("name")          String  name,
        @Param("regionCode")    String  regionCode,
        @Param("regionName")    String  regionName,
        @Param("ksicCode")      String  ksicCode,
        @Param("industryName")  String  industryName,
        @Param("employeeCount") Integer employeeCount
    );
}

