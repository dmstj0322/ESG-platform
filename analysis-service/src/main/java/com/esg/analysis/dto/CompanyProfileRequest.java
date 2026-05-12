package com.esg.analysis.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CompanyProfileRequest {
    private String regionCode;    // 행안부 시도코드 2자리 (예: "11"=서울, "41"=경기)
    private String ksicCode;      // KSIC 5자리 (예: "26110"=반도체)
    private Integer employeeCount;
}
