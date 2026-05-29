package com.esg.analysis.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;
import java.util.Collection;
import java.util.ArrayList;
import java.util.Collections;

/**
 * 지표별 keyword gating — cluster AND-match 방식으로 false negative 감소.
 *
 * <pre>
 * 통과 조건:
 *   KEYWORD_CLUSTERS 중 하나라도 cluster 내 모든 토큰이 text에 존재하면 PASS (OR across clusters).
 *   단일 토큰 cluster는 GENERIC_TOKENS 필터 적용 (similarity >= 0.85 시 완화).
 *   복합 cluster(size >= 2)는 조합 자체가 식별력 → generic 필터 없음.
 *   미정의 지표(E-10x 등)는 gate 없이 항상 PASS.
 * </pre>
 */
@Slf4j
@Service
public class IndicatorKeywordGate {

    // 0.88 → 0.82: S/G vocabulary mismatch 완화 — 복합 cluster partial match 허용 구간 확대
    private static final double RELAXED_SIMILARITY_THRESHOLD = 0.82;

    private static final Set<String> GENERIC_TOKENS = Set.of(
            "참여", "운영", "활동", "진행", "실시", "현황", "실적", "추진", "도입", "발생"
    );

    // G category negative domain tokens — S domain 오염 차단
    // 이 토큰이 text에 존재하면 G 지표 retrieval 에서 즉시 차단 (semantic similarity 무관)
    private static final Set<String> G_NEGATIVE_DOMAIN_TOKENS = Set.of(
            "산업안전", "안전보건교육", "안전교육", "재해예방교육",
            "봉사활동", "봉사시간", "지역사회봉사", "사회공헌",
            "volunteer", "csr",
            "교육 참여율", "교육참여율", "안전교육 참여율",
            "참여시간", "봉사"
    );

    // G indicator codes that require strict domain gating
    private static final Set<String> G_STRICT_DOMAIN_CODES = Set.of("G-302", "G-304", "G-305");

    // S indicator 내부 cross-indicator 오염 차단
    // S-203: ESG/지속가능경영 교육 전용 → 산업안전 교육 계열 차단
    // S-204: 임직원 참여 프로그램 전용 → 봉사활동·지역사회 계열 차단 (S-205 분리)
    private static final Map<String, Set<String>> S_NEGATIVE_TOKENS = new LinkedHashMap<>();
    static {
        S_NEGATIVE_TOKENS.put("S-203", Set.of(
                "안전교육", "안전보건교육", "산업안전 교육", "안전보건 교육", "재해예방 교육",
                "소방교육", "소방훈련", "안전관리 교육", "안전 교육", "근로자 안전교육"
        ));
        S_NEGATIVE_TOKENS.put("S-204", Set.of(
                "봉사활동", "지역사회 봉사", "사회공헌", "봉사시간", "봉사 시간",
                "자원봉사", "volunteer", "지역기부", "나눔 활동", "지역사회 활동"
        ));
    }

    // S indicator explicit phrases — 이 구문이 chunk에 있으면 S_NEGATIVE_TOKENS보다 먼저 PASS 처리
    // "임직원 ESG 참여율은 92%" 같은 bilingual 복합 구문이 substring mismatch로 탈락하는 것을 방지
    private static final Map<String, List<String>> S_EXPLICIT_PHRASES = new LinkedHashMap<>();
    static {
        // S-201: 산업안전 교육 — ISO인증·VR교육·협력사안전·교육시간KPI 명시적 구문
        S_EXPLICIT_PHRASES.put("S-201", List.of(
                "안전교육 이수율", "안전 교육 이수율",
                "vr 기반 안전교육", "vr안전교육", "vr 안전교육", "체험형 안전교육", "vr 교육",
                "iso45001", "iso 45001",
                "안전보건경영시스템", "ohsas",       // ISO45001 한국어명 및 전신 표준
                "협력사 안전보건", "협력사 안전 점검", "협력업체 안전", "협력사 안전",
                "1인당 안전교육", "안전교육 시간",
                "재해예방 교육 프로그램", "안전보건 교육 프로그램",
                "safety training program", "industrial safety training",
                "안전 인증 유지", "안전보건 인증",   // 인증 유지/취득 operational evidence
                "안전관리 체계", "안전보건 체계"     // 운영 체계 기반 evidence
        ));
        // S-202: 산업재해 발생 여부 — 중대재해0건·TRIR·무재해·재발방지 명시적 구문
        // historical disclosure + improvement = ESG maturity → VERIFIED 인정
        S_EXPLICIT_PHRASES.put("S-202", List.of(
                "중대재해 0건", "중대재해0건", "사망재해 0건", "중대 재해 0건",
                "trir", "ltir",
                "재해율 0", "사고율 0", "재해건수 0", "ltir 0", "trir 0",
                "무재해 달성", "무사고 달성", "무재해 인증",
                "업계 평균 대비", "산업 평균 대비", "평균 이하", "평균 대비 개선",
                "재발방지 대책", "재발방지대책", "안전 개선 완료", "재발 방지",
                "원인 분석 완료", "개선 조치 완료", "예방 체계 구축",  // 개선조치 증빙
                "사고율 개선", "재해율 개선", "안전지표 개선"            // KPI 개선 증빙
        ));
        S_EXPLICIT_PHRASES.put("S-203", List.of(
                "esg 교육 프로그램", "esg교육프로그램", "esg 교육을 실시", "esg 교육 실시",
                "esg 역량 강화", "esg 역량강화", "esg training", "sustainability education",
                "지속가능경영 교육 프로그램", "esg 교육 이수", "esg 교육과정",
                "sustainability training program", "esg 인식 교육", "esg 교육 시행",
                // 교육 운영 evidence + KPI — 정책 문서 형태가 아니어도 VERIFIED 인정
                "esg 교육 이수율", "esg교육이수율",
                "온보딩 esg 교육", "온보딩 교육", "신규 입사자 esg", "입사자 esg 교육",
                "관리자 심화", "심화 교육 과정", "심화 과정", "심화과정",
                "esg 전략 교육", "esg 공시 교육", "esg 역량 교육"
        ));
        S_EXPLICIT_PHRASES.put("S-204", List.of(
                "임직원 esg 참여율", "esg 참여율", "임직원 참여율", "직원 참여율",
                "임직원 esg 참여", "employee participation rate", "employee participation",
                "임직원 참여 프로그램", "사내 참여 프로그램 운영", "임직원 프로그램 참여",
                "esg engagement", "직원 참여 현황", "임직원 esg engagement"
        ));
        S_EXPLICIT_PHRASES.put("S-205", List.of(
                "지역사회 봉사활동 프로그램", "지역사회 봉사활동", "사회공헌 활동 운영",
                "봉사활동 프로그램", "community contribution", "volunteer program",
                "지역사회 기여 활동", "사회공헌 프로그램", "지역사회 공헌 활동",
                "사회공헌 활동", "지역사회 봉사 프로그램", "임직원 봉사활동",
                "임직원 자원봉사", "자원봉사 프로그램", "지역사회 환경정화",
                "취약계층 지원 프로그램", "취약계층 지원", "community program",
                "social contribution", "사회공헌 실적", "봉사 시간", "자원봉사",
                // 사회공헌 KPI + 실행 evidence — 정책 문구 없이도 VERIFIED 인정
                "사회공헌 투자", "사회공헌투자", "사회공헌 금액",
                "에너지 복지", "에너지복지",
                "stem 교육 지원", "교육 지원 프로그램",
                "자원봉사 시간", "봉사활동 시간",
                "나눔 활동", "나눔활동", "임직원 나눔",   // 나눔 활동 operational evidence
                "지역 기부", "지역기부", "기부금",         // 투자/기부 KPI evidence
                "사회공헌 실적", "사회공헌 현황"           // 실적 기반 evidence
        ));
    }

