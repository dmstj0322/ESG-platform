// ── K-ESG 지표 코드 정의 ────────────────────────────────────────────
export const E_INDICATORS = {
  'E-101': '전력 사용량',
  'E-102': '가스 사용량',
  'E-103': '탄소 배출량',
  'E-104': '폐기물 발생량',
  'E-105': '용수 사용량',
};

export const SG_INDICATORS = {
  'S-201': '산업안전 교육 여부',
  'S-202': '산업재해 발생 여부',
  'S-203': 'ESG 교육 실시 여부',
  'S-204': '임직원 참여 프로그램 여부',
  'S-205': '지역사회 봉사활동 여부',
  'G-301': '윤리경영 정책 수립 여부',
  'G-302': '내부 신고 시스템 운영 여부',
  'G-303': 'ESG 담당 조직 여부',
  'G-304': '외부 감사 수행 여부',
  'G-305': '이사회 독립성 정책 여부',
};

export const ALL_INDICATOR_CODES = { ...E_INDICATORS, ...SG_INDICATORS };
// 전체 표준 지표 수 (E:5 + S:5 + G:5)
export const TOTAL_INDICATOR_COUNT = Object.keys(ALL_INDICATOR_CODES).length;

// ── 공유 판단 기준 (AnalysisResultPage.jsx의 로컬 버전과 완전 동기화) ────
// 정량 표현 패턴: 수치·비율·단위가 포함된 텍스트는 문서 근거 구체성이 높음
const QUANTITATIVE_PATTERNS = [/%/, /\d+\s*시간/, /\d+\s*회/, /\d+\s*건/, /\d+\s*명/, /\d+\s*개/,
  /참여율/, /이수율/, /비율/, /운영\s*중/, /운영함/, /운영하고/, /횟수/, /인원/];

const hasQuantitativeEvidence = (text) => {
  if (!text) return false;
  return QUANTITATIVE_PATTERNS.some(p => p.test(text));
};

// 직접 거버넌스/사회 표현 — 높은 weight 부여로 VERIFIED 승격 대상
// AnalysisResultPage.jsx HIGH_WEIGHT_PATTERNS와 완전 동기화 유지
const HIGH_WEIGHT_PATTERNS = [
  '전담 조직', '내부 신고', '참여율', '교육 시행', '이수율',
  '안전교육', 'ESG 조직', '신고 시스템', '운영 중', '내부제보', '신고채널',
  '윤리경영 위원회', '위원회 운영', '윤리경영', '행동강령', '준법경영', '컴플라이언스',
  '반부패 정책', '청렴 서약', '이사회 독립', '사외이사', '외부감사', '외부 감사',
  '제3자 검증', '내부고발', 'ESG 담당', 'ESG 위원회', '지속가능경영 위원회',
  '신고센터', '제보센터', '핫라인', '내부 신고 시스템',
  // 산업안전·재해 operational KPI (S-201/202 승격)
  'ISO45001', 'iso45001', 'TRIR', 'LTIR', '안전보건경영시스템', '무재해 달성',
  '중대재해 0건', '재발방지 대책', '업계 평균 대비', '안전교육 이수율',
  // 사회공헌·교육 operational KPI (S-203/205 승격)
  '사회공헌 투자', '자원봉사 시간', '취약계층 지원', 'ESG 교육 이수율',
];

