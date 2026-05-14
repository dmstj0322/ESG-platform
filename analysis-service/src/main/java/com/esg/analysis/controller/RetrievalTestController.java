package com.esg.analysis.controller;

import com.esg.analysis.dto.EvidenceResult;
import com.esg.analysis.service.ConfidenceService;
import com.esg.analysis.service.ReportRagService;
import com.esg.analysis.service.domain.ESGEvidenceMatch;
import com.esg.analysis.service.domain.ESGIndicator;
import com.esg.analysis.service.repository.ESGEvidenceMatchRepository;
import com.esg.analysis.service.repository.ESGIndicatorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Retrieval 파이프라인 단독 검증용 임시 테스트 API.
 *
 * <p>PDF 업로드 없이 텍스트를 직접 인덱싱하고, 지표별 Evidence 검색·저장·Confidence 계산 흐름을
 * POST/GET 만으로 완전히 검증합니다.
 * 운영 배포 전에 제거하거나 @Profile("local") 등으로 접근을 제한하세요.
 *
 * <pre>
 * 검증 순서:
 *   1. POST /test/retrieval/index              — 텍스트 청킹 & ChromaDB 인덱싱
 *   2. GET  /test/retrieval/{code}             — Retrieval → Confidence → DB 저장 (mock analysisId)
 *   3. GET  /test/retrieval/saved?indicatorCode={code} — 저장된 ESGEvidenceMatch 조회
 *   4. DELETE /test/retrieval/session          — ChromaDB + DB 테스트 데이터 전체 정리
 * </pre>
 *
 * <p>mock analysisId = {@code Math.abs(sessionId.hashCode())}
 * 동일 sessionId를 사용하면 항상 동일한 testAnalysisId가 부여됩니다.
 */
@Slf4j
@RestController
@RequestMapping("/test/retrieval")
@RequiredArgsConstructor
public class RetrievalTestController {

    private final ReportRagService          reportRagService;
    private final ESGIndicatorRepository    esgIndicatorRepository;
    private final ConfidenceService         confidenceService;
    private final ESGEvidenceMatchRepository evidenceMatchRepository;

    private static final String DEFAULT_SESSION = "test-session-default";

