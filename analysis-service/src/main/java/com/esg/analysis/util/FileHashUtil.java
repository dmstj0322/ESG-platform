package com.esg.analysis.util;

import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class FileHashUtil {

    /**
     * [F-301] SHA-256 해시 계산 (표준 JDK 버전 + 스트리밍 방식)
     * 대용량 파일 대응을 위해 InputStream을 조각 단위로 읽습니다.
     */
    public static String calculateChecksum(MultipartFile file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");

            try (InputStream fis = file.getInputStream()) {
                byte[] byteArray = new byte[8192]; // 보통 8KB 정도가 성능상 효율적입니다.
                int bytesCount;

                while ((bytesCount = fis.read(byteArray)) != -1) {
                    digest.update(byteArray, 0, bytesCount);
                }
            }

            byte[] bytes = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();

        } catch (NoSuchAlgorithmException | IOException e) {
            // 서비스 로직에서 체크드 예외를 줄이기 위해 런타임 예외로 전환
            throw new RuntimeException("파일 해시 생성 중 오류 발생", e);
        }
    }
}