package com.esg.communityservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableAsync;

@EnableJpaAuditing
@EnableDiscoveryClient
@SpringBootApplication(scanBasePackages = {"com.esg.communityservice", "com.esg.common", "com.esg.infra"})
@EnableFeignClients(basePackages = {"com.esg.common", "com.esg.infra"})
@EnableAsync
//@ComponentScan
public class CommunityServiceApplication {

  public static void main(String[] args) {
    SpringApplication.run(CommunityServiceApplication.class, args);
  }

}
