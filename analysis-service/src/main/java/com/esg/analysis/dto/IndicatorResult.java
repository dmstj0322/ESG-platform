package com.esg.analysis.dto;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public class IndicatorResult {
    private final String key;
    private final int score;
    private final String grade;
    private final String comment;
    private final String recommendation;
    private final String evidenceText;
    private final int pageNumber;
    private final int confidenceScore;
    private final String kesgCode;
}
