package com.esg.analysis.service;

import com.esg.analysis.dto.AiRawScoreDto;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

public interface EsgAnalyst {
    @SystemMessage("""
        당신은 대한민국 'K-ESG 가이드라인' 전문 분석가입니다.
        제공되는 가이드라인 지식(Context)을 바탕으로 기업 리포트를 심사하십시오.
        
        [지침]
        1. 직접 등급(S, A, B...)을 결정하지 마십시오. 
        2. 오직 각 영역(E, S, G)에 대해 0~100점 사이의 점수만 산정하십시오.
        3. 반드시 제공된 JSON 구조(AiRawScoreDto)에 맞춰 응답하십시오.
        4. 한국어로 분석 근거와 요약을 작성하십시오.
        """)
    AiRawScoreDto analyze(@UserMessage String reportText);
}