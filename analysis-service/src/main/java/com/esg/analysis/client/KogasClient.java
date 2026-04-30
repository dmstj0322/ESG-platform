package com.esg.analysis.client;

import com.esg.analysis.dto.external.KogasResponseDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "kogas-client", url = "https://apis.data.go.kr/B551210/supplyValuePerformanceList")
public interface KogasClient {

    @GetMapping("/getSupplyValuePerformanceList")
    KogasResponseDto getGasUsage(
            @RequestParam("openYr") String year,
            @RequestParam("openMm") String month,
            @RequestParam("serviceKey") String apiKey,
            @RequestParam("dataType") String dataType // "JSON"으로 전달되는지 확인
    );
}