package com.esg.analysis.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import lombok.*;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

/**
 * [F-301] Redis 캐시용 DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisResultCache implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long analysisId;
    private String finalGrade;
    private String fullReport;
    private List<EvidenceData> evidence;

    // LocalDateTime 직렬화 문제 해결을 위한 어노테이션 추가
    @JsonSerialize(using = LocalDateTimeSerializer.class)
    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime analyzedAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class EvidenceData implements Serializable {
        private String indicator;
        private String content;
        private String page;
    }
}