// S indicator 명시 구문 — 백엔드 S_EXPLICIT_PHRASES와 동기화
const S_EXPLICIT_PHRASE_MAP_UTIL = {
  'S-201': ['iso45001', 'iso 45001', '안전보건경영시스템', 'vr 기반 안전교육', '안전교육 이수율',
            '협력사 안전보건', '협력사 안전', '협력사 안전 점검', '1인당 안전교육',
            '안전관리 체계', '협력사 점검', '안전 점검', '안전교육 연'],
  'S-202': ['중대재해 0건', '중대재해0건', 'trir', 'ltir', 'ltir 0',
            '재해율 0', '사고율 0', '무재해 달성', '업계 평균 대비', '재발방지 대책'],
  'S-203': ['esg 교육', 'esg교육', '지속가능경영 교육', 'esg 역량', 'esg교육이수율',
            '온보딩 esg 교육', '관리자 심화', 'esg 전략 교육'],
  'S-204': ['임직원 esg 참여율', 'esg 참여율', '임직원 참여율', '직원 참여율',
            '임직원 참여 프로그램', '사내 esg 프로그램', '직원 esg 참여', 'esg 참여',
            'employee participation rate', '임직원 참여'],
  'S-205': ['지역사회 봉사', '봉사활동 시간', '봉사 시간', '자원봉사 시간',
            '사회공헌 활동', 'community service', '봉사활동 실적', '봉사 활동',
            '사회공헌 투자', '사회공헌투자', '사회공헌 금액', '사회공헌 성과',
            '취약계층 지원', '취약계층', '에너지 복지', 'stem 교육 지원',
            '나눔 활동', '나눔활동',
            '지역 기부', '사회공헌 현황', '투자액', '지역사회 지원', '사회공헌 프로그램'],
};

// G indicator 명시 구문 — isValidEvidence 제한보다 우선 적용하여 false negative 방지
// 이 구문이 evidenceText에 존재하면 즉시 VERIFIED 반환 (semantic contamination 방어 예외)
const EXPLICIT_GOVERNANCE_PHRASES = [
  // G-302: 내부 신고 시스템
  '내부 신고 시스템 운영', '내부 신고 시스템을 운영', '내부신고시스템운영',
  '신고 시스템 운영', '신고시스템운영', '제보 시스템 운영',
  '내부 제보 시스템', '내부제보시스템',
  'whistleblowing system', 'ethics hotline', 'compliance hotline',
  '익명 신고 시스템', '익명신고시스템',
];

// G indicator별 명시 구문 맵 — 지표 코드별로 직접 증거 구문 빠른 탐색
// 입자어(을/를/이/가) 없는 형태 우선 — Korean particle substring mismatch 방지
const G_EXPLICIT_PHRASE_MAP = {
  'G-301': ['윤리경영 위원회', '윤리경영을 운영', '행동강령을 수립', '컴플라이언스 위원회', '반부패 정책',
            '윤리경영 정책', '윤리 방침', '준법경영', '윤리헌장', '청렴 서약', '윤리경영'],
  'G-302': ['내부 신고 시스템', '내부 신고', '내부신고', '익명 신고', '제보 시스템',
            '신고 채널', '신고센터', '제보센터', '핫라인', 'whistleblowing', '내부 제보', '신고시스템'],
  'G-303': ['ESG 전담 조직', 'ESG 담당 조직', 'ESG 위원회를', '지속가능경영 위원회', 'ESG팀을 설치', 'ESG 조직을',
            'ESG 전담', 'ESG 담당', '전담 조직', 'ESG 조직', 'ESG위원회', '지속가능경영 조직'],
  'G-304': ['외부 ESG 감사', '외부감사를 수행', '제3자 검증', '외부 검증기관', '외부 감사를 받',
            '외부 감사', '외부감사', '외부 검증', '외부 감사인'],
  'G-305': ['사외이사 비율', '이사회 독립성', '독립 이사를', '사외이사로 구성',
            '사외이사', '이사회 독립', '독립 이사', '비상임이사'],
};

// S-domain 표현 목록 — G 지표에 이 표현이 포함된 evidence는 NO_EVIDENCE로 강등
const S_DOMAIN_MARKERS = [
  '봉사', 'volunteer', 'csr', '사회공헌', 'donation', '참여시간', '참여 시간', '지역사회 봉사',
  '산업안전', '안전교육', '교육 참여율', '안전 교육', '산업 안전',
];

// G-302 내부 신고 시스템 — 이 중 하나 없으면 VERIFIED 불가 (도메인 강제 게이트)
const G302_MANDATORY_KW = [
  '내부 신고', '내부신고', '내부제보', '내부 제보',
  'whistleblowing', 'hotline', '핫라인',
  '제보', '신고 채널', '신고채널', '제보 채널', '제보채널',
  '신고센터', '제보센터', '신고시스템', '신고 시스템',
  'compliance', '익명 신고', '익명신고',
];

