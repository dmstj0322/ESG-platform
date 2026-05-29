package com.esg.communityservice.repository;

import com.esg.common.domain.ActivityType;
import com.esg.communityservice.domain.AdminStatus;
import com.esg.communityservice.domain.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PostRepository extends JpaRepository<Post,Long> {
  Page<Post> findAllByCompanyIdOrderByCreatedDateDesc(Long companyId,Pageable pageable);
  Page<Post> findByCompanyIdAndTitleContainingOrContentContaining(Long companyId, String title, String content, Pageable pageable);
  Page<Post> findAllByMemberIdAndCompanyIdOrderByCreatedDateDesc(Long userId, Long companyId, Pageable pageable);
  Page<Post> findAllByCompanyIdAndAdminStatusOrderByCreatedDateDesc(Long companyId, AdminStatus adminStatus, Pageable pageable);
  long countByMemberIdAndActivityTypeAndAdminStatus(Long memberId, ActivityType activityType, AdminStatus adminStatus);
}
