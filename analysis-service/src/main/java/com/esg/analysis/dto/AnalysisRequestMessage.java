package com.esg.analysis.dto;

import lombok.*;
import java.util.List;

@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AnalysisRequestMessage {
    private Long reportId;
    private Long companyId;
    private List<CarbonEmissionStatDto> stats; // QueryDSL로 뽑은 데이터
}