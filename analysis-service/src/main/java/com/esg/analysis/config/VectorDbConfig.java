package com.esg.analysis.config;

import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.ollama.OllamaEmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Duration;

@Configuration
public class VectorDbConfig {

    @Bean
    public EmbeddingModel embeddingModel() {
        // 현재 로컬에서 실행 중인 Ollama의 nomic-embed-text 모델을 사용합니다.
        return OllamaEmbeddingModel.builder()
                .baseUrl("http://localhost:11434")
                .modelName("nomic-embed-text")
                .timeout(Duration.ofSeconds(300))
                .build();
    }

    @Bean
    public EmbeddingStore<TextSegment> embeddingStore() {
        // 검색을 위한 인메모리 저장소
        return new InMemoryEmbeddingStore<>();
    }
}