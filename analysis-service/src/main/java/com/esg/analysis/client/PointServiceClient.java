package com.esg.analysis.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

// url 속성을 빼버리세요! 유레카가 이름(point-service)을 보고 알아서 주소를 찾아줍니다.
@FeignClient(name = "point-service")
public interface PointServiceClient {

    @GetMapping("/api/v1/points/{memberId}/balance")
    Long getMemberPointBalance(@PathVariable("memberId") Long memberId);
}