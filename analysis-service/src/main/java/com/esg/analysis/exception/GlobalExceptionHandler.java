package com.esg.analysis.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 우리가 만든 RuntimeException 처리
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> handleRuntimeException(RuntimeException e) {
        log.error("비즈니스 로직 에러: {}", e.getMessage());

        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String message = e.getMessage();

        // 사용량 제한 에러일 경우 429(Too Many Requests)로 응답
        if (message.contains("횟수를 초과")) {
            status = HttpStatus.TOO_MANY_REQUESTS;
        }

        ErrorResponse response = ErrorResponse.builder()
                .code("ANALYSIS_ERROR")
                .message(message)
                .status(status.value())
                .build();

        return new ResponseEntity<>(response, status);
    }
}