package com.esg.pointservice.repository;

import com.esg.pointservice.domain.PointBalance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PointBalanceRepository extends JpaRepository<PointBalance, Long> {

    @Query("SELECT COALESCE(SUM(pb.balance), 0) FROM PointBalance pb WHERE pb.companyId = :companyId")
    Long sumBalanceByCompanyId(@Param("companyId") Long companyId);
}
