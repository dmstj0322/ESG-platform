package com.esg.marketservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration; // 추가
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@EnableDiscoveryClient
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class}) // 이 부분 수정!
public class MarketServiceApplication {
  public static void main(String[] args) {
    SpringApplication.run(MarketServiceApplication.class, args);
  }
}