// AnalysisResultPage.jsx 로컬 버전과 완전 동기화 — Dashboard/ResultPage 동일 기준 적용
export const getVerificationStatus = (ev) => {
  const catChar = ev.indicatorCode?.[0];
  if (catChar === 'E') {
    if (ev.numericMatchLevel === 'HIGH')   return 'VERIFIED';
    if (ev.numericMatchLevel === 'MEDIUM') return 'WEAK';
    if (ev.numericMatchLevel === 'LOW')    return 'CONTRADICTION';
    return 'NO_EVIDENCE';
  }

  // ── [최고 우선순위] 백엔드 verificationStatus ─────────────────────────
  // CategoryAnalysisService 결정값: EXPLICIT·sim≥0.75·coverageVerified·clusterMatch
  // AnalysisResultPage와 동일: 백엔드 VERIFIED는 _isShared 체크보다 우선
  if (ev.verificationStatus === 'VERIFIED') return 'VERIFIED';
  if (ev.verificationStatus === 'PARTIAL')  return 'PARTIAL';
  if (ev.verificationStatus === 'NO_EVIDENCE') return 'NO_EVIDENCE';

  // matchedCluster EXPLICIT: 백엔드 verificationStatus 미설정 케이스 보완
  if (ev.matchedCluster?.startsWith('EXPLICIT:')) return 'VERIFIED';

  // S indicator 명시 구문 — AnalysisResultPage 동일 순서: _isShared보다 먼저
  const sExplicitPhrases = S_EXPLICIT_PHRASE_MAP_UTIL[ev.indicatorCode];
  if (sExplicitPhrases) {
    const textLowerSE = (ev.evidenceText ?? ev.text ?? '').toLowerCase();
    if (sExplicitPhrases.some(p => textLowerSE.includes(p.toLowerCase()))) return 'VERIFIED';
  }

  // G 지표: 도메인 일관성 검사 — _isShared보다 먼저 (AnalysisResultPage 동일 순서)
  if (catChar === 'G') {
    const textLower = (ev.evidenceText ?? ev.text ?? '').toLowerCase();
    if (S_DOMAIN_MARKERS.some(m => textLower.includes(m))) return 'NO_EVIDENCE';
    if (ev.indicatorCode === 'G-302' && !G302_MANDATORY_KW.some(k => textLower.includes(k))) return 'NO_EVIDENCE';
    if (ev.indicatorCode === 'G-302' && EXPLICIT_GOVERNANCE_PHRASES.some(p => textLower.includes(p))) return 'VERIFIED';
    const explicitPhrases = G_EXPLICIT_PHRASE_MAP[ev.indicatorCode];
    if (explicitPhrases?.some(p => textLower.includes(p.toLowerCase()))) return 'VERIFIED';
  }

  // ── _isShared: explicit/G 체크 이후, sim 체크 이전 — AnalysisResultPage 순서(line 490) 동일 ──
  if (ev._isShared) {
    const sharedText = ev.evidenceText ?? ev.text ?? '';
    const sharedHasKw = (ev.matchedKeywords?.length > 0) ||
      (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && ev.matchedCluster?.trim() !== '');
    const sharedHasHw = HIGH_WEIGHT_PATTERNS.some(p => sharedText.includes(p));
    const sharedSim   = toPct(ev.similarity) ?? 0;
    if (sharedHasKw || sharedHasHw || sharedSim >= 65) return 'PARTIAL';
    return 'WEAK';
  }

  if (ev.contradictionReason)  return 'CONTRADICTION';
  if (!ev.isValidEvidence)     return 'NO_EVIDENCE';

  const sim  = toPct(ev.similarity) ?? 0;
  const text = ev.evidenceText ?? ev.text ?? '';
  const hasKeywordMatch = (ev.matchedKeywords?.length > 0) ||
    (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && ev.matchedCluster.trim() !== '');
  const hasHighWeight = HIGH_WEIGHT_PATTERNS.some(p => text.includes(p));

  // STRONG tier → 즉시 VERIFIED
  if (ev.similarityTier === 'STRONG') return 'VERIFIED';

  if (catChar === 'G') {
    if (sim >= 78 && (hasKeywordMatch || hasHighWeight)) return 'VERIFIED';
    if (sim >= 55 && (hasKeywordMatch || hasHighWeight)) return 'WEAK';
    return 'NO_EVIDENCE';
  }

  // S 지표: 백엔드 0.75 기준과 동기화 (75% = sim >= 75)
  if (sim >= 75 && (hasKeywordMatch || hasHighWeight))                return 'VERIFIED';
  if (sim >= 82 && hasKeywordMatch)                                   return 'VERIFIED';
  if (sim >= 78 && hasHighWeight)                                     return 'VERIFIED';
  if (sim >= 85)                                                      return 'VERIFIED';
  if (sim >= 72 && hasQuantitativeEvidence(text) && hasKeywordMatch)  return 'VERIFIED';
  if (sim >= 75 && ev.similarityTier === 'MEDIUM')                    return 'VERIFIED';
  if (sim >= 55 && (hasKeywordMatch || hasHighWeight))                return 'WEAK';
  // S-202 last fallback: isValidEvidence=true이지만 VERIFIED 기준 미달 → PARTIAL (ResultPage 동기화)
  if (ev.indicatorCode === 'S-202' && ev.isValidEvidence) return 'PARTIAL';
  return 'NO_EVIDENCE';
};

