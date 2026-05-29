package com.esg.communityservice.service;

import com.esg.communityservice.domain.AIStatus;
import com.esg.communityservice.domain.ActivityType;
import com.esg.communityservice.domain.ImageFile;
import com.esg.communityservice.repository.ImageFileRepository;
import com.esg.infra.s3.S3Uploader;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImageUploadService {
  private final S3Uploader s3Uploader;
  private final ImageFileRepository imageFileRepository;

  @Transactional
  public ImageFile uploadImage(MultipartFile file, Long memberId, ActivityType activityType) throws IOException {
    String pHash = calculatePHash(file);

    if (imageFileRepository.existsByMemberIdAndFileHashAndAiStatus(memberId, pHash, AIStatus.SUCCESS)) {
      throw new IllegalArgumentException("이미 사용하신 인증 사진입니다. 새로운 사진을 촬영해 주세요!");
    }

    String url;
    try {
      url = s3Uploader.upload(file, "posts");
    } catch (Exception e) {
      log.warn("[S3] 업로드 실패 — 로컬 placeholder 사용: {}", e.getMessage());
      url = "https://placehold.co/400x300?text=" + UUID.randomUUID().toString().substring(0, 8);
    }

    return ImageFile.builder()
      .s3Url(url)
      .fileHash(pHash)
      .memberId(memberId)
      .activityType(activityType)
      .aiStatus(AIStatus.PENDING)
      .build();
  }

  private String calculatePHash(MultipartFile file) throws IOException {
    BufferedImage source = ImageIO.read(file.getInputStream());

    // 1. 8x8 크기로 축소 (세부 사항 무시)
    BufferedImage smallImg = new BufferedImage(8, 8, BufferedImage.TYPE_BYTE_GRAY);
    Graphics2D g2d = smallImg.createGraphics();

    Image scaled = source.getScaledInstance(8, 8, Image.SCALE_SMOOTH);
    g2d.drawImage(scaled, 0, 0, null);
    g2d.dispose();

    // 2. 평균 밝기 계산
    double total = 0;
    double[] pixels = new double[64];
    for (int y = 0; y < 8; y++) {
      for (int x = 0; x < 8; x++) {
        int color = smallImg.getRaster().getSample(x, y, 0);
        pixels[y * 8 + x] = color;
        total += color;
      }
    }
    double avg = total / 64.0;

    // 3. 평균보다 밝으면 1, 어두우면 0으로 해시 생성
    StringBuilder hash = new StringBuilder();
    for (double pixel : pixels) {
      hash.append(pixel >= avg ? "1" : "0");
    }
    return hash.toString();
  }
}
