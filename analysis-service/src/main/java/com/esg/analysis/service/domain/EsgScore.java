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

    // 실시간 포인트 수신 시 점수 업데이트 로직 (가중치 적용)
    public void addSocialPoints(Long points) {
        // 예: 100포인트당 0.1점 부여
        double converted = points * 0.001;
        this.socialScore = Math.min(100.0, this.socialScore + converted);
        calculateTotal();
    }

    // 최종 성과 확정 시 점수 셋팅 로직
    public void updateSocialScore(Double finalScore) {
        this.socialScore = finalScore;
        calculateTotal();
    }

    private void calculateTotal() {
        this.totalScore = (environmentScore + socialScore + governanceScore) / 3.0;
    }
}