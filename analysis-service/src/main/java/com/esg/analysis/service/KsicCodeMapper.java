package com.esg.analysis.service;

import org.springframework.stereotype.Component;

@Component
public class KsicCodeMapper {
    /**
     * AI가 추론한 5자리 KSIC 번호를 한전 API용 업종 기호로 매핑
     */
    public String mapToKepcoBizCd(String ksicCode) {
        if (ksicCode == null || ksicCode.length() < 2) return "C"; // 기본값 제조업

        String prefix = ksicCode.substring(0, 2);

        switch (prefix) {
            case "10": case "26": case "30": return "C"; // 제조업 (음식료, 반도체, 자동차 등)
            case "62": case "63": return "J";           // 정보통신업 (소프트웨어, 데이터 서비스)
            case "45": case "46": case "47": return "G"; // 도소매업
            default: return "C";
        }
    }
}