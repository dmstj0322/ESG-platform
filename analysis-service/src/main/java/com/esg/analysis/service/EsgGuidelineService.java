package com.esg.analysis.service;

import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.loader.FileSystemDocumentLoader;
import dev.langchain4j.data.document.parser.apache.tika.ApacheTikaDocumentParser;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.EmbeddingStoreIngestor;
import dev.langchain4j.data.segment.TextSegment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Slf4j
@Service
@RequiredArgsConstructor
public class EsgGuidelineService {

    private final EmbeddingModel embeddingModel;
    private final EmbeddingStore<TextSegment> embeddingStore;

    public void ingestGuideline(String fileName) {
        try {
            // JAR 배포 환경에서도 안전하게 파일을 읽기 위해 임시 파일로 복사 후 처리
            ClassPathResource resource = new ClassPathResource("guidelines/" + fileName);

            try (InputStream inputStream = resource.getInputStream()) {
                Path tempFile = Files.createTempFile("guideline-", ".pdf");
                Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);

                Document document = FileSystemDocumentLoader.loadDocument(tempFile, new ApacheTikaDocumentParser());

                EmbeddingStoreIngestor ingestor = EmbeddingStoreIngestor.builder()
                        .documentSplitter(DocumentSplitters.recursive(500, 50))
                        .embeddingModel(embeddingModel)
                        .embeddingStore(embeddingStore)
                        .build();

                ingestor.ingest(document);

                // 사용 후 임시 파일 삭제
                Files.deleteIfExists(tempFile);
            }
        } catch (Exception e) {
            log.error("#### [RAG] 학습 중 에러: {}", e.getMessage());
            throw new RuntimeException("가이드라인 학습 실패", e);
        }
    }
}