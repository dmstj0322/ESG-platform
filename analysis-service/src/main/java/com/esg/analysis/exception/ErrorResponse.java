package com.esg.analysis.exception;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ErrorResponse {
    private final String code;    // 에러 구분 코드 (예: THROT_001)
    private final String message; // 사용자에게 보여줄 메시지
    private final int status;     // HTTP 상태 코드
}