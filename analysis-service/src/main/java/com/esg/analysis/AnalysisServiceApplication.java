package com.esg.analysis;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling; // 추가

@EnableScheduling // 스케줄러 활성화
@EnableFeignClients
@SpringBootApplication(scanBasePackages = {"com.esg.analysis", "com.esg.common"})
public class AnalysisServiceApplication {
  public static void main(String[] args) {
    SpringApplication.run(AnalysisServiceApplication.class, args);
  }
}