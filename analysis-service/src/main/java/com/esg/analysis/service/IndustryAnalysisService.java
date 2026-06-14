//package com.esg.analysis.service;
//
//import com.esg.analysis.client.KepcoClient;
//import com.esg.analysis.client.KogasClient;
//import com.esg.analysis.dto.IndustryAvgDto;
//import com.esg.analysis.dto.external.KepcoResponseDto;
//import com.esg.analysis.dto.external.KogasResponseDto;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.stereotype.Service;
//
//import java.util.List;
//
//@Slf4j
//@Service
//@RequiredArgsConstructor
//public class IndustryAnalysisService {
//
//    private final KepcoClient kepcoClient;
//    private final KogasClient kogasClient;
//    // 만약 KsicCodeMapper가 없다면 이 줄을 지우고 직접 로직을 넣으셔도 됩니다.
//    // private final KsicCodeMapper ksicCodeMapper;
//
//    @Value("${external-api.kepco.key}")
//    private String kepcoApiKey;
//
//    @Value("${external-api.kogas.key}")
//    private String kogasServiceKey;
//
//    /**
//     * 업종별 평균 데이터 가져오기
//     */
//    public IndustryAvgDto getIndustryAverage(String ksicCode, String year, String month) {
//        // 임시로 ksicCode의 앞자리를 따서 업종 구분 (원래 Mapper 역할)
//        String bizCd = "C";
//        if (ksicCode.startsWith("62")) bizCd = "J";
//
//        // 1. 전력 평균 계산 (총사용량 / 총고객수)
//        KepcoResponseDto powerRes = kepcoClient.getPowerUsage(year, month, null, kepcoApiKey, "json");
//        double avgPower = 0;
//        if (powerRes != null && powerRes.getActualData() != null) {
//            List<KepcoResponseDto.KepcoData> data = powerRes.getActualData();
//            double totalUsage = data.stream().mapToDouble(d -> d.getPowerUsage()).sum();
//            double totalCust = data.stream().mapToDouble(d -> d.getCustCnt()).sum();
//            avgPower = totalCust > 0 ? totalUsage / totalCust : 0;
//        }
//
//        // 2. 가스 평균 계산 (산업용 필터링)
//        KogasResponseDto gasRes = kogasClient.getGasUsage(year, month, kogasServiceKey, "JSON");
//        double avgGas = 0;
//        if (gasRes != null && gasRes.getResponse().getBody() != null) {
//            avgGas = gasRes.getResponse().getBody().getItems().getItem().stream()
//                    .filter(item -> "산업용".equals(item.getCompanyName()))
//                    .mapToDouble(item -> Double.parseDouble(item.getMinMj()))
//                    .findFirst().orElse(0);
//        }
//
//        return IndustryAvgDto.builder()
//                .industryName(bizCd)
//                .avgPower(avgPower)
//                .avgGas(avgGas)
//                .build();
//    }
//}