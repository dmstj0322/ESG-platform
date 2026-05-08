package com.esg.analysis.dto;

import lombok.*;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisResponseDto {
    // AI가 PDF에서 추출/추론한 데이터
    private String ksicCode;      // AI가 추론한 KSIC 5자리 (ex: 26110)
    private double companyPower;  // PDF 내 전력 사용량
    private double companyGas;    // PDF 내 가스 사용량

    // API와 비교한 결과 데이터
    private String industryName;    // 업종명 (제조업 등)
    private double industryAvgPower; // 업종 평균 전력
    private double powerDiffPercent; // 전력 차이 (%)
    private String powerStatus;      // "절감" 또는 "초과"

    private double industryAvgGas;   // 업종 평균 가스
    private double gasDiffPercent;   // 가스 차이 (%)
}