    // G indicator explicit phrases — sim >= 0.68 이면 cluster gate 없이 즉시 PASS
    // 입자어(을/를/이/가) 없는 형태 우선으로 Korean particle substring mismatch 방지
    private static final Map<String, List<String>> G_EXPLICIT_PHRASES = new LinkedHashMap<>();
    static {
        G_EXPLICIT_PHRASES.put("G-301", List.of(
                "윤리경영 위원회", "윤리경영위원회", "윤리경영", "행동강령", "행동 강령",
                "컴플라이언스 위원회", "반부패 정책", "반부패", "부패방지",
                "윤리경영 정책", "준법경영", "준법", "윤리헌장", "윤리강령", "윤리규범",
                "청렴 서약", "청렴경영", "청렴", "청탁금지",
                "컴플라이언스", "compliance", "anti-corruption", "code of conduct",
                "ethics policy", "ethics committee", "code of ethics"
        ));
        G_EXPLICIT_PHRASES.put("G-302", List.of(
                "내부 신고 시스템", "내부신고시스템", "내부 신고", "내부신고",
                "익명 신고", "익명신고", "익명 제보", "제보 시스템", "신고 채널",
                "신고센터", "제보센터", "핫라인", "신고함", "제보함",
                "whistleblowing", "whistleblower", "hotline", "내부 제보", "내부제보",
                "신고시스템", "비리 신고", "부정 신고", "내부고발"
        ));
        G_EXPLICIT_PHRASES.put("G-303", List.of(
                // ESG 접두어 필수: "전담 조직"/"전담조직"/"esg 조직"/"esg조직" 제거
                // (이유: "안전관리 전담 조직" 같은 Social 안전 조직 문장이 explicit PASS 됨)
                "esg 전담 조직", "esg전담조직", "esg 담당 조직",
                "esg위원회", "esg 위원회",
                "지속가능경영 위원회", "지속가능경영위원회",
                "esg전담", "esg 전담",
                "지속가능경영 조직", "지속가능경영팀", "esg팀", "esg tf", "esg추진",
                "esg 사무국", "esg 추진단", "sustainability committee", "sustainability team",
                "esg 전담 부서", "esg전담부서", "esg 담당 부서", "esg담당부서",
                "대표이사 직속 esg", "대표이사직속esg", "대표이사 직속"
        ));
        G_EXPLICIT_PHRASES.put("G-304", List.of(
                "외부 esg 감사", "외부감사", "외부 감사", "외부감사인", "외부 감사인",
                "외부 회계감사", "외부회계감사", "외부 회계 감사",
                "외부 감사 수행", "외부감사 수행",
                "외부 감사 절차", "외부 감사 수행 절차",
                "감사 수행 절차", "회계감사 수행", "감사위원회 보고",
                "제3자 검증", "제3자검증", "외부 검증", "외부검증",
                "독립 감사", "독립감사", "회계감사", "회계법인",
                "감사보고서", "감사 의견", "third-party", "external audit",
                "external assurance", "assurance", "인증기관", "검증기관",
                "accounting audit", "independent audit", "outside audit", "audit procedure"
        ));
        G_EXPLICIT_PHRASES.put("G-305", List.of(
                "사외이사", "사외 이사", "독립이사", "독립 이사", "독립 사외이사",
                "이사회 독립", "이사회독립", "이사 독립", "이사회 독립성",
                "이사회 독립성 정책", "board independence policy",
                "독립적 의사결정", "사외이사 중심", "사외이사 중심의",
                "사외이사 비율", "비상임이사", "비상임 이사",
                "independent director", "independent board", "board independence",
                "outside director", "독립 이사회", "이사회 독립 정책",
                // 다양성 KPI 추가 (여성 이사, 이사회 다양성)
                "여성 이사", "여성이사", "여성 사외이사", "이사회 다양성",
                "board diversity", "gender diversity", "여성 임원 비율",
                "이사회 구성 다양성", "다양성 정책"
        ));
    }

