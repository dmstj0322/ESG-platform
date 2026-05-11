package com.esg.analysis.dto.external;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class KepcoResponseDto {

    // 시도 코드를 안 보냈을 때 응답 키
    @JsonProperty("totData")
    private List<KepcoData> totData;

    // 시도 코드를 보냈을 때 응답 키
    @JsonProperty("data")
    private List<KepcoData> data;

    // 두 리스트 중 데이터가 있는 쪽을 반환하는 편의 메서드
    public List<KepcoData> getActualData() {
        return (data != null && !data.isEmpty()) ? data : totData;
    }

    @Data
    public static class KepcoData {
        private String year;
        private String month;
        private String biz;        // 산업분류명
        private Double powerUsage; // JSON 예시 기준 (e 없음)
        private Long custCnt;      // 고객호수
    }
}