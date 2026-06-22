package com.esg.communityservice.repository;

import com.esg.common.domain.ActivityType;
import com.esg.communityservice.domain.AdminStatus;
import com.esg.communityservice.domain.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PostRepository extends JpaRepository<Post,Long> {
  Page<Post> findAllByCompanyIdOrderByCreatedDateDesc(Long companyId,Pageable pageable);
  Page<Post> findByCompanyIdAndTitleContainingOrContentContaining(Long companyId, String title, String content, Pageable pageable);
  Page<Post> findAllByMemberIdAndCompanyIdOrderByCreatedDateDesc(Long userId, Long companyId, Pageable pageable);
  Page<Post> findAllByCompanyIdAndAdminStatusOrderByCreatedDateDesc(Long companyId, AdminStatus adminStatus, Pageable pageable);
  long countByMemberIdAndActivityTypeAndAdminStatus(Long memberId, ActivityType activityType, AdminStatus adminStatus);

  @Query("SELECT p.memberId, MAX(p.nickname), COUNT(p) " +
    "FROM Post p " +
    "WHERE p.companyId = :companyId AND p.adminStatus = 'APPROVED' " +
    "GROUP BY p.memberId")
  List<Object[]> countApprovedPostsAndNicknameByCompanyId(@Param("companyId") Long companyId);
}
