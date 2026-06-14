//package com.esg.analysis.dto.external;
//
//import com.fasterxml.jackson.annotation.JsonProperty;
//import lombok.Data;
//import java.util.List;
//
//@Data
//public class KogasResponseDto {
//    @JsonProperty("response")
//    private Response response; // 최상위 response 키 추가
//
//    @Data
//    public static class Response {
//        private Header header;
//        private Body body;
//    }
//
//    @Data
//    public static class Header {
//        private String resultCode;
//        private String resultMsg;
//    }
//
//    @Data
//    public static class Body {
//        private Items items;
//        private int totalCount;
//        private String dataType;
//    }
//
//    @Data
//    public static class Items {
//        private List<KogasData> item;
//    }
//
//    @Data
//    public static class KogasData {
//        @JsonProperty("splYear")
//        private String year;
//
//        @JsonProperty("splMonth")
//        private String month;
//
//        @JsonProperty("splcalCpnm")
//        private String companyName; // 도시가스 회사명 (예: 합계)
//
//        @JsonProperty("splCalMinMj")
//        private String minMj; // 저위발열량(MJ)
//    }
//}