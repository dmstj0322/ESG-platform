package com.esg.communityservice.repository;

import com.esg.communityservice.domain.MemberBadge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface MemberBadgeRepository extends JpaRepository<MemberBadge, Long> {
  boolean existsByMemberIdAndBadgeId(Long memberId, Long badgeId);
  List<MemberBadge> findByMemberId(Long memberId);
  Optional<MemberBadge> findByMemberIdAndIsRepresentativeTrue(Long memberId);
  Optional<MemberBadge> findByMemberIdAndBadgeId(Long memberId, Long badgeId);
  List<MemberBadge> findByMemberIdInAndIsRepresentativeTrue(Set<Long> memberIds);
}
