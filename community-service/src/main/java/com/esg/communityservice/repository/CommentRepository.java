package com.esg.communityservice.repository;

import com.esg.communityservice.domain.Comment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommentRepository extends JpaRepository<Comment, Long> {
  Page<Comment> findByPostIdAndParentIsNullOrderByCreatedDateAsc(Long postId, Pageable pageable);
  Page<Comment> findByCompanyIdAndPostIdAndParentIsNullOrderByCreatedDateAsc(Long companyId, Long postId, Pageable pageable);
  List<Comment> findByParentInOrderByCreatedDateAsc(List<Comment> parents);
  Page<Comment> findByMemberIdAndCompanyIdOrderByCreatedDateDesc(Long userId, Long companyId, Pageable pageable);
}
