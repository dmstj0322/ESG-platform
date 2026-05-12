package com.esg.analysis.client;

import com.esg.common.dto.CompanyResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "auth-service")
public interface AuthServiceClient {

    @GetMapping("/companies/{companyId}")
    CompanyResponse getCompanyById(@PathVariable("companyId") Long companyId);
}
