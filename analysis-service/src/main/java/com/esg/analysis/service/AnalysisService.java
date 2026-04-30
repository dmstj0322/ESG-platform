//package com.esg.analysis.service;
//
//import com.esg.analysis.dto.AnalysisRequestMessage;
//import com.esg.analysis.dto.CarbonEmissionStatDto;
//import com.esg.analysis.service.domain.AnalysisReport;
//import com.esg.analysis.service.repository.AnalysisReportRepository;
//import com.esg.analysis.service.repository.CarbonEmissionRepository;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.kafka.core.KafkaTemplate;
//import org.springframework.stereotype.Service;
//import org.springframework.transaction.annotation.Transactional;
//
//import java.util.List;
//
//@Slf4j
//@Service
//@RequiredArgsConstructor
//public class AnalysisService {
//
//    private final CarbonEmissionRepository carbonRepository;
//    private final AnalysisReportRepository reportRepository;
//    private final KafkaTemplate<String, Object> kafkaTemplate;
//
//    /**
//     * 1. 분석 요청 (사용자 -> AI)
//     */
//    @Transactional
//    public void requestAnalysis(Long memberId, Long companyId, int year) {
//        // 데이터 조회
//        List<CarbonEmissionStatDto> stats = carbonRepository.getMonthlyStats(companyId, year);
//
//        // 리포트 초기 생성
//        AnalysisReport report = AnalysisReport.builder()
//                .memberId(memberId)
//                .companyId(companyId)
//                .status("PENDING")
//                .build();
//        reportRepository.save(report);
//
//        // Kafka 메시지 전송
//        AnalysisRequestMessage message = AnalysisRequestMessage.builder()
//                .reportId(report.getId())
//                .companyId(companyId)
//                .stats(stats)
//                .build();
//
//        kafkaTemplate.send("esg-analysis-request", message);
//        log.info("Analysis requested for reportId: {}", report.getId());
//    }
//
//    /**
//     * 2. AI 분석 결과 반영 (Consumer에서 호출하는 메서드!)
//     */
//    @Transactional
//    public void processAIFeedback(Long reportId, String content, String grade) {
//        log.info("Processing AI feedback for reportId: {}", reportId);
//
//        AnalysisReport report = reportRepository.findById(reportId)
//                .orElseThrow(() -> new IllegalArgumentException("해당 리포트를 찾을 수 없습니다. ID: " + reportId));
//
//        // 엔티티 내에 정의된 비즈니스 메서드 호출 (상태를 COMPLETED로 변경)
//        report.completeAnalysis(content, grade);
//
//        // 별도의 save() 없이 Dirty Checking으로 업데이트됩니다.
//    }
//}

