package com.esg.pointservice.repository;

import com.esg.pointservice.domain.PointHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PointHistoryRepository extends JpaRepository<PointHistory,Long> {
  Page<PointHistory> findByMemberId(Long memberId, Pageable pageable);
  List<PointHistory> findByMemberId(Long memberId);
  Page<PointHistory> findByCompanyId(Long companyId, Pageable pageable);
  List<PointHistory> findByMemberIdAndCompanyId(Long memberId, Long companyId);
}
