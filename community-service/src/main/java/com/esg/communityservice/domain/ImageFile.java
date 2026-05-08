package com.esg.communityservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class ImageFile extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long memberId;

  @Column(nullable = false)
  private String s3Url;

  @Column(nullable = false)
  private String fileHash;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "post_id")
  private Post post;

  @Enumerated(EnumType.STRING)
  private ActivityType activityType;

  @Builder.Default
  @Enumerated(EnumType.STRING)
  private AIStatus aiStatus = AIStatus.PENDING;

  public void updateAIStatus(AIStatus status) {
    if (this.aiStatus == AIStatus.FAIL) {
      log.warn("이미 처리가 완료된 이미지입니다.");
      return;
    }

    this.aiStatus = status;
  }

  public void setPost(Post post) {
    this.post = post;
    if (post != null && !post.getImages().contains(this)) {
      post.getImages().add(this);
    }
  }
}
