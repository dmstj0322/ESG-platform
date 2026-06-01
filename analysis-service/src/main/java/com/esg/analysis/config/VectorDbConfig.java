package com.esg.analysis.config;

import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.ollama.OllamaEmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.chroma.ChromaEmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Slf4j
@Configuration
public class VectorDbConfig {

    @Value("${ollama.base-url:http://localhost:11434}")
    private String ollamaBaseUrl;

    // 반드시 127.0.0.1 사용 — localhost는 IPv6([::1])로 해석될 수 있어 405 유발
    @Value("${chroma.base-url:http://esg-chroma:8000}")
    private String chromaBaseUrl;

    private static final String COLLECTION_NAME = "k-esg-guidelines";

    @Bean
    public EmbeddingModel embeddingModel() {
        return OllamaEmbeddingModel.builder()
                .baseUrl(ollamaBaseUrl)
                .modelName("nomic-embed-text")
                .timeout(Duration.ofSeconds(300))
                .build();
    }

    @Bean
    public EmbeddingStore<TextSegment> embeddingStore() {
        // ChromaDB 0.5.x 는 LangChain4j 0.35.0 클라이언트와 API 불일치 → 405
        // docker-compose에서 chromadb/chroma:0.4.24 로 다운그레이드 필수
        // 연결 실패 시 InMemory 폴백으로 서버 기동은 유지
        try {
            String baseUrl = chromaBaseUrl.endsWith("/")
                    ? chromaBaseUrl.substring(0, chromaBaseUrl.length() - 1)
                    : chromaBaseUrl;

            EmbeddingStore<TextSegment> store = ChromaEmbeddingStore.builder()
                    .baseUrl(baseUrl)
                    .collectionName(COLLECTION_NAME)
                    .build();

            log.info("[VectorDB] ChromaDB 연결 성공 — {}, 컬렉션: {}", baseUrl, COLLECTION_NAME);
            return store;

        } catch (Exception e) {
            log.warn("[VectorDB] ChromaDB 연결 실패 — InMemory 폴백으로 기동합니다. 원인: {}", e.getMessage());
            log.warn("[VectorDB] RAG 기능이 비활성화됩니다. ChromaDB 버전을 0.4.24로 낮추세요.");
            return new InMemoryEmbeddingStore<>();
        }
    }
}