export const toPct = (v) => (v == null ? null : Math.round(v <= 1 ? v * 100 : v));

// ── API 응답 점수 정규화 ─────────────────────────────────────────────
export const normalizeScore = (raw) => {
  if (!raw) return raw;
  const radar     = raw?.esgChart?.radar ?? [];
  const fromRadar = (cat) => radar.find(r => r.category === cat)?.score ?? 0;
  const sScore    = raw.sScore > 0 ? raw.sScore : fromRadar('S');
  // ecoSBonus: API 응답에 포함된 실제 보너스 값으로 before/after 표시 지원
  const ecoSBonus = raw.ecoSBonus != null && raw.ecoSBonus > 0 ? raw.ecoSBonus : null;
  return {
    ...raw,
    eScore:        raw.eScore     > 0 ? raw.eScore     : fromRadar('E'),
    sScore,
    gScore:        raw.gScore     > 0 ? raw.gScore     : fromRadar('G'),
    totalScore:    raw.totalScore > 0 ? raw.totalScore : (raw.esgChart?.totalScore ?? 0),
    ecoScoreBonus: ecoSBonus,
    sScoreBefore:  ecoSBonus != null ? sScore - ecoSBonus : null,
    sScoreAfter:   ecoSBonus != null ? sScore : null,
  };
};

// ── Dashboard 전용: 경량 KPI 요약 ────────────────────────────────────
// Dashboard는 이 함수 하나만 호출. 무거운 evidence table 처리 없음.
// AnalysisResultPage의 detectSharedEvidenceCodes와 동일 로직
// 동일 근거를 복수 지표가 공유하는 경우 탐지 → _isShared 마킹으로 VERIFIED 강등
const detectSharedCodes = (evidenceMatches) => {
  const seen = new Map();
  const shared = new Set();
  for (const ev of (evidenceMatches ?? [])) {
    const t = ev.evidenceText ?? ev.text ?? '';
    if (!t || t.length < 10) continue;
    const fp = t.trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 80);
    if (seen.has(fp)) shared.add(ev.indicatorCode);
    else seen.set(fp, ev.indicatorCode);
  }
  return shared;
};

