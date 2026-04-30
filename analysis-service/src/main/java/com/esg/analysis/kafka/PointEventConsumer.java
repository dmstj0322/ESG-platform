package com.esg.analysis.kafka;

import com.esg.analysis.service.domain.EsgScore;
import com.esg.analysis.service.repository.EsgScoreRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class PointEventConsumer {

    private final EsgScoreRepository esgScoreRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    @KafkaListener(topics = "point-payment-topic", groupId = "analysis-service-group")
    public void consume(String message) {
        try {
            // Kafka 메시지(JSON)를 읽어옵니다.
            JsonNode jsonNode = objectMapper.readTree(message);

            // 친구의 PostCreatedEvent 필드명인 companyId를 추출합니다.
            Long companyId = jsonNode.get("companyId").asLong();
            Long earnedPoints = 100L; // 친구가 100점씩 주기로 고정했으므로

            log.info(">>>> [F-401] 성과 확정 시작: 기업 ID {}, 수신 포인트 {}", companyId, earnedPoints);

            // 1. 해당 기업의 ESG 점수 데이터가 있는지 확인, 없으면 새로 생성
            EsgScore esgScore = esgScoreRepository.findByCompanyId(companyId)
                    .orElseGet(() -> new EsgScore(companyId));

            // 2. S(Social) 점수에 포인트 반영 (자산화)
            esgScore.addSocialPoints(earnedPoints);

            // 3. DB 저장 (성과 확정)
            esgScoreRepository.save(esgScore);

            log.info(">>>> [F-401] 성과 확정 완료: 기업 {}의 S 점수가 갱신되었습니다.", companyId);

        } catch (Exception e) {
            log.error("Kafka 메시지 처리 중 오류 발생: {}", e.getMessage());
        }
    }
}