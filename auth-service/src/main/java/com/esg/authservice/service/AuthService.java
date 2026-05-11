package com.esg.authservice.service;

import com.esg.authservice.domain.Company;
import com.esg.authservice.domain.Member;
import com.esg.authservice.domain.Role;
import com.esg.authservice.dto.LoginRequest;
import com.esg.authservice.dto.LoginResponse;
import com.esg.authservice.dto.SignupRequest;
import com.esg.authservice.repository.CompanyRepository;
import com.esg.authservice.repository.MemberRepository;
import com.esg.common.dto.MemberResponse;
import com.esg.common.security.JwtUtil;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {
  private final MemberRepository memberRepository;
  private final CompanyRepository companyRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtUtil jwtUtil;

  @Transactional
  public void signupAdmin(SignupRequest signupRequest) {
    if (memberRepository.findByEmail(signupRequest.email()).isPresent()) {
      throw new IllegalArgumentException("이미 존재하는 이메일입니다.");
    }

    String emailDomain = signupRequest.email().split("@")[1];

    if (companyRepository.findByEmailDomain(emailDomain).isPresent()) {
      throw new IllegalArgumentException("이미 등록된 회사 도메인입니다.");
    }
    Company company = companyRepository.save(new Company(null, emailDomain.split("\\.")[0], emailDomain));

    String encodedPassword = passwordEncoder.encode(signupRequest.password());

    Member member = Member.builder()
      .companyId(company.getId())
      .email(signupRequest.email())
      .password(encodedPassword)
      .nickname(signupRequest.nickname())
      .role(Role.COMPANY_ADMIN)
      .build();

    memberRepository.save(member);
  }

  @Transactional
  public void signupUser(SignupRequest signupRequest) {
    if (memberRepository.findByEmail(signupRequest.email()).isPresent()) {
      throw new IllegalArgumentException("이미 존재하는 이메일입니다.");
    }

    String emailDomain = signupRequest.email().split("@")[1];

    Company company = companyRepository.findByEmailDomain(emailDomain)
      .orElseThrow(() -> new IllegalArgumentException("등록되지 않은 회사입니다. 회사 관리자에게 문의하세요."));

    String encodedPassword = passwordEncoder.encode(signupRequest.password());

    Member member = Member.builder()
      .companyId(company.getId())
      .email(signupRequest.email())
      .password(encodedPassword)
      .nickname(signupRequest.nickname())
      .role(Role.USER)
      .build();

    memberRepository.save(member);
  }

  public LoginResponse login(LoginRequest loginRequest) {
    Member member = memberRepository.findByEmail(loginRequest.email())
      .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

    if (!passwordEncoder.matches(loginRequest.password(), member.getPassword())) {
      throw new IllegalArgumentException("비밀번호가 일치하지 않습니다.");
    }

    String accessToken = jwtUtil.createToken(
      member.getId(),
      member.getEmail(),
      member.getCompanyId(),
      member.getRole().name(),
      member.getNickname());

    String refreshToken = jwtUtil.createRefreshToken(member.getEmail());

    return new LoginResponse(accessToken, refreshToken, member.getEmail(), member.getNickname(), member.getId());
  }

  @Transactional(readOnly = true)
  public String refreshAccessToken(String refreshToken) {
    // 1. Refresh Token 검증 및 정보 추출
    Claims claims = jwtUtil.getUserInfoFromToken(refreshToken);
    String email = claims.getSubject();

    // 2. 유저 존재 여부 확인
    Member member = memberRepository.findByEmail(email)
      .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

    // 3. 새로운 Access Token 생성 및 반환
    return jwtUtil.createToken(
      member.getId(),
      member.getEmail(),
      member.getCompanyId(),
      member.getRole().name(),
      member.getNickname()
    );
  }

  @Transactional(readOnly = true)
  public MemberResponse getMemberInfoForInternal(Long id) {
    Member member = memberRepository.findById(id)
      .orElseThrow(() -> new IllegalArgumentException("해당 회원을 찾을 수 없습니다."));

    return new MemberResponse(
      member.getId(),
      member.getCompanyId(),
      member.getNickname(),
      member.getEmail()
    );
  }

  @Transactional(readOnly = true)
  public String getAdminEmailByCompanyId(Long companyId) {
    return memberRepository.findByCompanyIdAndRole(companyId, Role.COMPANY_ADMIN)
      .map(Member::getEmail)
      .orElseThrow(() -> new IllegalArgumentException("관리자를 찾을 수 없습니다."));
  }
}