export const computeDashboardKPIs = (data) => {
  if (!data) return null;

  // buildCompleteIndicatorList + _isShared 마킹 — ResultPage와 완전 동일 기준
  const rawList      = buildCompleteIndicatorList(data.evidenceMatches);
  const sharedCodes  = detectSharedCodes(data.evidenceMatches);
  const completeList = sharedCodes.size > 0
    ? rawList.map(ev => sharedCodes.has(ev.indicatorCode) ? { ...ev, _isShared: true } : ev)
    : rawList;
  const total         = TOTAL_INDICATOR_COUNT;

  // 단일 소스 카운트 — ResultPage의 auditCounts와 동일 기준
  const verifiedCount = completeList.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
  const partialCount  = completeList.filter(e => getVerificationStatus(e) === 'PARTIAL').length;
  const missingCount  = completeList.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length;
  const contraCount   = completeList.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length;
  const detectedCount = verifiedCount + partialCount + contraCount;

  // DEBUG
  console.log('[Dashboard] verifiedCount=', verifiedCount, '/ total=', total);
  completeList.forEach(e => {
    const s = getVerificationStatus(e);
    if (s !== 'VERIFIED') {
      console.log(`  ❌ ${e.indicatorCode} → ${s} | backendStatus=${e.verificationStatus ?? '없음'} | isValidEvidence=${e.isValidEvidence} | sim=${e.similarity} | cluster=${e.matchedCluster}`);
    }
  });

  // [2] Confidence floor: VERIFIED 충분 + 불일치 적음 → 과도한 신뢰도 감점 완화
  let confidence = data.overallConfidence ?? 0;
  if (verifiedCount >= 6 && contraCount <= 1 && confidence < 65) {
    confidence = 65;
  }

  const detectedCodes = new Set((data.evidenceMatches ?? []).map(e => e.indicatorCode).filter(Boolean));

  // G/S 지표 중 evidence 미검출 목록
  const gBlocked = Object.keys(SG_INDICATORS).filter(c => c.startsWith('G') && !detectedCodes.has(c));
  const sBlocked = Object.keys(SG_INDICATORS).filter(c => c.startsWith('S') && !detectedCodes.has(c));

  // E 지표 불일치 (numericMatchLevel 직접 참조)
  const eLow = completeList.filter(e => e.indicatorCode?.startsWith('E') && e.numericMatchLevel === 'LOW');

  // 권고사항 요약 (Dashboard 표시용 — 최대 4건)
  const recs = [];
  if (eLow.length >= 2)
    recs.push({
      sev: 'HIGH', code: 'E-CONTR',
      title: '환경 데이터 증빙 불일치',
      desc: `${eLow.length}개 환경 지표에서 수치 불일치가 감지되었습니다.`,
      scoreImpact: '+8~12점', urgency: '즉시',
      docs: ['수치 측정 원본 데이터 (CSV)', '제3자 인증서 또는 측정 기관 확인서'],
    });
  else if (eLow.length === 1)
    recs.push({
      sev: 'MED', code: 'E-CONTR',
      title: '환경 수치 불일치 주의',
      desc: '1개 환경 지표에서 수치 차이가 감지되었습니다.',
      scoreImpact: '+3~6점', urgency: '1개월',
      docs: ['측정 원본 데이터', '단위 환산 근거서'],
    });

  if (gBlocked.length >= 2)
    recs.push({
      sev: 'HIGH', code: 'G-NOEV',
      title: '지배구조 근거 부재',
      desc: `${gBlocked.length}개 지배구조 지표에서 감사 근거가 미검출되었습니다.`,
      scoreImpact: '+5~8점', urgency: '1개월',
      docs: ['지배구조 정책 문서', 'ESG 보고서 지배구조 섹션'],
    });
  else if (gBlocked.length === 1)
    recs.push({
      sev: 'MED', code: 'G-NOEV',
      title: '지배구조 증빙 보강 권고',
      desc: '1개 지배구조 지표에서 감사 근거가 미검출되었습니다.',
      scoreImpact: '+2~4점', urgency: '분기 내',
      docs: ['해당 정책 수립 문서'],
    });

  if (sBlocked.length >= 2)
    recs.push({
      sev: 'MED', code: 'S-NOEV',
      title: '사회 지표 증빙 미흡',
      desc: `${sBlocked.length}개 사회 지표에서 감사 근거가 미검출되었습니다.`,
      scoreImpact: '+3~6점', urgency: '분기 내',
      docs: ['사회공헌 활동 보고서', '산업안전 교육 이수 기록'],
    });

  const highCount = recs.filter(r => r.sev === 'HIGH').length;
  const medCount  = recs.filter(r => r.sev === 'MED').length;

  // 환경 Benchmark 첫 번째 지표 diff (Snapshot 표시용)
  const benchMetrics = data.benchmarkComparison?.metrics ?? [];
  const firstBenchMetric = benchMetrics[0] ?? null;
  const envDiffPct = firstBenchMetric?.company != null && (firstBenchMetric?.industryAvg ?? 0) > 0
    ? (firstBenchMetric.company - firstBenchMetric.industryAvg) / firstBenchMetric.industryAvg * 100
    : null;

  return {
    // ── API 직접 필드 (서버 계산값) ──
    finalGrade:  data.finalGrade,
    totalScore:  data.totalScore,
    eScore:      data.eScore,
    sScore:      data.sScore,
    gScore:      data.gScore,
    confidence,
    companyName: data.companyName,
    analyzedAt:  data.analyzedAt,
    benchmarkComparison: data.benchmarkComparison,
    // ── 검증 카운트 (buildCompleteIndicatorList 기반 단일 소스) ──
    verifiedCount,
    partialCount,
    missingCount,
    detectedCount,
    totalIndicators: total,
    // Strict Verification = VERIFIED / total (완전검증 비율)
    verifiedPct: total > 0 ? Math.round(verifiedCount / total * 100) : 0,
    // Evidence Coverage = (VERIFIED + PARTIAL + CONTRA) / total (근거 탐지 비율)
    evidenceCovPct: total > 0 ? Math.round(detectedCount / total * 100) : 0,
    recs: recs.slice(0, 4),
    highCount,
    medCount,
    // ── Snapshot 표시용 ──
    envBenchmarkLabel:  firstBenchMetric?.name ?? null,
    envBenchmarkDiffPct: envDiffPct,
    benchmarkIndustry:  data.benchmarkComparison?.industry ?? null,
    benchmarkRegion:    data.benchmarkComparison?.regionName ?? null,
  };
};