    // ── G 지배구조 추가 explicit phrases (board/ESG governance 강화) ──────────────
    // G-301 확장: 윤리·반부패·준법 교육 및 인증 전용 — 리스크관리 계열 제거
    // (리스크관리위원회/ERM/사이버보안은 G-301 윤리경영 정책 지표와 직접 연결 약함)
    static {
        List<String> g301ext = new ArrayList<>(G_EXPLICIT_PHRASES.get("G-301"));
        g301ext.addAll(List.of(
                "반부패 교육", "반부패교육", "부패방지 교육",
                "컴플라이언스 교육", "준법 교육",
                "반부패 프로그램", "청렴 교육", "청탁금지 교육",
                "윤리 핫라인", "윤리핫라인", "윤리 신고", "내부통제",
                "위반 징계", "징계 처리", "부패 사건",
                "iso 37001", "iso37001", "반부패 경영시스템"
        ));
        G_EXPLICIT_PHRASES.put("G-301", Collections.unmodifiableList(g301ext));

        // G-304 확장: 개인정보보호·사이버보안 인증 추가
        List<String> g304ext = new ArrayList<>(G_EXPLICIT_PHRASES.get("G-304"));
        g304ext.addAll(List.of(
                "개인정보보호 인증", "isms", "iso27001", "iso 27001",
                "정보보호 인증", "정보보안 인증", "개인정보보호위원회",
                "개인정보보호 체계", "사이버보안", "cybersecurity",
                "정보보호 관리체계", "isms-p",
                "privacy policy", "data protection", "gdpr"
        ));
        G_EXPLICIT_PHRASES.put("G-304", Collections.unmodifiableList(g304ext));
    }

    // [3] G-303: 보고서 제목·브랜딩 텍스트 단독 pass 방지 — explicit 조직 entity 없으면 BLOCKED
    // "ESG 지속가능경영 보고서" 같은 title noise는 거버넌스 조직 증거가 아님
    // G-303 Social 안전/보건 조직 패턴 — 이 패턴만 있고 ESG governance phrase 없으면 BLOCKED
    private static final Set<String> G303_SOCIAL_ORG_PATTERNS = new LinkedHashSet<>(List.of(
            "안전관리 전담", "안전관리전담", "산업안전 전담", "산업안전전담",
            "재해예방 전담", "재해예방전담", "안전보건 전담", "안전보건전담",
            "안전관리 조직", "안전관리조직", "산업안전 조직", "산업안전조직",
            "재해예방 조직", "재해예방조직", "안전보건 조직", "안전보건조직",
            "안전관리 부서", "안전관리부서", "안전 담당 부서", "안전담당부서"
    ));

    // G-303 entity 판별: 반드시 ESG 접두어 또는 지속가능경영 접두어가 붙은 조직 구문만 허용.
    // "전담조직","전담 조직","담당부서","담당 부서" 제거 — "안전관리 전담 조직" 같은 S-domain 오염 방지.
    private static final Set<String> G303_ENTITY_KW = new LinkedHashSet<>(List.of(
            "esg팀", "esg위원회", "esg 위원회", "지속가능경영위원회", "지속가능경영 위원회",
            "esg전담", "esg 전담",
            "governance committee", "esg 담당부서", "esg담당부서", "esg담당조직", "esg 담당조직",
            "esg 조직", "esg조직", "esg tf", "sustainability team", "csr team",
            "esg 담당 부서", "esg 전담 조직",
            "esg 전담 부서", "esg전담부서",
            "대표이사 직속 esg", "대표이사직속esg", "대표이사 직속"
    ));

    /**
     * 지표 코드 → keyword cluster 목록.
     * cluster 내 모든 토큰이 normalized text에 있어야 해당 cluster 매칭.
     * cluster 간 OR → 하나라도 완전 매칭 시 PASS.
     */
    private static final Map<String, List<List<String>>> KEYWORD_CLUSTERS = new LinkedHashMap<>();

