package com.esg.analysis.config;

import com.esg.analysis.service.EsgGuidelineService;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.model.embedding.EmbeddingModel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class GuidelineInitializer implements ApplicationRunner {

    private final EsgGuidelineService esgGuidelineService;
    private final EmbeddingStore<TextSegment> embeddingStore;
    private final EmbeddingModel embeddingModel;


    @Override
    public void run(ApplicationArguments args) {
        log.info("[Guideline] 서버 시작 — K-ESG 가이드라인 적재 여부 확인");

        try {
            // Chroma에 데이터가 이미 있는지 확인 (더미 쿼리로 검색)
            var testEmbedding = embeddingModel.embed("K-ESG 환경 지표").content();
            var testRequest   = EmbeddingSearchRequest.builder()
                    .queryEmbedding(testEmbedding)
                    .maxResults(1)
                    .minScore(0.0)
                    .build();
            var existing = embeddingStore.search(testRequest).matches();

            if (!existing.isEmpty()) {
                log.info("[Guideline] Chroma에 기존 데이터 존재 ({} 건 이상) → 적재 스킵", existing.size());
                return;
            }

            // 없으면 새로 적재
            log.info("[Guideline] Chroma 비어 있음 → K-ESG 가이드라인 2종 적재 시작");
            esgGuidelineService.ingestGuideline("K-ESG_Guideline.pdf");
            esgGuidelineService.ingestGuideline("Industry_K-ESG_Guideline.pdf");
            log.info("[Guideline] 적재 완료");

        } catch (Exception e) {
            // 적재 실패해도 서버는 정상 기동 — RAG 없이 분석은 계속 가능
            log.error("[Guideline] 적재 중 오류 (서버는 계속 기동): {}", e.getMessage());
        }
    }
}