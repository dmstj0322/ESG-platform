package com.esg.authservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AdminSignupRequest(
  @NotBlank(message = "이메일은 필수 입력값입니다.")
  @Email(message = "올바른 이메일 형식으로 입력해주세요.")
  String email,

  @NotBlank(message = "비밀번호는 필수 입력값입니다.")
  @Size(min = 8, message = "비밀번호는 최소 8자 이상이어야 합니다.")
  String password,

  @NotBlank(message = "닉네임은 필수 입력값입니다.")
  @Size(max = 20, message = "닉네임은 최대 20자까지 가능합니다.")
  String nickname,

  String companyName,

  @NotBlank(message = "지역을 선택해주세요.")
  String regionCode,

  String regionName,

  @NotBlank(message = "업종을 선택해주세요.")
  String ksicCode,

  String industryName,

  Integer employeeCount
) {
}
