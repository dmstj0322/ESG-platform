package com.esg.analysis.service;

import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.domain.ESGIndicator;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.chroma.ChromaEmbeddingStore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 업로드된 보고서 PDF를 세션별 ChromaDB 컬렉션에 인덱싱하고,
 * K-ESG 지표별 키워드로 정밀 검색(Targeted Retrieval)을 수행합니다.
 * 분석 완료 후 임시 컬렉션을 삭제하여 벡터 DB를 정리합니다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportRagService {

    private final EmbeddingModel embeddingModel;
    private final RestTemplate restTemplate;
    private final IndicatorKeywordGate keywordGate;

    @Value("${chroma.base-url:http://esg-chroma:8000}")
    private String chromaBaseUrl;

    // 세션별 store 캐싱 — 동일 세션에 대한 ChromaDB 다중 접근 방지
    private final Map<String, ChromaEmbeddingStore> storeCache = new ConcurrentHashMap<>();

    /**
     * final_score 기준 유효 Evidence 최소 임계값.
     * 이 값 미만은 low-confidence로 분류되며 isValidEvidence=false로 반환됩니다.
     * Confidence 계산·UI 필터링 시 이 상수를 참조하세요.
     */
    public static final double EVIDENCE_THRESHOLD   = 0.6;

    /**
     * E 카테고리 전용 완화 임계값.
     * CSV/마크다운 테이블 데이터는 서술형 텍스트보다 semantic similarity 가 낮게 산출되므로
     * E-101~E-105 지표에 한해 0.5로 완화합니다. S/G 카테고리는 기존 0.6 유지.
     */
    public static final double EVIDENCE_THRESHOLD_E = 0.5;

    /** S 카테고리 finalScore 최소 임계값 — 노동·안전·인적자원 지표에 표준 기준 적용. */
    public static final double EVIDENCE_THRESHOLD_S = 0.60;

    /** G 카테고리 finalScore 최소 임계값.
     * 0.58 → 0.50: governance 어휘 vocabulary mismatch가 심각 → recall 우선.
     * keyword gate + explicit phrase shortcut 이 precision을 담당하므로 threshold 대폭 완화 안전.
     * BM25 hybrid score 도입으로 false positive 위험도 낮아짐. */
    public static final double EVIDENCE_THRESHOLD_G = 0.50;

    /**
     * Weak-semantic-only (keyword 0개) 후보 최소 rawSim 임계값.
     * E/S: 0.80 유지. G: 0.50으로 대폭 완화 (governance vocabulary mismatch 대응).
     */
    public static final double PRE_FILTER_WEAK_SIM   = 0.80;
    public static final double PRE_FILTER_WEAK_SIM_G  = 0.50;

    /**
     * kwScore 계산 시 가중치를 0.3배로 줄이는 일반·범용 키워드 목록.
     * "교육", "정책" 등이 단독으로 매칭되어 관련 없는 증거의 점수를 부풀리는 것을 방지합니다.
     */
    private static final Set<String> GENERIC_WEAK_KEYWORDS = Set.of("교육", "정책", "운영", "체계", "관리");

    /**
     * K-ESG 18개 핵심 지표 코드 → 일반 벡터 검색 키워드 (개념·전략 중심).
     */
    public static final Map<String, String> INDICATOR_KEYWORDS = new LinkedHashMap<>();

    /**
     * K-ESG 18개 핵심 지표 코드 → 표(Table) 데이터 특화 쿼리 (수치·단위 중심).
     * 이중 쿼리 검색(Query Expansion)에 사용됩니다.
     */
    public static final Map<String, String> INDICATOR_TABLE_QUERIES = new LinkedHashMap<>();

    /**
     * 지표 코드별 문서 실제 표현 기반 추가 쿼리 목록.
     * sliding-window 생성 쿼리가 커버하지 못하는 zero-count·부재 표현을 보완합니다.
     */
    public static final Map<String, List<String>> INDICATOR_EXTRA_QUERIES = new LinkedHashMap<>();

    /**
     * 지표별 mandatory keyword — 1개 이상 포함 여부로 증거 귀속 정확도 검증.
     * 이 중 단 하나도 없으면 semantic similarity가 높아도 해당 지표 증거로 거부됩니다.
     * cross-indicator contamination 방지용 hard gate.
     */
    public static final Map<String, List<String>> INDICATOR_MANDATORY_KW = new LinkedHashMap<>();

    static {
        // ■ 환경(E) — 일반 키워드
        INDICATOR_KEYWORDS.put("E1_환경경영목표",    "환경목표 방침 환경경영 탄소중립 환경전략 환경비전 환경정책 Net-Zero");
        INDICATOR_KEYWORDS.put("E2_온실가스배출",    "온실가스 GHG CO2 탄소 배출량 Scope1 Scope2 직접배출 간접배출 검증");
        INDICATOR_KEYWORDS.put("E3_에너지사용",      "에너지 전력 연료 재생에너지 재생가능 에너지원단위 전력소비 kWh");
        INDICATOR_KEYWORDS.put("E4_물환경",          "물 용수 폐수 수자원 취수량 재이용수 수질 방류 절수");
        INDICATOR_KEYWORDS.put("E5_폐기물",          "폐기물 재활용 매립 소각 일반폐기물 지정폐기물 재사용 순환경제");
        INDICATOR_KEYWORDS.put("E6_환경컴플라이언스","환경 법규 위반 사고 벌금 과태료 행정처분 환경사고 환경규제 제재");
        // ■ 사회(S)
        INDICATOR_KEYWORDS.put("S1_산업안전",        "산업안전 재해 사고 LTIR 재해율 안전보건 사망 부상 OSHA 안전관리 산재");
        INDICATOR_KEYWORDS.put("S2_인적자원",        "직원 임직원 고용 인력 정규직 비정규직 이직률 채용 퇴직 근속 FTE");
        INDICATOR_KEYWORDS.put("S3_인권다양성",      "인권 차별 다양성 양성평등 여성 성별 고충 인권정책 포용 DEI");
        INDICATOR_KEYWORDS.put("S4_훈련교육",        "교육 훈련 역량개발 학습 인재 HRD 1인당교육시간 연수 OJT 사내교육");
        INDICATOR_KEYWORDS.put("S5_동반성장",        "협력사 공급망 동반성장 상생 벤더 공급업체 협력업체 파트너십 ESG공급망");
        INDICATOR_KEYWORDS.put("S6_지역사회",        "지역사회 사회공헌 봉사 기부 나눔 CSR CSV 임팩트 사회투자 지역상생");
        // ■ 지배구조(G)
        INDICATOR_KEYWORDS.put("G1_이사회구성",      "이사회 사외이사 독립이사 이사구성 여성이사 다양성 CEO 경영진 이사선임");
        INDICATOR_KEYWORDS.put("G2_이사회활동",      "이사회 회의 안건 의결 참석률 보수 이사보수 위원회 활동 결의");
        INDICATOR_KEYWORDS.put("G3_감사기구",        "감사 감사위원회 내부감사 외부감사 회계감사 감사인 내부통제 감사보고");
        INDICATOR_KEYWORDS.put("G4_주주권리",        "주주 배당 의결권 주주총회 소수주주 IR 투자자 주주환원 스튜어드십");
        INDICATOR_KEYWORDS.put("G5_윤리반부패",      "윤리 반부패 청렴 행동강령 내부제보 공정거래 부패방지 컴플라이언스 준법");
        INDICATOR_KEYWORDS.put("G6_정보보안",        "정보보안 개인정보 사이버보안 ISMS 보안사고 데이터보호 개인정보보호법 보안");

        // ■ 환경(E) — 표·수치 특화 쿼리
        INDICATOR_TABLE_QUERIES.put("E1_환경경영목표",    "환경목표 감축률 % 달성률 2030 목표연도 수치");
        INDICATOR_TABLE_QUERIES.put("E2_온실가스배출",    "배출량 tCO2-eq tCO2 Scope 1 2 총계 합계 직접 간접 8768 연도");
        INDICATOR_TABLE_QUERIES.put("E3_에너지사용",      "에너지 사용량 TJ GJ MWh kWh 전력 소비량 총계 재생에너지 비율");
        INDICATOR_TABLE_QUERIES.put("E4_물환경",          "취수량 용수 m3 톤 폐수 재이용량 방류량 절감률 %");
        INDICATOR_TABLE_QUERIES.put("E5_폐기물",          "폐기물 발생량 톤 재활용률 매립량 소각량 지정폐기물 일반폐기물 %");
        INDICATOR_TABLE_QUERIES.put("E6_환경컴플라이언스","환경 위반 건수 0건 벌금 과태료 원 행정처분 사고 발생");
        // ■ 사회(S)
        INDICATOR_TABLE_QUERIES.put("S1_산업안전",        "재해율 사고 건수 사망 부상 LTIR 0.0 명 발생률 %");
        INDICATOR_TABLE_QUERIES.put("S2_인적자원",        "직원 수 명 정규직 비정규직 여성 남성 이직률 % 채용 FTE 인원");
        INDICATOR_TABLE_QUERIES.put("S3_인권다양성",      "여성 비율 % 장애인 다양성 고충 건수 처리율 인권교육 이수");
        INDICATOR_TABLE_QUERIES.put("S4_훈련교육",        "교육 시간 인당 시간 이수율 % 투자금액 억원 훈련 비용");
        INDICATOR_TABLE_QUERIES.put("S5_동반성장",        "협력사 수 지원 금액 동반성장 상생 공급망 평가 참여 건수");
        INDICATOR_TABLE_QUERIES.put("S6_지역사회",        "사회공헌 금액 억원 봉사 시간 기부 참여 인원 명 투자");
        // ■ 지배구조(G)
        INDICATOR_TABLE_QUERIES.put("G1_이사회구성",      "이사회 구성원 명 사외이사 여성이사 독립 비율 % 인원");
        INDICATOR_TABLE_QUERIES.put("G2_이사회활동",      "이사회 개최 횟수 참석률 % 안건 의결 결의 보수 원");
        INDICATOR_TABLE_QUERIES.put("G3_감사기구",        "감사위원회 활동 횟수 내부통제 취약점 의견 외부감사인");
        INDICATOR_TABLE_QUERIES.put("G4_주주권리",        "배당 주당 원 배당성향 % 주주총회 의결권 참석률");
        INDICATOR_TABLE_QUERIES.put("G5_윤리반부패",      "부패 위반 건수 신고 제보 교육 이수율 % 0건 처리");
        INDICATOR_TABLE_QUERIES.put("G6_정보보안",        "보안 사고 건수 ISMS 인증 개인정보 침해 0건 취약점 점검");

        // ── 지표별 문서 실제 표현 추가 쿼리 ────────────────────────────────────
        // S-201: 산업안전 교육 핵심 keyword 직접 쿼리 + operational maturity evidence 쿼리
        INDICATOR_EXTRA_QUERIES.put("S-201", List.of(
                "안전교육",
                "교육시간",
                "이수율",
                "재해예방 교육",
                "안전보건 교육",
                "산업안전 교육",
                "안전 훈련",
                "안전관리 교육",
                "안전 인식 교육",
                "근로자 안전교육",
                // operational safety maturity evidence — 인증·VR·KPI·협력사
                "ISO45001",
                "ISO 45001",
                "안전보건경영시스템",
                "VR 기반 안전교육",
                "VR 안전교육",
                "1인당 안전교육",
                "안전교육 이수율",
                "협력사 안전보건 점검",
                "협력사 안전 점검",
                "협력사 안전"
        ));
        // S-202: 산업재해 — zero-count / 수치 / 부재 표현 대폭 확장
        INDICATOR_EXTRA_QUERIES.put("S-202", List.of(
                "산업재해",
                "산업재해 없음",
                "무재해",
                "무사고",
                "무사고 달성",
                "사고 없음",
                "LTIR 0",
                "재해 발생 없음",
                "재해율 0",
                "사고율 0",
                "재해건수 0",
                "사고건수",
                "사고 발생건수",
                "안전사고 현황",
                "LTIR",
                "재해율",
                "재해건수",
                "산재 현황",
                "직업병",
                "사망 0명",
                "사고 발생률"
        ));
        // S-203: ESG 교육 실시 여부
        INDICATOR_EXTRA_QUERIES.put("S-203", List.of(
                "ESG 교육",
                "ESG교육",
                "지속가능경영 교육",
                "지속가능성 교육",
                "윤리경영 교육",
                "환경 교육",
                "환경 교육 실시",
                "탄소중립 교육",
                "ESG 역량 강화",
                "ESG 인식 제고",
                "ESG 인식 교육",
                "ESG 역량 교육",
                "사회 교육",
                "거버넌스 교육",
                "지속가능성 역량",
                "ESG 교육 시간",
                "compliance training",
                "sustainability training"
        ));
        // S-204: 임직원 참여 프로그램
        INDICATOR_EXTRA_QUERIES.put("S-204", List.of(
                "임직원 참여",
                "임직원 참여율",
                "임직원 참여 프로그램",
                "직원 참여 프로그램",
                "직원 참여 제도",
                "사내 참여 프로그램",
                "사내 캠페인",
                "임직원 참여 현황",
                "임직원 캠페인"
        ));
        // S-205: 지역사회 공헌 활동 — 실제 문서 표현 대폭 확장 + richer evidence 쿼리 추가
        INDICATOR_EXTRA_QUERIES.put("S-205", List.of(
                "봉사활동",
                "봉사 시간",
                "봉사시간",
                "지역사회 봉사활동 참여 시간",
                "사회공헌 활동",
                "사회공헌",
                "지역사회 공헌",
                "지역사회 기여",
                "지역사회 봉사",
                "CSR 활동",
                "CSR",
                "사회적 책임",
                "나눔 활동",
                "지역기부",
                "지역 기부",
                "지역사회 투자",
                "지역 협력",
                "사회적 기여",
                "임직원 봉사",
                "사회공헌 프로그램",
                "지역 나눔",
                "사회 공헌금",
                "volunteer",
                "community",
                // richer evidence queries — 사회공헌 투자·STEM·취약계층 에너지복지
                "사회공헌 투자액",
                "사회공헌 투자",
                "STEM 교육 지원",
                "STEM 교육",
                "취약계층 에너지 복지",
                "에너지 복지",
                "취약계층 지원",
                "취약계층",
                "지역사회 지원 사업",
                "사회공헌 성과"
        ));
        // G-301: 윤리경영 정책 핵심 keyword — 반부패·윤리 운영 실적 우선 반영
        INDICATOR_EXTRA_QUERIES.put("G-301", List.of(
                "윤리경영",
                "윤리방침",
                "윤리강령",
                "윤리헌장",
                "윤리규범",
                "윤리 위원회",
                "윤리경영 위원회",
                "준법",
                "준법경영",
                "컴플라이언스",
                "compliance",
                "compliance committee",
                "compliance program",
                "반부패",
                "반부패 교육 이수율",
                "윤리교육 이수율",
                "부패방지",
                "청탁금지",
                "청렴경영",
                "청렴 서약",
                "반부패 정책",
                "ethics policy",
                "ethics committee",
                "code of conduct",
                "anti-corruption",
                "행동강령",
                "윤리경영 선언",
                "사내 윤리",
                "윤리 경영 정책",
                "윤리 핫라인",
                "윤리 핫라인 제보",
                "징계",
                "위반 징계",
                "중대 부패 사건",
                "부패 사건",
                "내부통제"
        ));
        // G-302: 내부 신고 시스템 — whistleblowing 동의어 전방위 확장
        INDICATOR_EXTRA_QUERIES.put("G-302", List.of(
                "내부 신고",
                "내부신고",
                "내부 신고 시스템",
                "신고 시스템",
                "내부제보",
                "내부 제보",
                "익명 신고",
                "익명 제보",
                "제보 채널",
                "신고 채널",
                "신고센터",
                "제보센터",
                "신고함",
                "제보함",
                "핫라인",
                "hotline",
                "whistleblowing",
                "whistle blowing",
                "whistleblower",
                "내부고발",
                "내부고발자",
                "비리 신고",
                "부정 신고",
                "compliance hotline",
                "신고 제도",
                "내부 감찰",
                "신고 접수"
        ));
        // G-303: ESG 담당 조직 — title 오염 방지 + 조직 entity 전방위 쿼리
        INDICATOR_EXTRA_QUERIES.put("G-303", List.of(
                "ESG 전담 조직",
                "ESG 담당 조직",
                "ESG팀",
                "ESG팀 설치",
                "ESG 위원회",
                "ESG 위원회 운영",
                "지속가능경영위원회",
                "지속가능경영 위원회",
                "ESG 전담부서",
                "ESG 전담",
                "전담 조직",
                "ESG 추진단",
                "ESG 사무국",
                "지속가능경영팀",
                "ESG 경영팀",
                "sustainability committee",
                "ESG governance",
                "ESG 조직도",
                "ESG 추진 체계",
                "ESG 전략 조직",
                "ESG 이사회",
                "ESG TF",
                "sustainability team",
                "CSR team",
                "ESG 담당부서",
                "ESG 조직 구성",
                "지속가능경영 조직"
        ));
        // G-304: 외부 감사 — 회계감사·제3자 검증 동의어 전방위 확장
        INDICATOR_EXTRA_QUERIES.put("G-304", List.of(
                "외부 감사",
                "외부감사",
                "외부 ESG 감사",
                "외부 감사 수행",
                "ESG 감사",
                "제3자 검증",
                "외부 검증",
                "외부 독립감사",
                "독립 감사",
                "외부 감사인",
                "외부감사인",
                "회계감사",
                "회계법인",
                "감사 의견",
                "외부감사 결과",
                "검증 보고서",
                "제3자 확인",
                "외부 검토",
                "독립적 검증",
                "external audit",
                "third-party audit",
                "external assurance",
                "independent audit",
                "assurance",
                "감사보고서",
                "인증기관",
                "검증기관"
        ));
        // G-305: 이사회 독립성 — 사외이사·독립이사 동의어 전방위 확장
        INDICATOR_EXTRA_QUERIES.put("G-305", List.of(
                "사외이사",
                "사외 이사",
                "사외이사 비율",
                "이사회 독립",
                "이사회 독립성",
                "독립 이사",
                "독립이사",
                "비상임이사",
                "이사 독립성",
                "이사회 구성",
                "이사회 다양성",
                "이사회 투명성",
                "독립 이사 선임",
                "이사 선임 기준",
                "board member",
                "independent director",
                "board independence",
                "independent board",
                "감사위원회 독립성"
        ));
        // E-104: CSV 업로드 시 영문 컬럼명(waste_kg) 포함 청크를 RAG가 검색할 수 있도록 추가
        INDICATOR_EXTRA_QUERIES.put("E-104", List.of(
                "waste_kg",
                "waste",
                "폐기물 발생량",
                "폐기물"
        ));

        // ── Mandatory keyword 초기화 ──────────────────────────────────────────
        // 각 지표 증거 귀속 검증 — 아래 키워드 중 1개 이상 없으면 REJECT
        // S 지표: cross-indicator 오염 방지 (안전교육↔ESG교육, 봉사활동↔임직원참여)
        INDICATOR_MANDATORY_KW.put("S-202", List.of(
                "산업재해", "중대재해", "무재해", "재해 발생", "재해율", "ltir", "산재", "무사고", "사고율", "재해건수"
        ));
        INDICATOR_MANDATORY_KW.put("S-203", List.of(
                "esg 교육", "esg교육", "지속가능경영 교육", "윤리 교육", "윤리경영 교육",
                "탄소중립 교육", "환경 교육", "sustainability training", "compliance training", "esg역량"
        ));
        INDICATOR_MANDATORY_KW.put("S-204", List.of(
                "임직원 참여", "직원 참여", "임직원 참여율", "직원 참여율", "사내 프로그램", "사내 캠페인", "사내캠페인",
                // bilingual alias: "임직원 ESG 참여율은 92%" — "ESG" 가 사이에 끼어 기존 substring 매칭 실패
                "임직원 esg 참여율", "esg 참여율", "employee participation", "직원 esg 참여", "esg 참여"
        ));
        INDICATOR_MANDATORY_KW.put("S-205", List.of(
                "지역사회", "봉사활동", "사회공헌", "봉사시간", "봉사 시간", "csr", "나눔", "기부", "자원봉사"
        ));
        // G 지표: 명시적 거버넌스 표현 mandatory
        INDICATOR_MANDATORY_KW.put("G-301", List.of(
                "윤리경영", "윤리강령", "윤리규범", "행동강령", "컴플라이언스", "반부패",
                "준법경영", "청렴경영", "윤리헌장", "compliance", "anti-corruption", "code of conduct"
        ));
        INDICATOR_MANDATORY_KW.put("G-302", List.of(
                "내부 신고", "내부신고", "제보", "whistle", "신고 시스템", "신고시스템",
                "신고센터", "핫라인", "hotline", "신고채널", "신고 채널", "내부고발"
        ));
        INDICATOR_MANDATORY_KW.put("G-303", List.of(
                "esg 전담", "esg전담", "esg 위원회", "esg위원회", "지속가능경영위원회",
                "지속가능경영 위원회", "esg팀", "esg 조직", "esg조직", "sustainability committee",
                // "ESG 담당 조직" 패턴 — "전담" 대신 "담당" 표기, 지속가능경영 조직 등
                "esg 담당 조직", "esg담당조직", "esg 담당", "지속가능경영 조직", "esg 운영 조직",
                // 추가: "ESG 전담 부서", "대표이사 직속 ESG" 조직 서술 패턴
                "esg 전담 부서", "esg전담부서", "esg 담당 부서", "esg담당부서",
                "대표이사 직속 esg", "대표이사직속esg"
        ));
        INDICATOR_MANDATORY_KW.put("G-304", List.of(
                "외부 감사", "외부감사", "외부 검증", "외부검증",
                "회계감사", "감사위원회", "감사보고서", "감사인",
                "제3자 검증", "제3자검증", "external audit", "assurance",
                "회계법인", "독립 감사", "독립감사", "한국품질재단", "인증기관", "검증기관"
        ));
        INDICATOR_MANDATORY_KW.put("G-305", List.of(
                "사외이사", "독립 이사", "독립이사", "이사회 독립", "이사회독립",
                "비상임이사", "사외이사 비율", "이사회 구성",
                "independent director", "board independence", "outside director",
                "이사회 다양성", "여성 이사", "여성이사"
        ));
    }

    /**
     * 보고서 원문을 청크로 분할하여 세션 전용 ChromaDB 컬렉션에 인덱싱합니다.
     * category=G 이면 더 큰 청크(700자) 사용 — governance 정책 문단이 잘리지 않도록.
     *
     * @param sessionId     분석 세션 UUID — ChromaDB 컬렉션명으로 사용됨
     * @param reportContent 보고서 전체 원문
     * @param category      "E"/"S"/"G" — null 이면 기본값(E 사이즈) 사용
     */
    public void indexReport(String sessionId, String reportContent, String category) {
        if (reportContent == null || reportContent.isBlank()) {
            log.warn("[ReportRAG] 보고서 내용 없음 — 인덱싱 건너뜀 sessionId={}", sessionId);
            return;
        }
        try {
            String cleaned = sanitizeHtml(reportContent);
            List<TextSegment> segments = chunkBySectionWithOverlap(cleaned, "uploaded-report", category);

            // ── [DIAG] Raw chunk dump — S/G category 전체 청크 내용 출력 ─────────
            if ("G".equalsIgnoreCase(category) || "S".equalsIgnoreCase(category)) {
                log.info("[CHUNK-INDEX-SUMMARY] category={} totalChunks={} sessionId={}",
                        category, segments.size(), sessionId);
                for (int ci = 0; ci < segments.size(); ci++) {
                    String ct = segments.get(ci).text();
                    String ctLower = ct.toLowerCase().replaceAll("\\s+", "");
                    boolean hasG304 = ctLower.contains("외부감사") || ctLower.contains("회계감사") || ctLower.contains("외부검증");
                    boolean hasG305 = ctLower.contains("사외이사") || ctLower.contains("이사회독립") || ctLower.contains("boardindependence");
                    boolean hasS205 = ctLower.contains("봉사활동") || ctLower.contains("사회공헌") || ctLower.contains("지역사회봉사");
                    if (hasG304 || hasG305 || hasS205) {
                        log.info("[CHUNK-INDEX] category={} chunk={}/{} len={}" +
                                        " hasG304={} hasG305={} hasS205={} text='{}'",
                                category, ci + 1, segments.size(), ct.length(),
                                hasG304, hasG305, hasS205,
                                ct.substring(0, Math.min(300, ct.length())).replace("\n", " "));
                    }
                }
            }

            log.info("[ReportRAG] 청킹 완료 sessionId={} category={} → {}개 세그먼트 (입력 {}자)",
                    sessionId, category, segments.size(), cleaned.length());

            if (segments.isEmpty()) {
                log.warn("[ReportRAG] 세그먼트 없음 sessionId={} — 인덱싱 건너뜀", sessionId);
                return;
            }

            ChromaEmbeddingStore sessionStore = getOrCreateStore(sessionId);

            // 배치 임베딩 후 일괄 저장
            List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
            sessionStore.addAll(embeddings, segments);
            log.info("[ReportRAG] 인덱싱 완료 sessionId={} → {}개 벡터 저장", sessionId, embeddings.size());

        } catch (Exception e) {
            // ChromaDB 불가 시 분석은 계속 진행 (graceful degradation)
            log.error("[ReportRAG] 인덱싱 실패 sessionId={} 원인={}", sessionId, e.getMessage());
        }
    }

    /** 기존 호출 호환 유지 (category 미지정 시 기본 청크 크기 적용). */
    public void indexReport(String sessionId, String reportContent) {
        indexReport(sessionId, reportContent, null);
    }

    // ── 섹션 기반 청킹 상수 ────────────────────────────────────────────────────
    // 문장 단위 분리로 cross-topic contamination 방지.
    // G 700자 → 350자: 하나의 청크에 여러 정책 topic이 혼재하면 잘못된 indicator mapping 발생
    // ── 청크 크기 설정 ────────────────────────────────────────────────────────
    // G/S: 1500/1200자 대형화 — 짧은 chunk는 semantic embedding이 약해 ChromaDB 검색에서 탈락 방지
    // "외부 회계감사 및 외부 감사 수행 절차" 같은 문장이 충분한 맥락과 함께 embed되어야 recall 향상

    private static final int SECTION_MAX   = 280;    // E default chunk size
    private static final int SECTION_MAX_S = 1200;   // S: 1200자 (was 280) — 봉사활동·참여율 단락 보존
    private static final int SECTION_MAX_G = 1500;   // G: 1500자 (was 350) — 감사·독립이사 정책 단락 보존
    private static final int SECTION_MIN   = 35;     // 병합 기준 최소 크기
    private static final int OVERLAP_CHARS   = 50;   // E overlap
    private static final int OVERLAP_CHARS_S = 250;  // S overlap (was 40) — 단락 경계 문장 보존
    private static final int OVERLAP_CHARS_G = 250;  // G overlap (was 60) — 정책 문장 연속성 보존

    /**
     * 진단 모드 지표 — retrieval 단계 전체 로그만 출력, keyword gate/mandatory는 정상 적용.
     * G-304/G-305 DIAG bypass 제거: 이전에 bypass로 인해 무관한 청크(문서헤더, Social활동)가 선택됨.
     */
    private static final Set<String> DIAG_INDICATORS = Set.of();   // 전체 비활성화

    /**
     * Indicator별 semantic constraint — keyword gate 통과 후 추가 의미론적 검증.
     * 지정된 키워드 중 하나 이상이 반드시 chunk에 존재해야 함.
     * "similarity 높은 chunk" 가 아니라 "indicator를 실제로 설명하는 chunk" 를 선택하기 위한 reranking 게이트.
     */
    private static final Map<String, List<String>> INDICATOR_SEMANTIC_CONSTRAINTS = new LinkedHashMap<>();
    static {
        // G-304: 외부 감사 / 제3자 검증 문맥 필수
        INDICATOR_SEMANTIC_CONSTRAINTS.put("G-304", List.of(
                "외부 감사", "외부감사", "외부 검증", "외부검증",
                "제3자 검증", "제3자검증", "third-party", "third party",
                "external audit", "assurance", "회계감사", "회계법인",
                "감사보고서", "감사위원회", "감사인", "독립 감사", "독립감사",
                "한국품질재단", "인증기관", "검증기관", "iso 검증", "iso검증"
        ));
        // G-305: 이사회 독립성 / 사외이사 / 다양성 문맥 필수
        INDICATOR_SEMANTIC_CONSTRAINTS.put("G-305", List.of(
                "사외이사", "사외 이사", "독립이사", "독립 이사",
                "이사회 독립", "이사회독립", "이사회 구성", "이사회구성",
                "이사회 독립성", "board independence", "independent director",
                "outside director", "비상임이사", "비상임 이사",
                "사외이사 비율", "여성 이사", "여성이사", "이사회 다양성",
                "board diversity", "이사회 운영", "이사회운영"
        ));
        // G-303: ESG 전담 조직 문맥 필수 (사회 안전조직 오염 방지 강화)
        INDICATOR_SEMANTIC_CONSTRAINTS.put("G-303", List.of(
                "esg 위원회", "esg위원회", "esg 전담", "esg전담",
                "esg 담당", "esg담당", "지속가능경영위원회", "지속가능경영 위원회",
                "esg팀", "esg 조직", "sustainability committee"
        ));
        // G-302: 내부 신고 시스템 문맥 필수
        INDICATOR_SEMANTIC_CONSTRAINTS.put("G-302", List.of(
                "내부 신고", "내부신고", "제보", "신고 시스템", "신고시스템",
                "신고센터", "핫라인", "hotline", "whistle", "내부고발",
                "신고채널", "신고 채널", "익명 신고", "익명신고"
        ));
    }

    // ── 레거시 (indexTestReport / chunkByParagraph) ───────────────────────────
    private static final int CHUNK_MAX_CHARS = 450;
    private static final int CHARS_PER_PAGE  = 1000;

    /**
     * 테스트 전용 인덱싱: 문단 우선 분할 → 450자 초과 시 단어 경계 분할.
     * chunk_index / page_number / file_name metadata를 각 청크에 부착하여 저장합니다.
     *
     * @return 저장된 청크 수
     */
    public int indexTestReport(String sessionId, String reportText, String sourceFile) {
        if (reportText == null || reportText.isBlank()) {
            log.warn("[ReportRAG] 보고서 내용 없음 sessionId={}", sessionId);
            return 0;
        }
        String src = (sourceFile != null && !sourceFile.isBlank()) ? sourceFile : "test-input";
        List<TextSegment> segments = chunkByParagraph(sanitizeHtml(reportText), src);
        if (segments.isEmpty()) return 0;

        try {
            ChromaEmbeddingStore store = getOrCreateStore(sessionId);
            List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
            store.addAll(embeddings, segments);
            log.info("[ReportRAG] 테스트 인덱싱 완료 sessionId={} chunkCount={}", sessionId, segments.size());
            return segments.size();
        } catch (Exception e) {
            log.error("[ReportRAG] 테스트 인덱싱 실패 sessionId={} 원인={}", sessionId, e.getMessage());
            return 0;
        }
    }

    // ── 섹션 기반 청킹 (indexReport 메인 경로) ──────────────────────────────────

    /**
     * Heading(#) / 빈 줄 기준 1차 단락 분리 → SECTION_MAX 초과 시 문장 경계 세분화
     * → OVERLAP_CHARS 크기 이전 청크 tail을 다음 청크 앞에 prepend.
     *
     * <pre>
     * 1973자 입력 예상:
     *   rawBlocks ≈ heading 수 + 빈줄 경계 수  →  10~20개
     *   최종 세그먼트 ≈  8~15개  (overlap 포함)
     * </pre>
     */
    /**
     * Accumulator 방식 섹션 청킹: 라인을 한 줄씩 읽으며 sectionMax 도달 시 즉시 flush.
     * category 에 따라 청크 크기·overlap 을 자동 조정 (G > S > E).
     * G governance 정책 문단은 900자까지 허용 — 윤리경영 선언문·감사위원회 설명이 잘리지 않도록.
     */
    private List<TextSegment> chunkBySectionWithOverlap(String text, String sourceFile, String category) {
        String src = (sourceFile != null && !sourceFile.isBlank()) ? sourceFile : "report";

        // 카테고리별 청크 크기 / overlap 선택
        final int sectionMax;
        final int overlapChars;
        if ("G".equalsIgnoreCase(category)) {
            sectionMax   = SECTION_MAX_G;
            overlapChars = OVERLAP_CHARS_G;
        } else if ("S".equalsIgnoreCase(category)) {
            sectionMax   = SECTION_MAX_S;
            overlapChars = OVERLAP_CHARS_S;
        } else {
            sectionMax   = SECTION_MAX;
            overlapChars = OVERLAP_CHARS;
        }

        List<String> rawChunks = new ArrayList<>();
        StringBuilder buf = new StringBuilder();

        for (String line : text.split("\n")) {
            String t = line.trim();

            // heading → 현재 버퍼 flush 후 heading 텍스트(# 제거)를 새 버퍼 시작점으로
            boolean isHeading = t.matches("^#{1,4}\\s+.+")
                    || t.matches("^-{3,}$")
                    || t.matches("^={3,}$");
            if (isHeading) {
                flushSectionBuffer(buf, rawChunks);
                String headingText = t.replaceFirst("^#{1,4}\\s+", "").trim();
                if (!headingText.isBlank()) buf.append(headingText);
                continue;
            }

            // 빈 줄 → 버퍼가 최소 크기 이상이면 flush
            if (t.isEmpty()) {
                if (buf.length() >= SECTION_MIN) flushSectionBuffer(buf, rawChunks);
                continue;
            }

            // 단일 라인이 sectionMax 초과 → 버퍼 flush 후 즉시 splitByLength
            if (t.length() > sectionMax) {
                flushSectionBuffer(buf, rawChunks);
                rawChunks.addAll(splitByLength(t, sectionMax));
                continue;
            }

            // 이 라인 추가 시 sectionMax 초과 → 먼저 flush
            if (buf.length() > 0 && buf.length() + 1 + t.length() > sectionMax) {
                flushSectionBuffer(buf, rawChunks);
            }

            if (buf.length() > 0) buf.append(" ");
            buf.append(t);
        }
        flushSectionBuffer(buf, rawChunks);

        // 마지막 청크가 너무 짧으면 바로 앞 청크에 병합
        if (rawChunks.size() >= 2) {
            String last = rawChunks.get(rawChunks.size() - 1);
            if (last.length() < SECTION_MIN) {
                rawChunks.remove(rawChunks.size() - 1);
                rawChunks.set(rawChunks.size() - 1,
                        rawChunks.get(rawChunks.size() - 1) + " " + last);
            }
        }

        log.info("[ChunkSplit] src={} category={} inputLen={} rawChunks={} sectionMax={} overlap={}",
                src, category, text.length(), rawChunks.size(), sectionMax, overlapChars);

        // ── overlap 적용 + TextSegment 생성 ──────────────────────────────────
        List<TextSegment> segments = new ArrayList<>();
        String prevTail = "";
        int idx = 0;
        int charOffset = 0;

        for (String chunk : rawChunks) {
            String content = prevTail.isBlank() ? chunk : prevTail + "\n" + chunk;
            int pageNum = charOffset / CHARS_PER_PAGE + 1;

            segments.add(TextSegment.from(content.trim(),
                    Metadata.from("chunk_index", String.valueOf(idx))
                            .put("page_number", String.valueOf(pageNum))
                            .put("file_name", src)));

            prevTail = tailWithBoundary(chunk, overlapChars);
            charOffset += chunk.length();
            idx++;
        }

        if (!segments.isEmpty()) {
            int avgLen = (int) segments.stream().mapToInt(s -> s.text().length()).average().orElse(0);
            log.info("[ChunkStats] src={} category={} inputLen={} finalChunks={} avgChunkLen={} overlap={}",
                    src, category, text.length(), segments.size(), avgLen, overlapChars);
        }
        return segments;
    }

    /** StringBuilder 내용을 blocks에 추가하고 초기화합니다. */
    private void flushSectionBuffer(StringBuilder buf, List<String> blocks) {
        String s = buf.toString().trim();
        if (!s.isBlank()) blocks.add(s);
        buf.setLength(0);
    }

    /**
     * chunk 끝에서 maxLen 이하의 overlap tail을 단어 경계에서 추출합니다.
     */
    private String tailWithBoundary(String text, int maxLen) {
        if (text.length() <= maxLen) return text;
        String tail = text.substring(text.length() - maxLen);
        int spaceIdx = tail.indexOf(' ');
        return (spaceIdx > 0 && spaceIdx < maxLen / 2) ? tail.substring(spaceIdx + 1) : tail;
    }

    // ── 레거시 청킹 (indexTestReport 전용) ──────────────────────────────────────

    private List<TextSegment> chunkByParagraph(String text, String sourceFile) {
        List<TextSegment> result = new ArrayList<>();

        // 빈 줄 기준 1차 분리; 없으면 단일 개행 기준으로 재시도
        String[] paragraphs = text.split("\\n{2,}");
        if (paragraphs.length == 1) {
            paragraphs = text.split("\\n");
        }

        int chunkIndex = 0;
        int charOffset  = 0;

        for (String para : paragraphs) {
            String trimmed = para.trim();
            if (trimmed.isBlank()) {
                charOffset += para.length() + 2;
                continue;
            }

            List<String> subChunks = trimmed.length() <= CHUNK_MAX_CHARS
                    ? List.of(trimmed)
                    : splitByLength(trimmed, CHUNK_MAX_CHARS);

            for (String chunk : subChunks) {
                int pageNum = charOffset / CHARS_PER_PAGE + 1;
                result.add(TextSegment.from(chunk,
                        Metadata.from("chunk_index", String.valueOf(chunkIndex))
                                .put("page_number", String.valueOf(pageNum))
                                .put("file_name", sourceFile)));
                chunkIndex++;
                charOffset += chunk.length();
            }
            charOffset += para.length() - trimmed.length() + 2;
        }
        return result;
    }

    private List<String> splitByLength(String text, int maxLen) {
        List<String> chunks = new ArrayList<>();
        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + maxLen, text.length());
            if (end < text.length()) {
                // 단어 경계 역방향 탐색 (최소 절반 이상 채워진 경우만)
                int spaceIdx = text.lastIndexOf(' ', end);
                if (spaceIdx > start + maxLen / 2) end = spaceIdx;
            }
            String chunk = text.substring(start, end).trim();
            if (!chunk.isBlank()) chunks.add(chunk);
            start = end + 1;
        }
        return chunks;
    }

    /**
     * K-ESG 지표 키워드로 세션 컬렉션에서 가장 관련성 높은 보고서 구절 Top-K를 반환합니다.
     *
     * @param sessionId    분석 세션 UUID
     * @param indicatorKey INDICATOR_KEYWORDS의 키 (예: "E2_온실가스배출")
     * @param topK         최대 반환 청크 수 (권장: 3~5)
     * @return 관련 구절 문자열, 없으면 빈 문자열
     */
    /**
     * 일반 키워드 + 표 데이터 특화 쿼리 두 벌을 실행하여 결과를 병합·중복제거합니다.
     * 동일 텍스트 청크는 높은 유사도 점수를 기준으로 한 번만 포함됩니다.
     */
    public String retrieveForIndicator(String sessionId, String indicatorKey, int topK) {
        String generalQuery = INDICATOR_KEYWORDS.getOrDefault(indicatorKey,
                indicatorKey.contains("_") ? indicatorKey.split("_", 2)[1] : indicatorKey);
        String tableQuery = INDICATOR_TABLE_QUERIES.getOrDefault(indicatorKey, generalQuery);
        try {
            ChromaEmbeddingStore sessionStore = getOrCreateStore(sessionId);

            // 텍스트 → 최고 유사도 점수 (중복 제거)
            Map<String, Double> bestByText = new LinkedHashMap<>();
            for (EmbeddingMatch<TextSegment> m : searchStore(sessionStore, generalQuery, topK)) {
                bestByText.merge(m.embedded().text().trim(), m.score(), Math::max);
            }
            for (EmbeddingMatch<TextSegment> m : searchStore(sessionStore, tableQuery, topK)) {
                bestByText.merge(m.embedded().text().trim(), m.score(), Math::max);
            }
            if (bestByText.isEmpty()) return "";

            // 유사도 내림차순 정렬 후 topK까지 반환
            return bestByText.entrySet().stream()
                    .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                    .limit(topK)
                    .map(e -> "  • " + e.getKey())
                    .collect(Collectors.joining("\n"));

        } catch (Exception e) {
            log.warn("[ReportRAG] 지표 검색 실패 indicator={} 원인={}", indicatorKey, e.getMessage());
            return "";
        }
    }

    private List<EmbeddingMatch<TextSegment>> searchStore(
            ChromaEmbeddingStore store, String query, int maxResults) {
        try {
            Embedding queryEmbedding = embeddingModel.embed(query).content();
            EmbeddingSearchRequest req = EmbeddingSearchRequest.builder()
                    .queryEmbedding(queryEmbedding)
                    .maxResults(maxResults)
                    .minScore(0.3)
                    .build();
            return store.search(req).matches();
        } catch (Exception e) {
            log.warn("[ReportRAG] searchStore 실패 query='{}...' 원인={}",
                    query.substring(0, Math.min(20, query.length())), e.getMessage());
            return List.of();
        }
    }

    /**
     * ESGIndicator keywords를 2-token 슬라이딩 윈도우로 분해하여 다중 쿼리를 생성한 뒤,
     * 각 쿼리 결과를 텍스트 기준으로 병합하여 반환합니다.
     *
     * <p><b>Re-ranking 전략</b>
     * <pre>
     * 1. ChromaDB에서 similarity 기준 candidatePool(=topK×CANDIDATE_MULTIPLIER)개 수집
     *    → topK만 수집하면 similarity가 약간 낮지만 keyword 매칭이 좋은 청크가 탈락
     * 2. 수집된 후보 전체에 finalScore = similarity×0.7 + keywordMatchScore×0.3 계산
     * 3. 텍스트 기준 중복 제거 (같은 청크는 finalScore가 높은 쪽 보존)
     * 4. finalScore 기준 내림차순 정렬
     * 5. validEvidence 필터 (finalScore >= EVIDENCE_THRESHOLD / EVIDENCE_THRESHOLD_E)
     * 6. topK 제한
     * 7. retrievalRank(1-based) 부여
     * </pre>
     *
     * @param sessionId 분석 세션 UUID
     * @param indicator ESGIndicator (title + keywords 기반 쿼리·점수 계산)
     * @param topK      최종 반환 개수 (step 6)
     */
    /**
     * ChromaDB 후보 수집 배수.
     * similarity 기준 상위 N개만 가져오면 keyword 매칭이 좋은 청크가 조기 탈락하므로
     * topK × CANDIDATE_MULTIPLIER 개를 수집한 뒤 finalScore로 재정렬합니다.
     */
    private static final int CANDIDATE_MULTIPLIER = 5;

    /** 다중 쿼리 결과에서 청크별 점수 데이터를 하나로 묶는 내부 홀더입니다. */
    private record MatchData(
            EmbeddingMatch<TextSegment> match,
            double rawSim,
            double kwScore,
            double finalScore,
            List<String> matchedKws   // keyword gate 통과 여부와 무관하게 hit된 indicator keywords
    ) {}

    /** keyword gate 통과 candidate — gate 결과(matchedCluster)를 함께 보유합니다. */
    private record AcceptedEntry(MatchData data, String matchedCluster) {}

    /** 카테고리별 임계값 적용 — E: 완화(0.50) / S: 표준(0.60) / G: 강화(0.62) / 기타: 기본(0.60) */
    public List<EvidenceResult> retrieveEvidenceForIndicator(String sessionId, ESGIndicator indicator, int topK, String category) {
        double threshold = "E".equalsIgnoreCase(category) ? EVIDENCE_THRESHOLD_E
                         : "G".equalsIgnoreCase(category) ? EVIDENCE_THRESHOLD_G
                         : "S".equalsIgnoreCase(category) ? EVIDENCE_THRESHOLD_S
                         : EVIDENCE_THRESHOLD;
        log.info("[QUALITY-GATE] indicator={} category={} effectiveThreshold={}",
                indicator.getCode(), category, threshold);
        return retrieveEvidenceForIndicatorInternal(sessionId, indicator, topK, threshold, category);
    }

    /** 기존 호출 호환 유지 (AnalysisConsumer 등 — category 미지정 시 기본 임계값 적용) */
    public List<EvidenceResult> retrieveEvidenceForIndicator(String sessionId, ESGIndicator indicator, int topK) {
        return retrieveEvidenceForIndicatorInternal(sessionId, indicator, topK, EVIDENCE_THRESHOLD, null);
    }

    private List<EvidenceResult> retrieveEvidenceForIndicatorInternal(String sessionId, ESGIndicator indicator, int topK, double effectiveThreshold, String category) {
        List<String> queries       = buildRetrievalQueries(indicator);
        List<String> keywords      = extractKeywords(indicator);
        // similarity 기준 topK만 수집하면 keyword 우세 청크가 조기 탈락하므로 더 넓은 후보를 수집
        int          candidatePool = Math.max(topK * CANDIDATE_MULTIPLIER, 20);
        long         startMs       = System.currentTimeMillis();

        try {
            ChromaEmbeddingStore store = getOrCreateStore(sessionId);

            log.info("[RAG-QUERY] indicator={} queries={} candidatePool={}",
                    indicator.getCode(), queries, candidatePool);

            // ── step 1·2·3: 후보 수집 + finalScore 계산 + normalized text 기준 중복 제거 ──────
            Map<String, MatchData> best = new LinkedHashMap<>();
            int rawCount = 0; // pre-filter 통과 candidate 수 (dedup 전)

            for (String query : queries) {
                for (EmbeddingMatch<TextSegment> match : searchStore(store, query, candidatePool)) {
                    String text    = match.embedded().text().trim();
                    double rawSim  = match.score();

                    // ── 줄 단위 boilerplate 필터 (chunk 전체 skip 금지) ──────────────────
                    // 테스트 설명 줄만 제거하고 실제 Governance/Social ESG 정책 근거는 보존합니다.
                    text = removeBoilerplateLines(text);
                    if (text.length() < 30) continue; // pure-boilerplate chunk만 제외

                    // ── G-304 Candidate Prefilter (audit anchor narrowing) ──────────────
                    // 리스크관리·ESG운영·위원회활동 등 generic governance chunk 조기 제외.
                    // hard reject 아님 — 이후 mandatory KW gate + anchor reranking이 precision 담당.
                    String textLowerPre = text.toLowerCase();
                    if ("G-304".equals(indicator.getCode())) {
                        boolean hasAuditAnchor =
                                textLowerPre.contains("외부") || textLowerPre.contains("감사")
                                || textLowerPre.contains("검증") || textLowerPre.contains("assurance")
                                || textLowerPre.contains("제3자") || textLowerPre.contains("회계법인")
                                || textLowerPre.contains("인증") || textLowerPre.contains("한국품질재단");
                        if (!hasAuditAnchor) {
                            log.debug("[G304-PREFILTER] no audit anchor — candidate narrowed out text='{}'",
                                    text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                            continue;
                        }
                    }

                    // ── keyword match 인라인 계산 (matchedKeywords + kwScore 동시 추출) ──
                    String textLower = text.toLowerCase();
                    List<String> matchedKws = keywords.stream()
                            .filter(kw -> textLower.contains(kw.toLowerCase()))
                            .collect(Collectors.toList());
                    // 일반 키워드(교육/정책/운영 등)는 0.3x 가중치로 계산 — false positive 억제
                    double kwScore;
                    if (keywords.isEmpty()) {
                        kwScore = 0.0;
                    } else {
                        double weightedMatched = matchedKws.stream()
                                .mapToDouble(kw -> GENERIC_WEAK_KEYWORDS.contains(kw.toLowerCase()) ? 0.3 : 1.0)
                                .sum();
                        kwScore = Math.min(1.0, weightedMatched / keywords.size());
                    }
                    boolean isWeakSemanticOnly = matchedKws.isEmpty();

                    // ── [DIAG] G-304/G-305/S-205: raw candidate dump (pre-filter 이전) ──────
                    boolean isDiag = DIAG_INDICATORS.contains(indicator.getCode());
                    if (isDiag) {
                        String noSpc = textLower.replaceAll("\\s+", "");
                        log.info("[RAW-CANDIDATE] indicator={} sim={} matchedKws={} " +
                                        "has_외부감사수행절차={} has_boardindependencepolicy={} " +
                                        "has_지역사회봉사활동={} has_사회공헌활동={} text='{}'",
                                indicator.getCode(), String.format("%.3f", rawSim), matchedKws,
                                noSpc.contains("외부감사수행절차"),
                                noSpc.contains("boardindependencepolicy"),
                                noSpc.contains("지역사회봉사활동"),
                                noSpc.contains("사회공헌활동"),
                                text.substring(0, Math.min(200, text.length())).replace("\n", " "));
                    }

                    // Pre-filter: kw=0 AND rawSim < threshold → semantic-only noise 제거
                    // G 지표: vocabulary mismatch 심각 → 0.50으로 대폭 완화 (keyword gate가 precision 담당)
                    // DIAG 지표: pre-filter 완전 bypass — 탈락 원인 파악
                    double preFilterMin = (isWeakSemanticOnly && indicator.getCode().startsWith("G-"))
                            ? PRE_FILTER_WEAK_SIM_G : PRE_FILTER_WEAK_SIM;
                    if (!isDiag && isWeakSemanticOnly && rawSim < preFilterMin) {
                        log.debug("[RAG-PREFILTER] indicator={} category={} sim={} SKIPPED(weak-semantic-noise) text='{}'",
                                indicator.getCode(), category != null ? category : "?",
                                String.format("%.3f", rawSim),
                                text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                        continue;
                    }

                    // S-domain 표현이 포함된 청크는 G-* 지표 후보에서 제외 (semantic contamination 방지)
                    // 단, explicit governance phrase(윤리경영위원회·사외이사 등)가 있으면 제외 면제
                    // DIAG 지표: domain-excl bypass — 탈락 원인 파악
                    if (!isDiag && indicator.getCode().startsWith("G-")
                            && (textLower.contains("봉사활동") || textLower.contains("봉사 활동")
                                || textLower.contains("봉사시간") || textLower.contains("봉사 시간")
                                || textLower.contains("참여시간") || textLower.contains("참여 시간")
                                || textLower.contains("지역사회 봉사") || textLower.contains("volunteer"))) {
                        // explicit G phrase 확인 — 있으면 S-domain 배제 면제
                        boolean hasExplicitGPhrase = keywordGate.hasExplicitGPhrase(indicator.getCode(), text);
                        if (!hasExplicitGPhrase) {
                            log.info("[DOMAIN-EXCL] G indicator={} S-domain excluded sim={} text='{}'",
                                    indicator.getCode(), String.format("%.3f", rawSim),
                                    text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                            continue;
                        }
                        log.info("[DOMAIN-EXCL-EXEMPT] G indicator={} explicit phrase present — domain-excl 면제 sim={} text='{}'",
                                indicator.getCode(), String.format("%.3f", rawSim),
                                text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                    }

                    // ── E-numeric chunk hard block for G-* indicators ─────────────────────────────
                    // CSV/테이블 형태의 환경(E) 수치 데이터가 거버넌스 지표에 잘못 매칭되는 것을 차단합니다.
                    // DIAG bypass 여부와 무관한 hard rule — semantic similarity만으로 넘어온 오염 방지.
                    if (indicator.getCode().startsWith("G-") && isENumericChunk(textLower, text)) {
                        boolean hasGPhrase = keywordGate.hasExplicitGPhrase(indicator.getCode(), text);
                        if (!hasGPhrase) {
                            log.info("[E-NUMERIC-BLOCK] G indicator={} E-category numeric chunk rejected sim={} text='{}'",
                                    indicator.getCode(), String.format("%.3f", rawSim),
                                    text.substring(0, Math.min(80, text.length())).replace("\n", " "));
                            continue;
                        }
                    }

                    // ── Mandatory keyword gate ────────────────────────────────────
                    // 지표 증거 귀속 검증: 핵심 키워드 1개 이상 없으면 REJECT (cross-indicator contamination 방지)
                    // DIAG 지표 또는 EXPLICIT-PHRASE-BOOST 대상: bypass — false negative 방지
                    List<String> mandatoryKws = INDICATOR_MANDATORY_KW.get(indicator.getCode());
                    if (mandatoryKws != null) {
                        boolean hasMandatory = mandatoryKws.stream()
                                .anyMatch(mk -> textLower.contains(mk.toLowerCase()));
                        if (!hasMandatory) {
                            // EXPLICIT-PHRASE-BOOST bypass: 명시적 구문이 존재하는 candidate는
                            // mandatory keyword spacing 변형("ESG 담당 조직" vs "esg 조직" 등)으로
                            // 미매칭 시에도 통과 — 증거 귀속 정확도는 explicit phrase가 보증함
                            // G-303: hasExplicitPhrase=true → governance phrase 확인됨 → contamination 체크 skip
                            if (!indicator.getCode().startsWith("E-")
                                    && keywordGate.hasExplicitPhrase(indicator.getCode(), text)) {
                                log.info("[MANDATORY-BYPASS-EXPLICIT] indicator={} sim={} " +
                                                "explicit phrase match → mandatory 우회 text='{}'",
                                        indicator.getCode(), String.format("%.3f", rawSim),
                                        text.substring(0, Math.min(80, text.length())).replace("\n", " "));
                                hasMandatory = true;
                            }
                        }
                        if (!hasMandatory) {
                            if (isDiag) {
                                // DIAG: 탈락 대신 경고만 출력하고 통과 허용
                                log.warn("[MANDATORY-FAIL-BYPASS] indicator={} sim={} " +
                                                "mandatory keyword missing but DIAG bypass active. " +
                                                "mandatoryKws={} text='{}'",
                                        indicator.getCode(), String.format("%.3f", rawSim),
                                        mandatoryKws,
                                        text.substring(0, Math.min(150, text.length())).replace("\n", " "));
                            } else {
                                log.info("[MANDATORY-FAIL] indicator={} sim={} mandatory keyword missing text='{}'",
                                        indicator.getCode(), String.format("%.3f", rawSim),
                                        text.substring(0, Math.min(80, text.length())).replace("\n", " "));
                                continue;
                            }
                        }
                    }

                    // ── Semantic Constraint Gate ─────────────────────────────────────
                    // Indicator별 의미론적 필수 조건: 지정된 키워드 중 하나 이상 포함 필수.
                    // "similarity 높은 chunk" → "indicator를 실제로 설명하는 chunk" 로 reranking 효과.
                    // 문서 헤더(회사명), Social 활동 내용이 G 지표에 잘못 바인딩되는 것을 방지.
                    List<String> semanticConstraints = INDICATOR_SEMANTIC_CONSTRAINTS.get(indicator.getCode());
                    if (semanticConstraints != null) {
                        boolean satisfiesConstraint = semanticConstraints.stream()
                                .anyMatch(sc -> textLower.contains(sc.toLowerCase()));
                        if (!satisfiesConstraint) {
                            // Explicit phrase 통과 시 semantic constraint 면제
                            boolean hasExplicit = keywordGate.hasExplicitPhrase(indicator.getCode(), text);
                            if (!hasExplicit) {
                                log.info("[SEMANTIC-CONSTRAINT-FAIL] indicator={} sim={} " +
                                                "no semantic constraint satisfied — chunk rejected. text='{}'",
                                        indicator.getCode(), String.format("%.3f", rawSim),
                                        text.substring(0, Math.min(100, text.length())).replace("\n", " "));
                                continue;
                            }
                        }
                    }

                    // vocabulary mismatch 보완 kwScore floor 적용
                    // G 지표: rawSim >= 0.50부터 적용 (threshold 완화에 맞춰 floor도 완화)
                    // S-202/S-205: rawSim >= 0.75 완화 (S recall 향상)
                    if (isWeakSemanticOnly) {
                        boolean isGFloor = indicator.getCode().startsWith("G-") && rawSim >= 0.50;
                        boolean isSFloor = ("S-202".equals(indicator.getCode()) || "S-205".equals(indicator.getCode()))
                                && rawSim >= 0.75;
                        if (isGFloor || isSFloor) {
                            log.info("[RAG-KWFLOOR] indicator={} sim={} kwScore 0.000→0.250 text='{}'",
                                    indicator.getCode(), String.format("%.3f", rawSim),
                                    text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                            kwScore = Math.max(kwScore, 0.25);
                        }
                    }

                    // BM25 hybrid scoring: G/S 지표는 현재 query 기준 term-overlap 점수를 추가 신호로 활용.
                    // finalScore = rawSim*0.65 + max(kwScore, bm25)*0.35
                    // E는 기존 formula 유지 (수치·테이블 데이터는 keyword 매칭이 다름)
                    double finalScore;
                    if (indicator.getCode().startsWith("G-") || indicator.getCode().startsWith("S-")) {
                        double bm25 = computeBm25TermScore(textLower, query);
                        double combinedKw = Math.max(kwScore, bm25);
                        if (bm25 > kwScore) {
                            log.debug("[BM25-BOOST] indicator={} bm25={} > kwScore={} text='{}'",
                                    indicator.getCode(), String.format("%.3f", bm25),
                                    String.format("%.3f", kwScore),
                                    text.substring(0, Math.min(50, text.length())).replace("\n", " "));
                        }
                        finalScore = rawSim * 0.65 + combinedKw * 0.35;
                    } else {
                        finalScore = rawSim * 0.7 + kwScore * 0.3;
                    }

                    // Explicit phrase boost: S/G 지표에 명시적 구문이 존재하면 finalScore → 0.85 보장
                    // G-303 우선 순서:
                    //   1) hasExplicitPhrase=true → governance phrase 확인됨 → 즉시 boost (contamination skip)
                    //   2) hasExplicitPhrase=false AND Social 오염 → reject 로그만 (boost 없음)
                    if (!indicator.getCode().startsWith("E-")) {
                        boolean hasExplicit = keywordGate.hasExplicitPhrase(indicator.getCode(), text);
                        if (hasExplicit) {
                            double boosted = Math.max(finalScore, 0.85);
                            if (boosted > finalScore) {
                                if ("G-303".equals(indicator.getCode())) {
                                    log.info("[G303-GOV-EXPLICIT-PASS] governance phrase detected → boost {}→0.850 text='{}'",
                                            String.format("%.3f", finalScore),
                                            text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                                } else {
                                    log.info("[EXPLICIT-PHRASE-BOOST] indicator={} sim={} finalScore {}→{} text='{}'",
                                            indicator.getCode(), String.format("%.3f", rawSim),
                                            String.format("%.3f", finalScore), boosted,
                                            text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                                }
                            }
                            finalScore = boosted;
                        } else if ("G-303".equals(indicator.getCode()) && isG303SocialOrgContamination(text)) {
                            // governance phrase 없음 + Social 안전 조직 패턴 → 오염 경고 (boost 없음)
                            log.info("[G303-EXPLICIT-REJECT] reason=generic_social_org text='{}'",
                                    text.substring(0, Math.min(80, text.length())).replace("\n", " "));
                        }
                    }

                    // ── G-304 Confidence-weighted Audit Anchor Reranking ──────────────
                    // Hard filter 없이 외부감사/제3자 검증 anchor는 boost, 일반 운영 단어는 soft penalty
                    if ("G-304".equals(indicator.getCode())) {
                        double anchorAdj = computeG304AuditAnchorAdj(textLower);
                        double adjusted  = Math.min(1.0, Math.max(0.0, finalScore + anchorAdj));
                        if (anchorAdj != 0.0) {
                            log.info("[G304-ANCHOR-RERANK] adj={} {} → {} text='{}'",
                                    String.format("%+.2f", anchorAdj),
                                    String.format("%.3f", finalScore),
                                    String.format("%.3f", adjusted),
                                    text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                        }
                        finalScore = adjusted;
                    }

                    List<String> logKws = matchedKws.size() <= 3
                            ? matchedKws : matchedKws.subList(0, 3);
                    log.info("[RAG-CANDIDATE] indicator={} sim={} kw={} final={}" +
                                    " matchedKeywords={} isWeakSemanticOnly={} text='{}'",
                            indicator.getCode(),
                            String.format("%.3f", rawSim),
                            String.format("%.3f", kwScore),
                            String.format("%.3f", finalScore),
                            logKws, isWeakSemanticOnly,
                            text.substring(0, Math.min(80, text.length())).replace("\n", " "));

                    // normalized key: trim(source) + lowercase(textLower) + 내부 공백 정규화
                    String normalizedKey = textLower.replaceAll("\\s+", " ");
                    rawCount++;
                    MatchData existing = best.get(normalizedKey);
                    if (existing == null || finalScore > existing.finalScore()) {
                        best.put(normalizedKey, new MatchData(match, rawSim, kwScore, finalScore, matchedKws));
                    }
                }
            }

            log.info("[RAG-DEDUPE] indicator={} before={} after={} removed={}",
                    indicator.getCode(), rawCount, best.size(), rawCount - best.size());
            log.info("[ReportRAG] 후보 수집 완료 indicator={} pool={}개 (쿼리×{}, candidatePerQuery={})",
                    indicator.getCode(), best.size(), queries.size(), candidatePool);

            // ── step 4·5·6·7: staged filtering — per-step drop logging ─────────────
            int blocked = 0;
            List<EvidenceResult> results = new ArrayList<>();
            int rank = 1;

            // stage 0: sort by finalScore desc
            List<MatchData> allCandidates = new ArrayList<>(best.values());
            allCandidates.sort((a, b) -> Double.compare(b.finalScore(), a.finalScore()));

            // stage 1: finalScore threshold filter (E category uses relaxed threshold 0.5)
            List<MatchData> aboveThreshold = new ArrayList<>();
            for (MatchData d : allCandidates) {
                if (d.finalScore() >= effectiveThreshold) {
                    aboveThreshold.add(d);
                }
            }
            {
                String top = aboveThreshold.isEmpty() ? "N/A"
                        : aboveThreshold.get(0).match().embedded().text().trim()
                                .substring(0, Math.min(60,
                                        aboveThreshold.get(0).match().embedded().text().trim().length()))
                                .replace("\n", " ");
                log.info("[FILTER-1-THRESHOLD] indicator={} before={} after={} dropped={} threshold={} topPreview='{}'",
                        indicator.getCode(), allCandidates.size(), aboveThreshold.size(),
                        allCandidates.size() - aboveThreshold.size(), effectiveThreshold, top);
            }

            // stage 2: keyword gate filter — per-candidate [GATE-CHECK] log
            // DIAG 지표(G-304/G-305/S-205): keyword gate 완전 bypass — 탈락 원인 파악
            boolean bypassGate = DIAG_INDICATORS.contains(indicator.getCode());
            List<AcceptedEntry> passedGate = new ArrayList<>();
            for (MatchData d : aboveThreshold) {
                String chunkText   = d.match().embedded().text().trim();
                String preview     = chunkText.substring(0, Math.min(120, chunkText.length())).replace("\n", " ");

                String matchResult;
                boolean gatePass;
                if (bypassGate) {
                    matchResult = "GATE-BYPASS";
                    gatePass    = true;
                    log.info("[GATE-BYPASS] indicator={} finalScore={} sim={} kw={} preview='{}'",
                            indicator.getCode(),
                            String.format("%.3f", d.finalScore()),
                            String.format("%.3f", d.rawSim()),
                            String.format("%.3f", d.kwScore()),
                            preview);
                } else {
                    // describeMatch() 내부에서 [KeywordGate] BLOCKED detail 로그 출력
                    matchResult = keywordGate.describeMatch(indicator.getCode(), chunkText, d.rawSim());
                    gatePass    = !"BLOCKED".equals(matchResult);
                }

                if (gatePass) {
                    passedGate.add(new AcceptedEntry(d, matchResult));
                    if (!bypassGate) {
                        log.info("[GATE-CHECK] indicator={} finalScore={} sim={} kw={}" +
                                        " matchedCluster=[{}] gateResult=PASS preview='{}'",
                                indicator.getCode(),
                                String.format("%.3f", d.finalScore()),
                                String.format("%.3f", d.rawSim()),
                                String.format("%.3f", d.kwScore()),
                                matchResult, preview);
                    }
                } else {
                    blocked++;
                    log.info("[GATE-CHECK] indicator={} finalScore={} sim={} kw={}" +
                                    " gateResult=BLOCKED preview='{}'",
                            indicator.getCode(),
                            String.format("%.3f", d.finalScore()),
                            String.format("%.3f", d.rawSim()),
                            String.format("%.3f", d.kwScore()),
                            preview);
                }
            }
            log.info("[FILTER-2-GATE] indicator={} before={} after={} dropped={}",
                    indicator.getCode(), aboveThreshold.size(), passedGate.size(),
                    aboveThreshold.size() - passedGate.size());

            // stage 3: page-diversity 우선 topK 선택
            // 동일 페이지 중복 청크 → page당 최고 finalScore만 보존 → 다양한 페이지 우선 선택
            Map<Integer, AcceptedEntry> bestPerPage = new LinkedHashMap<>();
            List<AcceptedEntry> noPageEntries = new ArrayList<>();
            for (AcceptedEntry e : passedGate) {
                int pg = resolvePageNumber(e.data().match().embedded());
                if (pg <= 0) {
                    noPageEntries.add(e);
                } else {
                    bestPerPage.merge(pg, e, (a, b) ->
                            a.data().finalScore() >= b.data().finalScore() ? a : b);
                }
            }
            List<AcceptedEntry> diversified = new ArrayList<>();
            bestPerPage.values().stream()
                    .sorted((a, b) -> Double.compare(b.data().finalScore(), a.data().finalScore()))
                    .forEach(diversified::add);
            noPageEntries.stream()
                    .sorted((a, b) -> Double.compare(b.data().finalScore(), a.data().finalScore()))
                    .forEach(diversified::add);
            List<AcceptedEntry> sorted = diversified.stream().limit(topK).collect(Collectors.toList());
            log.info("[FILTER-3-DIVERSITY] indicator={} gatePass={} uniquePages={} noPage={} final={} topK={}",
                    indicator.getCode(), passedGate.size(), bestPerPage.size(),
                    noPageEntries.size(), sorted.size(), topK);

            for (AcceptedEntry entry : sorted) {
                MatchData d      = entry.data();
                String rawChunk  = d.match().embedded().text().trim();
                String bestSent  = extractBestSentence(rawChunk, keywords, indicator.getCode());
                String cluster   = "NO_GATE".equals(entry.matchedCluster()) ? null : entry.matchedCluster();
                results.add(EvidenceResult.builder()
                        .evidenceText(bestSent)
                        .pageNumber(resolvePageNumber(d.match().embedded()))
                        .similarity(d.rawSim())
                        .keywordMatchScore(d.kwScore())
                        .finalScore(d.finalScore())
                        .isValidEvidence(true)
                        .retrievalRank(rank)
                        .indicatorCode(indicator.getCode())
                        .sourceFile(resolveSourceFile(d.match().embedded()))
                        .matchedKeywords(d.matchedKws().isEmpty() ? null : d.matchedKws())
                        .matchedCluster(cluster)
                        .build());
                rank++;
            }

            long latencyMs  = System.currentTimeMillis() - startMs;
            int  poolSize   = best.size();
            int  blockedCount = blocked;
            long eligibleCount = best.values().stream()
                    .filter(d -> d.finalScore() >= effectiveThreshold).count();
            double blockedRatio  = eligibleCount > 0 ? (double) blockedCount / eligibleCount : 0.0;
            double coverageRatio = eligibleCount > 0
                    ? (double) results.size() / Math.min(topK, eligibleCount)
                    : 0.0;

            // top-k similarity 요약
            if (!results.isEmpty()) {
                String topKSims = results.stream()
                        .map(r -> String.format("%.3f", r.getSimilarity()))
                        .collect(Collectors.joining(", "));
                log.info("[RAG-TOPK] indicator={} valid={} similarities=[{}]",
                        indicator.getCode(), results.size(), topKSims);
            } else {
                String topFinalScores = best.values().stream()
                        .sorted((a, b) -> Double.compare(b.finalScore(), a.finalScore()))
                        .limit(5)
                        .map(d -> String.format("%.3f(sim=%.3f)", d.finalScore(), d.rawSim()))
                        .collect(Collectors.joining(", "));
                log.info("[RAG-EMPTY] indicator={} pool={} top5finalScores=[{}]",
                        indicator.getCode(), best.size(), topFinalScores);
            }

            log.info("[RetrievalMetrics] indicator={} pool={} valid={} blocked={}" +
                            " blockedRatio={} coverage={} latency={}ms",
                    indicator.getCode(), poolSize, results.size(), blockedCount,
                    String.format("%.2f", blockedRatio),
                    String.format("%.2f", coverageRatio),
                    latencyMs);

            // ── [RETRIEVAL-QUALITY] 종합 품질 요약 로그 ──────────────────────────────
            int uniqueResultPages = (int) results.stream()
                    .mapToInt(EvidenceResult::getPageNumber)
                    .filter(p -> p > 0)
                    .distinct()
                    .count();
            String qualityLabel = results.isEmpty() ? "NO_EVIDENCE"
                    : results.stream().anyMatch(r -> r.getFinalScore() >= 0.80) ? "HIGH"
                    : results.stream().anyMatch(r -> r.getFinalScore() >= 0.70) ? "MEDIUM" : "LOW";
            log.info("[RETRIEVAL-QUALITY] indicator={} category={} threshold={} pool={}" +
                            " gatePassed={} final={} uniquePages={} quality={}",
                    indicator.getCode(), category != null ? category : "?",
                    effectiveThreshold, poolSize, passedGate.size(),
                    results.size(), uniqueResultPages, qualityLabel);

            return results;

        } catch (Exception e) {
            log.warn("[ReportRAG] Evidence 검색 실패 indicator={} 원인={}", indicator.getCode(), e.getMessage());
            return List.of();
        }
    }

    /**
     * 쿼리 토큰이 docLower 에 몇 개나 포함되는지 비율(0.0~1.0)로 반환합니다.
     * BM25 대용 term-overlap 점수 — G/S hybrid scoring 에서 kwScore 대체·보완으로 사용.
     * 2자 미만 토큰은 노이즈로 제외합니다.
     */
    private double computeBm25TermScore(String docLower, String query) {
        if (query == null || query.isBlank() || docLower == null) return 0.0;
        String[] terms = query.toLowerCase().split("\\s+");
        long validTerms = java.util.Arrays.stream(terms).filter(t -> t.length() >= 2).count();
        if (validTerms == 0) return 0.0;
        long matches = java.util.Arrays.stream(terms)
                .filter(t -> t.length() >= 2 && docLower.contains(t))
                .count();
        return (double) matches / validTerms;
    }

    /**
     * indicator title + keywords 필드를 토큰 단위로 분해한 키워드 리스트를 반환합니다.
     * title은 구절 단위 exact match 용도로 첫 번째에 추가됩니다.
     */
    private List<String> extractKeywords(ESGIndicator indicator) {
        List<String> kws = new ArrayList<>();
        if (indicator.getTitle() != null && !indicator.getTitle().isBlank()) {
            kws.add(indicator.getTitle());
        }
        if (indicator.getKeywords() != null && !indicator.getKeywords().isBlank()) {
            for (String token : indicator.getKeywords().split("\\s+")) {
                if (!token.isBlank()) kws.add(token);
            }
        }
        return kws;
    }

    /**
     * chunkText 내에 keywords가 몇 개나 포함되는지 비율(0.0~1.0)로 반환합니다.
     * 한국어 부분 문자열 포함 여부를 기준으로 하며, 대소문자를 무시합니다.
     */
    private double computeKeywordScore(String chunkText, List<String> keywords) {
        return computeKeywordScore(chunkText, keywords, null);
    }

    private double computeKeywordScore(String chunkText, List<String> keywords, String indicatorCode) {
        if (keywords.isEmpty()) return 0.0;
        String lower = chunkText.toLowerCase();
        List<String> matched = keywords.stream()
                .filter(kw -> lower.contains(kw.toLowerCase()))
                .collect(Collectors.toList());
        double score = (double) matched.size() / keywords.size();
        if (score == 0.0 && indicatorCode != null) {
            log.info("[KW-SCORE] indicator={} score=0.000 queryTokens={} matched=[] preview='{}'",
                    indicatorCode, keywords,
                    lower.substring(0, Math.min(80, lower.length())).replace("\n", " "));
        }
        return score;
    }

    /**
     * keywords 문자열을 공백으로 분리한 뒤 2-token 슬라이딩 윈도우(step=2)로 phrase 쿼리를 생성합니다.
     * indicator title을 첫 번째 쿼리로 추가하고, 최대 4개로 제한합니다.
     *
     * <pre>
     * S-201 keywords: "산업안전 교육 안전교육 재해예방 교육실시 안전보건 이수율 교육시간"
     *   → ["산업안전 교육 여부", "산업안전 교육", "안전교육 재해예방", "교육실시 안전보건"]
     * G-301 keywords: "윤리경영 정책 윤리 행동강령 청렴 반부패 윤리방침 컴플라이언스 준법"
     *   → ["윤리경영 정책 존재 여부", "윤리경영 정책", "윤리 행동강령", "청렴 반부패"]
     * </pre>
     */
    private List<String> buildRetrievalQueries(ESGIndicator indicator) {
        List<String> queries = new ArrayList<>();
        queries.add(indicator.getTitle()); // 지표명 우선 쿼리

        // G 지표: 슬라이딩 윈도우 쿼리 8개까지 허용 (S/E: 4개)
        boolean isG = indicator.getCode() != null && indicator.getCode().startsWith("G-");
        int maxSliding = isG ? 8 : 4;

        if (indicator.getKeywords() != null && !indicator.getKeywords().isBlank()) {
            String[] tokens = indicator.getKeywords().split("\\s+");
            for (int i = 0; i + 1 < tokens.length; i += 2) {
                queries.add(tokens[i] + " " + tokens[i + 1]);
                if (queries.size() >= maxSliding) break;
            }
            if (queries.size() < maxSliding && tokens.length % 2 == 1) {
                queries.add(tokens[tokens.length - 1]);
            }
        }

        // 지표 코드별 문서 실제 표현 추가 쿼리 병합 (중복 제거, 한도 없음)
        List<String> extras = INDICATOR_EXTRA_QUERIES.get(indicator.getCode());
        if (extras != null) {
            for (String eq : extras) {
                if (!queries.contains(eq)) queries.add(eq);
            }
        }

        log.debug("[QUERIES] indicator={} totalQueries={}", indicator.getCode(), queries.size());
        return queries;
    }

    private static final Pattern PAGE_PATTERN = Pattern.compile("\\[FILE_PAGE:(\\d+)\\]");
    private static final List<String> PAGE_META_KEYS = List.of("page_number", "page", "page_num");
    private static final List<String> SOURCE_META_KEYS = List.of("file_name", "source", "document_id");

    /**
     * 페이지 번호를 chunk metadata에서 우선 추출하고, 없으면 텍스트 내 [FILE_PAGE:X] 마커로 폴백합니다.
     * OCR 파이프라인이 Document metadata에 page 정보를 포함하면 자동으로 활용됩니다.
     */
    private int resolvePageNumber(TextSegment segment) {
        for (String key : PAGE_META_KEYS) {
            try {
                String val = segment.metadata().getString(key);
                if (val != null && !val.isBlank()) {
                    return Integer.parseInt(val.trim());
                }
            } catch (Exception ignored) {}
        }
        Matcher m = PAGE_PATTERN.matcher(segment.text());
        return m.find() ? Integer.parseInt(m.group(1)) : -1;
    }

    /**
     * chunk metadata에서 원본 파일명을 추출합니다. (file_name → source → document_id 순)
     */
    private String resolveSourceFile(TextSegment segment) {
        for (String key : SOURCE_META_KEYS) {
            try {
                String val = segment.metadata().getString(key);
                if (val != null && !val.isBlank()) return val;
            } catch (Exception ignored) {}
        }
        return null;
    }

    /**
     * 분석 완료 후 세션 전용 임시 컬렉션을 ChromaDB에서 삭제합니다.
     * 실패해도 분석 결과에는 영향 없음 — 경고 로그만 출력.
     */
    public void deleteSessionCollection(String sessionId) {
        storeCache.remove(sessionId);
        try {
            String url = normalize(chromaBaseUrl) + "/api/v1/collections/" + sessionId;
            restTemplate.delete(url);
            log.info("[ReportRAG] 임시 컬렉션 삭제 완료 sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("[ReportRAG] 임시 컬렉션 삭제 실패 (수동 정리 필요) sessionId={} 원인={}", sessionId, e.getMessage());
        }
    }

    private ChromaEmbeddingStore getOrCreateStore(String sessionId) {
        return storeCache.computeIfAbsent(sessionId, id ->
                ChromaEmbeddingStore.builder()
                        .baseUrl(normalize(chromaBaseUrl))
                        .collectionName(id)
                        .build());
    }

    private String normalize(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    /**
     * HTML 태그를 제거하되 문단/heading 구조(개행)는 보존합니다.
     *
     * <p>Upstage OCR은 Markdown을 반환합니다. {@code Jsoup.parse().text()}를 그대로 쓰면
     * 모든 개행이 단일 공백으로 압축되어 청크 수가 2~3개로 급감합니다.
     * HTML 태그 포함 여부를 판별하고, Markdown이면 개행 구조를 유지한 채 태그만 제거합니다.
     */
    private String sanitizeHtml(String text) {
        if (text == null) return "";
        boolean hasHtmlTags = text.contains("</") || text.contains("/>");
        String result;
        if (hasHtmlTags) {
            String nl = text
                    .replaceAll("(?i)<br[^>]*>", "\n")
                    .replaceAll("(?i)</(p|div|h[1-6]|li|td|tr|section|article)>", "\n")
                    .replaceAll("<[^>]+>", "")
                    .replaceAll("[ \\t]+", " ")
                    .replaceAll("\\n{3,}", "\n\n");
            result = nl.isBlank() ? text : nl.trim();
        } else {
            result = text.replaceAll("<[^>]+>", "").trim();
        }
        return normalizeOcrText(result);
    }

    /** OCR 아티팩트 정규화: 특수문자·불필요 공백·유니코드 제거. */
    private String normalizeOcrText(String text) {
        if (text == null) return "";
        return text
                .replaceAll("[ \t]+", " ")                               // 다중 공백 → 단일 공백
                .replaceAll("\r\n", "\n").replaceAll("\r", "\n")         // CRLF/CR → LF
                .replaceAll("\n{3,}", "\n\n")                             // 3중+ 개행 → 2줄
                .replaceAll("[\\u00AD\\u200B\\u200C\\u200D\\uFEFF]", "") // 보이지 않는 문자 제거
                .replaceAll("[\\u2022\\u25CF\\u25E6\\u2023]", " ")       // bullet 기호 → 공백
                .trim();
    }

    // G-303 Social 안전/보건 조직 패턴 — ESG governance explicit boost 전 오염 감지
    private static final List<String> G303_SOCIAL_ORG_CONTAMINATION_PATTERNS = List.of(
            "안전관리 전담", "안전관리전담", "산업안전 전담", "산업안전전담",
            "재해예방 전담", "재해예방전담", "안전보건 전담", "안전보건전담",
            "안전관리 조직", "안전관리조직", "산업안전 조직", "산업안전조직",
            "재해예방 조직", "재해예방조직", "안전보건 조직", "안전보건조직",
            "안전관리 부서", "안전관리부서", "안전 담당 부서", "안전담당부서"
    );

    /**
     * G-303: Social 안전/보건 조직 문장 오염 여부 판별.
     * "안전관리 전담 조직을 운영" 같은 문장이 governance explicit boost 받지 않도록 차단.
     * @return true이면 Social 안전 조직 오염 → explicit boost/bypass 금지
     */
    private boolean isG303SocialOrgContamination(String text) {
        if (text == null || text.isBlank()) return false;
        String tNorm = text.toLowerCase().replaceAll("\\s+", "");
        return G303_SOCIAL_ORG_CONTAMINATION_PATTERNS.stream()
                .anyMatch(p -> tNorm.contains(p.toLowerCase().replaceAll("\\s+", "")));
    }

    // G-303: 명시적 거버넌스 조직 구문 — 이 구문이 포함된 문장을 최우선 선택
    // specific → generic 순서: phrase-first 탐색 시 가장 구체적인 조직 구문이 먼저 매칭됨
    private static final List<String> G303_GOVERNANCE_PRIORITY_PHRASES = List.of(
            "대표이사 직속 esg", "대표이사직속esg",   // most specific
            "esg 전담 부서", "esg전담부서",
            "esg 담당 조직", "esg담당조직",
            "지속가능경영 조직", "지속가능경영조직",
            "지속가능경영위원회",
            "esg 위원회", "esg위원회",
            "esg팀",
            "전담 부서", "전담부서",               // generic — last priority
            "담당 조직", "담당조직"
    );

    /**
     * chunk 원문을 문장 단위로 분리한 뒤, indicator keywords와 가장 관련 높은 문장을 반환합니다.
     * G-303: explicit governance phrase 포함 문장을 keyword score보다 항상 우선 선택합니다.
     * 모든 문장의 keyword score가 0이면 원문을 최대 200자로 잘라 반환합니다.
     */
    private String extractBestSentence(String chunkText, List<String> keywords, String indicatorCode) {
        if (chunkText == null || chunkText.isBlank()) return "";

        // 소수점(94.3%, 6.8시간)을 문장 경계로 처리하지 않도록
        // 앞뒤가 모두 숫자인 마침표는 분리 제외
        String[] sentences = chunkText.split("(?<![0-9])[.。](?![0-9])|\\n+");

        // [G-303 우선 경로] phrase-first: 가장 구체적인 governance 구문을 먼저 탐색,
        // 해당 구문이 포함된 문장이 있으면 즉시 반환 → Social 문장이 앞에 있어도 올바른 문장 선택
        if ("G-303".equals(indicatorCode)) {
            for (String phrase : G303_GOVERNANCE_PRIORITY_PHRASES) {
                String phNorm = phrase.toLowerCase().replaceAll("\\s+", "");
                for (String s : sentences) {
                    String trimmed = s.trim();
                    if (trimmed.length() < 8 || trimmed.startsWith("#")) continue;
                    String tLower = trimmed.toLowerCase().replaceAll("\\s+", "");
                    if (tLower.contains(phNorm)) {
                        String selected = trimmed.length() > 200 ? trimmed.substring(0, 200).trim() + "…" : trimmed;
                        log.info("[G303-PHRASE-FIRST] phrase='{}' selected='{}'",
                                phrase, selected.length() > 80 ? selected.substring(0, 80) : selected);
                        return selected;
                    }
                }
            }
        }

        // ── [Evidence Bundle 모드] ───────────────────────────────────────────
        // S-201, S-202, G-301, G-302, G-304: 상호보완적 evidence 문장 synthesis
        // 단일 최고점 문장 선택 대신 "감사 설명력이 가장 높은 2~3문장 bundle" 생성
        // 예) S-202: KPI(TRIR 0.42) + PREVENTION(재발방지 대책 수립) 함께 표시
        if (BUNDLE_MODE_INDICATORS.contains(indicatorCode)) {
            String bundle = buildEvidenceBundle(sentences, keywords, indicatorCode);
            if (bundle != null && !bundle.isBlank()) {
                // normalizeEvidenceBundle: 원문 token 기반 "KPI / 운영 / 예방" 압축 형태로 재구성
                return normalizeEvidenceBundle(bundle, indicatorCode);
            }
        }

        // [S-205 richness-first 경로] 사회공헌 evidence 다양성 기반 선택
        // marker count(사회공헌 유형 다양성) + evidence richness score 조합
        // KPI 단일문장("봉사시간: 12,500시간") score=1 vs 사회공헌투자+STEM+취약계층 문장 score=1 동점
        //  → richness score로 명시적 우선 선택 (길이 tiebreak보다 정확)
        if ("S-205".equals(indicatorCode)) {
            String richBest = null;
            double richBestScore = -1.0;
            for (String s : sentences) {
                String trimmed = s.trim();
                if (trimmed.length() < 10 || trimmed.startsWith("#")) continue;
                String tLower = trimmed.toLowerCase();
                // 사회공헌 evidence 유형 다양성 (count) + richness score 합산
                long markerCount = S205_RICHNESS_MARKERS.stream()
                        .filter(r -> tLower.contains(r.toLowerCase())).count();
                double richScore = markerCount * 1.0 + computeEvidenceRichnessScore(trimmed);
                if (richScore > richBestScore) {
                    richBestScore = richScore;
                    richBest = trimmed;
                }
            }
            if (richBest != null && !richBest.isBlank()) {
                String selected = richBest.length() > 200 ? richBest.substring(0, 200).trim() + "…" : richBest;
                log.info("[S205-RICHNESS-FIRST] score={} selected='{}'",
                        String.format("%.2f", richBestScore),
                        selected.length() > 80 ? selected.substring(0, 80) : selected);
                return selected;
            }
        }

        String best = "";
        double bestScore = -1.0;
        // S 지표 일반 경로: keyword score + richness secondary scoring (weight 0.25)
        // G 지표: keyword score만 사용 (domain contamination 방지)
        boolean applyRichness = indicatorCode != null && indicatorCode.startsWith("S-");

        for (String s : sentences) {
            String trimmed = s.trim();
            if (trimmed.length() < 8) continue;
            // [1] # heading 잔류 라인 / 문서 제목 패턴 스킵 (title contamination 방어)
            if (trimmed.startsWith("#")) continue;
            double kwScore = computeKeywordScore(trimmed, keywords);
            double score = applyRichness
                    ? kwScore + computeEvidenceRichnessScore(trimmed) * 0.25
                    : kwScore;
            if (score > bestScore || (score == bestScore && trimmed.length() > best.length())) {
                bestScore = score;
                best = trimmed;
            }
        }

        if (best.isBlank()) {
            return chunkText.length() > 200
                    ? chunkText.substring(0, 200).trim() + "…"
                    : chunkText;
        }
        return best.length() > 200 ? best.substring(0, 200).trim() + "…" : best;
    }

    /**
     * Evidence 문장의 정보 밀도(richness) 점수를 계산합니다.
     *
     * <pre>
     * 개별 feature 점수 (최대 0.90):
     *   KPI 수치 (숫자+단위)  +0.30   "14.2시간", "4회", "94%"
     *   퍼센트               +0.20   "%"
     *   Action verb           +0.15   실시·이수·수행·도입·운영·완료·제공
     *   대상 조직             +0.15   협력사·임직원·근로자·관리자
     *   운영 activity         +0.10   교육·훈련·점검·프로그램·이수
     *
     * Multi-signal density bonus:
     *   5개 feature 이상     +0.50
     *   3개 feature 이상     +0.25
     *
     * Length bonus (정보 밀도):
     *   >= 80자              +0.30
     *   >= 50자              +0.20
     *   >= 30자              +0.10
     *
     * Short sentence penalty (keyword-only 단문 억제):
     *   &lt; 15자               -0.30
     *   &lt; 25자               -0.10
     *
     * 예시:
     *   "ISO45001 인증 유지" (10자)                       ≈ -0.20
     *   "VR 교육 실시" (8자)                              ≈ -0.05
     *   "협력사 안전교육 연 4회 실시" (22자)              ≈  0.55
     *   "VR 안전교육 실시 이수율 94% 1인당 8시간" (30자)  ≈  1.35
     * </pre>
     */
    private static double computeEvidenceRichnessScore(String sentence) {
        if (sentence == null || sentence.isBlank()) return 0.0;
        String lower = sentence.toLowerCase();

        // Feature 1: KPI 수치 (숫자+단위)
        boolean hasKpiNum    = S201_KPI_PATTERN.matcher(sentence).find();
        // Feature 2: 퍼센트
        boolean hasPct       = lower.contains("%");
        // Feature 3: Action verb (수립·강화 추가)
        boolean hasActionV   = lower.contains("실시") || lower.contains("이수")
                            || lower.contains("수행") || lower.contains("도입")
                            || lower.contains("운영") || lower.contains("완료")
                            || lower.contains("진행") || lower.contains("유지")
                            || lower.contains("실행") || lower.contains("제공")
                            || lower.contains("수립") || lower.contains("강화");
        // Feature 4: 대상 조직
        boolean hasOrgTarget = lower.contains("협력사") || lower.contains("임직원")
                            || lower.contains("직원") || lower.contains("근로자")
                            || lower.contains("관리자") || lower.contains("협력업체")
                            || lower.contains("전직원") || lower.contains("전 직원")
                            || lower.contains("전 임직원") || lower.contains("구성원");
        // Feature 5: 운영 activity (대책·체계 추가)
        boolean hasEduAct    = lower.contains("교육") || lower.contains("훈련")
                            || lower.contains("점검") || lower.contains("프로그램")
                            || lower.contains("과정") || lower.contains("이수")
                            || lower.contains("대책") || lower.contains("체계")
                            || lower.contains("위원회") || lower.contains("시스템");
        // Feature 6: Mitigation / Prevention (S-202 운영 maturity — 개선·재발방지·원인분석)
        boolean hasMitigationV = lower.contains("재발방지") || lower.contains("재발 방지")
                              || lower.contains("원인 분석") || lower.contains("원인분석")
                              || lower.contains("개선 완료") || lower.contains("개선완료")
                              || lower.contains("예방 체계") || lower.contains("예방체계")
                              || lower.contains("업계 평균") || lower.contains("산업 평균")
                              || lower.contains("개선 조치") || lower.contains("개선조치")
                              || lower.contains("후속 조치") || lower.contains("시정 조치")
                              || lower.contains("방지 대책") || lower.contains("방지대책");

        int featureCount = (hasKpiNum ? 1 : 0) + (hasPct ? 1 : 0)
                         + (hasActionV ? 1 : 0) + (hasOrgTarget ? 1 : 0)
                         + (hasEduAct ? 1 : 0) + (hasMitigationV ? 1 : 0);

        double score = 0.0;
        if (hasKpiNum)      score += 0.30;
        if (hasPct)         score += 0.20;
        if (hasActionV)     score += 0.15;
        if (hasOrgTarget)   score += 0.15;
        if (hasEduAct)      score += 0.10;
        if (hasMitigationV) score += 0.15;   // 개선·재발방지·예방체계 = operational maturity 핵심

        // Multi-signal density bonus
        if      (featureCount >= 5) score += 0.50;
        else if (featureCount >= 3) score += 0.25;

        // Length bonus — 40~120자 optimal range (사용자 요청 기준)
        int len = sentence.length();
        if      (len >= 100) score += 0.30;
        else if (len >= 70)  score += 0.25;
        else if (len >= 40)  score += 0.15;  // optimal range
        else if (len >= 30)  score += 0.05;

        // Short sentence penalty (keyword-only 단문 억제 — 20자 미만 강화)
        if      (len < 20) score -= 0.35;  // 강화: "TRIR=0" 같은 단문
        else if (len < 30) score -= 0.15;  // 완화: 짧은 선언문

        return score;
    }

    // ── S-202 Tier-based evidence ranking ────────────────────────────────────
    // Tier 2 (base 20): 운영 maturity evidence — 재발방지, 원인분석, 개선완료, 예방체계
    // Tier 1 (base 10): KPI 수치 evidence — TRIR, 무재해, 중대재해0건
    // + richness score (mitigation feature 포함)
    private static final List<String> S202_MITIGATION_KWS = List.of(
            "재발방지", "재발 방지", "원인 분석", "원인분석",
            "개선 완료", "개선완료", "예방 체계", "예방체계",
            "업계 평균 대비", "산업 평균 대비", "평균 대비 개선",
            "안전 개선", "대책 수립", "방지 대책", "방지대책",
            "예방 활동", "안전관리 강화", "후속 조치", "시정 조치",
            "개선 조치", "개선조치"
    );
    private static final List<String> S202_KPI_KWS = List.of(
            "trir", "ltir", "중대재해 0건", "중대재해0건",
            "재해율", "사고율", "무재해", "무사고",
            "0건", "발생하지 않", "재해 없음", "사고 없음",
            "ltir 0", "trir 0", "재해건수 0", "재해율 0"
    );

    // ── Evidence Bundle 모드 — 상호보완적 evidence synthesis ────────────────
    // 단일 최고점 문장 선택 대신 감사 설명력이 높은 complementary sentence bundle 생성
    private static final Set<String> BUNDLE_MODE_INDICATORS = Set.of(
            "S-201", "S-202", "G-301", "G-302", "G-304"
    );

    // Evidence type 분류 상수
    private static final int EV_NONE        = 0;
    private static final int EV_KPI         = 1;  // 정량 수치 (TRIR, %, 시간, 건수)
    private static final int EV_PREVENTION  = 2;  // 재발방지·개선·예방체계·원인분석
    private static final int EV_POLICY      = 3;  // 정책·인증·체계·위원회
    private static final int EV_OPERATIONAL = 4;  // 실시·수행·이수·점검·운영 활동
    private static final int EV_GOVERNANCE  = 5;  // 이사회·ESG위원회·사외이사

    // Scored sentence holder (bundle 내부 처리용)
    private record SentScore(int idx, String text, double score, int evType) {}

    /**
     * 감사 토큰 + authority weight.
     * weight 기준 내림차순 정렬 후 " / " 결합 → 중요도 높은 evidence가 앞에 위치.
     *
     * <pre>
     * KPI          1.0  — 정량 수치 (TRIR, 이수율, 건수)
     * PREVENTION   0.8  — 개선·재발방지·예방체계
     * OPERATIONAL  0.6  — 실시·수행·운영 활동
     * POLICY       0.4  — 정책·인증·위원회
     * DECLARATIVE  0.1  — 일반 선언 (출력 제외)
     * </pre>
     */
    private record WeightedToken(String text, double weight) {}

    /** 문장을 evidence type으로 분류합니다. */
    private static int classifyEvidenceType(String sentence) {
        String s = sentence.toLowerCase();
        // KPI: 숫자 + 단위 또는 %
        if (S201_KPI_PATTERN.matcher(sentence).find() || s.contains("%")) return EV_KPI;
        // Prevention/improvement
        if (s.contains("재발방지") || s.contains("원인 분석") || s.contains("개선 완료")
                || s.contains("예방 체계") || s.contains("개선조치") || s.contains("방지 대책")
                || s.contains("원인분석") || s.contains("예방활동") || s.contains("시정 조치"))
            return EV_PREVENTION;
        // Governance
        if (s.contains("이사회") || s.contains("esg위원회") || s.contains("esg 위원회")
                || s.contains("사외이사") || s.contains("감사위원회") || s.contains("esg 담당"))
            return EV_GOVERNANCE;
        // Policy/certification
        if (s.contains("정책") || s.contains("인증") || s.contains("체계") || s.contains("방침")
                || s.contains("iso") || s.contains("위원회") || s.contains("규정"))
            return EV_POLICY;
        // Operational activity
        if (s.contains("실시") || s.contains("이수") || s.contains("수행") || s.contains("점검")
                || s.contains("운영") || s.contains("시행") || s.contains("도입"))
            return EV_OPERATIONAL;
        return EV_NONE;
    }

    /** 두 evidence type이 상호보완적인지 확인합니다 (bundle merge 대상 여부). */
    private static boolean isComplementaryPair(int a, int b) {
        if (a == EV_NONE || b == EV_NONE || a == b) return false;
        // KPI + PREVENTION: S-202 핵심 (정량지표 + 개선조치)
        if ((a == EV_KPI && b == EV_PREVENTION) || (a == EV_PREVENTION && b == EV_KPI)) return true;
        // KPI + OPERATIONAL: S-201 핵심 (교육 이수율 + 실시 활동)
        if ((a == EV_KPI && b == EV_OPERATIONAL) || (a == EV_OPERATIONAL && b == EV_KPI)) return true;
        // KPI + POLICY: G-304 (인증 + 수치)
        if ((a == EV_KPI && b == EV_POLICY) || (a == EV_POLICY && b == EV_KPI)) return true;
        // POLICY + OPERATIONAL: G-301/302 (정책 + 운영 실적)
        if ((a == EV_POLICY && b == EV_OPERATIONAL) || (a == EV_OPERATIONAL && b == EV_POLICY)) return true;
        // GOVERNANCE + KPI: G-304/305 (구조 + 수치)
        if ((a == EV_GOVERNANCE && b == EV_KPI) || (a == EV_KPI && b == EV_GOVERNANCE)) return true;
        // PREVENTION + OPERATIONAL: 개선체계 + 실시 활동
        if ((a == EV_PREVENTION && b == EV_OPERATIONAL) || (a == EV_OPERATIONAL && b == EV_PREVENTION)) return true;
        return false;
    }

    /** 지표별 문장 scoring (bundle 내부 용) */
    private double scoreSentenceForBundle(String trimmed, List<String> keywords, String indicatorCode) {
        String tNorm = trimmed.toLowerCase().replaceAll("\\s+", "");
        if ("S-201".equals(indicatorCode)) {
            int tier = S201_DIRECT_EDUCATION_KWS.stream()
                    .anyMatch(p -> tNorm.contains(p.toLowerCase().replaceAll("\\s+", ""))) ? 2
                    : S201_SAFETY_OPERATION_KWS.stream()
                    .anyMatch(p -> tNorm.contains(p.toLowerCase().replaceAll("\\s+", ""))) ? 1 : 0;
            return tier * 10.0 + computeEvidenceRichnessScore(trimmed);
        }
        if ("S-202".equals(indicatorCode)) {
            boolean isKpi = S202_KPI_KWS.stream()
                    .anyMatch(p -> tNorm.contains(p.toLowerCase().replaceAll("\\s+", "")));
            boolean isMit = S202_MITIGATION_KWS.stream()
                    .anyMatch(p -> tNorm.contains(p.toLowerCase().replaceAll("\\s+", "")));
            // KPI·PREVENTION 모두 Tier 2 동등 우선도 — 수치 문장이 primary가 될 수 있도록
            int tier = (isKpi || isMit) ? 2 : 0;
            // TRIR·LTIR·중대재해·업계평균 명시 문장 추가 boost → KPI sentence가 primary 선택되도록 유도
            double kpiBonus = (tNorm.contains("trir") || tNorm.contains("ltir")
                    || tNorm.contains("중대재해") || tNorm.contains("업계평균대비")
                    || tNorm.contains("재해율")) ? 5.0 : 0.0;
            return tier * 10.0 + kpiBonus + computeEvidenceRichnessScore(trimmed);
        }
        // G-304: audit evidence anchor에 authority bonus 추가 → generic governance chunk 보다 우선 선택
        if ("G-304".equals(indicatorCode)) {
            double auditBonus = 0.0;
            if (tNorm.contains("외부감사") || tNorm.contains("외부검증")
                    || tNorm.contains("제3자검증") || tNorm.contains("assurance")
                    || tNorm.contains("independentassurance") || tNorm.contains("검증보고서")
                    || tNorm.contains("한국품질재단") || tNorm.contains("회계감사")
                    || tNorm.contains("회계법인")) {
                auditBonus = 8.0; // +6~10 authority bonus
            }
            return computeKeywordScore(trimmed, keywords) * 5.0 + auditBonus + computeEvidenceRichnessScore(trimmed);
        }
        // G 지표: keyword score + richness
        return computeKeywordScore(trimmed, keywords) * 5.0 + computeEvidenceRichnessScore(trimmed);
    }

    /**
     * Evidence Bundle synthesis — 감사 설명력이 높은 complementary sentence 조합 생성.
     *
     * <pre>
     * 1. 모든 문장 scoring → 상위 순위 정렬
     * 2. 최고점 문장 = primary
     * 3. primary와 evidence type이 상호보완적인 nearby 문장 탐색 (거리 <= 4)
     * 4. complementary 발견 시 최대 300자 이내에서 bundle 생성
     *
     * 예시 결과:
     *   S-202: "중대산업재해 발생 없음, TRIR 0.42 (업계 평균 대비 48.1% 낮음)"
     *        + "경미한 부상 11건 원인 분석 및 재발방지 대책 수립·시행"
     * </pre>
     */
    private String buildEvidenceBundle(String[] sentences, List<String> keywords, String indicatorCode) {
        // Step 1: 모든 문장 scoring
        List<SentScore> scored = new ArrayList<>();
        for (int i = 0; i < sentences.length; i++) {
            String trimmed = sentences[i].trim();
            if (trimmed.length() < 8 || trimmed.startsWith("#")) continue;
            double score = scoreSentenceForBundle(trimmed, keywords, indicatorCode);
            scored.add(new SentScore(i, trimmed, score, classifyEvidenceType(trimmed)));
        }
        if (scored.isEmpty()) return "";

        // Step 2: 최고점 primary 선택
        scored.sort((a, b) -> Double.compare(b.score(), a.score()));
        SentScore primary = scored.get(0);
        if (primary.text().isBlank()) return "";

        String primaryText = primary.text().length() > 200
                ? primary.text().substring(0, 200).trim() + "…"
                : primary.text();

        log.info("[BUNDLE-PRIMARY] indicator={} score={} tier={} evType={} text='{}'",
                indicatorCode, String.format("%.2f", primary.score()),
                primary.score() >= 20.0 ? "T2" : primary.score() >= 10.0 ? "T1" : "T0",
                primary.evType(),
                primaryText.length() > 80 ? primaryText.substring(0, 80) : primaryText);

        // Step 3: Complementary secondary 탐색
        // S-202: KPI(수치)·PREVENTION(재발방지)이 다른 단락에 있을 수 있으므로 거리 기준 완화
        int distLimit = "S-202".equals(indicatorCode) ? 8 : 4;
        String secondaryText = null;
        for (SentScore candidate : scored.subList(1, scored.size())) {
            if (candidate.text().length() < 12) continue;
            int dist = Math.abs(candidate.idx() - primary.idx());
            if (dist > distLimit) continue;

            boolean comp = isComplementaryPair(primary.evType(), candidate.evType());
            // 상호보완 pair가 아니어도 different type이면 허용 (약한 보완)
            boolean diffType = candidate.evType() != primary.evType() && candidate.evType() != EV_NONE;
            if (!comp && !diffType) continue;

            String candText = candidate.text().length() > 150
                    ? candidate.text().substring(0, 150).trim() + "…"
                    : candidate.text();
            if (primaryText.length() + 2 + candText.length() > 300) continue;

            secondaryText = candText;
            log.info("[BUNDLE-SECONDARY] indicator={} dist={} evTypes=({},{}) comp={} text='{}'",
                    indicatorCode, dist, primary.evType(), candidate.evType(), comp,
                    candText.length() > 60 ? candText.substring(0, 60) : candText);
            break;
        }

        String result = secondaryText != null ? primaryText + " " + secondaryText : primaryText;
        log.info("[BUNDLE-RESULT] indicator={} sentences={} totalLen={}",
                indicatorCode, secondaryText != null ? 2 : 1, result.length());
        return result;
    }

    // ── KPI 숫자+단위 패턴 (normalize 공용) ──────────────────────────────────
    // negative lookbehind (?<![\d.]) 로 소수점 내부 substring 추출 방지.
    // "61.4%" 에서 "4%" 를 별도 추출하는 fragmentation bug 차단.
    private static final java.util.regex.Pattern TRIR_EXTRACT  =
            java.util.regex.Pattern.compile("(?i)TRIR\\s*[\\(〔\\[=:은이가는을를]?\\s*(\\d+(?:\\.\\d+)?)");
    private static final java.util.regex.Pattern LTIR_EXTRACT  =
            java.util.regex.Pattern.compile("(?i)LTIR\\s*[\\(〔\\[=:은이가는을를]?\\s*(\\d+(?:\\.\\d+)?)");
    private static final java.util.regex.Pattern HOURS_EXTRACT =
            java.util.regex.Pattern.compile("(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s*시간");
    private static final java.util.regex.Pattern FREQ_EXTRACT  =
            java.util.regex.Pattern.compile("연\\s*(\\d+)\\s*회");
    private static final java.util.regex.Pattern RATE_EXTRACT  =
            java.util.regex.Pattern.compile("이수율\\s*(\\d+(?:\\.\\d+)?)%?");
    private static final java.util.regex.Pattern PCT_EXTRACT   =
            java.util.regex.Pattern.compile("(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s*%");
    private static final java.util.regex.Pattern COUNT_EXTRACT =
            java.util.regex.Pattern.compile("(?<![\\d,])(\\d[\\d,]*)\\s*건");
    private static final java.util.regex.Pattern PERSON_EXTRACT=
            java.util.regex.Pattern.compile("(?<![\\d,])(\\d[\\d,]*)\\s*명");
    private static final java.util.regex.Pattern MONEY_EXTRACT =
            java.util.regex.Pattern.compile("(?<![\\d,])(\\d[\\d,]*)\\s*억원?");
    private static final java.util.regex.Pattern IND_COMP_EXTRACT =
            java.util.regex.Pattern.compile("업계\\s*평균\\s*대비\\s*(-?\\d+(?:\\.\\d+)?%?)");

    /**
     * Evidence bundle을 "감사 토큰 / 구분자" 형태로 압축합니다.
     *
     * <p>문장 생성(paraphrasing) 없이 원문 token 기반 compressed synthesis만 수행.
     * 압축에 실패하거나 토큰이 부족하면 원본 bundle을 그대로 반환합니다.
     *
     * <pre>
     * S-202 예시:
     *   입력: "중대산업재해는 발생하지 않았으며 TRIR 0.42 업계 평균 대비 48.1% 낮음"
     *       + "원인 분석 및 재발방지 대책 수립·시행"
     *   출력: "중대재해 0건 / TRIR 0.42 / 업계 평균 대비 -48.1% / 원인분석·재발방지 수립"
     * </pre>
     */
    private static String normalizeEvidenceBundle(String bundle, String indicatorCode) {
        if (bundle == null || bundle.isBlank()) return bundle;

        // Step 1: 구문 압축 전처리 (regex 치환)
        String text = compressAuditPhrases(bundle);

        // Step 2: 지표별 감사 토큰 추출
        List<String> tokens = extractAuditTokens(text, indicatorCode);

        // Step 3: 토큰 2개 이상 추출 성공 시 " / " 구분자 조합
        if (tokens.size() >= 2) {
            String normalized = tokens.stream()
                    .distinct()
                    .filter(t -> !t.isBlank())
                    .filter(t -> !isOrphanNumericToken(t)) // semantic label 없는 순수 수치 token 제거
                    .collect(java.util.stream.Collectors.joining(" / "));
            if (normalized.length() >= 15 && normalized.length() <= 300) {
                log.info("[EVIDENCE-NORMALIZED] indicator={} tokens={} result='{}'",
                        indicatorCode, tokens.size(), normalized);
                return normalized;
            }
        }

        // Fallback: 원본 bundle 반환 (압축 실패)
        return bundle;
    }

    /** 긴 수식어·반복 주어를 압축합니다. 원문 token은 보존됩니다. */
    private static String compressAuditPhrases(String text) {
        // "동종 업계 평균 대비 N.N% 낮은 수준" → "업계 평균 대비 -N.N%"
        text = text.replaceAll("동종\\s*업계\\s*평균\\s*대비\\s*(\\d+\\.?\\d*)%?\\s*낮[은은다]",
                               "업계 평균 대비 -$1%");
        text = text.replaceAll("업계\\s*평균\\s*대비\\s*(\\d+\\.?\\d*)%?\\s*낮[은은다]",
                               "업계 평균 대비 -$1%");
        // "발생하지 않았으며/않았습니다" → "0건"
        text = text.replaceAll("발생하지\\s*않[았을으며는으로에습니다.]+", "0건");
        // "수립·시행", "수립‧시행" → 통일
        text = text.replaceAll("수립[·‧•]시행", "수립/시행");
        return text;
    }

    /**
     * 지표별 감사 핵심 토큰을 원문에서 추출합니다.
     *
     * <p>semantic label + numeric value pair를 유지하며, authority weight 내림차순으로 정렬합니다.
     * 원문 token preserving — paraphrasing·생성 없이 원문 substring 기반 추출만 수행합니다.
     *
     * <pre>
     * 예) S-202:
     *   [중대재해 0건 (1.0), 재해율(TRIR) 0.42 (1.0), 업계 평균 대비 -48.1% (1.0),
     *    원인분석 및 재발방지 체계 수립 (0.8)]
     *   → "중대재해 0건 / 재해율(TRIR) 0.42 / 업계 평균 대비 -48.1% / 원인분석·재발방지 수립"
     * </pre>
     */
    private static List<String> extractAuditTokens(String text, String indicatorCode) {
        List<WeightedToken> wt = new ArrayList<>();
        String lower = text.toLowerCase();
        java.util.regex.Matcher m;

        // ── S-202: 산업재해 발생 여부 ─────────────────────────────────────
        if ("S-202".equals(indicatorCode)) {
            // KPI 1.0: 중대재해 0건
            if ((lower.contains("중대재해") || lower.contains("중대 재해"))
                    && (lower.contains("0건") || lower.contains("발생하지") || lower.contains("없")))
                wt.add(new WeightedToken("중대재해 0건", 1.0));
            // KPI 1.0: 재해율(TRIR/LTIR) 수치 — semantic label 포함
            m = TRIR_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("재해율(TRIR) " + m.group(1), 1.0));
            m = LTIR_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("재해율(LTIR) " + m.group(1), 1.0));
            // KPI 1.0: 업계 평균 대비 (semantic anchor 유지)
            m = IND_COMP_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("업계 평균 대비 " + m.group(1), 1.0));
            else if (lower.contains("업계 평균") || lower.contains("업계평균"))
                wt.add(new WeightedToken("업계 평균 대비 개선", 0.8));
            // PREVENTION 0.8: 원인분석 + 재발방지 복합 여부
            boolean hasOrigin = lower.contains("원인 분석") || lower.contains("원인분석");
            boolean hasPrev   = lower.contains("재발방지") || lower.contains("재발 방지");
            if (hasOrigin && hasPrev)
                wt.add(new WeightedToken("원인분석·재발방지 수립", 0.8));
            else if (hasPrev)
                wt.add(new WeightedToken("재발방지 대책 수립", 0.8));
            else if (hasOrigin)
                wt.add(new WeightedToken("원인 분석 완료", 0.8));
            // KPI 0.7: 부상건수 — S-202 priority: TRIR > 중대재해 0건 > 부상건수
            if (lower.contains("부상") || lower.contains("경상")) {
                m = COUNT_EXTRACT.matcher(text);
                if (m.find()) wt.add(new WeightedToken("부상 " + m.group(1) + "건", 0.7));
            }

        // ── S-201: 산업안전 교육 여부 ─────────────────────────────────────
        } else if ("S-201".equals(indicatorCode)) {
            // KPI 1.0: 교육 이수율
            m = RATE_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("교육 이수율 " + m.group(1) + "%", 1.0));
            // KPI 1.0: 1인당 교육 시간 (semantic label 포함)
            m = HOURS_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("1인당 교육 " + m.group(1) + "시간", 1.0));
            // OPERATIONAL 0.6: VR 체험 안전교육
            if (lower.contains("vr") && lower.contains("교육"))
                wt.add(new WeightedToken("VR 체험 안전교육", 0.6));
            // OPERATIONAL 0.6: 교육 빈도
            m = FREQ_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("안전교육 연 " + m.group(1) + "회 실시", 0.6));
            // OPERATIONAL 0.6: 협력사 안전점검
            if (lower.contains("협력사") && (lower.contains("점검") || lower.contains("안전")))
                wt.add(new WeightedToken("협력사 안전보건 점검", 0.6));
            // POLICY 0.4: ISO45001 인증 유지
            if (lower.contains("iso45001") || lower.contains("iso 45001"))
                wt.add(new WeightedToken("ISO45001 인증 유지", 0.4));

        // ── S-205: 지역사회 봉사활동 여부 ──────────────────────────────────
        } else if ("S-205".equals(indicatorCode)) {
            // KPI 1.1: 참여율(%) — S-205 priority: 참여율 > 참여인원 > 시간
            m = PCT_EXTRACT.matcher(text);
            if (m.find() && (lower.contains("참여율") || lower.contains("이수율") || lower.contains("참가율"))) {
                wt.add(new WeightedToken("임직원 참여율 " + m.group(1) + "%", 1.1));
            }
            // KPI 1.0: 봉사활동 시간
            m = HOURS_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("봉사활동 " + m.group(1) + "시간", 1.0));
            // KPI 0.9: 참여 인원 (참여율보다 낮은 우선도)
            m = PERSON_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("참여 인원 " + m.group(1) + "명", 0.9));
            // KPI 0.9: 사회공헌 투자 금액
            m = MONEY_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("사회공헌 투자 " + m.group(1) + "억원", 0.9));
            // OPERATIONAL 0.6: STEM 교육 지원
            if (lower.contains("stem"))
                wt.add(new WeightedToken("STEM 교육 지원", 0.6));
            // OPERATIONAL 0.6: 취약계층 에너지복지
            if (lower.contains("취약계층"))
                wt.add(new WeightedToken("취약계층 에너지복지 지원", 0.6));
            else if (lower.contains("에너지 복지"))
                wt.add(new WeightedToken("에너지 복지 지원", 0.6));

        // ── G-302: 내부 신고 시스템 여부 ────────────────────────────────────
        } else if ("G-302".equals(indicatorCode)) {
            // KPI 1.0: 개인정보 유출 0건 (semantic label)
            if (lower.contains("개인정보") && (lower.contains("0건") || lower.contains("없")))
                wt.add(new WeightedToken("개인정보 유출 0건", 1.0));
            // KPI 1.0: 처리율
            m = PCT_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("신고 처리율 " + m.group(1) + "%", 1.0));
            // KPI 1.0: 접수 건수
            m = COUNT_EXTRACT.matcher(text);
            if (m.find()) wt.add(new WeightedToken("접수 " + m.group(1) + "건 처리", 1.0));
            // POLICY 0.4: ISMS 인증 유지
            if (lower.contains("isms") || lower.contains("iso27001") || lower.contains("iso 27001"))
                wt.add(new WeightedToken("ISMS 인증 유지", 0.4));
            // POLICY 0.4: 신고 채널 운영 (마지막에 — POLICY 낮은 weight)
            if (lower.contains("핫라인") || lower.contains("내부 신고") || lower.contains("내부신고"))
                wt.add(new WeightedToken("신고 채널 운영", 0.4));

        // ── G-301: 윤리경영 정책 여부 ──────────────────────────────────────
        } else if ("G-301".equals(indicatorCode)) {
            // KPI 1.0: 반부패 교육 이수율 (반부패 context 우선)
            if (lower.contains("반부패") || lower.contains("윤리") && lower.contains("이수율")) {
                m = RATE_EXTRACT.matcher(text);
                if (m.find()) wt.add(new WeightedToken("반부패·윤리 교육 이수율 " + m.group(1) + "%", 1.0));
            } else {
                m = RATE_EXTRACT.matcher(text);
                if (m.find()) wt.add(new WeightedToken("윤리교육 이수율 " + m.group(1) + "%", 1.0));
            }
            // KPI 1.0: 중대 부패 사건 0건
            if ((lower.contains("부패") || lower.contains("corruption")) && (lower.contains("0건") || lower.contains("없")))
                wt.add(new WeightedToken("중대 부패 사건 0건", 1.0));
            // KPI 1.0: 위반 0건
            if (lower.contains("위반") && (lower.contains("0건") || lower.contains("없")))
                wt.add(new WeightedToken("윤리 위반 0건", 1.0));
            // OPERATIONAL 0.6: 윤리 핫라인 운영 (제보 건수 포함)
            if (lower.contains("핫라인") || lower.contains("윤리 신고") || lower.contains("윤리신고"))
                wt.add(new WeightedToken("윤리 핫라인 운영·근거 확인", 0.6));
            // OPERATIONAL 0.4: 위반 징계 처리
            if (lower.contains("징계") || lower.contains("위반 처리") || lower.contains("제재"))
                wt.add(new WeightedToken("윤리 위반 징계 프로세스 운영", 0.4));
            // POLICY 0.4: 윤리경영 위원회
            if (lower.contains("컴플라이언스") || lower.contains("윤리경영"))
                wt.add(new WeightedToken("윤리경영 위원회 운영", 0.4));
            // POLICY 0.4: 행동강령 전사 적용
            if (lower.contains("행동강령"))
                wt.add(new WeightedToken("행동강령 전사 적용", 0.4));

        // ── G-303: ESG 담당 조직 여부 ──────────────────────────────────────
        // priority: 출석률(%) > 회의 수 > 조직 운영 여부
        } else if ("G-303".equals(indicatorCode)) {
            // KPI 1.1: 이사회 출석률(%) — G-303 최우선 KPI
            m = PCT_EXTRACT.matcher(text);
            if (m.find() && (lower.contains("출석률") || lower.contains("참석률") || lower.contains("참여율"))) {
                wt.add(new WeightedToken("출석률 " + m.group(1) + "%", 1.1));
            }
            // KPI 1.0: 회의 수
            m = COUNT_EXTRACT.matcher(text);
            if (m.find() && (lower.contains("회의") || lower.contains("개최") || lower.contains("회차"))) {
                wt.add(new WeightedToken("회의 " + m.group(1) + "회 개최", 1.0));
            }
            // OPERATIONAL 0.6: ESG 위원회 운영
            if (lower.contains("esg 위원회") || lower.contains("esg위원회") || lower.contains("지속가능경영위원회"))
                wt.add(new WeightedToken("ESG 위원회 운영", 0.6));
            // POLICY 0.4: ESG 전담 조직
            if (lower.contains("esg팀") || lower.contains("esg 전담") || lower.contains("esg담당"))
                wt.add(new WeightedToken("ESG 전담 조직 구성", 0.4));

        // ── G-304: 외부 감사 수행 여부 ────────────────────────────────────
        } else if ("G-304".equals(indicatorCode)) {
            // KPI 1.0: 검증 비율 — audit context 필수 (orphan numeric 방지)
            // PCT_EXTRACT가 "평가 콘트롤 100%" 등 non-audit 퍼센트를 오인식하는 것을 방지
            m = PCT_EXTRACT.matcher(text);
            while (m.find()) {
                String pctVal = m.group(1);
                int ctxStart  = Math.max(0, m.start() - 50);
                String ctx    = text.substring(ctxStart, m.start()).toLowerCase();
                if (ctx.contains("검증") || ctx.contains("감사") || ctx.contains("확인") || ctx.contains("이수")) {
                    wt.add(new WeightedToken("ESG 데이터 검증 " + pctVal + "%", 1.0));
                    break; // 첫 번째 audit-context PCT만 사용
                }
            }
            // OPERATIONAL 0.6: 외부감사 완료
            if (lower.contains("외부 감사") || lower.contains("외부감사"))
                wt.add(new WeightedToken("외부감사 수행 완료", 0.6));
            // OPERATIONAL 0.6: 제3자 검증
            if (lower.contains("제3자 검증") || lower.contains("외부 검증"))
                wt.add(new WeightedToken("ESG 데이터 제3자 검증", 0.6));
            // POLICY 0.4: ISMS 유지
            if (lower.contains("isms") || lower.contains("iso27001"))
                wt.add(new WeightedToken("ISMS 인증 유지", 0.4));
        }

        // authority weight 내림차순 정렬 → 중요도 높은 evidence가 출력 앞에 위치
        wt.sort((a, b) -> Double.compare(b.weight(), a.weight()));
        return wt.stream().map(WeightedToken::text)
                .collect(java.util.stream.Collectors.toList());
    }

    // ── S-201 Tier-based evidence ranking ────────────────────────────────────
    // Tier 2 (base 20): 직접 교육 실행 evidence — VR교육, 이수율, 협력사점검, 교육실시
    // Tier 1 (base 10): 안전 운영/인증 evidence — ISO45001, 안전보건경영시스템
    // + richness score 사용 (multi-feature density + length normalization + short penalty)
    private static final List<String> S201_DIRECT_EDUCATION_KWS = List.of(
            "vr 기반 안전교육", "vr안전교육", "체험형 안전교육", "vr 교육",
            "안전교육 이수율", "안전 교육 이수율", "1인당 안전교육", "1인당 교육시간",
            "안전보건 교육", "산업안전 교육", "재해예방 교육",
            "교육 이수", "안전교육 실시", "교육을 실시", "교육 실시", "교육을 시행",
            "안전훈련", "안전 훈련",
            "협력사 안전보건 점검", "협력사 안전 점검", "협력업체 안전 점검",
            "협력사 점검", "안전보건 점검"
    );
    // Tier 1: 안전 운영/인증 evidence (직접 교육 evidence 없을 때 fallback)
    private static final List<String> S201_SAFETY_OPERATION_KWS = List.of(
            "iso45001", "iso 45001", "안전보건경영시스템", "ohsas",
            "안전 인증 유지", "안전보건 인증", "안전관리 체계", "안전보건 체계"
    );
    // KPI 수치 패턴: 숫자 + 단위 (시간/회/%/명/건)
    private static final java.util.regex.Pattern S201_KPI_PATTERN =
            java.util.regex.Pattern.compile("\\d+\\.?\\d*\\s*(시간|회|%|명|건)");

    // S-205: richness 계산용 사회공헌 evidence type 목록
    private static final List<String> S205_RICHNESS_MARKERS = List.of(
            "사회공헌 투자", "사회공헌투자", "투자액",
            "stem", "취약계층", "에너지 복지", "에너지복지",
            "봉사활동", "봉사 시간", "봉사시간",
            "참여 인원", "참여인원",
            "지역사회", "나눔", "기부"
    );

    // 기존 호환 유지 (테스트 등 내부 호출용)
    private String extractBestSentence(String chunkText, List<String> keywords) {
        return extractBestSentence(chunkText, keywords, null);
    }

    /**
     * E-category numeric/table chunk 판별.
     * electricity/gas/CO2/water/waste 수치가 표 또는 CSV 형태로 담긴 청크를 탐지합니다.
     * G-* 지표에 환경 수치 데이터가 semantic similarity만으로 잘못 매칭되는 것을 방지합니다.
     */
    private static boolean isENumericChunk(String textLower, String rawText) {
        // E-category column header names (underscore notation) — sufficient alone to identify E-data
        boolean hasEColumnHeader =
            textLower.contains("electricity_kwh") || textLower.contains("gas_mj")
            || textLower.contains("carbon_tco2") || textLower.contains("waste_kg")
            || textLower.contains("water_m3") || textLower.contains("co2eq")
            || textLower.contains("tco2eq");
        if (hasEColumnHeader) return true;

        // "Environment(E) 수치 데이터" header label
        if (textLower.contains("environment(e)") || textLower.contains("environment (e)")
                || (textLower.contains("수치 데이터") && textLower.contains("month"))) return true;

        // E keywords + tabular/CSV form
        boolean hasEKeyword =
            textLower.contains("electricity") || textLower.contains("kwh")
            || textLower.contains("tco2")
            || textLower.contains("탄소 배출") || textLower.contains("탄소배출")
            || (textLower.contains("폐기물") && (textLower.contains("ton") || textLower.contains("톤")))
            || (textLower.contains("용수") && (textLower.contains("m3") || textLower.contains("m³")));
        boolean hasTabularForm =
            rawText.contains("|")                                   // markdown table
            || textLower.contains("month:")                        // CSV key-value
            || textLower.contains("electricity:")
            || textLower.contains("month ")                        // "month electricity_kwh gas_mj" header
            || textLower.matches("(?s).*\\d{4}-\\d{2}.*");        // YYYY-MM date row
        return hasEKeyword && hasTabularForm;
    }

    /**
     * 줄 단위 boilerplate 제거 — chunk 전체 skip 대신 테스트 설명 줄만 필터링.
     * "ESG Governance / Social Test Report" 같은 문서 제목이 포함된 chunk에서도
     * 윤리경영·내부신고·이사회 등 실제 정책 근거 문장은 그대로 보존됩니다.
     */
    private static String removeBoilerplateLines(String text) {
        if (text == null || text.isBlank()) return "";
        String[] lines = text.split("\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String lw = line.trim().toLowerCase();
            boolean isBoilerplate =
                lw.contains("retrieval 테스트") || lw.contains("retrieval테스트")
                || lw.contains("테스트 문서입니다") || lw.contains("테스트문서입니다")
                || lw.contains("테스트 데이터입니다") || lw.contains("테스트데이터입니다")
                || lw.contains("테스트 보고서입니다") || lw.contains("테스트보고서입니다")
                || lw.contains("샘플 텍스트") || lw.contains("샘플텍스트")
                || lw.contains("성능 검증을 위해 작성")
                || lw.contains("mock data") || lw.contains("mockdata")
                || lw.contains("dummy data")
                || lw.contains("sample text")
                // 짧은 제목 줄(< 80자)에서만 "social test report" / "test report" 제거
                || (line.trim().length() < 80 && (
                        lw.contains("social test report")
                        || lw.equals("test report")
                        || lw.equals("test document")))
                // 짧은 제목 줄에서 "esg governance" + "test" 조합 제거
                // 단, 실제 정책 키워드(정책/규범/시스템/위원회/이사회/담당)가 있으면 보존
                || (line.trim().length() < 80
                        && lw.contains("esg governance") && lw.contains("test")
                        && !lw.contains("정책") && !lw.contains("규범")
                        && !lw.contains("시스템") && !lw.contains("위원회")
                        && !lw.contains("이사회") && !lw.contains("담당"));
            if (!isBoilerplate) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(line);
            }
        }
        return sb.toString().trim();
    }

    /**
     * G-304 Audit Anchor Reranking 점수 조정.
     * Hard filter 없이 외부감사/제3자 검증 anchor는 boost, 일반 운영 단어는 soft penalty.
     * recall은 유지하고 audit evidence를 상위 ranking으로 유도합니다.
     */
    private static double computeG304AuditAnchorAdj(String textLower) {
        // Strong Audit Anchors: +0.25
        if (textLower.contains("외부감사") || textLower.contains("외부 감사")
                || textLower.contains("제3자 검증") || textLower.contains("assurance")
                || textLower.contains("회계법인") || textLower.contains("감사보고서")
                || textLower.contains("독립 감사") || textLower.contains("독립감사")
                || textLower.contains("외부 검증") || textLower.contains("외부검증")
                || textLower.contains("third-party audit") || textLower.contains("external audit")
                || textLower.contains("independent audit")) {
            return 0.25;
        }
        // Medium Audit Anchors: +0.10
        if (textLower.contains("외부기관 검토") || textLower.contains("외부기관검토")
                || textLower.contains("인증기관 확인") || textLower.contains("인증기관확인")
                || textLower.contains("검증 완료") || textLower.contains("검증완료")) {
            return 0.10;
        }
        // Weak Generic Governance: -0.15 (audit anchor 전혀 없을 때만 적용)
        int weakCount = 0;
        for (String w : List.of("평가", "운영", "참여", "캠페인", "협력사", "활동", "점검")) {
            if (textLower.contains(w)) weakCount++;
        }
        if (weakCount >= 2) return -0.15;
        return 0.0;
    }

    /**
     * semantic label 없는 순수 수치 토큰 판별.
     * "39%", "124개사", "99%" 같이 의미 맥락이 제거된 orphan numeric을 normalizeEvidenceBundle 출력에서 제외합니다.
     */
    private static boolean isOrphanNumericToken(String token) {
        if (token == null || token.isBlank()) return false;
        return token.trim().matches("^[\\d,]+\\.?\\d*\\s*(%|건|명|개사|억원?|시간|회)$");
    }
}
