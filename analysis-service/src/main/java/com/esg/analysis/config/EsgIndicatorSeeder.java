package com.esg.analysis.config;

import com.esg.analysis.service.domain.ESGIndicator;
import com.esg.analysis.service.repository.ESGIndicatorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class EsgIndicatorSeeder {

    private final ESGIndicatorRepository repository;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        List<ESGIndicator> indicators = List.of(
                // ── E (환경) ──────────────────────────────────────────────────────
                build("E", "E-101", "전력 사용량",
                        "연간 전력 소비량 공시 (kWh)",
                        0.20,
                        "전력 사용량 kWh 전력소비 에너지소비 전력비용 에너지 전기 재생에너지"),
                build("E", "E-102", "가스 사용량",
                        "연간 가스 소비량 공시 (m³)",
                        0.20,
                        "가스 사용량 LNG 도시가스 천연가스 m3 연료 가스소비 가스비용"),
                build("E", "E-103", "탄소 배출량",
                        "온실가스 배출량 공시 (tCO₂-eq)",
                        0.20,
                        "탄소 배출량 CO2 온실가스 GHG tCO2-eq 탄소중립 Scope 직접배출 간접배출 검증"),
                build("E", "E-104", "폐기물 발생량",
                        "연간 폐기물 발생 및 처리 현황 (톤)",
                        0.20,
                        "폐기물 발생량 톤 재활용 매립 소각 일반폐기물 지정폐기물 폐기물처리 재활용률"),
                build("E", "E-105", "수자원 사용량",
                        "연간 수자원 취수 및 재이용 현황 (m³)",
                        0.20,
                        "수자원 사용량 용수 취수량 m3 물 사용 재이용수 폐수 수질 절수"),

                // ── S (사회) ──────────────────────────────────────────────────────
                build("S", "S-201", "산업안전 교육 여부",
                        "임직원 대상 산업안전 교육 실시 여부",
                        0.25,
                        "산업안전 교육 안전교육 재해예방 교육실시 안전보건 이수율 교육시간"),
                build("S", "S-202", "산업재해 발생 여부",
                        "산업재해 발생 건수 및 재해율 공시",
                        0.25,
                        "산업재해 재해 사고 LTIR 재해율 사망 부상 재해건수 안전사고"),
                build("S", "S-203", "ESG 교육 실시 여부",
                        "임직원 ESG 역량 교육 실시 여부",
                        0.25,
                        "ESG 교육 지속가능경영 교육 임직원교육 ESG역량 교육프로그램 이수"),
                build("S", "S-204", "임직원 참여율",
                        "사내 ESG·환경 활동 임직원 참여 비율",
                        0.25,
                        "임직원 참여율 참여비율 참여 활동 임직원활동 에코 자원봉사 캠페인"),
                build("S", "S-205", "지역사회 봉사활동 여부",
                        "임직원 지역사회 봉사 및 사회공헌 활동 실시 여부",
                        0.25,
                        "지역사회 봉사활동 자원봉사 사회공헌 봉사시간 봉사 활동 지역사회공헌 임직원봉사 봉사프로그램 환경정화 취약계층 community service social contribution"),

                // ── G (지배구조) ──────────────────────────────────────────────────
                build("G", "G-301", "윤리경영 정책 존재 여부",
                        "윤리경영 방침 및 행동강령 수립 여부",
                        0.33,
                        "윤리경영 정책 윤리 행동강령 청렴 반부패 윤리방침 컴플라이언스 준법"),
                build("G", "G-302", "내부 신고 시스템 여부",
                        "내부 비위 신고·제보 채널 운영 여부",
                        0.33,
                        "내부신고 신고시스템 제보 내부고발 핫라인 신고채널 익명신고 내부제보"),
                build("G", "G-303", "ESG 담당 조직 존재 여부",
                        "ESG 전담 조직 또는 위원회 운영 여부",
                        0.34,
                        "ESG 담당 조직 ESG위원회 지속가능경영 담당부서 ESG전담 ESG팀 위원회"),
                build("G", "G-304", "외부 감사 수행 여부",
                        "외부 회계감사 또는 독립적 감사 수행 여부",
                        0.33,
                        "외부감사 회계감사 외부회계감사 감사수행 감사위원회 외부감사인 독립감사 감사절차 audit external audit accounting audit independent audit"),
                build("G", "G-305", "이사회 독립성 정책 여부",
                        "사외이사 중심의 이사회 독립성 정책 수립 및 운영 여부",
                        0.33,
                        "이사회독립성 사외이사 독립이사 이사회구성 독립적의사결정 이사회정책 board independence outside director independent director board policy")
        );

        int saved = 0;
        for (ESGIndicator indicator : indicators) {
            if (!repository.existsByCode(indicator.getCode())) {
                repository.save(indicator);
                saved++;
            }
        }
        if (saved > 0) {
            log.info("[EsgIndicatorSeeder] ESGIndicator {}개 시드 완료", saved);
        }
    }

    private ESGIndicator build(String category, String code, String title,
                                String description, double weight, String keywords) {
        return ESGIndicator.builder()
                .category(category)
                .code(code)
                .title(title)
                .description(description)
                .weight(weight)
                .keywords(keywords)
                .build();
    }
}
