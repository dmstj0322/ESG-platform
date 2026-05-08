package com.esg.communityservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.Where;

import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@SQLDelete(sql = "UPDATE post SET is_deleted = true WHERE id = ?")
@Where(clause = "is_deleted = false")
public class Post extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long companyId;

  @Column(nullable = false)
  private Long memberId;

  @Column(nullable = false)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String content;

  @Builder.Default
  @OneToMany(mappedBy = "post", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<ImageFile> images = new ArrayList<>();

  @OneToMany(mappedBy = "post", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<Comment> comments = new ArrayList<>();

  @Builder.Default
  @Column(columnDefinition = "integer default 0")
  private int likeCount = 0;

  @Builder.Default
  @Column(columnDefinition = "integer default 0")
  private int viewCount = 0;

  @Builder.Default
  @Column(nullable = false)
  private boolean isDeleted = false;

  @Column
  private Double aiScore;

  @Column
  private String aiResult;

  @Enumerated(EnumType.STRING)
  private AIStatus aiStatus;

  public void updateAiAnalysis(Double aiScore, String aiResult, AIStatus status) {
    this.aiScore = aiScore;
    this.aiResult = aiResult;
    this.aiStatus = status;

    if (this.images != null) {
      this.images.forEach(image -> image.updateAIStatus(status));
    }
  }

  public void updateAiStatus(AIStatus aiStatus) {
    this.aiStatus = aiStatus;
    this.images.forEach(image -> image.updateAIStatus(aiStatus));
  }

  @Builder.Default
  @Enumerated(EnumType.STRING)
  private AdminStatus adminStatus = AdminStatus.WAITING;

  private String rejectionReason;

  public void approve() {
    this.adminStatus = AdminStatus.APPROVED;
  }

  public void reject(String reason) {
    this.adminStatus = AdminStatus.REJECTED;
    this.rejectionReason = reason;
  }

  public void update(String title, String content) {
    this.title = title;
    this.content = content;
  }

  public void increaseViewCount() {
    this.viewCount++;
  }

  public void increaseLikeCount() {
    this.likeCount++;
  }

  public void decreaseLikeCount() {
    if (this.likeCount > 0) {
      this.likeCount--;
    }
  }

  public void addImage(ImageFile image) {
    this.images.add(image);
    image.setPost(this);
  }
}