    static {
        // ── S (사회) ──────────────────────────────────────────────────────────

        // S-201: 산업안전 교육
        KEYWORD_CLUSTERS.put("S-201", List.of(
                // 복합 cluster (AND-match / relaxed 모드에서 partial 허용)
                List.of("산업안전", "교육"),
                List.of("안전보건", "교육"),
                List.of("재해예방", "교육"),
                // 단일 토큰 — indicator.getKeywords() vocabulary 동기화
                List.of("안전교육"),
                List.of("안전보건교육"),
                List.of("안전 교육"),
                List.of("교육시간"),      // 1인당 교육시간 N시간
                List.of("산업안전"),      // 산업안전 standalone
                List.of("안전보건"),      // 안전보건 standalone
                List.of("재해예방"),      // 재해예방 standalone
                List.of("이수율"),        // 교육 이수율
                List.of("안전관리"),      // 안전관리 체계
                List.of("안전 훈련"),     // safety training
                List.of("ISO45001"),      // 안전보건경영시스템 인증
                List.of("VR", "안전"),    // VR 기반 안전교육
                List.of("협력사", "안전") // 협력사 안전보건 점검
        ));

        // S-202: 산업재해 발생 여부
        KEYWORD_CLUSTERS.put("S-202", List.of(
                List.of("산업재해"),
                List.of("LTIR"),
                List.of("TRIR"),          // Total Recordable Incident Rate
                List.of("재해율"),
                List.of("재해건수"),
                List.of("산재"),
                List.of("사망재해"),
                List.of("무재해"),
                List.of("무사고"),
                List.of("사고율"),
                List.of("안전사고"),
                List.of("사고건수"),
                List.of("중대재해"),      // 중대재해 0건 등
                List.of("사고", "건수"),
                List.of("안전사고", "발생"),
                List.of("재해", "발생"),
                List.of("사고 없음"),
                List.of("산업재해 없음"),
                List.of("재해 발생 없음"),
                List.of("LTIR 0"),
                List.of("재발방지"),      // 재발방지 대책 수립 = disclosure maturity
                List.of("업계 평균", "개선") // 업계 평균 대비 개선
        ));

        // S-203: ESG 교육 실시 여부 — "안전교육"과 엄격히 분리
        // "산업안전 교육", "안전보건 교육" 단독으로는 PASS 불가
        // ESG·지속가능성·윤리경영·탄소중립·환경 교육 explicit keyword 필수
        KEYWORD_CLUSTERS.put("S-203", List.of(
                List.of("ESG", "교육"),
                List.of("지속가능경영", "교육"),
                List.of("윤리경영", "교육"),
                List.of("탄소중립", "교육"),
                List.of("환경", "교육"),
                List.of("compliance", "training"),
                List.of("sustainability", "training"),
                List.of("ESG교육"),           // 띄어쓰기 없는 변형
                List.of("ESG역량"),           // ESG 역량 강화 교육
                List.of("지속가능성", "역량")  // 지속가능성 역량 교육
        ));

        // S-204: 임직원 참여 프로그램
        // 봉사활동·사회공헌 클러스터는 S-205 전용 — S_NEGATIVE_TOKENS와 함께 이중 차단
        // "참여율" 단독 클러스터 제거 (봉사활동 참여율 등 오탐 원인) → "임직원 참여율"로 강화
        KEYWORD_CLUSTERS.put("S-204", List.of(
                List.of("임직원", "참여"),         // AND-match: 둘 다 있어야 pass
                List.of("직원", "참여", "프로그램"), // AND-match 3개
                List.of("사내", "참여"),
                List.of("직원", "프로그램"),
                List.of("사내", "캠페인"),
                List.of("캠페인", "참여"),
                List.of("임직원", "참여율"),         // 강화: 단독 "참여율" 제거 → 임직원 필수
                List.of("직원", "참여율"),           // 직원 참여율
                List.of("임직원", "참여비율")
        ));

        // ── G (지배구조) ──────────────────────────────────────────────────────

        // G-301: 윤리경영 정책
        KEYWORD_CLUSTERS.put("G-301", List.of(
                // 복합 cluster
                List.of("컴플라이언스", "정책"),
                List.of("윤리경영", "방침"),
                // 단일 토큰 — indicator keywords 동기화
                List.of("윤리경영"),
                List.of("행동강령"),
                List.of("반부패"),
                List.of("윤리헌장"),
                List.of("준법경영"),      // 준법경영 체계
                List.of("준법"),          // 준법 standalone
                List.of("청렴"),          // 청렴 활동
                List.of("컴플라이언스"),  // 컴플라이언스 standalone
                List.of("윤리"),          // 윤리 standalone
                List.of("윤리 정책"),     // 윤리 정책 (space-normalized 포함)
                List.of("윤리 방침")      // 윤리 방침
        ));

        // G-302: 내부 신고 시스템
        // 동의어 변형 대응:
        //   "익명 신고 시스템"  → ["익명","신고"]
        //   "내부 제보 채널"    → ["내부","제보"] / ["제보","채널"]
        //   "윤리 신고 제도"    → ["윤리","신고"]
        //   "whistleblowing 시스템" / "hotline" 영문 표현 포함
        KEYWORD_CLUSTERS.put("G-302", List.of(
                List.of("내부제보"),
                List.of("익명신고"),
                List.of("신고시스템"),
                List.of("내부", "신고"),
                List.of("익명", "신고"),
                List.of("내부", "제보"),
                List.of("제보", "채널"),
                List.of("윤리", "신고"),
                List.of("제보", "시스템"),
                List.of("신고", "시스템"),
                List.of("제보센터"),
                List.of("신고센터"),
                List.of("whistleblowing"),
                List.of("whistle", "blowing"),
                List.of("hotline"),
                List.of("핫라인"),
                List.of("신고채널"),
                List.of("신고", "채널"),
                List.of("내부고발"),
                List.of("내부 신고"),
                List.of("신고 시스템"),
                List.of("내부신고시스템"),
                List.of("신고 운영"),
                List.of("제보 채널")
        ));

        // G-303: ESG 담당 조직
        // 제거: List.of("ESG","조직") → 청크 헤더 ESG + 본문 안전조직 오염
        //       List.of("전담","조직") → "안전관리 전담 조직" 매칭
        KEYWORD_CLUSTERS.put("G-303", List.of(
                List.of("ESG", "위원회"),
                List.of("ESG", "전담"),       // "ESG 전담" 복합어 — ESG prefix 필수
                List.of("ESG", "담당"),
                List.of("ESG", "TF"),
                List.of("지속가능경영", "위원회"),
                List.of("ESG팀"),
                List.of("ESG전담"),
                List.of("ESG 담당부서")
        ));

        // S-205: 지역사회 공헌 활동
        KEYWORD_CLUSTERS.put("S-205", List.of(
                List.of("지역사회", "봉사"),
                List.of("지역사회", "기여"),
                List.of("지역사회", "공헌"),
                List.of("사회공헌", "활동"),
                List.of("봉사활동", "참여"),
                List.of("참여", "시간"),
                List.of("봉사", "시간"),
                List.of("봉사활동"),
                List.of("봉사시간"),
                List.of("지역사회봉사"),
                List.of("사회공헌"),
                List.of("사회적", "책임"),
                List.of("사회적책임"),
                List.of("사회", "기여"),
                List.of("CSR", "활동"),
                List.of("CSR"),
                List.of("volunteer"),
                List.of("community"),
                List.of("지역기부"),
                List.of("지역", "기부"),
                List.of("기부"),
                List.of("나눔"),
                List.of("지역사회투자")
        ));

        // G-304: 외부 감사 체계
        KEYWORD_CLUSTERS.put("G-304", List.of(
                List.of("외부감사"),
                List.of("외부", "감사"),
                List.of("감사인"),
                List.of("공인회계사"),
                List.of("회계감사"),
                List.of("감사보고서"),
                List.of("감사", "보고서"),
                List.of("독립감사"),
                List.of("외부감사인"),
                List.of("외부 감사인"),
                List.of("외부", "ESG", "감사"),
                List.of("외부", "ESG감사"),
                List.of("제3자", "검증"),
                List.of("제3자검증"),
                List.of("독립", "검증"),
                List.of("독립검증"),
                List.of("ESG", "감사"),
                List.of("외부", "검증"),
                List.of("외부검증"),
                List.of("third-party", "assurance"),
                List.of("third", "party", "assurance"),
                List.of("assurance"),
                List.of("인증기관"),
                List.of("검증기관")
        ));

        // G-305: 이사회 독립성 + 다양성
        KEYWORD_CLUSTERS.put("G-305", List.of(
                List.of("사외이사"),
                List.of("독립이사"),
                List.of("이사회", "독립"),
                List.of("이사회", "구성"),
                List.of("이사회", "독립성"),
                List.of("독립", "이사"),
                List.of("사외이사비율"),
                List.of("비상임이사"),
                List.of("사외", "이사"),
                List.of("이사회독립성"),
                List.of("여성", "이사"),     // 이사회 다양성
                List.of("이사회", "다양성"),
                List.of("board", "diversity"),
                List.of("독립", "이사회")
        ));
    }

