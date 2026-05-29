package com.esg.communityservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class MemberBadge extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long memberId;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "badge_id")
  private Badge badge;

  @Column(nullable = false)
  private boolean isRepresentative = false; // 🌟 추가

  public void setRepresentative() { this.isRepresentative = true; }
  public void unsetRepresentative() { this.isRepresentative = false; }

  public MemberBadge(Long memberId, Badge badge) {
    this.memberId = memberId;
    this.badge = badge;
  }
}
