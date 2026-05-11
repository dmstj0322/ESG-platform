package com.esg.common.client;

import com.esg.common.dto.MemberResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "auth-service")
public interface AuthClient {
  @GetMapping("/members/{memberId}")
  MemberResponse getMemberById(@PathVariable("memberId") Long memberId);

  @GetMapping("/companies/{companyId}/admin-email")
  String getAdminEmailByCompanyId(@PathVariable("companyId") Long companyId);
}
