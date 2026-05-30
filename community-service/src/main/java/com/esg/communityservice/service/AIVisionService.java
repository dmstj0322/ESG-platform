package com.esg.communityservice.service;

import com.esg.common.domain.ActivityType;
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
import java.util.List;

@Service
@Slf4j
public class AIVisionService {
  private final ImageAnnotatorClient client;
  private final S3Client s3Client;

  // 🌟 AI 검증 임계값 (상수 처리)
  private static final float REJECT_THRESHOLD = 0.7f;
  private static final float ACCEPT_THRESHOLD = 0.5f;

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

  // 1️⃣ 활동 유형 추론 (이미지 업로드 시 프론트엔드에 추천용)
  public ActivityType analyzeActivityType(List<MultipartFile> files) throws IOException {
    List<LabelInfo> allDetectedLabels = new ArrayList<>();

    for (MultipartFile file : files) {
      ByteString imgBytes = ByteString.copyFrom(file.getBytes());
      allDetectedLabels.addAll(detectLabels(imgBytes));
    }

    log.info("AI 분석된 전체 라벨: {}", allDetectedLabels);

    // 🌟 기본값을 FAIL로 설정
    ActivityType bestType = ActivityType.FAIL;
    double highestScore = 0.0;

    for (ActivityType type : ActivityType.values()) {
      if (type == ActivityType.FAIL) continue; // FAIL 타입은 검사에서 제외

      // 1. 부정 키워드 감지 시 해당 타입 후보에서 즉시 제외
      boolean isRejected = allDetectedLabels.stream()
        .anyMatch(label -> type.getRejectKeywords().stream()
          .anyMatch(reject -> label.description().contains(reject))
          && label.score() > REJECT_THRESHOLD);

      if (isRejected) {
        log.info("❌ {}: 부정 키워드 감지 → 후보 탈락", type);
        continue;
      }

      // 2. 긍정 키워드 점수 합산
//      double scoreSum = allDetectedLabels.stream()
//        .filter(label -> type.getKeywords().contains(label.description()) && label.score() > ACCEPT_THRESHOLD)
//        .mapToDouble(LabelInfo::score)
//        .sum();

      // 2. 가중치를 적용한 점수 합산
      double scoreSum = 0.0;
      for (LabelInfo label : allDetectedLabels) {
        if (label.score() < ACCEPT_THRESHOLD) continue;

        // 🌟 Primary 키워드는 점수를 1.5배로 계산하여 압도적인 우위를 줌
        if (type.getPrimaryKeywords().stream().anyMatch(k -> label.description().contains(k))) {
          scoreSum += (label.score() * 1.5);
        }
        // 일반 키워드는 그대로 합산
        else if (type.getKeywords().stream().anyMatch(k -> label.description().contains(k))) {
          scoreSum += label.score();
        }
      }

      if (scoreSum > 0 && scoreSum > highestScore) {
        highestScore = scoreSum;
        bestType = type;
      }
    }

    log.info("🎯 최종 추론된 AI 활동 유형: {}, 합산 점수: {}", bestType, highestScore);
    return bestType;
  }

  public double getMaxConfidenceScore(ActivityType type, List<String> imageUrls) {
    if (type == ActivityType.FAIL) return 0.0;

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

        // 1. 부정 키워드 체크 (발견 시 즉각 -1.0 반환)
        boolean isRejected = labels.stream()
          .anyMatch(label -> type.getRejectKeywords().stream()
            .anyMatch(reject -> label.description().contains(reject))
            && label.score() > REJECT_THRESHOLD);

        if (isRejected) {
          log.warn("🚨 부정 키워드 감지됨! AI 자동 탈락 처리. 활동: {}, 이미지: {}", type, urlString);
          return -1.0;
        }

//        // 2. 긍정 키워드 합산
//        double currentScore = labels.stream()
//          .filter(label -> type.getKeywords().contains(label.description()) && label.score() > ACCEPT_THRESHOLD)
//          .mapToDouble(LabelInfo::score)
//          .sum();

        // 2. 긍정 키워드 합산 (가중치 적용)
        double currentScore = 0.0;
        int matchCount = 0; // 매칭된 유효 키워드 개수

        for (LabelInfo label : labels) {
          if (label.score() < ACCEPT_THRESHOLD) continue;

          if (type.getPrimaryKeywords().stream().anyMatch(k -> label.description().contains(k))) {
            currentScore += (label.score() * 1.5);
            matchCount++;
          } else if (type.getKeywords().stream().anyMatch(k -> label.description().contains(k))) {
            currentScore += label.score();
            matchCount++;
          }
        }

        if (currentScore > 0) {
          // 3. 점수 정규화 및 보너스 점수
          // (매칭된 키워드 개수가 많을수록 맥락이 정확하므로 0.05점씩 보너스 부여)
          double finalScore = (currentScore / 2.0) + (matchCount * 0.05);
          // 합산 점수가 1.0을 넘지 않도록 캡핑
          currentScore = Math.min(1.0, currentScore);
        } else {
          log.info("이미지에서 긍정 키워드를 찾을 수 없습니다. (0점 처리)");
        }

        maxScore = Math.max(maxScore, currentScore);
        log.info("이미지 분석 결과 - 현재 합산 점수: {}, 누적 최고 점수: {}", currentScore, maxScore);

      } catch (Exception e) {
        log.error("S3 이미지 분석 중 오류 발생: {}", urlString, e);
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