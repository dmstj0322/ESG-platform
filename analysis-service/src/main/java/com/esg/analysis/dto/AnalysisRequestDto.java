package com.esg.analysis.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisRequestDto {
    private Long analysisId;
    private Long companyId;
    private String content;
    private String fileHash; // 이 필드가 반드시 있어야 합니다!
}