package com.esg.analysis.dto;

import lombok.*;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IndustryAvgDto {
    private String industryName;
    private double avgPower;
    private double avgGas;
}