//package com.esg.analysis.service;
//
//import dev.langchain4j.data.document.Document;
//import dev.langchain4j.data.document.parser.apache.tika.ApacheTikaDocumentParser;
//import dev.langchain4j.data.segment.TextSegment;
//import dev.langchain4j.model.chat.ChatLanguageModel;
//import dev.langchain4j.model.embedding.EmbeddingModel;
//import dev.langchain4j.rag.content.retriever.ContentRetriever;
//import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
//import dev.langchain4j.service.AiServices;
//import dev.langchain4j.store.embedding.EmbeddingStore;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.stereotype.Service;
//import org.springframework.web.multipart.MultipartFile;
//
//@Slf4j
//@Service
//@RequiredArgsConstructor
//public class AnalysisService {
//
//    private final ChatLanguageModel chatLanguageModel; // Gemini
//    private final EmbeddingStore<TextSegment> embeddingStore; // 학습된 지식 저장소
//    private final EmbeddingModel embeddingModel; // 검색용 임베딩 모델
//
//    /**
//     * 실제 분석 수행 메서드
//     */
//    public String analyzeReport(MultipartFile file) {
//        try {
//            // 1. 리포트 PDF 텍스트 추출
//            Document reportDoc = ApacheTikaDocumentParser.load(file.getInputStream());
//
//            // 2. 검색기(Retriever) 설정: 질문과 관련된 지식 3개를 찾아오도록 설정
//            ContentRetriever contentRetriever = EmbeddingStoreContentRetriever.builder()
//                    .embeddingStore(embeddingStore)
//                    .embeddingModel(embeddingModel)
//                    .maxResults(3) // 가장 관련 깊은 가이드라인 3문단 추출
//                    .build();
//
//            // 3. AI 서비스 인터페이스 생성 (Proxy 방식)
//            EsgAnalyst analyst = AiServices.builder(EsgAnalyst.class)
//                    .chatLanguageModel(chatLanguageModel)
//                    .contentRetriever(contentRetriever)
//                    .build();
//
//            // 4. 분석 실행
//            log.info("#### [RAG] Gemini 분석 시작...");
//            return analyst.analyze(reportDoc.text());
//
//        } catch (Exception e) {
//            log.error("#### 분석 실패: {}", e.getMessage());
//            return "분석 중 오류가 발생했습니다.";
//        }
//    }
//
//    /**
//     * AI에게 내릴 페르소나와 프롬프트 정의
//     */
//    interface EsgAnalyst {
//        @dev.langchain4j.service.SystemMessage("""
//            당신은 K-ESG 가이드라인 전문가입니다.
//            제공된 가이드라인 지식(Context)만을 바탕으로 사용자의 리포트를 분석하세요.
//            반드시 다음 형식을 지키세요:
//            1. 평가 지표명
//            2. 현재 수준 분석
//            3. 개선 권고 사항
//            4. 예상 등급 (S, A, B, C)
//            """)
//        String analyze(String reportText);
//    }
//}

//@Service
//@RequiredArgsConstructor
//public class AnalysisService {
//
//    private final ChatLanguageModel chatLanguageModel;
//    private final EmbeddingStore<TextSegment> embeddingStore;
//    private final EmbeddingModel embeddingModel;
//    private final AnalysisReportRepository repository; // JPA 레포지토리
//
//    @Transactional
//    public AnalysisReportEntity runAnalysis(Long companyId, MultipartFile file) {
//        // 1. PDF 텍스트 추출 (Tika 사용)
//        String content = extractText(file);
//
//        // 2. RAG 검색기 설정
//        ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
//                .embeddingStore(embeddingStore)
//                .embeddingModel(embeddingModel)
//                .maxResults(5)
//                .build();
//
//        // 3. AI 서비스 생성
//        EsgAnalyst analyst = AiServices.builder(EsgAnalyst.class)
//                .chatLanguageModel(chatLanguageModel)
//                .contentRetriever(retriever)
//                .build();
//
//        // 4. AI 분석 (결과가 자동으로 Dto에 담김)
//        AnalysisResultDto resultDto = analyst.analyze(content);
//
//        // 5. DB 저장을 위해 Entity로 변환 및 저장
//        AnalysisReportEntity report = AnalysisReportEntity.builder()
//                .companyId(companyId)
//                .totalGrade(resultDto.getTotalGrade())
//                .totalScore(resultDto.getTotalScore())
//                .content(resultDto.getSummary())
//                .status("COMPLETED")
//                .build();
//
//        return repository.save(report);
//    }
//
//    private String extractText(MultipartFile file) {
//        try {
//            return ApacheTikaDocumentParser.load(file.getInputStream()).text();
//        } catch (Exception e) {
//            throw new RuntimeException("PDF 텍스트 추출 실패");
//        }
//    }
//}

package com.esg.analysis.service;

