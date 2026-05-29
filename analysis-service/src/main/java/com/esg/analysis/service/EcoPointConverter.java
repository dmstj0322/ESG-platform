package com.esg.analysis.service;

import org.springframework.stereotype.Component;

/**
 * 에코포인트 → ESG 점수 환산 공식 단일 출처.
 * 모든 환산은 이 클래스를 통해 수행하며, 서비스마다 다른 공식을 사용하지 않습니다.
 */
@Component
public class EcoPointConverter {

    public static final long EP_PER_CARBON_KG = 1_000L;       // 1,000 EP = 1 kg CO2eq
    public static final double SCORE_PER_CARBON_KG = 0.02;     // 1 kg → E점수 0.02점
    public static final double MAX_E_BONUS = 10.0;              // E 가산점 상한
    public static final double KG_PER_TREE = 6.6;              // 소나무 1그루 = 6.6 kg
    public static final long EP_PER_S_POINT = 1_000L;          // 1,000 EP → S점수 +1점
    public static final long MAX_S_BONUS = 5L;                  // S 가산점 상한

    public double toCarbonKg(long ecoPoints) {
        return ecoPoints / (double) EP_PER_CARBON_KG;
    }

    public double toEquivalentTrees(long ecoPoints) {
        return toCarbonKg(ecoPoints) / KG_PER_TREE;
    }

    public int toEBonus(long ecoPoints) {
        return (int) Math.round(Math.min(toCarbonKg(ecoPoints) * SCORE_PER_CARBON_KG, MAX_E_BONUS));
    }

    public int toSBonus(long ecoPoints) {
        return (int) Math.min(ecoPoints / EP_PER_S_POINT, MAX_S_BONUS);
    }

    /** 분석 시점 — 사용자 포인트 잔액 → 지표별 S 가산점 */
    public long toAnalysisSocialBonus(long userPoints) {
        return userPoints / EP_PER_S_POINT;
    }

    /** 실시간 포인트 이벤트 → S 점수 증분 (1,000 EP = +1점) */
    public double toSocialScoreIncrement(long earnedPoints) {
        return earnedPoints / (double) EP_PER_S_POINT;
    }

    public double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
