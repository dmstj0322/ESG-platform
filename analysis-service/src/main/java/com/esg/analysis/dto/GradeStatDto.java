package com.esg.analysis.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class GradeStatDto {
    private String grade;
    private Long count;
}