    private record ClusterMatchResult(boolean matched, boolean normalizeMatch, String reason) {}

    public boolean passes(String indicatorCode, String text) {
        return passes(indicatorCode, text, 0.0);
    }

    public boolean passes(String indicatorCode, String text, double similarity) {
        if (indicatorCode == null || text == null) return true;
        String textLower = text.toLowerCase();
        String textNorm  = bilingualNorm(textLower);

        // [S-EXPLICIT-PHRASE-SHORTCUT] S indicator explicit phrase → S_NEGATIVE_TOKENS보다 먼저 PASS
        // "임직원 ESG 참여율은 92%", "ESG 교육 프로그램을 시행 중" 같은 명시적 구문은
        // 같은 청크에 "안전 교육"/"봉사활동"이 언급되더라도 해당 지표의 핵심 증거로 인정
        if (indicatorCode.startsWith("S-")) {
            List<String> sPhrases = S_EXPLICIT_PHRASES.get(indicatorCode);
            if (sPhrases != null) {
                for (String phrase : sPhrases) {
                    if (containsNormalized(textNorm, phrase)) {
                        log.info("[KeywordGate] S-EXPLICIT-PHRASE-PASS indicator={} phrase='{}' sim={}",
                                indicatorCode, phrase, String.format("%.3f", similarity));
                        return true;
                    }
                }
            }
        }

        // S indicator cross-indicator contamination 선제 차단
        // S-203: 안전교육 계열 → S-201/202 전용, S-203에서 차단
        // S-204: 봉사활동·지역사회 계열 → S-205 전용, S-204에서 차단
        {
            Set<String> sNeg = S_NEGATIVE_TOKENS.get(indicatorCode);
            if (sNeg != null) {
                for (String neg : sNeg) {
                    if (textLower.contains(neg.toLowerCase())) {
                        log.info("[KeywordGate] S-CONTAMINATION-BLOCKED indicator={} negToken='{}' sim={}",
                                indicatorCode, neg, String.format("%.3f", similarity));
                        return false;
                    }
                }
            }
        }

        // [EXPLICIT-PHRASE-SHORTCUT FIRST] G indicator: explicit phrase → 즉시 PASS (sim 요건 없음)
        // S-domain check / cluster gate 보다 먼저 실행 — "윤리경영위원회" 같은 명시적 거버넌스 표현은
        // 문맥에 봉사활동 언급이 있어도 governance evidence로 인정 (false negative 방지 최우선)
        if (indicatorCode.startsWith("G-")) {
            List<String> explicitPhrases = G_EXPLICIT_PHRASES.get(indicatorCode);
            if (explicitPhrases != null) {
                for (String phrase : explicitPhrases) {
                    if (containsNormalized(textNorm, phrase)) {
                        log.info("[KeywordGate] G-EXPLICIT-PHRASE-PASS indicator={} phrase='{}' sim={}",
                                indicatorCode, phrase, String.format("%.3f", similarity));
                        return true;
                    }
                }
            }
        }

        // G 지표 S-domain contamination 선제 차단 (explicit phrase 통과 후)
        if (indicatorCode.startsWith("G-")) {
            String textNoSpc = textLower.replaceAll("\\s+", "");
            for (String neg : G_NEGATIVE_DOMAIN_TOKENS) {
                String negLower  = neg.toLowerCase();
                String negNoSpc  = negLower.replaceAll("\\s+", "");
                if (textLower.contains(negLower) || textNoSpc.contains(negNoSpc)) {
                    log.info("[KeywordGate] G-DOMAIN-BLOCKED indicator={} negToken='{}' sim={}",
                            indicatorCode, neg, String.format("%.3f", similarity));
                    return false;
                }
            }
        }
        // [3] G-303: title/branding text 단독 pass 금지 — explicit 조직 entity 없으면 BLOCKED
        if ("G-303".equals(indicatorCode)) {
            String textNoSpc = textLower.replaceAll("\\s+", "");
            boolean hasEntity = G303_ENTITY_KW.stream().anyMatch(k -> {
                String kl = k.toLowerCase(); String kn = kl.replaceAll("\\s+", "");
                return textLower.contains(kl) || textNoSpc.contains(kn);
            });
            if (!hasEntity) {
                log.info("[KeywordGate] G-303-ENTITY-BLOCKED no explicit org entity found sim={}", String.format("%.3f", similarity));
                return false;
            }
            // Social 안전/보건 조직 패턴 감지 시:
            // governance explicit phrase가 있으면 contamination 차단 skip (governance phrase 우선)
            // governance explicit phrase가 없을 때만 BLOCKED
            boolean hasSocialOrg = G303_SOCIAL_ORG_PATTERNS.stream().anyMatch(p -> {
                String pl = p.toLowerCase(); String pn = pl.replaceAll("\\s+", "");
                return textLower.contains(pl) || textNoSpc.contains(pn);
            });
            if (hasSocialOrg) {
                String tNormG = bilingualNorm(textLower);
                List<String> gPhrases = G_EXPLICIT_PHRASES.get("G-303");
                boolean hasGovExplicit = gPhrases != null
                        && gPhrases.stream().anyMatch(p -> containsNormalized(tNormG, p));
                if (!hasGovExplicit) {
                    log.info("[G303-EXPLICIT-REJECT] reason=generic_social_org sim={}", String.format("%.3f", similarity));
                    return false;
                }
                // governance phrase 있음 → contamination 차단 skip (describeMatch explicit shortcut로 처리)
            }
        }

        String match = describeMatch(indicatorCode, text, similarity);
        if ("NO_GATE".equals(match)) return true;
        boolean passed = !"BLOCKED".equals(match);
        if (passed) {
            log.info("[KeywordGate] PASS indicator={} cluster=[{}] sim={}",
                    indicatorCode, match, String.format("%.3f", similarity));
        }
        return passed;
    }

