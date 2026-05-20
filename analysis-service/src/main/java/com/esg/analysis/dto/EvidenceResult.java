package com.esg.analysis.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class EvidenceResult {
    private final String       evidenceText;
    private final int          pageNumber;        // metadata 우선, fallback: [FILE_PAGE:X] regex, 없으면 -1
    private final double       similarity;        // ChromaDB 원시 코사인 유사도 (0.0~1.0)
    private final double       keywordMatchScore; // indicator keywords 매칭 비율 (0.0~1.0)
    private final double       finalScore;        // similarity*0.7 + keywordMatchScore*0.3
    private final boolean      isValidEvidence;   // finalScore >= ReportRagService.EVIDENCE_THRESHOLD
    private final int          retrievalRank;     // finalScore 내림차순 1-based 순위
    private final String       indicatorCode;     // e.g. "S-201"
    private final String       sourceFile;        // chunk metadata의 파일명, 없으면 null
    // ── Explainability metadata ────────────────────────────────────────────
    private final List<String> matchedKeywords;   // indicator keywords 중 chunk에 실제 등장한 토큰 목록
    private final String       matchedCluster;    // KeywordGate에서 매칭된 cluster 문자열 (예: "산업안전|교육")
}