    // ──────────────────────────────────────────────────────────────────────────
    // 1. 인덱싱
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 보고서 원문(plain text)을 ChromaDB 테스트 세션에 인덱싱합니다.
     * 문단 단위(빈 줄 기준) 또는 최대 450자 기준으로 청킹하고,
     * chunk_index / page_number / file_name metadata를 각 청크에 부착합니다.
     *
     * <pre>
     * curl -X POST "http://localhost:8082/test/retrieval/index" \
     *      -H "Content-Type: text/plain;charset=UTF-8" \
     *      --data-binary @report_sample.txt
     *
     * # sourceFile·sessionId 직접 지정 시
     * curl -X POST "http://localhost:8082/test/retrieval/index?sessionId=my-session&sourceFile=samsung2023.txt" \
     *      -H "Content-Type: text/plain;charset=UTF-8" \
     *      -d "산업안전 교육을 연 2회 실시하였으며 재해율은 0.02%입니다."
     * </pre>
     */
    @PostMapping(value = "/index", consumes = "text/plain;charset=UTF-8")
    public ResponseEntity<Map<String, Object>> indexTestText(
            @RequestParam(defaultValue = DEFAULT_SESSION) String sessionId,
            @RequestParam(defaultValue = "test-input") String sourceFile,
            @RequestBody String reportText) {

        log.info("[TestRetrieval] 인덱싱 요청 sessionId={} sourceFile={} textLen={}",
                sessionId, sourceFile, reportText.length());
        int chunkCount = reportRagService.indexTestReport(sessionId, reportText, sourceFile);
        log.info("[TestRetrieval] 인덱싱 완료 sessionId={} chunkCount={}", sessionId, chunkCount);

        return ResponseEntity.ok(Map.of(
                "sessionId",      sessionId,
                "sourceFile",     sourceFile,
                "textLength",     reportText.length(),
                "chunkCount",     chunkCount,
                "testAnalysisId", toTestAnalysisId(sessionId),
                "status",         "indexed"
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Evidence Retrieval + Confidence 계산 + DB 저장
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 지정 ESGIndicator 코드에 대해 Evidence Retrieval → Confidence 계산 → DB 저장을 수행합니다.
     * 동일 sessionId + indicatorCode 조합을 재호출하면 이전 저장 결과를 교체합니다.
     *
     * <pre>
     * curl "http://localhost:8082/test/retrieval/S-201"
     * curl "http://localhost:8082/test/retrieval/G-301?sessionId=my-session&topK=3"
     *
     * # 저장 없이 Retrieval만 확인
     * curl "http://localhost:8082/test/retrieval/S-201?save=false"
     * </pre>
     *
     * @param indicatorCode ESGIndicator 코드 (예: S-201, G-301, E-103)
     * @param sessionId     인덱싱 때 사용한 sessionId (기본값: test-session-default)
     * @param topK          반환할 최대 Evidence 수 (기본값: 5)
     * @param save          DB 저장 여부 (기본값: true)
     */
    @Transactional
    @GetMapping("/{indicatorCode}")
    public ResponseEntity<?> retrieveEvidence(
            @PathVariable String indicatorCode,
            @RequestParam(defaultValue = DEFAULT_SESSION) String sessionId,
            @RequestParam(defaultValue = "5") int topK,
            @RequestParam(defaultValue = "true") boolean save) {

        log.info("[TestRetrieval] 검색 요청 indicator={} sessionId={} topK={} save={}",
                indicatorCode, sessionId, topK, save);

        Optional<ESGIndicator> opt = esgIndicatorRepository.findByCode(indicatorCode);
        if (opt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error",         "등록되지 않은 지표 코드",
                    "indicatorCode", indicatorCode,
                    "hint",          "E-101~E-105 / S-201~S-204 / G-301~G-303"
            ));
        }

        ESGIndicator indicator     = opt.get();
        long         testAnalysisId = toTestAnalysisId(sessionId);

        log.info("[TestRetrieval][진단] testAnalysisId={} (sessionId='{}')", testAnalysisId, sessionId);

        // 1. Retrieval
        List<EvidenceResult> results =
                reportRagService.retrieveEvidenceForIndicator(sessionId, indicator, topK);

        long validCount = results.stream().filter(EvidenceResult::isValidEvidence).count();
        log.info("[TestRetrieval][진단] Retrieval 완료 indicator={} 전체={}건 valid(≥0.6)={}건",
                indicatorCode, results.size(), validCount);

        if (results.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "indicatorCode",  indicatorCode,
                    "sessionId",      sessionId,
                    "testAnalysisId", testAnalysisId,
                    "results",        List.of(),
                    "message",        "Evidence 없음 — 먼저 POST /test/retrieval/index 로 텍스트를 인덱싱하세요."
            ));
        }

        // 2. Confidence 계산
        int confidence = confidenceService.calculate(indicator, results);
        log.info("[TestRetrieval][진단] Confidence 계산 완료 indicator={} confidence={}",
                indicatorCode, confidence);

        // 3. DB 저장 (save=true, 기본값)
        int savedCount = 0;
        if (save) {
            log.info("[TestRetrieval][진단] 저장 시작 — delete 기존 레코드 analysisId={} indicatorCode={}",
                    testAnalysisId, indicatorCode);
            evidenceMatchRepository.deleteByAnalysisIdAndIndicatorCode(testAnalysisId, indicatorCode);

            List<ESGEvidenceMatch> matches = new ArrayList<>();
            for (EvidenceResult ev : results) {
                log.info("[TestRetrieval][진단] 저장 대상[rank={}] finalScore={} sim={} kw={} indicatorCode='{}' text='{}'",
                        ev.getRetrievalRank(),
                        String.format("%.3f", ev.getFinalScore()),
                        String.format("%.3f", ev.getSimilarity()),
                        String.format("%.3f", ev.getKeywordMatchScore()),
                        ev.getIndicatorCode(),
                        ev.getEvidenceText().substring(0, Math.min(40, ev.getEvidenceText().length())));
                matches.add(ESGEvidenceMatch.from(testAnalysisId, ev, confidence / 100.0));
            }

            log.info("[TestRetrieval][진단] saveAllAndFlush 호출 analysisId={} count={}건",
                    testAnalysisId, matches.size());
            evidenceMatchRepository.saveAllAndFlush(matches);
            savedCount = matches.size();
            log.info("[TestRetrieval][진단] Evidence DB 저장 완료 indicator={} analysisId={} savedCount={}",
                    indicatorCode, testAnalysisId, savedCount);
        } else {
            log.info("[TestRetrieval][진단] save=false — DB 저장 건너뜀");
        }

