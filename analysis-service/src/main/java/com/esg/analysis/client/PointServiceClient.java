package com.esg.analysis.client;

import com.esg.common.dto.EsgPoolResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "point-service")
public interface PointServiceClient {

    @GetMapping("/points/{memberId}/balance")
    Long getMemberPointBalance(@PathVariable("memberId") Long memberId);

    /** 회사 ESG Pool 조회 — SUM(balance) 방식 아님, company_esg_pool 단일 테이블 기반 */
    @GetMapping("/points/company/{companyId}/esg-pool")
    EsgPoolResponse getCompanyEsgPool(@PathVariable("companyId") Long companyId);

    /** ESG 분석 후 회사 ESG Pool 차감 — 개인 balance 차감 없음 */
    @PostMapping("/points/company/{companyId}/consume-esg-pool")
    void consumeEsgPool(
            @PathVariable("companyId") Long companyId,
            @RequestParam("amount") Long amount,
            @RequestParam(value = "description", required = false, defaultValue = "") String description);
}
