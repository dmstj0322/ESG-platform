package com.esg.analysis.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiRawScoreDto {
    private int environmentScore; // 환경 점수 (0-100)
    private int socialScore;      // 사회 점수 (0-100)
    private int governanceScore;  // 지배구조 점수 (0-100)

    private String environmentReason; // 환경 평가 근거
    private String socialReason;      // 사회 평가 근거
    private String governanceReason;  // 지배구조 평가 근거

    private String summary;           // 전체 요약
}