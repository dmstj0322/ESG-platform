package com.esg.communityservice.repository;

import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.ImageFile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ImageFileRepository extends JpaRepository<ImageFile, Long> {
  boolean existsByMemberIdAndFileHashAndAiStatus(Long memberId, String fileHash, AIStatus aiStatus);
}