import com.esg.analysis.dto.AiRawScoreDto;
import com.esg.analysis.dto.AnalysisResultDto;
import com.esg.analysis.service.domain.AnalysisReport;
import com.esg.analysis.service.repository.AnalysisReportRepository;
import dev.langchain4j.data.document.parser.apache.tika.ApacheTikaDocumentParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.DigestUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisService {

    private final EsgAnalyst esgAnalyst;
    private final AnalysisReportRepository analysisReportRepository;
    private final RedisTemplate<String, Object> redisTemplate;

    // F-202: 자체 가중치 설정 (E: 40%, S: 30%, G: 30%)
    private static final double W_ENV = 0.4;
    private static final double W_SOC = 0.3;
    private static final double W_GOV = 0.3;

    @Transactional
    public AnalysisResultDto analyzeAndSave(Long userId, Long companyId, MultipartFile file) {
        try {
            // 1. [F-301] 파일 해시 기반 중복 방어
            String fileHash = DigestUtils.md5DigestAsHex(file.getBytes());
            String cacheKey = "analysis:cache:" + fileHash;

            AnalysisResultDto cached = (AnalysisResultDto) redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                log.info("#### [F-301] 중복 리포트 감지! Redis 캐시 반환 (Hash: {})", fileHash);
                return cached;
            }

            // 2. [RAG] 텍스트 추출 및 AI 분석
            log.info("#### [RAG] Gemini 분석 시작...");
            String reportText = new ApacheTikaDocumentParser().parse(file.getInputStream()).text();
            AiRawScoreDto rawData = esgAnalyst.analyze(reportText);

            // 3. [F-202] 자체 가중치 등급 산출 알고리즘
            double totalScore = (rawData.getEnvironmentScore() * W_ENV) +
                    (rawData.getSocialScore() * W_SOC) +
                    (rawData.getGovernanceScore() * W_GOV);
            String finalGrade = determineGrade(totalScore);

            // 4. DB 저장
            AnalysisReport report = AnalysisReport.builder()
                    .memberId(userId)
                    .companyId(companyId)
                    .grade(finalGrade)
                    .reportContent(rawData.getSummary())
                    .status("COMPLETED")
                    .build();
            AnalysisReport saved = analysisReportRepository.save(report);

            // 5. 결과 DTO 조립 (Evidence 매핑 추가)
            AnalysisResultDto result = AnalysisResultDto.builder()
                    .analysisId(saved.getId())
                    .totalGrade(finalGrade)
                    .totalScore(totalScore)
                    .summary(rawData.getSummary())
                    .fullReport(rawData.getSummary())
                    .finalGrade(finalGrade)
                    .sections(List.of(
                            createSection("Environment", rawData.getEnvironmentScore(), rawData.getEnvironmentReason()),
                            createSection("Social", rawData.getSocialScore(), rawData.getSocialReason()),
                            createSection("Governance", rawData.getGovernanceScore(), rawData.getGovernanceReason())
                    ))
                    // PDF 표 출력을 위한 데이터 구성
                    .evidence(List.of(
                            new AnalysisResultDto.Evidence("환경(Environment) 부문", rawData.getEnvironmentReason(), "본문 참조"),
                            new AnalysisResultDto.Evidence("사회(Social) 부문", rawData.getSocialReason(), "본문 참조"),
                            new AnalysisResultDto.Evidence("지배구조(Governance) 부문", rawData.getGovernanceReason(), "본문 참조")
                    ))
                    .build();

            // 6. 캐시 저장 (30일 유지)
            redisTemplate.opsForValue().set(cacheKey, result, 30, TimeUnit.DAYS);

            return result;

        } catch (Exception e) {
            log.error("분석 에러 발생: ", e);
            throw new RuntimeException("ESG 분석 실패");
        }
    }

    private AnalysisResultDto.SectionResult createSection(String category, int score, String comment) {
        return new AnalysisResultDto.SectionResult(category, determineGrade(score), score, comment);
    }

    private String determineGrade(double score) {
        if (score >= 90) return "S";
        if (score >= 80) return "A";
        if (score >= 70) return "B";
        if (score >= 60) return "C";
        return "D";
    }
}