    /**
     * 매칭된 cluster를 "|" 구분 문자열로 반환합니다.
     * 한국어 복합어 띄어쓰기 변형 대응: "신고 시스템" ↔ "신고시스템" 동시 확인.
     * G 지표: S-domain 오염 선제 차단 (negative domain token 검사 먼저 수행).
     *
     * @return 매칭 cluster 토큰 문자열, gate 미정의 시 "NO_GATE", 차단 시 "BLOCKED"
     */
    public String describeMatch(String indicatorCode, String text, double similarity) {
        if (indicatorCode == null || text == null) return "NO_GATE";
        String tLower = text.toLowerCase();
        String tNorm  = bilingualNorm(tLower);

        // [S-EXPLICIT-PHRASE-SHORTCUT] S indicator: explicit phrase → S_NEGATIVE_TOKENS보다 먼저 PASS
        if (indicatorCode.startsWith("S-")) {
            List<String> sPhrases = S_EXPLICIT_PHRASES.get(indicatorCode);
            if (sPhrases != null) {
                for (String phrase : sPhrases) {
                    if (containsNormalized(tNorm, phrase)) {
                        log.info("[KeywordGate] S-EXPLICIT-PHRASE-PASS(describeMatch) indicator={} phrase='{}' sim={}",
                                indicatorCode, phrase, String.format("%.3f", similarity));
                        return "EXPLICIT:" + phrase;
                    }
                }
            }
        }

        // S indicator cross-indicator contamination 차단 (passes()와 동일 순서)
        {
            Set<String> sNeg = S_NEGATIVE_TOKENS.get(indicatorCode);
            if (sNeg != null) {
                for (String neg : sNeg) {
                    if (tLower.contains(neg.toLowerCase())) {
                        log.info("[KeywordGate] S-CONTAMINATION-BLOCKED(describeMatch) indicator={} negToken='{}' sim={}",
                                indicatorCode, neg, String.format("%.3f", similarity));
                        return "BLOCKED";
                    }
                }
            }
        }

        // [EXPLICIT-PHRASE-SHORTCUT FIRST] G indicator: explicit phrase → 즉시 PASS (sim 요건 없음)
        if (indicatorCode.startsWith("G-")) {
            List<String> explicitPhrases = G_EXPLICIT_PHRASES.get(indicatorCode);
            if (explicitPhrases != null) {
                for (String phrase : explicitPhrases) {
                    if (containsNormalized(tNorm, phrase)) {
                        log.info("[KeywordGate] G-EXPLICIT-PHRASE-PASS(describeMatch) indicator={} phrase='{}' sim={}",
                                indicatorCode, phrase, String.format("%.3f", similarity));
                        return "EXPLICIT:" + phrase;
                    }
                }
            }
        }

        // G 지표 S-domain contamination 선제 차단 (explicit phrase 통과 후)
        if (indicatorCode.startsWith("G-")) {
            String tNoSpc = tLower.replaceAll("\\s+", "");
            for (String neg : G_NEGATIVE_DOMAIN_TOKENS) {
                String nLower = neg.toLowerCase();
                String nNoSpc = nLower.replaceAll("\\s+", "");
                if (tLower.contains(nLower) || tNoSpc.contains(nNoSpc)) {
                    log.info("[KeywordGate] G-DOMAIN-BLOCKED indicator={} negToken='{}' sim={}",
                            indicatorCode, neg, String.format("%.3f", similarity));
                    return "BLOCKED";
                }
            }
        }
        // [3] G-303: explicit 조직 entity 없으면 BLOCKED
        // (주의: G-EXPLICIT-PHRASE-SHORTCUT이 이미 위에서 실행됨 → governance phrase 있으면 여기 미도달)
        if ("G-303".equals(indicatorCode)) {
            String tNoSpc = tLower.replaceAll("\\s+", "");
            boolean hasEntity = G303_ENTITY_KW.stream().anyMatch(k -> {
                String kl = k.toLowerCase(); String kn = kl.replaceAll("\\s+", "");
                return tLower.contains(kl) || tNoSpc.contains(kn);
            });
            if (!hasEntity) {
                log.info("[KeywordGate] G-303-ENTITY-BLOCKED no explicit org entity found sim={}", String.format("%.3f", similarity));
                return "BLOCKED";
            }
            // Social 안전/보건 조직 패턴: governance explicit phrase 없을 때만 BLOCKED
            // (governance phrase가 있었다면 이미 EXPLICIT shortcut에서 return됨 — 이중 보호)
            boolean hasSocialOrg = G303_SOCIAL_ORG_PATTERNS.stream().anyMatch(p -> {
                String pl = p.toLowerCase(); String pn = pl.replaceAll("\\s+", "");
                return tLower.contains(pl) || tNoSpc.contains(pn);
            });
            if (hasSocialOrg) {
                boolean hasGovExplicit = G_EXPLICIT_PHRASES.getOrDefault("G-303", List.of())
                        .stream().anyMatch(p -> containsNormalized(tNorm, p));
                if (!hasGovExplicit) {
                    log.info("[G303-EXPLICIT-REJECT] reason=generic_social_org sim={}", String.format("%.3f", similarity));
                    return "BLOCKED";
                }
            }
        }

        List<List<String>> clusters = KEYWORD_CLUSTERS.get(indicatorCode);
        if (clusters == null || clusters.isEmpty()) return "NO_GATE";

        String tNoSpc2 = tLower.replaceAll("\\s+", "");
        boolean relaxed = similarity >= RELAXED_SIMILARITY_THRESHOLD;

        for (List<String> cluster : clusters) {
            ClusterMatchResult r = evaluateCluster(cluster, tLower, tNoSpc2, relaxed);
            if (r.matched()) {
                if (r.normalizeMatch()) {
                    log.info("[KeywordGate] NORMALIZE_MATCH indicator={} cluster=[{}] sim={}",
                            indicatorCode, String.join("|", cluster), String.format("%.3f", similarity));
                }
                return String.join("|", cluster);
            }
        }

        List<String> reasons = new ArrayList<>();
        for (List<String> cluster : clusters) {
            ClusterMatchResult r = evaluateCluster(cluster, tLower, tNoSpc2, relaxed);
            reasons.add("[" + String.join("|", cluster) + "→" + r.reason() + "]");
        }
        String summary = reasons.stream().limit(5).collect(Collectors.joining(", "));
        if (reasons.size() > 5) summary += " ...+" + (reasons.size() - 5) + "more";
        log.info("[KeywordGate] BLOCKED indicator={} sim={} relaxed={} detail={}",
                indicatorCode, String.format("%.3f", similarity), relaxed, summary);

        // [INTENT-CHECK] — intent mismatch 진단 로그
        Set<String> allTokens = clusters.stream()
                .flatMap(Collection::stream)
                .map(String::toLowerCase)
                .collect(Collectors.toSet());
        long requiredKwMatched = allTokens.stream()
                .filter(t -> tLower.contains(t) || tNoSpc2.contains(t.replaceAll("\\s+", "")))
                .count();
        Set<String> genericSet = Set.of("교육", "정책", "운영", "체계", "관리", "활동", "참여", "시스템");
        boolean genericOnly = requiredKwMatched > 0 && allTokens.stream()
                .filter(t -> tLower.contains(t) || tNoSpc2.contains(t.replaceAll("\\s+", "")))
                .allMatch(genericSet::contains);
        boolean intentMismatch = requiredKwMatched == 0 || genericOnly;
        log.info("[INTENT-CHECK] indicator={} requiredKeywordsMatched={} genericOnly={} intentMismatch={} result=BLOCK",
                indicatorCode, requiredKwMatched, genericOnly, intentMismatch);

        return "BLOCKED";
    }

