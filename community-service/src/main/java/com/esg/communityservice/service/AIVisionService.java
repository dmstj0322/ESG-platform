package com.esg.communityservice.service;

import com.esg.communityservice.domain.ActivityType;
import com.google.cloud.vision.v1.*;
import com.google.protobuf.ByteString;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

@Service
@Slf4j
public class AIVisionService {
  private final ImageAnnotatorClient client;
  private final S3Client s3Client;

  public AIVisionService(S3Client s3Client) throws IOException {
    this.client = ImageAnnotatorClient.create();
    this.s3Client = s3Client;
  }

  private record LabelInfo(String description, float score) {}

  private List<LabelInfo> detectLabels(ByteString imgBytes) {
    Image img = Image.newBuilder().setContent(imgBytes).build();
    Feature feat = Feature.newBuilder().setType(Feature.Type.LABEL_DETECTION).build();
    AnnotateImageRequest request = AnnotateImageRequest.newBuilder()
      .addFeatures(feat)
      .setImage(img)
      .build();

    BatchAnnotateImagesResponse response = client.batchAnnotateImages(List.of(request));

    List<LabelInfo> labels = response.getResponsesList().get(0).getLabelAnnotationsList().stream()
      .map(annotation -> new LabelInfo(
        annotation.getDescription().toLowerCase().replace(" ", "_"),
        annotation.getScore()))
      .toList();

    log.info("AI가 감지한 라벨 목록: {}", labels);

    return labels;
  }

  public ActivityType analyzeActivityType(List<MultipartFile> files) throws IOException {
    List<LabelInfo> allDetectedLabels = new ArrayList<>();
    for (MultipartFile file : files) {
      ByteString imgBytes = ByteString.copyFrom(file.getBytes());
      allDetectedLabels.addAll(detectLabels(imgBytes));
    }

    log.info("AI 분석된 전체 라벨: {}", allDetectedLabels);

    return Arrays.stream(ActivityType.values())
      .filter(type -> type != ActivityType.FAIL)
      .max(Comparator.comparingDouble(type -> {
        boolean isRejected = allDetectedLabels.stream()
          .anyMatch(label -> type.getRejectKeywords().contains(label.description()) && label.score() > 0.5f);

        if (isRejected) {
          log.info("활동 타입 {} 분석 중 부정 키워드 감지됨", type);
          return 0.0; // 강제로 낮은 점수를 주어 후보에서 제외
        }
        return allDetectedLabels.stream()
          .filter(label -> type.getKeywords().contains(label.description()))
          .filter(label -> label.score() > 0.6f)
          .mapToDouble(LabelInfo::score)
          .sum();
      }))
      .filter(type -> {
        // 최고 점수 계산 로직 재수행 (위의 map 로직에서 반환된 점수 활용 필요)
        double score = allDetectedLabels.stream()
          .filter(label -> type.getKeywords().contains(label.description()))
          .filter(label -> label.score() > 0.6f)
          .mapToDouble(LabelInfo::score)
          .sum();

        boolean isRejected = allDetectedLabels.stream()
          .anyMatch(label -> type.getRejectKeywords().contains(label.description()) && label.score() > 0.5f);

        return !isRejected && score > 0.0;
      })
      .orElse(ActivityType.FAIL); // 매칭 없으면 기본값
  }

  public double getMaxConfidenceScore(ActivityType type, List<String> imageUrls) {
    double maxScore = 0.0;
    for (String urlString : imageUrls) {
      try {
        URI uri = new java.net.URI(urlString);
        String bucketName = uri.getHost().split("\\.")[0];
        String key = uri.getPath().substring(1);

        ByteString imgBytes = ByteString.copyFrom(s3Client.getObjectAsBytes(
          GetObjectRequest.builder().bucket(bucketName).key(key).build()
        ).asByteArray());

        List<LabelInfo> labels = detectLabels(imgBytes);

        boolean isRejected = labels.stream()
          .anyMatch(label -> type.getRejectKeywords().contains(label.description()) && label.score() > 0.5f);

        if (isRejected) {
          log.warn("🚨 부정 키워드 감지됨! AI 자동 탈락 처리. 활동: {}, 이미지: {}", type, urlString);
          return 0.0; // 일회용품이나 부정맥락이 발견되면 즉시 0점 처리
        }

        double currentMax = labels.stream()
          .filter(label -> type.getKeywords().contains(label.description()) && label.score() > 0.6f)
          .mapToDouble(LabelInfo::score)
          .max()
          .orElse(0.0);

        maxScore = Math.max(maxScore, currentMax);
        log.info("해당 이미지 분석 결과 - 현재 최고 점수: {}, 누적 최고 점수: {}", currentMax, maxScore);

      } catch (Exception e) {
        log.error("AI API 호출 실패: {}", e.getMessage());
        throw new RuntimeException("AI 서비스 연결 실패", e);
      }
    }
    return maxScore;
  }

  @PreDestroy
  public void closeClient() {
    if (client != null) {
      client.close();
    }
  }
}
