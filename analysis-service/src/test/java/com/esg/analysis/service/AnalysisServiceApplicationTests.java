package com.esg.analysis.service;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@Disabled("CI 환경 없이 Spring 컨텍스트 로딩 불가 — 인프라 연동 시 활성화")
class AnalysisServiceApplicationTests {

  @Test
  void contextLoads() {
  }

}
