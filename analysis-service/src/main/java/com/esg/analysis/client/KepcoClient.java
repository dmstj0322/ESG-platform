package com.esg.analysis.client;

import com.esg.analysis.service.config.FeignConfig;
import com.esg.analysis.dto.external.KepcoResponseDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(
        name = "kepcoClient",
        url = "https://bigdata.kepco.co.kr/openapi/v1/powerUsage",
        configuration = FeignConfig.class // 수정됨
)
public interface KepcoClient {
    @GetMapping("/industryType.do")
    KepcoResponseDto getPowerUsage(
            @RequestParam("year") String year,
            @RequestParam("month") String month,
            @RequestParam("apiKey") String apiKey,
            @RequestParam("returnType") String returnType
    );
}