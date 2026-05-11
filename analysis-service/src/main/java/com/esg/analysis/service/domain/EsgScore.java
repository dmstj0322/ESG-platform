package com.esg.analysis.service.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "esg_scores")
public class EsgScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long companyId;

    private Double environmentScore = 0.0; // E
    private Double socialScore = 0.0;      // S (포인트 연동 대상)
    private Double governanceScore = 0.0;   // G

    private Double totalScore = 0.0;

    public EsgScore(Long companyId) {
        this.companyId = companyId;
    }

    // 실시간 포인트 이벤트 수신 시 S 점수 증분 (EcoPointConverter.toSocialScoreIncrement 기준)
    public void addSocialPoints(double increment) {
        this.socialScore = Math.min(100.0, this.socialScore + increment);
        calculateTotal();
    }

    public void updateSocialScore(Double finalScore) {
        this.socialScore = Math.min(100.0, finalScore);
        calculateTotal();
    }

    // E×40% + S×30% + G×30% — AnalysisConsumer 리포트 산정식과 동일
    private void calculateTotal() {
        this.totalScore = environmentScore * 0.4 + socialScore * 0.3 + governanceScore * 0.3;
    }
}