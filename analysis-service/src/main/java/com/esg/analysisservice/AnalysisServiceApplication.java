package com.esg.analysisservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@EnableDiscoveryClient
@SpringBootApplication
public class AnalysisServiceApplication {

  public static void main(String[] args) {
    SpringApplication.run(AnalysisServiceApplication.class, args);
  }

}
