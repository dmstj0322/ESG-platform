package com.esg.communityservice.service;

import com.esg.common.domain.ActivityType;
import com.google.cloud.vision.v1.*;
import com.google.protobuf.ByteString;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@Service
public class AIVisionService {
  private final ImageAnnotatorClient client;
  private final S3Client s3Client;

  // 🌟 AI 검증 임계값 (상수 처리)
  private static final float REJECT_THRESHOLD = 0.6f;
  private static final float ACCEPT_THRESHOLD = 0.5f;

  private static final Logger aiLogger = LoggerFactory.getLogger("ai-analysis");

  public AIVisionService(S3Client s3Client) throws IOException {
    this.client = ImageAnnotatorClient.create();
    this.s3Client = s3Client;
  }

  private record LabelInfo(String description, float score) {}

  public record AiResult(double score, String labelsDetail, String bestImageUrl) {}

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

    aiLogger.info("AI가 감지한 라벨 목록: {}", labels);
    return labels;
  }

  private boolean isExactMatch(String description, String keyword) {
    String desc = description.toLowerCase();
    String key = keyword.toLowerCase();
    return desc.equals(key)
      || desc.startsWith(key + "_")
      || desc.endsWith("_" + key)
      || desc.contains("_" + key + "_");
  }

  public ActivityType analyzeActivityType(List<MultipartFile> files) throws IOException {
    List<LabelInfo> allDetectedLabels = new ArrayList<>();

    for (MultipartFile file : files) {
      ByteString imgBytes = ByteString.copyFrom(file.getBytes());
      allDetectedLabels.addAll(detectLabels(imgBytes));
    }

    aiLogger.info("AI 분석된 전체 라벨: {}", allDetectedLabels);

    ActivityType bestType = ActivityType.FAIL;
    double highestScore = 0.0;

    for (ActivityType type : ActivityType.values()) {
      if (type == ActivityType.FAIL) continue;

      // 1. 🌟 면책 특권 조건 확인 (Primary 키워드가 0.8 이상인지)
      boolean hasStrongPrimary = allDetectedLabels.stream()
        .anyMatch(label -> type.getPrimaryKeywords().stream()
          .anyMatch(primary -> isExactMatch(label.description(), primary) && label.score() >= 0.8f));

      // 2. 부정 키워드 감지
      boolean isRejected = allDetectedLabels.stream()
        .anyMatch(label -> type.getRejectKeywords().stream()
          .anyMatch(reject -> isExactMatch(label.description(), reject)
            && label.score() > REJECT_THRESHOLD));

      // 3. 🛡️ 탈락 방어 로직 적용
      if (isRejected) {
        if (hasStrongPrimary) {
          aiLogger.info("🛡️ [면책 발동] 강력한 긍정 증거(Primary >= 0.8)가 있어 부정 키워드를 무시합니다. 활동: {}", type);
        } else {
          aiLogger.info("❌ {}: 부정 키워드 감지 → 후보 탈락", type);
          continue; // 면책 특권이 없으면 기존처럼 탈락
        }
      }

      // 4. 가중치를 적용한 점수 합산
      double scoreSum = 0.0;
      for (LabelInfo label : allDetectedLabels) {
        if (label.score() < ACCEPT_THRESHOLD) continue;

        if (type.getPrimaryKeywords().stream().anyMatch(k -> isExactMatch(label.description(), k))) {
          scoreSum += (label.score() * 2.0);
        } else if (type.getKeywords().stream().anyMatch(k -> isExactMatch(label.description(), k))) {
          scoreSum += label.score();
        }
      }

      if (scoreSum > 0 && scoreSum > highestScore) {
        highestScore = scoreSum;
        bestType = type;
      }
    }

    aiLogger.info("🎯 최종 추론된 AI 활동 유형: {}, 합산 점수: {}", bestType, highestScore);
    return bestType;
  }

  public AiResult getMaxConfidenceScore(ActivityType type, List<String> imageUrls) {
    if (type == ActivityType.FAIL) return new AiResult(0.0, "FAIL 타입", null);

    double maxScore = 0.0;
    String bestLabels = "감지된 라벨 없음";
    String bestImageUrl = (imageUrls != null && !imageUrls.isEmpty()) ? imageUrls.get(0) : null;

    for (String urlString : imageUrls) {
      try {
        URI uri = new java.net.URI(urlString);
        String bucketName = uri.getHost().split("\\.")[0];
        String key = uri.getPath().substring(1);

        ByteString imgBytes = ByteString.copyFrom(s3Client.getObjectAsBytes(
          GetObjectRequest.builder().bucket(bucketName).key(key).build()
        ).asByteArray());

        List<LabelInfo> labels = detectLabels(imgBytes);

        String currentLabelsStr = labels.stream()
          .map(l -> String.format("%s(%.2f)", l.description(), l.score()))
          .toList()
          .toString();

        // 1. 🌟 면책 특권 조건 확인 (Primary 키워드가 0.8 이상인지)
        boolean hasStrongPrimary = labels.stream()
          .anyMatch(label -> type.getPrimaryKeywords().stream()
            .anyMatch(primary -> isExactMatch(label.description(), primary) && label.score() >= 0.8f));

        // 2. 부정 키워드 체크
        boolean isRejected = labels.stream()
          .anyMatch(label -> type.getRejectKeywords().stream()
            .anyMatch(reject -> isExactMatch(label.description(), reject)
              && label.score() > REJECT_THRESHOLD));

        // 3. 🛡️ 탈락 방어 로직 적용
        if (isRejected) {
          if (hasStrongPrimary) {
            aiLogger.info("🛡️ [면책 발동] 강력한 긍정 증거(Primary >= 0.8)가 있어 부정 키워드를 무시합니다. 활동: {}", type);
          } else {
            aiLogger.warn("🚨 부정 키워드 감지됨! AI 자동 탈락 처리. 활동: {}, 이미지: {}", type, urlString);
            return new AiResult(-1.0, "🚨 부정 키워드 감지됨!\n감지된 라벨: " + currentLabelsStr, urlString);
          }
        }

        // 4. 긍정 키워드 합산 (가중치 적용)
        double currentScore = 0.0;
        int matchCount = 0;

        for (LabelInfo label : labels) {
          if (label.score() < ACCEPT_THRESHOLD) continue;

          if (type.getPrimaryKeywords().stream().anyMatch(k -> isExactMatch(label.description(), k))) {
            currentScore += (label.score() * 2.0);
            matchCount++;
          } else if (type.getKeywords().stream().anyMatch(k -> isExactMatch(label.description(), k))) {
            currentScore += label.score();
            matchCount++;
          }
        }

        if (currentScore > 0) {
          // 점수 정규화 및 보너스 점수
          double finalScore = (currentScore / 2.0) + (matchCount * 0.05);
          currentScore = Math.min(1.0, finalScore);

          // 🌟 추가: 강력한 결정타(Primary 0.8 이상)가 있으면 무조건 0.85 이상을 보장하여 억울한 탈락(수동 검수행) 방지
          if (hasStrongPrimary) {
            currentScore = Math.max(0.85, currentScore);
          }
        } else {
          aiLogger.info("이미지에서 긍정 키워드를 찾을 수 없습니다. (0점 처리)");
        }

        if (currentScore >= maxScore) {
          maxScore = currentScore;
          bestLabels = currentLabelsStr;
          bestImageUrl = urlString;
        }

        aiLogger.info("이미지 분석 결과 - 현재 합산 점수: {}, 누적 최고 점수: {}", currentScore, maxScore);

      } catch (Exception e) {
        aiLogger.error("S3 이미지 분석 중 오류 발생: {}", urlString, e);
      }
    }
    return new AiResult(maxScore, bestLabels, bestImageUrl);
  }

  @PreDestroy
  public void closeClient() {
    if (client != null) {
      client.close();
    }
  }
}