package com.esg.communityservice.domain;

import com.esg.common.domain.ActivityType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class Badge {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private String name;
  private String description;
  private String imageUrl;

  @Enumerated(EnumType.STRING)
  private ActivityType targetActivityType;

  private int targetCount;
}
