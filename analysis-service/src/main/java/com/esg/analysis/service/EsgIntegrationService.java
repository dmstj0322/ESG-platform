package com.esg.analysis.service;

import com.esg.analysis.client.KepcoClient;
import com.esg.analysis.client.KogasClient;
import com.esg.analysis.dto.AnalysisResponseDto;
import com.esg.analysis.dto.external.KepcoResponseDto;
import com.esg.analysis.dto.external.KogasResponseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EsgIntegrationService {

    private final KepcoClient kepcoClient;
    private final KogasClient kogasClient;
    private final KsicCodeMapper ksicCodeMapper;
    // Gemini 연동 서비스는 프로젝트의 환경에 맞춰 주입 (가칭 GeminiService)
    // private final GeminiService geminiService;

    @Value("${external-api.kepco.key}")
    private String kepcoApiKey;

    @Value("${external-api.kogas.key}")
    private String kogasServiceKey;

    /**
     * 전체 프로세스: PDF 분석 -> 업종 추론 -> API 비교 -> 결과 리턴
     */
    public AnalysisResponseDto analyzeEsgReport(byte[] pdfFile, String year, String month) {

        // 1. [AI 단계] Gemini에게 프롬프트를 보내 PDF 분석 및 KSIC 추론
        // (프롬프트 예시: "보고서의 사업 내용을 보고 KSIC 코드 5자리를 추론하고 사용량을 JSON으로 줘")
        // 여기서는 AI가 분석 결과를 반환했다고 가정합니다.
        String inferredKsic = "26110"; // AI가 "반도체 제조"임을 파악하고 추론한 번호
        double extractedPower = 5500.0;
        double extractedGas = 120.0;

        // 2. [매핑 단계] KSIC 번호를 한전 업종 기호로 변환 (26110 -> C)
        String bizCd = ksicCodeMapper.mapToKepcoBizCd(inferredKsic);

        // 3. [API 단계] 한전 API에서 해당 업종의 평균 데이터 가져오기
        KepcoResponseDto powerRes = kepcoClient.getPowerUsage(year, month, kepcoApiKey, "json");
        double avgPower = 0;
        if (powerRes != null && powerRes.getActualData() != null) {
            List<KepcoResponseDto.KepcoData> dataList = powerRes.getActualData();
            double totalUsage = dataList.stream().mapToDouble(d -> d.getPowerUsage()).sum();
            double totalCust = dataList.stream().mapToDouble(d -> d.getCustCnt()).sum();
            avgPower = totalCust > 0 ? totalUsage / totalCust : 0;
        }

        // 4. [API 단계] 가스공사 API에서 산업용 평균 가져오기
        KogasResponseDto gasRes = kogasClient.getGasUsage(year, month, kogasServiceKey, "JSON");
        double avgGas = 0;
        if (gasRes != null && gasRes.getResponse().getBody() != null) {
            avgGas = gasRes.getResponse().getBody().getItems().getItem().stream()
                    .filter(item -> "산업용".equals(item.getCompanyName()))
                    .mapToDouble(item -> Double.parseDouble(item.getMinMj()))
                    .findFirst().orElse(0);
        }

        // 5. [비교 단계] 당사 실적 vs 업종 평균 비교 계산
        double pDiff = ((extractedPower - avgPower) / avgPower) * 100;
        double gDiff = ((extractedGas - avgGas) / avgGas) * 100;

        // 6. [결과 생성]
        return AnalysisResponseDto.builder()
                .ksicCode(inferredKsic)
                .industryName(bizCd)
                .companyPower(extractedPower)
                .industryAvgPower(avgPower)
                .powerDiffPercent(Math.abs(pDiff))
                .powerStatus(pDiff <= 0 ? "절감" : "초과")
                .companyGas(extractedGas)
                .industryAvgGas(avgGas)
                .gasDiffPercent(Math.abs(gDiff))
                .build();
    }
}