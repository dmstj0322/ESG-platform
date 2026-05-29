package com.esg.analysis;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@EnableFeignClients
@EnableJpaAuditing
@SpringBootApplication(scanBasePackages = {"com.esg.analysis", "com.esg.common"})
public class AnalysisServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AnalysisServiceApplication.class, args);
    }
}