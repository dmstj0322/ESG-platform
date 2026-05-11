package com.esg.analysis.client;

import com.esg.analysis.dto.external.KepcoRegionalResponseDto;
import com.esg.analysis.service.config.FeignConfig;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 한전 빅데이터 시도별 전기사용량 API 클라이언트.
 *
 * 기존 KepcoClient(industryType.do)는 전국 업종 집계만 제공하여
 * 지역별 비교에 부적합 → 이 클라이언트로 교체하거나 병행 사용.
 *
 * API 키는 application.yml의 external-api.kepco.key 값을 공유합니다.
 */
@FeignClient(
        name = "kepcoRegionalClient",
        url = "https://bigdata.kepco.co.kr/openapi/v1/powerUsage",
        configuration = FeignConfig.class
)
public interface KepcoRegionalClient {

    /**
     * 시도별 월간 전기사용량 조회
     *
     * @param year       조회 연도 (예: "2024")
     * @param month      조회 월 (예: "01")
     * @param metroCd    시도코드 2자리 (예: "11"=서울, "31"=울산)
     * @param apiKey     한전 빅데이터 API 키
     * @param returnType 반환 형식 ("json")
     */
    @GetMapping("/city.do")
    KepcoRegionalResponseDto getRegionalPowerUsage(
            @RequestParam("year")       String year,
            @RequestParam("month")      String month,
            @RequestParam("metroCd")    String metroCd,
            @RequestParam("apiKey")     String apiKey,
            @RequestParam("returnType") String returnType
    );
}
