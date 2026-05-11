package com.esg.communityservice.repository;

import com.esg.communityservice.domain.Post;
import com.esg.communityservice.domain.PostLike;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PostLikeRepository extends JpaRepository<PostLike, Long> {
  boolean existsByCompanyIdAndPostIdAndMemberId(Long companyId, Long postId, Long memberId);
  void deleteByCompanyIdAndPostIdAndMemberId(Long companyId, Long postId, Long memberId);

  boolean existsByPostIdAndMemberId(Long postId, Long memberId);

  @Query("SELECT pl.post FROM PostLike pl WHERE pl.memberId = :memberId AND pl.companyId = :companyId ORDER BY pl.id DESC")
  Page<Post> findPostsByMemberIdAndCompanyId(Long memberId, Long companyId, Pageable pageable);
}
