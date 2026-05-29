package com.esg.communityservice.repository;

import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.ImageFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ImageFileRepository extends JpaRepository<ImageFile, Long> {
  boolean existsByMemberIdAndFileHashAndAiStatusIn(Long memberId, String fileHash, List<AIStatus> aiStatus);
}
