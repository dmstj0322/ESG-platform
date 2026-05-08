package com.esg.analysis.service.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 기업 프로파일 엔티티.
 * 지역코드·업종코드·임직원 수를 보유하여 지역별 벤치마크 비교에 활용됩니다.
 * 향후 별도 company-service 마이크로서비스로 분리할 수 있습니다.
 */
@Entity
@Table(name = "company")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    /**
     * 행정안전부 시도코드 (2자리)
     * 11=서울, 26=부산, 27=대구, 28=인천, 29=광주, 30=대전,
     * 31=울산, 36=세종, 41=경기, 42=강원, 43=충북, 44=충남,
     * 45=전북, 46=전남, 47=경북, 48=경남, 50=제주
     */
    @Column(name = "region_code", length = 10)
    private String regionCode;

    @Column(name = "region_name", length = 50)
    private String regionName;

    /**
     * 한국표준산업분류(KSIC) 코드 (5자리)
     * 예) 26110=반도체, 20110=석유화학, 62010=SW개발
     */
    @Column(name = "ksic_code", length = 10)
    private String ksicCode;

    @Column(name = "industry_name", length = 100)
    private String industryName;

    @Column(name = "employee_count")
    private Integer employeeCount;
}
