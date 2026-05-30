package com.esg.notificationservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long memberId;
  private String message;

  @Enumerated(EnumType.STRING)
  private NotificationType type;

  private Long targetId;

  @Builder.Default
  private boolean isRead = false;

  public void markAsRead() {
    this.isRead = true;
  }
}
