package com.esg.authservice.controller;

import com.esg.authservice.dto.AdminSignupRequest;
import com.esg.authservice.dto.LoginRequest;
import com.esg.authservice.dto.LoginResponse;
import com.esg.authservice.dto.SignupRequest;
import com.esg.authservice.service.AuthService;
import com.esg.common.dto.CompanyResponse;
import com.esg.common.dto.MemberResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping
@RequiredArgsConstructor
public class AuthController {
  private final AuthService authService;

  @PostMapping("/signup/company-admin")
  public ResponseEntity<String> signupCompanyAdmin(@Valid @RequestBody AdminSignupRequest signupRequest) {
    authService.signupAdmin(signupRequest);
    return ResponseEntity.ok("회사 관리자 등록 및 회사 생성이 완료되었습니다.");
  }

  @PostMapping("/signup/user")
  public ResponseEntity<String> signupUser(@Valid @RequestBody SignupRequest signupRequest) {
    authService.signupUser(signupRequest);
    return ResponseEntity.ok("회원가입이 완료되었습니다.");
  }

  @PostMapping("/login")
  public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest loginRequest) {
    return ResponseEntity.ok(authService.login(loginRequest));
  }

  @PostMapping("/refresh")
  public ResponseEntity<String> refresh(@RequestBody Map<String, String> request) {
    String refreshToken = request.get("refreshToken");

    if (refreshToken == null || refreshToken.isEmpty()) {
      throw new IllegalArgumentException("Refresh Token이 누락되었습니다.");
    }

    String newAccessToken = authService.refreshAccessToken(refreshToken);

    return ResponseEntity.ok(newAccessToken);
  }

  @GetMapping("/members/{memberId}")
  public ResponseEntity<MemberResponse> getMemberInternal(@PathVariable("memberId") Long id) {
    return ResponseEntity.ok(authService.getMemberInfoForInternal(id));
  }

  @GetMapping("/companies/{companyId}/admin-email")
  public ResponseEntity<String> getAdminEmailInternal(@PathVariable("companyId") Long companyId) {
    return ResponseEntity.ok(authService.getAdminEmailByCompanyId(companyId));
  }

  @GetMapping("/companies/{companyId}")
  public ResponseEntity<CompanyResponse> getCompanyInternal(@PathVariable("companyId") Long companyId) {
    return ResponseEntity.ok(authService.getCompanyById(companyId));
  }

  @PutMapping("/companies/{companyId}/profile")
  public ResponseEntity<Void> updateCompanyProfile(
    @PathVariable("companyId") Long companyId,
    @RequestBody AdminSignupRequest req) {
    authService.updateCompanyProfile(companyId, req);
    return ResponseEntity.ok().build();
  }
}