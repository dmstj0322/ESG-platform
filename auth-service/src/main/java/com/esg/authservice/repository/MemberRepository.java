package com.esg.authservice.repository;

import com.esg.authservice.domain.Member;
import com.esg.authservice.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
  Optional<Member> findByEmail(String email);

  boolean existsByCompanyId(Long companyId);

  Optional<Member> findByCompanyIdAndRole(Long companyId, Role role);
}
