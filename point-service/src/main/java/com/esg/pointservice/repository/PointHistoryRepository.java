package com.esg.pointservice.repository;

import com.esg.pointservice.domain.PointHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PointHistoryRepository extends JpaRepository<PointHistory,Long> {
  Page<PointHistory> findByMemberIdOrderByCreatedDateDesc(Long memberId, Pageable pageable);
}
