package com.esg.analysis.service;

import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.domain.ESGIndicator;
import org.jsoup.Jsoup;
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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

    @Value("${chroma.base-url:http://127.0.0.1:8000}")
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

    /** G 카테고리 finalScore 최소 임계값 — 지배구조 지표는 더 엄격한 증빙 기준 요구. */
    public static final double EVIDENCE_THRESHOLD_G = 0.62;

    /**
     * Weak-semantic-only (keyword 0개) 후보 최소 rawSim 임계값.
     * 0.83 → 0.85 상향: keyword 불일치 + 낮은 sim 조합은 false positive 위험이 높음.
     */
    public static final double PRE_FILTER_WEAK_SIM = 0.85;

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
        // S-201: 산업안전 교육 핵심 keyword 직접 쿼리
        INDICATOR_EXTRA_QUERIES.put("S-201", List.of(
                "안전교육",
                "교육시간",
                "이수율",
                "재해예방 교육",
                "안전보건 교육"
        ));
        // S-202: 재해 zero-count / 부재 표현 — sliding-window에서 생성 불가
        INDICATOR_EXTRA_QUERIES.put("S-202", List.of(
                "산업재해 없음",
                "사고 없음",
                "무재해",
                "LTIR 0",
                "재해 발생 없음"
        ));
        // G-301: 윤리경영 정책 핵심 keyword 직접 쿼리
        INDICATOR_EXTRA_QUERIES.put("G-301", List.of(
                "윤리경영",
                "윤리방침",
                "준법",
                "컴플라이언스",
                "반부패"
        ));
        // G-302: 내부 신고 시스템 실제 문서 표현
        INDICATOR_EXTRA_QUERIES.put("G-302", List.of(
                "내부 신고 시스템 운영",
                "신고 시스템 운영",
                "내부제보 시스템",
                "whistleblowing",
                "compliance hotline"
        ));
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
            String cleaned = sanitizeHtml(reportContent);
            // 섹션(heading/단락) 기반 청킹 + overlap 적용
            // 1973자 → 목표 8~15 세그먼트 (SECTION_MAX=350, OVERLAP=60)
            List<TextSegment> segments = chunkBySectionWithOverlap(cleaned, "uploaded-report");
            log.info("[ReportRAG] 청킹 완료 sessionId={} → {}개 세그먼트 (입력 {}자)",
                    sessionId, segments.size(), cleaned.length());

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

    // ── 섹션 기반 청킹 상수 ────────────────────────────────────────────────────
    // target chunk: 140~180자 / overlap: 60자 / min: 40자
    // 1973자 입력 기준 10~14 세그먼트 목표

    private static final int SECTION_MAX   = 180;   // 청크 최대 크기 (350→180)
    private static final int SECTION_MIN   = 40;    // 병합 기준 최소 크기 (80→40)
    private static final int OVERLAP_CHARS = 60;    // 이전 청크 tail prepend 크기

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
     * Accumulator 방식 섹션 청킹: 라인을 한 줄씩 읽으며 SECTION_MAX 도달 시 즉시 flush.
     * Heading/빈 줄은 경계점, 단일 라인이 SECTION_MAX 초과하면 splitByLength 처리.
     *
     * <pre>
     * 1973자 기준:
     *   SECTION_MAX=180 → rawChunks ≈ 10~14 → finalChunks(with overlap) ≈ 10~14
     * </pre>
     */
    private List<TextSegment> chunkBySectionWithOverlap(String text, String sourceFile) {
        String src = (sourceFile != null && !sourceFile.isBlank()) ? sourceFile : "report";
        List<String> rawChunks = new ArrayList<>();
        StringBuilder buf = new StringBuilder();

        for (String line : text.split("\n")) {
            String t = line.trim();

            // heading → 현재 버퍼 flush 후 heading을 새 버퍼 시작점으로
            boolean isHeading = t.matches("^#{1,4}\\s+.+")
                    || t.matches("^-{3,}$")
                    || t.matches("^={3,}$");
            if (isHeading) {
                flushSectionBuffer(buf, rawChunks);
                buf.append(t);
                continue;
            }

            // 빈 줄 → 버퍼가 최소 크기 이상이면 flush
            if (t.isEmpty()) {
                if (buf.length() >= SECTION_MIN) flushSectionBuffer(buf, rawChunks);
                continue;
            }

            // 단일 라인이 SECTION_MAX 초과 → 버퍼 flush 후 즉시 splitByLength
            if (t.length() > SECTION_MAX) {
                flushSectionBuffer(buf, rawChunks);
                rawChunks.addAll(splitByLength(t, SECTION_MAX));
                continue;
            }

            // 이 라인 추가 시 SECTION_MAX 초과 → 먼저 flush
            if (buf.length() > 0 && buf.length() + 1 + t.length() > SECTION_MAX) {
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

        log.info("[ChunkSplit] src={} inputLen={} rawChunks={} sectionMax={}",
                src, text.length(), rawChunks.size(), SECTION_MAX);

        // ── overlap 적용 + TextSegment 생성 ──────────────────────────────────
        // page_number 는 String.valueOf 로 저장 — Metadata.getString() 이 String만 반환하기 때문
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

            prevTail = tailWithBoundary(chunk, OVERLAP_CHARS);
            charOffset += chunk.length();
            idx++;
        }

        if (!segments.isEmpty()) {
            int avgLen = (int) segments.stream().mapToInt(s -> s.text().length()).average().orElse(0);
            log.info("[ChunkStats] src={} inputLen={} finalChunks={} avgChunkLen={} overlap={}",
                    src, text.length(), segments.size(), avgLen, OVERLAP_CHARS);
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

                    // Pre-filter: kw=0 AND rawSim < PRE_FILTER_WEAK_SIM → semantic-only noise 제거 (0.85 강화 임계값)
                    if (isWeakSemanticOnly && rawSim < PRE_FILTER_WEAK_SIM) {
                        log.debug("[RAG-PREFILTER] indicator={} category={} sim={} SKIPPED(weak-semantic-noise) text='{}'",
                                indicator.getCode(), category != null ? category : "?",
                                String.format("%.3f", rawSim),
                                text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                        continue;
                    }

                    // sim >= 0.82 이고 kw=0 인 경우: vocabulary mismatch 보완 floor 적용 (S-202/G-302 한정)
                    if (isWeakSemanticOnly && rawSim >= 0.82
                            && ("S-202".equals(indicator.getCode()) || "G-302".equals(indicator.getCode()))) {
                        log.info("[RAG-KWFLOOR] indicator={} sim={} kwScore 0.000→0.150 text='{}'",
                                indicator.getCode(), String.format("%.3f", rawSim),
                                text.substring(0, Math.min(60, text.length())).replace("\n", " "));
                        kwScore = 0.15;
                    }
                    double finalScore = rawSim * 0.7 + kwScore * 0.3;

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
            List<AcceptedEntry> passedGate = new ArrayList<>();
            for (MatchData d : aboveThreshold) {
                String chunkText   = d.match().embedded().text().trim();
                String preview     = chunkText.substring(0, Math.min(80, chunkText.length())).replace("\n", " ");
                // describeMatch() 내부에서 [KeywordGate] BLOCKED detail 로그 출력
                String matchResult = keywordGate.describeMatch(indicator.getCode(), chunkText, d.rawSim());
                boolean gatePass   = !"BLOCKED".equals(matchResult);
                if (gatePass) {
                    passedGate.add(new AcceptedEntry(d, matchResult));
                    log.info("[GATE-CHECK] indicator={} finalScore={} sim={} kw={}" +
                                    " matchedCluster=[{}] gateResult=PASS preview='{}'",
                            indicator.getCode(),
                            String.format("%.3f", d.finalScore()),
                            String.format("%.3f", d.rawSim()),
                            String.format("%.3f", d.kwScore()),
                            matchResult, preview);
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
                String bestSent  = extractBestSentence(rawChunk, keywords);
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

        if (indicator.getKeywords() != null && !indicator.getKeywords().isBlank()) {
            String[] tokens = indicator.getKeywords().split("\\s+");
            for (int i = 0; i + 1 < tokens.length; i += 2) {
                queries.add(tokens[i] + " " + tokens[i + 1]);
                if (queries.size() >= 4) break;
            }
            if (queries.size() < 4 && tokens.length % 2 == 1) {
                queries.add(tokens[tokens.length - 1]);
            }
        }

        // 지표 코드별 문서 실제 표현 추가 쿼리 병합 (중복 제거)
        List<String> extras = INDICATOR_EXTRA_QUERIES.get(indicator.getCode());
        if (extras != null) {
            for (String eq : extras) {
                if (!queries.contains(eq)) queries.add(eq);
            }
        }
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
        if (hasHtmlTags) {
            // block-level 태그를 개행으로 치환한 뒤 나머지 태그 제거
            String nl = text
                    .replaceAll("(?i)<br[^>]*>", "\n")
                    .replaceAll("(?i)</(p|div|h[1-6]|li|td|tr|section|article)>", "\n")
                    .replaceAll("<[^>]+>", "")
                    .replaceAll("[ \\t]+", " ")
                    .replaceAll("\\n{3,}", "\n\n");
            return nl.isBlank() ? text : nl.trim();
        }
        // Markdown: stray HTML 태그만 제거, 개행 구조 보존
        return text.replaceAll("<[^>]+>", "").trim();
    }

    /**
     * chunk 원문을 문장 단위로 분리한 뒤, indicator keywords와 가장 관련 높은 문장을 반환합니다.
     * 모든 문장의 keyword score가 0이면 원문을 최대 200자로 잘라 반환합니다.
     */
    private String extractBestSentence(String chunkText, List<String> keywords) {
        if (chunkText == null || chunkText.isBlank()) return "";

        String[] sentences = chunkText.split("[.。\\n]+");
        String best = "";
        double bestScore = -1.0;

        for (String s : sentences) {
            String trimmed = s.trim();
            if (trimmed.length() < 8) continue;
            double score = computeKeywordScore(trimmed, keywords);
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
}