        return ResponseEntity.ok(Map.of(
                "indicatorCode",  indicatorCode,
                "sessionId",      sessionId,
                "testAnalysisId", testAnalysisId,
                "confidence",     confidence,
                "savedCount",     savedCount,
                "results",        results
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. 저장된 Evidence 조회
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * DB에 저장된 ESGEvidenceMatch 레코드를 지표 코드 기준으로 조회합니다.
     * PathVariable 방식은 /{indicatorCode} 핸들러와 경로 충돌이 발생하므로
     * RequestParam 방식을 사용합니다.
     *
     * <pre>
     * # 지표별 조회
     * curl "http://localhost:8082/test/retrieval/saved?indicatorCode=S-201"
     * curl "http://localhost:8082/test/retrieval/saved?indicatorCode=S-201&sessionId=my-session"
     *
     * # 세션 전체 조회 (indicatorCode 생략)
     * curl "http://localhost:8082/test/retrieval/saved"
     * curl "http://localhost:8082/test/retrieval/saved?sessionId=my-session"
     * </pre>
     */
    @GetMapping("/saved")
    public ResponseEntity<Map<String, Object>> getSavedEvidence(
            @RequestParam(required = false) String indicatorCode,
            @RequestParam(defaultValue = DEFAULT_SESSION) String sessionId) {

        long testAnalysisId = toTestAnalysisId(sessionId);

        List<ESGEvidenceMatch> saved;
        if (indicatorCode != null && !indicatorCode.isBlank()) {
            saved = evidenceMatchRepository.findByAnalysisIdAndIndicatorCode(testAnalysisId, indicatorCode);
            log.info("[TestRetrieval] 저장 조회(지표별) indicator={} sessionId={} count={}",
                    indicatorCode, sessionId, saved.size());
        } else {
            saved = evidenceMatchRepository.findByAnalysisId(testAnalysisId);
            log.info("[TestRetrieval] 저장 조회(세션 전체) sessionId={} count={}",
                    sessionId, saved.size());
        }

        return ResponseEntity.ok(Map.of(
                "indicatorCode",  indicatorCode != null ? indicatorCode : "ALL",
                "sessionId",      sessionId,
                "testAnalysisId", testAnalysisId,
                "count",          saved.size(),
                "evidence",       saved
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. 세션 정리
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 테스트 세션의 ChromaDB 컬렉션과 DB Evidence 레코드를 모두 삭제합니다.
     *
     * <pre>
     * curl -X DELETE "http://localhost:8082/test/retrieval/session"
     * curl -X DELETE "http://localhost:8082/test/retrieval/session?sessionId=my-session"
     * </pre>
     */
    @DeleteMapping("/session")
    public ResponseEntity<Map<String, Object>> deleteTestSession(
            @RequestParam(defaultValue = DEFAULT_SESSION) String sessionId) {

        long testAnalysisId = toTestAnalysisId(sessionId);

        // ChromaDB 컬렉션 삭제
        reportRagService.deleteSessionCollection(sessionId);

        // DB Evidence 삭제
        evidenceMatchRepository.deleteByAnalysisId(testAnalysisId);

        log.info("[TestRetrieval] 세션 삭제 sessionId={} testAnalysisId={}", sessionId, testAnalysisId);
        return ResponseEntity.ok(Map.of(
                "sessionId",      sessionId,
                "testAnalysisId", testAnalysisId,
                "status",         "deleted"
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 유틸
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * sessionId를 결정론적 양수 Long으로 변환합니다.
     * 동일한 sessionId는 항상 동일한 testAnalysisId를 반환합니다.
     */
    private static long toTestAnalysisId(String sessionId) {
        return Math.abs((long) sessionId.hashCode());
    }
}
