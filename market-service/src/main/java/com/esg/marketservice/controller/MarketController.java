package com.esg.marketservice.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MarketController {

    @GetMapping("/test")
    public String test(@RequestHeader(value = "X-User-Id", required = false) String userId) {
        if (userId == null) {
            return "마켓 서비스 직접 접속 성공! (로그인 정보 없음)";
        }
        return "게이트웨이를 통한 접속 성공! 로그인 유저 ID: " + userId;
    }
}