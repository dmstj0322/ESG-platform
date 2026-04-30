package com.esg.analysis.config;

import com.esg.analysis.service.EsgAnalyst;
import dev.langchain4j.data.segment.TextSegment; // 추가됨
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.googleai.GoogleAiGeminiChatModel;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.store.embedding.EmbeddingStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiConfig {

    @Value("${langchain4j.google-ai-gemini.chat-model.api-key}")
    private String apiKey;

    @Value("${langchain4j.google-ai-gemini.chat-model.model-name}")
    private String modelName;

    @Bean
    public ChatLanguageModel chatLanguageModel() {
        return GoogleAiGeminiChatModel.builder()
                .apiKey(apiKey)
                .modelName(modelName)
                // logRequests 메서드 에러 시 아래 한 줄을 주석 처리하거나 삭제하세요.
                // .logRequests(true)
                // .logResponses(true)
                .build();
    }

    @Bean
    public EsgAnalyst esgAnalyst(ChatLanguageModel chatLanguageModel,
                                 EmbeddingStore<TextSegment> embeddingStore, // 제네릭 타입 명시 <TextSegment>
                                 EmbeddingModel embeddingModel) {

        // ContentRetriever 설정 시 타입 일치를 위해 빌더 활용
        ContentRetriever contentRetriever = EmbeddingStoreContentRetriever.builder()
                .embeddingStore(embeddingStore)
                .embeddingModel(embeddingModel)
                .maxResults(3)
                .build();

        return AiServices.builder(EsgAnalyst.class)
                .chatLanguageModel(chatLanguageModel)
                .contentRetriever(contentRetriever)
                .build();
    }
}