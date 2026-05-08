package com.esg.authservice.config;

import com.esg.authservice.domain.Company;
import com.esg.authservice.domain.Member;
import com.esg.authservice.domain.Role;
import com.esg.authservice.repository.CompanyRepository;
import com.esg.authservice.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {
  private final MemberRepository memberRepository;
  private final PasswordEncoder passwordEncoder;

  @Override
  public void run(String... args) throws Exception {
    if (memberRepository.findByEmail("admin@esg.com").isEmpty()) {
      Member admin = Member.builder()
        .companyId(0L)
        .email("admin@esg.com")
        .password(passwordEncoder.encode("admin1234!"))
        .nickname("SystemAdmin")
        .role(Role.ADMIN)
        .build();
      memberRepository.save(admin);
    }
  }
}