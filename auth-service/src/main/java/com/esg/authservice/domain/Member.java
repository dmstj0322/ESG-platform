package com.esg.authservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
public class Member extends BaseTimeEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long companyId;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(nullable = false)
  private String password;

  @Column(nullable = false)
  private String nickname;

  @Enumerated(EnumType.STRING)
  private Role role;

  private int point;

  @Builder
  public Member(Long companyId, String email, String password, String nickname, Role role) {
    this.companyId = companyId;
    this.email = email;
    this.password = password;
    this.nickname = nickname;
    this.role = role;
    this.point = 0;
  }
}