// G-303: 명시적 거버넌스 조직 구문 포함 여부 — evidence 선택 우선순위 판별
const G303_GOV_PHRASES = [
  'esg 전담 부서', 'esg전담부서', 'esg 담당 조직', 'esg담당조직',
  '지속가능경영 조직', '지속가능경영조직', '대표이사 직속 esg', '대표이사직속esg',
  '대표이사 직속', '전담 부서', '전담부서', '담당 조직', '담당조직',
  'esg 위원회', 'esg위원회', '지속가능경영위원회', 'esg팀',
];
const hasG303GovPhrase = (text) => {
  if (!text) return false;
  const tNorm = text.toLowerCase().replace(/\s+/g, '');
  return G303_GOV_PHRASES.some(p => tNorm.includes(p.toLowerCase().replace(/\s+/g, '')));
};

// G-303 evidence 우선순위 비교: governance phrase > EXPLICIT cluster > finalScore
const g303Priority = (ev) => {
  if (hasG303GovPhrase(ev.evidenceText ?? ev.text)) return 2;
  if (ev.matchedCluster?.startsWith('EXPLICIT:')) return 1;
  return 0;
};

// ── ResultPage 전용: 완전한 지표 목록 빌더 ──────────────────────────
// Dashboard는 사용하지 않음. ResultPage evidence table 전용.
// numeric evidence 우선순위 점수: HIGH=3 MEDIUM=2 LOW=1 없음=0
const numericPriority = (ev) =>
  ev.numericMatchLevel === 'HIGH'   ? 3 :
  ev.numericMatchLevel === 'MEDIUM' ? 2 :
  ev.numericMatchLevel === 'LOW'    ? 1 : 0;

