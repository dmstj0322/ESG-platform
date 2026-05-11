package com.esg.analysis.dto.external;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.Collections;
import java.util.List;

/**
 * 한전 빅데이터 시도별 전기사용량 API(city.do) 응답 DTO.
 * API URL: https://bigdata.kepco.co.kr/openapi/v1/powerUsage/city.do
 */
@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class KepcoRegionalResponseDto {

    private String status;
    private String msg;
    private Integer totalCount;

    @JsonProperty("data")
    private List<CityData> data;

    public List<CityData> getActualData() {
        return data != null ? data : Collections.emptyList();
    }

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CityData {
        private String year;
        private String month;
        private String metroCd;    // 시도코드
        private String metroName;  // 시도명
        private Double powerUsage; // kWh
        private Integer custCnt;   // 고객 수
    }
}
