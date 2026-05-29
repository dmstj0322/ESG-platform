package com.esg.analysis.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * Environment CSV 업로드 결과 응답 DTO.
 *
 * <pre>
 * status:
 *   "SUCCESS" — 모든 행 저장 성공
 *   "PARTIAL" — 일부 저장 성공 (errors 확인 필요)
 *   "FAILED"  — 전체 실패 (파싱 오류 또는 유효 행 없음)
 *
 * uploadSessionId:
 *   이번 업로드 배치의 고유 UUID.
 *   EnvironmentData.uploadSessionId와 동일한 값이며,
 *   향후 PDF 증빙 연결 시 이 값으로 매핑합니다.
 * </pre>
 */
@Getter
@Builder
public class EnvironmentUploadResult {

    private final int          rowsProcessed;
    private final int          rowsSaved;
    private final List<String> errors;
    private final String       status;

    /** 이번 업로드 배치 UUID — EnvironmentData.uploadSessionId와 동일 */
    private final String uploadSessionId;

    public static EnvironmentUploadResult failed(String message) {
        return EnvironmentUploadResult.builder()
                .rowsProcessed(0)
                .rowsSaved(0)
                .errors(List.of(message))
                .status("FAILED")
                .uploadSessionId(null)
                .build();
    }
}
