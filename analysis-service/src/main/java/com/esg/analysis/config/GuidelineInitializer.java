package com.esg.analysis.config;

import com.esg.analysis.service.EsgGuidelineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class GuidelineInitializer implements CommandLineRunner {

    private final EsgGuidelineService esgGuidelineService;

    @Override
    public void run(String... args) throws Exception {
        log.info("#### [System] K-ESG 가이드라인 자동 학습을 시작합니다...");

        // resources/guidelines 폴더 내의 모든 pdf 파일 스캔
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources("classpath:guidelines/*.pdf");

        if (resources.length == 0) {
            log.warn("#### [System] 학습할 가이드라인 파일이 없습니다. (경로: resources/guidelines/*.pdf)");
            return;
        }

        for (Resource resource : resources) {
            String fileName = resource.getFilename();
            try {
                // 기존에 만들어둔 ingestGuideline 호출
                esgGuidelineService.ingestGuideline(fileName);
                log.info("#### [System] 학습 완료: {}", fileName);
            } catch (Exception e) {
                log.error("#### [System] 학습 실패 ({}): {}", fileName, e.getMessage());
            }
        }

        log.info("#### [System] 모든 가이드라인 학습 프로세스가 완료되었습니다.");
    }
}