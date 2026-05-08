package com.esg.analysis.service;

import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    @Value("${chroma.base-url:http://127.0.0.1:8000}")
    private String chromaBaseUrl;

    /**
     * K-ESG 18개 핵심 지표 코드 → 일반 벡터 검색 키워드 (개념·전략 중심).
     */
    public static final Map<String, String> INDICATOR_KEYWORDS = new LinkedHashMap<>();

    /**
     * K-ESG 18개 핵심 지표 코드 → 표(Table) 데이터 특화 쿼리 (수치·단위 중심).
     * 이중 쿼리 검색(Query Expansion)에 사용됩니다.
     */
    public static final Map<String, String> INDICATOR_TABLE_QUERIES = new LinkedHashMap<>();

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
    }

    /**
     * 보고서 원문을 700자 단위 청크로 분할하여 세션 전용 ChromaDB 컬렉션에 인덱싱합니다.
     *
     * @param sessionId   분석 세션 UUID — ChromaDB 컬렉션명으로 사용됨
     * @param reportContent 보고서 전체 원문
     */
    public void indexReport(String sessionId, String reportContent) {
        if (reportContent == null || reportContent.isBlank()) {
            log.warn("[ReportRAG] 보고서 내용 없음 — 인덱싱 건너뜀 sessionId={}", sessionId);
            return;
        }
        try {
            // 500~800자 단위 청킹, 150자 오버랩으로 문맥 연속성 보장
            DocumentSplitter splitter = DocumentSplitters.recursive(700, 150);
            List<TextSegment> segments = splitter.split(Document.from(reportContent));
            log.info("[ReportRAG] 청킹 완료 sessionId={} → {}개 세그먼트", sessionId, segments.size());

            ChromaEmbeddingStore sessionStore = ChromaEmbeddingStore.builder()
                    .baseUrl(normalize(chromaBaseUrl))
                    .collectionName(sessionId)
                    .build();

            // 배치 임베딩 후 일괄 저장
            List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
            sessionStore.addAll(embeddings, segments);
            log.info("[ReportRAG] 인덱싱 완료 sessionId={} → {}개 벡터 저장", sessionId, embeddings.size());

        } catch (Exception e) {
            // ChromaDB 불가 시 분석은 계속 진행 (graceful degradation)
            log.error("[ReportRAG] 인덱싱 실패 sessionId={} 원인={}", sessionId, e.getMessage());
        }
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
            ChromaEmbeddingStore sessionStore = ChromaEmbeddingStore.builder()
                    .baseUrl(normalize(chromaBaseUrl))
                    .collectionName(sessionId)
                    .build();

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
     * 분석 완료 후 세션 전용 임시 컬렉션을 ChromaDB에서 삭제합니다.
     * 실패해도 분석 결과에는 영향 없음 — 경고 로그만 출력.
     */
    public void deleteSessionCollection(String sessionId) {
        try {
            String url = normalize(chromaBaseUrl) + "/api/v1/collections/" + sessionId;
            restTemplate.delete(url);
            log.info("[ReportRAG] 임시 컬렉션 삭제 완료 sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("[ReportRAG] 임시 컬렉션 삭제 실패 (수동 정리 필요) sessionId={} 원인={}", sessionId, e.getMessage());
        }
    }

    private String normalize(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