    private ClusterMatchResult evaluateCluster(List<String> cluster, String normalized,
                                                String normalizedNoSpc, boolean relaxed) {
        if (cluster.isEmpty()) return new ClusterMatchResult(false, false, "EMPTY_CLUSTER");

        if (cluster.size() >= 2) {
            // strict pass: all tokens match (AND)
            boolean allMatch = cluster.stream().map(String::toLowerCase)
                    .allMatch(t -> normalized.contains(t)
                            || normalizedNoSpc.contains(t.replaceAll("\\s+", "")));
            if (allMatch) {
                boolean isNorm = cluster.stream().map(String::toLowerCase)
                        .anyMatch(t -> !normalized.contains(t)
                                && normalizedNoSpc.contains(t.replaceAll("\\s+", "")));
                return new ClusterMatchResult(true, isNorm, isNorm ? "NORMALIZE_MATCH" : "MATCH");
            }
            // relaxed pass: sim >= threshold → 1개 이상 token 매칭 시 PARTIAL_MATCH
            // semantic similarity가 이미 충분히 높으므로 vocabulary mismatch 완화
            if (relaxed) {
                boolean anyMatch = cluster.stream().map(String::toLowerCase)
                        .anyMatch(t -> normalized.contains(t)
                                || normalizedNoSpc.contains(t.replaceAll("\\s+", "")));
                if (anyMatch) {
                    return new ClusterMatchResult(true, false, "PARTIAL_MATCH");
                }
            }
            String failToken = cluster.stream().map(String::toLowerCase)
                    .filter(t -> !normalized.contains(t)
                            && !normalizedNoSpc.contains(t.replaceAll("\\s+", "")))
                    .findFirst().orElse("?");
            return new ClusterMatchResult(false, false, "TOKEN_MISMATCH:" + failToken);
        }

        // single-token cluster
        String token = cluster.get(0).toLowerCase();
        String tokenNoSpc = token.replaceAll("\\s+", "");
        boolean matchNormal = normalized.contains(token);
        boolean matchNoSpc = normalizedNoSpc.contains(tokenNoSpc);
        if (!matchNormal && !matchNoSpc) {
            return new ClusterMatchResult(false, false, "TOKEN_MISMATCH:" + token);
        }
        if (!relaxed && GENERIC_TOKENS.contains(token)) {
            return new ClusterMatchResult(false, false, "THRESHOLD_FAIL:" + token);
        }
        boolean isNorm = !matchNormal && matchNoSpc;
        return new ClusterMatchResult(true, isNorm, isNorm ? "NORMALIZE_MATCH" : "MATCH");
    }

