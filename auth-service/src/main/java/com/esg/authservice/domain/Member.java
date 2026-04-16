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
  @GeneratedValue(strategy = GenerationType.AUTO)
  private Long id;

  @Column(nullable = false, unique = true)
  private String email;

  private String password;
  private String nickname;

  @Enumerated(EnumType.STRING)
  private Role role;

  @Builder
  public Member(String email, String password, String nickname, Role role) {
    this.email = email;
    this.password = password;
    this.nickname = nickname;
    this.role = role;
  }
}
