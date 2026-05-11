package com.esg.analysis.service;

import com.esg.analysis.dto.AiRawScoreDto;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Component
public class MockEsgAnalyst implements EsgAnalyst {

    @Override
    public AiRawScoreDto analyze(String reportText) {
        log.info("#### [Mock 모드] Gemini 호출 없이 가짜 데이터를 반환합니다.");
        return AiRawScoreDto.builder()
                .environmentScore(85)
                .socialScore(70)
                .governanceScore(65)
                .environmentReason("온실가스 배출량이 감소했으나 용수 사용량이 증가함.")
                .socialReason("여성 임원 비율은 우수하나 이직률 관리가 필요함.")
                .governanceReason("이사회 투명성 데이터가 일부 부족함.")
                .summary("환경 성과는 우수하나 사회적 책임 지표의 개선이 필요합니다.")
                .build();
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MockEsgAnalyst.class);
}