    /** 지표에 gate가 정의되어 있는지 확인합니다 (테스트·로그용). */
    public boolean hasGate(String indicatorCode) {
        return KEYWORD_CLUSTERS.containsKey(indicatorCode);
    }

    /**
     * G 지표 explicit phrase 존재 여부를 확인합니다.
     * ReportRagService 의 DOMAIN-EXCL 면제 판별에 사용됩니다.
     */
    public boolean hasExplicitGPhrase(String indicatorCode, String text) {
        if (text == null || indicatorCode == null) return false;
        String tn = bilingualNorm(text.toLowerCase());
        List<String> phrases = G_EXPLICIT_PHRASES.get(indicatorCode);
        if (phrases == null) return false;
        return phrases.stream().anyMatch(p -> containsNormalized(tn, p));
    }

    /**
     * S 지표 explicit phrase 존재 여부를 확인합니다.
     * ReportRagService 의 finalScore 부스트 판별에 사용됩니다.
     */
    public boolean hasExplicitSPhrase(String indicatorCode, String text) {
        if (text == null || indicatorCode == null) return false;
        String tn = bilingualNorm(text.toLowerCase());
        List<String> phrases = S_EXPLICIT_PHRASES.get(indicatorCode);
        if (phrases == null) return false;
        return phrases.stream().anyMatch(p -> containsNormalized(tn, p));
    }

    /**
     * S/G 지표 통합 explicit phrase 존재 여부 확인.
     * ReportRagService finalScore 부스트 로직에서 사용됩니다.
     */
    public boolean hasExplicitPhrase(String indicatorCode, String text) {
        if (indicatorCode == null || text == null) return false;
        if (indicatorCode.startsWith("G-")) return hasExplicitGPhrase(indicatorCode, text);
        if (indicatorCode.startsWith("S-")) return hasExplicitSPhrase(indicatorCode, text);
        return false;
    }

    /**
     * 정규화 기반 포함 검사: bilingualNorm(normText).contains(bilingualNorm(phrase)).
     * normText는 이미 lowercased + bilingualNorm 처리된 상태로 전달해야 합니다.
     * 공백 제거 + 전각→반각 변환을 통해 "외부 회계감사" ↔ "외부회계감사" 등 spacing 변형 흡수.
     */
    private static boolean containsNormalized(String normText, String phrase) {
        return normText.contains(bilingualNorm(phrase.toLowerCase()));
    }

    /**
     * 한영 혼합 구문 정규화: 전각→반각, 하이픈 통일, 공백 제거.
     * "이사회 독립성 정책（Board Independence Policy）" 같이 전각 문자가 섞인
     * PDF OCR 결과를 반각으로 통일하여 substring 매칭 정확도를 높입니다.
     */
    private static String bilingualNorm(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if      (c >= 'Ａ' && c <= 'Ｚ') c = (char)(c - 0xFEE0); // 전각 A-Z → 반각
            else if (c >= 'ａ' && c <= 'ｚ') c = (char)(c - 0xFEE0); // 전각 a-z → 반각
            else if (c >= '０' && c <= '９') c = (char)(c - 0xFEE0); // 전각 0-9 → 반각
            else if (c == '（') c = '(';   // 전각 ( → 반각
            else if (c == '）') c = ')';   // 전각 ) → 반각
            else if (c == '–' || c == '—') c = '-'; // en/em dash → hyphen
            else if (c == ' ' || c == '\t' || c == '\n' || c == '\r') continue; // 공백 제거
            sb.append(c);
        }
        return sb.toString();
    }
}
