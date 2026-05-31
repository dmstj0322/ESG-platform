package com.esg.infra.s3;

import io.awspring.cloud.s3.ObjectMetadata;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.io.IOException;
import java.time.Duration;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class S3Uploader {
  private final S3Client s3Client;

  @Value("${spring.cloud.aws.s3.bucket}")
  private String bucket;

  public String upload(MultipartFile multipartFile, String dirName) throws IOException {

    System.out.println("===== S3 DEBUG =====");
    System.out.println("BUCKET = " + bucket);
    System.out.println("DIR = " + dirName);
    System.out.println("FILE = " + multipartFile.getOriginalFilename());
    System.out.println("SIZE = " + multipartFile.getSize());
    System.out.println("CONTENT_TYPE=" + multipartFile.getContentType());

    String fileName = dirName + "/" + UUID.randomUUID() + "_" + multipartFile.getOriginalFilename();
    PutObjectRequest putObjectRequest = PutObjectRequest.builder()
      .bucket(bucket)
      .key(fileName)
      .contentType(multipartFile.getContentType())
      .build();

    s3Client.putObject(putObjectRequest,
      RequestBody.fromInputStream(multipartFile.getInputStream(), multipartFile.getSize()));

    return "https://" + bucket + ".s3.ap-northeast-2.amazonaws.com/" + fileName;
  }

//  public String getPresignedUrl(String key) {
//    GetPresigner presigner = GetPresigner.create();
//
//    GetObjectRequest getObjectRequest = GetObjectRequest.builder()
//      .bucket(bucket)
//      .key(key)
//      .build();
//
//    GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
//      .signatureDuration(Duration.ofMinutes(10)) // 10분 동안 유효
//      .getObjectRequest(getObjectRequest)
//      .build();
//
//    return presigner.presignGetObject(presignRequest).url().toString();
//  }
}
