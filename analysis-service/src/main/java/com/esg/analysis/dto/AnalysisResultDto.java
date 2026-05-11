package com.esg.analysis.dto;

import lombok.*;
import java.util.List;

@Getter @Setter @Builder
@NoArgsConstructor @AllArgsConstructor
public class AnalysisResultDto {
    private Long analysisId;
    private String totalGrade;
    private double totalScore;
    private String summary;
    private String fullReport;  // Markdown 리포트 본문
    private String finalGrade;  // S, A, B, C...

    private List<SectionResult> sections;
    private List<Evidence> evidence; // PDF 리포트 하단 표에 들어갈 데이터

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SectionResult {
        private String category;
        private String grade;
        private int score;
        private String comment;
    }

    @Getter @Setter @Builder
    @NoArgsConstructor @AllArgsConstructor
    public static class Evidence {
        private String indicator; // 지표명 (예: 온실가스 배출)
        private String content;   // 분석 내용
        private String page;      // 참조 페이지
    }
}