export const buildCompleteIndicatorList = (evidenceMatches) => {
  const isVerifiedEv = (ev) =>
    ev?.verificationStatus === 'VERIFIED' || ev?.matchedCluster?.startsWith('EXPLICIT:');
  const evScore = (ev) => Math.max(ev?.similarity ?? 0, ev?.finalScore ?? 0);

  const byCode = new Map();
  for (const ev of (evidenceMatches ?? [])) {
    const code = ev.indicatorCode;
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing) { byCode.set(code, ev); continue; }

    // G-303: governance phrase 포함 evidence 최우선 선택 (similarity 무관)
    if (code === 'G-303') {
      const evPri = g303Priority(ev);
      const exPri = g303Priority(existing);
      if (evPri > exPri) { byCode.set(code, ev); continue; }
      if (exPri > evPri) continue;
    }

    // E 지표: numericMatchLevel 있는 evidence 최우선 선택
    // semantic evidence(similarity만 있음)보다 numeric verification 결과 우선
    if (code.startsWith('E-')) {
      const evNum = numericPriority(ev);
      const exNum = numericPriority(existing);
      if (evNum > exNum) { byCode.set(code, ev); continue; }
      if (exNum > evNum) continue;
      // 동일 numeric 우선순위면 similarity 비교
    }

    // S/G 지표 (G-303 제외): VERIFIED/EXPLICIT evidence 우선 선택 — ResultPage 동기화
    if (!code.startsWith('E-') && code !== 'G-303') {
      const evIsV = isVerifiedEv(ev);
      const exIsV = isVerifiedEv(existing);
      if (evIsV && !exIsV) { byCode.set(code, ev); continue; }
      if (!evIsV && exIsV) continue;
    }

    if (evScore(ev) > evScore(existing)) byCode.set(code, ev);
  }
  for (const [code, title] of Object.entries(ALL_INDICATOR_CODES)) {
    if (!byCode.has(code)) {
      byCode.set(code, {
        indicatorCode:     code,
        indicatorTitle:    title,
        isValidEvidence:   false,
        similarity:        null,
        numericMatchLevel: null,
        _synthetic:        true,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => {
    const order = { E: 0, S: 1, G: 2 };
    const ca = order[a.indicatorCode?.[0]] ?? 3;
    const cb = order[b.indicatorCode?.[0]] ?? 3;
    if (ca !== cb) return ca - cb;
    return (a.indicatorCode ?? '').localeCompare(b.indicatorCode ?? '');
  });
};

// ── ResultPage 전용: 상세 권고사항 빌더 ─────────────────────────────
// Dashboard는 사용하지 않음. computeDashboardKPIs.recs 로 대체.
export const buildRecommendations = (indicators) => {
  const recs = [];
  if (!indicators?.length) return recs;

  const byStatus       = (s) => indicators.filter(ev => getVerificationStatus(ev) === s);
  const byCat          = (items, cat) => items.filter(ev => ev.indicatorCode?.startsWith(cat));
  const contradictions = byStatus('CONTRADICTION');
  const noEvidence     = byStatus('NO_EVIDENCE');
  const weakItems      = byStatus('WEAK');
  const eContradictions = byCat(contradictions, 'E');
  const gContradictions = byCat(contradictions, 'G');
  const gNoEvidence     = byCat(noEvidence, 'G');
  const sNoEvidence     = byCat(noEvidence, 'S');
  const eNoEvidence     = byCat(noEvidence, 'E');
  const sWeak           = byCat(weakItems, 'S');
  const gWeak           = byCat(weakItems, 'G');

  if (eContradictions.length >= 2)
    recs.push({ sev: 'HIGH', code: 'E-CONTR', cat: 'E',
      title: '환경 데이터 증빙 불일치 — 재검증 권고',
      desc: `${eContradictions.length}개 환경(E) 지표에서 제출 수치와 증빙 문서 간 유의미한 차이가 확인되었습니다.`,
      scoreImpact: '+8~12점', urgency: '즉시',
      docs: ['수치 측정 원본 데이터 (CSV)', '제3자 인증서 또는 측정 기관 확인서'] });
  else if (eContradictions.length === 1) {
    const t = eContradictions[0].indicatorTitle ?? eContradictions[0].indicatorCode;
    recs.push({ sev: 'MED', code: 'E-CONTR-1', cat: 'E',
      title: `${t} — 수치 출처 재확인 권고`,
      desc: `${t} 항목의 제출값과 증빙 문서 내 기재값 간 차이가 감지되었습니다.`,
      scoreImpact: '+3~6점', urgency: '1개월',
      docs: ['측정 원본 데이터', '단위 환산 산정 근거서'] });
  }
  if (gContradictions.length >= 1)
    recs.push({ sev: 'HIGH', code: 'G-CONTR', cat: 'G',
      title: '지배구조 공시 내용 — 감사 기준 불일치',
      desc: `${gContradictions.length}개 지배구조(G) 항목에서 K-ESG 감사 기준과 불일치하는 신호가 감지되었습니다.`,
      scoreImpact: '+6~10점', urgency: '즉시',
      docs: ['이사회 회의록', '감사위원회 운영 기록', '윤리경영 강령 원문'] });
  if (gNoEvidence.length >= 2)
    recs.push({ sev: 'HIGH', code: 'G-NOEV', cat: 'G',
      title: '지배구조 공시 문서 — 감사 근거 부재',
      desc: `${gNoEvidence.length}개 지배구조(G) 지표에서 감사 근거가 확인되지 않았습니다.`,
      scoreImpact: '+5~8점', urgency: '1개월',
      docs: ['지배구조 정책 문서', 'ESG 보고서 지배구조 섹션', '내부 신고 시스템 운영 현황'] });
  else if (gNoEvidence.length === 1) {
    const t = gNoEvidence[0].indicatorTitle ?? gNoEvidence[0].indicatorCode;
    recs.push({ sev: 'MED', code: 'G-NOEV-1', cat: 'G',
      title: `${t} — 공시 내용 보강 권고`,
      desc: `${t} 항목에 대한 감사 근거가 보고서에서 확인되지 않았습니다.`,
      scoreImpact: '+2~4점', urgency: '분기 내',
      docs: ['해당 정책 수립 문서', '운영 현황 보고서'] });
  }
  if (sNoEvidence.length >= 2)
    recs.push({ sev: 'MED', code: 'S-NOEV', cat: 'S',
      title: '사회 지표 증빙 — 문서 기재 미흡',
      desc: `${sNoEvidence.length}개 사회(S) 지표에서 감사 근거가 확인되지 않았습니다.`,
      scoreImpact: '+3~6점', urgency: '분기 내',
      docs: ['사회공헌 활동 보고서', '산업안전 교육 이수 기록'] });
  if (sWeak.length >= 2)
    recs.push({ sev: 'MED', code: 'S-WEAK', cat: 'S',
      title: '사회 지표 — 정량 근거 보강 권고',
      desc: `${sWeak.length}개 사회(S) 지표에서 정량적 근거가 미흡합니다.`,
      scoreImpact: '+2~5점', urgency: '분기 내',
      docs: ['정량 성과 지표 데이터', '교육 이수율 현황표'] });
  if (gWeak.length >= 2)
    recs.push({ sev: 'MED', code: 'G-WEAK', cat: 'G',
      title: '지배구조 — 실적 근거 구체화 권고',
      desc: `${gWeak.length}개 지배구조(G) 지표에서 실적 데이터가 미흡합니다.`,
      scoreImpact: '+2~5점', urgency: '분기 내',
      docs: ['이사회 독립성 비율 현황', '감사위원회 연간 실적 보고서'] });
  if (eNoEvidence.length >= 2)
    recs.push({ sev: 'LOW', code: 'E-NOEV', cat: 'E',
      title: '환경 계량 데이터 — 문서 기재 누락',
      desc: `${eNoEvidence.length}개 환경(E) 지표에서 수치 데이터를 확인하지 못했습니다.`,
      scoreImpact: '+2~4점', urgency: '다음 보고 주기',
      docs: ['환경 데이터 측정 보고서', 'CSV 수치 증빙 파일'] });

  return recs.slice(0, 5);
};
