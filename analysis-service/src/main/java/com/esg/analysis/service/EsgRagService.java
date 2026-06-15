//package com.esg.analysis.service;
//
//import dev.langchain4j.data.embedding.Embedding;
//import dev.langchain4j.data.segment.TextSegment;
//import dev.langchain4j.model.embedding.EmbeddingModel;
//import dev.langchain4j.store.embedding.EmbeddingMatch;
//import dev.langchain4j.store.embedding.EmbeddingStore;
//import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.stereotype.Service;
//
//import java.util.List;
//import java.util.stream.Collectors;
//
//@Slf4j
//@Service
//@RequiredArgsConstructor
//public class EsgRagService {
//
//    private final EmbeddingModel embeddingModel;
//    private final EmbeddingStore<TextSegment> embeddingStore;
//
//    /**
//     * 보고서 텍스트를 쿼리로 삼아 K-ESG 가이드라인 벡터 스토어에서
//     * 유사도 높은 청크를 검색하여 하나의 문자열로 합쳐 반환합니다.
//     *
//     * @param reportText  분석 대상 보고서 본문 (쿼리용 — 앞 1000자만 사용)
//     * @param maxResults  가져올 최대 청크 수 (권장: 5~8)
//     * @param minScore    유사도 최소 임계값 0.0~1.0 (권장: 0.5)
//     * @return 검색된 K-ESG 지침 텍스트 (없으면 빈 문자열)
//     */
//    public String retrieveRelevantGuidelines(String reportText, int maxResults, double minScore) {
//        if (reportText == null || reportText.isBlank()) {
//            log.warn("[RAG] 보고서 텍스트가 비어 있어 검색을 건너뜁니다.");
//            return "";
//        }
//
//        try {
//            // 쿼리는 보고서 앞부분 1000자로 제한 (임베딩 비용 절감)
//            String query = reportText.length() > 1000
//                    ? reportText.substring(0, 1000)
//                    : reportText;
//
//            return search(query, maxResults, minScore);
//
//        } catch (Exception e) {
//            log.error("[RAG] 검색 중 오류 발생: {}", e.getMessage());
//            return "";
//        }
//    }
//
//    /**
//     * K-ESG 지표 키워드를 직접 쿼리로 사용하여 해당 지표의 가이드라인 청크를 검색합니다.
//     * Selective Context RAG에서 지표별 정밀 가이드라인 발췌에 사용됩니다.
//     *
//     * @param indicatorKeywords K-ESG 지표 관련 검색어 (예: "온실가스 GHG Scope1 배출량")
//     * @param maxResults        반환할 최대 청크 수 (권장: 3)
//     * @return 해당 지표 관련 K-ESG 가이드라인 텍스트 (없으면 빈 문자열)
//     */
//    public String retrieveGuidelinesForIndicator(String indicatorKeywords, int maxResults) {
//        if (indicatorKeywords == null || indicatorKeywords.isBlank()) {
//            return "";
//        }
//        try {
//            return search(indicatorKeywords, maxResults, 0.4);
//        } catch (Exception e) {
//            log.warn("[RAG] 지표별 가이드라인 검색 실패 — keywords={}, 원인={}", indicatorKeywords, e.getMessage());
//            return "";
//        }
//    }
//
//    private String search(String query, int maxResults, double minScore) {
//        Embedding queryEmbedding = embeddingModel.embed(query).content();
//
//        EmbeddingSearchRequest searchRequest = EmbeddingSearchRequest.builder()
//                .queryEmbedding(queryEmbedding)
//                .maxResults(maxResults)
//                .minScore(minScore)
//                .build();
//
//        List<EmbeddingMatch<TextSegment>> matches = embeddingStore.search(searchRequest).matches();
//
//        if (matches.isEmpty()) {
//            log.warn("[RAG] 유사한 K-ESG 지침을 찾지 못했습니다. (minScore={}, 가이드라인이 학습되어 있는지 확인하세요)", minScore);
//            return "";
//        }
//
//        log.info("[RAG] 검색 완료 — {}개 청크 발견 (상위 유사도: {})",
//                matches.size(),
//                String.format("%.3f", matches.get(0).score()));
//
//        return matches.stream()
//                .map(match -> match.embedded().text())
//                .collect(Collectors.joining("\n\n---\n\n"));
//    }
//}
