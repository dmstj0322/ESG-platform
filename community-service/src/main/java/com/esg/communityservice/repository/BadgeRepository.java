package com.esg.communityservice.repository;

import com.esg.common.domain.ActivityType;
import com.esg.communityservice.domain.Badge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BadgeRepository extends JpaRepository<Badge, Long> {
  List<Badge> findByTargetActivityType(ActivityType targetActivityType);
}
