package com.esg.communitymarketservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@EnableDiscoveryClient
@SpringBootApplication
public class CommunityMarketServiceApplication {

  public static void main(String[] args) {
    SpringApplication.run(CommunityMarketServiceApplication.class, args);
  }

}
