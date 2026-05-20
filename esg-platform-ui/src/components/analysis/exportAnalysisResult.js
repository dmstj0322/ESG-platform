import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── 색상 팔레트 ──────────────────────────────────────────────────────
const GRADE_RGB = {
  S: [124, 58, 237], A: [22, 163, 74], B: [29, 78, 216],
  C: [217, 119, 6],  D: [220, 38, 38],
};
const gradeRgb = (g) => GRADE_RGB[String(g ?? '').toUpperCase()] ?? [82, 82, 91];

const NAVY    = [15,  23,  42];
const NAVY2   = [30,  41,  59];
const MUTED   = [100, 116, 139];
const TEXT    = [30,  30,  40];
const BORDER  = [226, 232, 240];
const BG      = [248, 250, 252];
const BG2     = [241, 245, 249];
const WHITE   = [255, 255, 255];
const EMERALD = [22,  163, 74];
const EMERALD_LIGHT = [209, 250, 229];
const AMBER   = [217, 119, 6];
const RED     = [220, 38,  38];
const PURPLE  = [124, 58,  237];
const KOR     = { font: 'NanumGothic', fontStyle: 'normal' };

// ESG 카테고리 색상
const ESG_RGB = { E: EMERALD, S: [29, 78, 216], G: [217, 119, 6] };
const ESG_LABEL = { E: '환경 (Environmental)', S: '사회 (Social)', G: '지배구조 (Governance)' };

// ── 폰트 로더 ────────────────────────────────────────────────────────
const loadFont = async (doc) => {
  const res = await fetch('/fonts/NanumGothic-Regular.ttf');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const u8 = new Uint8Array(await res.arrayBuffer());
  const CHUNK = 8192;
  let bin = '';
  for (let i = 0; i < u8.length; i += CHUNK) bin += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  doc.addFileToVFS('NanumGothic.ttf', btoa(bin));
  doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
};

// ── 유틸리티 ────────────────────────────────────────────────────────
const setF = (doc, sz) => { doc.setFont('NanumGothic', 'normal'); doc.setFontSize(sz); };
const setC = (doc, rgb) => doc.setTextColor(...rgb);
const setFill = (doc, rgb) => doc.setFillColor(...rgb);
const setDraw = (doc, rgb) => doc.setDrawColor(...rgb);

const scoreBar = (doc, x, y, w, score, rgb) => {
  const pct = Math.min(100, Math.max(0, score ?? 0)) / 100;
  setFill(doc, BORDER); doc.roundedRect(x, y, w, 3.5, 1.5, 1.5, 'F');
  if (pct > 0.01) {
    setFill(doc, rgb);
    doc.roundedRect(x, y, Math.max(4, w * pct), 3.5, 1.5, 1.5, 'F');
  }
};

const miniBar = (doc, x, y, w, pct, rgb) => {
  const fill = Math.min(100, Math.max(0, pct ?? 0)) / 100;
  setFill(doc, [60, 60, 70]); doc.roundedRect(x, y, w, 2.5, 1, 1, 'F');
  if (fill > 0.01) { setFill(doc, rgb); doc.roundedRect(x, y, Math.max(3, w * fill), 2.5, 1, 1, 'F'); }
};

const stripMd = (text) =>
  String(text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*{1,3}(.+?)\*{1,3}/g, '$1')
    .replace(/`+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();

const fmtNum = (v) => {
  if (v == null) return '-';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
};

const toPct = (v) => (v == null ? null : Math.round(v <= 1 ? v * 100 : v));

// ── 전체 K-ESG 지표 코드 → 표시명 (Verification Summary의 단일 소스) ──
const ALL_INDICATOR_CODES_PDF = {
  'E-101': '전력 사용량',   'E-102': '가스 사용량',  'E-103': '탄소 배출량',
  'E-104': '폐기물 발생량', 'E-105': '용수 사용량',
  'S-201': '산업안전 교육', 'S-202': '산업재해 발생', 'S-203': 'ESG 교육 실시',
  'S-204': '임직원 참여',
  'G-301': '윤리경영 정책', 'G-302': '내부 신고 시스템', 'G-303': 'ESG 담당 조직',
};

/**
 * evidenceMatches에 없는 지표를 NO_EVIDENCE 합성 항목으로 추가해 완전한 목록 반환.
 * getVST() 계산의 단일 소스 역할을 합니다.
 */
const buildCompleteListForPdf = (evidenceMatches) => {
  const byCode = new Map();
  for (const ev of (evidenceMatches ?? [])) {
    const code = ev.indicatorCode;
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing) { byCode.set(code, ev); continue; }
    const evSim = ev.similarity ?? ev.finalScore ?? 0;
    const exSim = existing.similarity ?? existing.finalScore ?? 0;
    if (evSim > exSim) byCode.set(code, ev);
  }
  for (const [code, title] of Object.entries(ALL_INDICATOR_CODES_PDF)) {
    if (!byCode.has(code)) {
      byCode.set(code, { indicatorCode: code, indicatorTitle: title, isValidEvidence: false, similarity: null, numericMatchLevel: null });
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

// ── 공통 헤더/푸터 ───────────────────────────────────────────────────
const pageHeader = (doc, label, accentRgb = EMERALD) => {
  setFill(doc, NAVY); doc.rect(0, 0, 210, 10, 'F');
  setFill(doc, accentRgb); doc.rect(0, 10, 210, 1.5, 'F');
  setF(doc, 7); setC(doc, [147, 197, 253]);
  doc.text('ECO POINT  |  ESG Management Platform', 14, 7);
  if (label) { setC(doc, [148, 163, 184]); doc.text(label, 196, 7, { align: 'right' }); }
};

const pageFooter = (doc, companyName, analysisId, pageNum, total) => {
  const y = 288;
  setFill(doc, NAVY2); doc.rect(0, y, 210, 9, 'F');
  setF(doc, 7); setC(doc, [203, 213, 225]);
  doc.text(`ECO POINT ESG Management Platform  ·  ${companyName}  ·  ID: ${analysisId}`, 14, y + 5.5);
  setC(doc, [147, 197, 253]);
  doc.text(`${pageNum} / ${total}`, 196, y + 5.5, { align: 'right' });
};

const sectionTitle = (doc, text, y, accentRgb = NAVY) => {
  setFill(doc, accentRgb); doc.rect(14, y - 1, 3, 7, 'F');
  setF(doc, 11); setC(doc, TEXT);
  doc.text(text, 20, y + 4.5);
  return y + 12;
};

// GPT 리포트 섹션 파서 (export용 — 간이버전)
const parseReportSectionsForPdf = (fullReport) => {
  if (!fullReport?.trim()) return [];
  const sections = [];
  const regex = /^#{1,3}\s+(.+)$/gm;
  let match, lastIndex = 0, lastTitle = null;
  while ((match = regex.exec(fullReport)) !== null) {
    if (lastTitle !== null) {
      const content = fullReport.slice(lastIndex, match.index).trim();
      if (content) sections.push({ title: lastTitle, content });
    }
    lastTitle = match[1].trim();
    lastIndex = match.index + match[0].length;
  }
  if (lastTitle !== null) {
    const content = fullReport.slice(lastIndex).trim();
    if (content) sections.push({ title: lastTitle, content });
  }
  if (sections.length === 0 && fullReport.trim()) {
    sections.push({ title: 'ESG 종합 분석', content: fullReport });
  }
  return sections;
};

// ── 메인 Export ─────────────────────────────────────────────────────
export const exportAnalysisResult = async (data, analysisId) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let fontOk = false;
  try { await loadFont(doc); fontOk = true; } catch { doc.setFont('helvetica', 'normal'); }

  const W              = 210;
  const now            = new Date();
  const dateStr        = now.toLocaleDateString('ko-KR');
  const generatedAt    = now.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const companyName    = data.companyName ?? '기업 ESG 분석';
  const gradeC         = gradeRgb(data.finalGrade);
  const analyzedAt     = (data.analyzedAt ?? dateStr).slice(0, 10);
  const isAutoSimulation = data.isAutoSimulation === true
    || localStorage.getItem('esg_isAutoSimulation') === 'true';

  // ═══════════════════════════════════════════════════════
  //  PAGE 1: 표지 (Cover)
  // ═══════════════════════════════════════════════════════
  // 상단 네이비 배경
  setFill(doc, NAVY); doc.rect(0, 0, W, 115, 'F');
  // 등급 컬러 상단 라인
  setFill(doc, gradeC); doc.rect(0, 0, W, 3.5, 'F');

  // 플랫폼 레이블
  setF(doc, 7); setC(doc, [147, 197, 253]);
  doc.text('ECO POINT  |  ESG Management Platform', 14, 16);

  // Main title
  setF(doc, 18); setC(doc, WHITE);
  doc.text('K-ESG AI AUDIT REPORT', 14, 35);

  // Engine subtitle
  setF(doc, 8); setC(doc, [148, 163, 184]);
  doc.text('Generated by ECO POINT ESG Audit Engine v3', 14, 45);

  // Methodology subtitle
  setF(doc, 7.5); setC(doc, [100, 116, 139]);
  doc.text(
    isAutoSimulation
      ? 'Industry Benchmark Simulation  ·  K-ESG Rule-based Scoring  ·  사전 진단 모드'
      : 'Numeric Verification  ·  Semantic Retrieval  ·  Evidence Detection',
    14, 53
  );

  // 기업명
  setF(doc, 20); setC(doc, WHITE);
  const nameLines = doc.splitTextToSize(companyName, 130);
  doc.text(nameLines, 14, 67);

  // Audit badge (VERIFIED / WARNING / ESTIMATED / SIMULATION)
  const isBenchmarkFallbackCover = data.isBenchmarkFallback === true
    || data.benchmarkComparison?.companyDataSource === 'BENCHMARK'
    || data.benchmarkComparison?.companyDataSource === 'MOCK';
  const auditBadgeLabel = isAutoSimulation
    ? 'SIMULATION'
    : isBenchmarkFallbackCover
    ? 'ESTIMATED'
    : (data.lowMismatchCount ?? 0) > 0 || (data.overallConfidence ?? 100) < 50
    ? 'WARNING'
    : 'VERIFIED';
  const auditBadgeRgb = auditBadgeLabel === 'VERIFIED' ? EMERALD
    : auditBadgeLabel === 'SIMULATION' ? AMBER
    : auditBadgeLabel === 'WARNING' ? AMBER
    : [217, 119, 6];
  setFill(doc, auditBadgeRgb);
  doc.roundedRect(14, 82, 38, 8, 2, 2, 'F');
  setF(doc, 7); setC(doc, WHITE);
  doc.text(auditBadgeLabel, 33, 87.5, { align: 'center' });

  // 메타 정보
  setF(doc, 7.5); setC(doc, [148, 163, 184]);
  doc.text(`분석 ID: ${analysisId}  ·  업종: ${data.industry ?? '-'}  ·  분석일: ${analyzedAt}`, 14, 105);
  setF(doc, 6.5); setC(doc, [100, 116, 139]);
  doc.text(`Generated: ${generatedAt}`, 196, 105, { align: 'right' });

  // 등급 원형 배지
  setFill(doc, gradeC); doc.circle(184, 58, 21, 'F');
  doc.setLineWidth(0.8); setDraw(doc, [...gradeC.map(c => Math.min(255, c + 40))]);
  doc.circle(184, 58, 21, 'S');
  setF(doc, 22); setC(doc, WHITE);
  doc.text(String(data.finalGrade ?? '?'), 184, 66, { align: 'center' });
  setF(doc, 6.5); setC(doc, [199, 210, 254]);
  doc.text('종합 등급', 184, 79, { align: 'center' });

  // 본문 배경
  setFill(doc, BG); doc.rect(0, 115, W, 173, 'F');

  let y = 125;

  // 총점 + 신뢰도
  setFill(doc, WHITE); doc.roundedRect(14, y, 86, 36, 3, 3, 'F');
  setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, y, 86, 36, 3, 3, 'S');
  setFill(doc, gradeC); doc.roundedRect(14, y, 86, 4, 2, 2, 'F'); doc.rect(14, y + 2, 86, 2, 'F');
  setF(doc, 7.5); setC(doc, MUTED); doc.text('종합 점수', 57, y + 12, { align: 'center' });
  setF(doc, 22); setC(doc, gradeC); doc.text(String(data.totalScore ?? 0), 57, y + 28, { align: 'center' });
  setF(doc, 8); setC(doc, MUTED); doc.text('/ 100점', 72, y + 28);
  scoreBar(doc, 20, y + 31, 74, data.totalScore ?? 0, gradeC);

  if (data.overallConfidence != null) {
    setFill(doc, WHITE); doc.roundedRect(106, y, 90, 36, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(106, y, 90, 36, 3, 3, 'S');
    setFill(doc, PURPLE); doc.roundedRect(106, y, 90, 4, 2, 2, 'F'); doc.rect(106, y + 2, 90, 2, 'F');
    setF(doc, 7.5); setC(doc, MUTED); doc.text('분석 신뢰도', 151, y + 12, { align: 'center' });
    setF(doc, 22); setC(doc, PURPLE); doc.text(`${data.overallConfidence}%`, 151, y + 28, { align: 'center' });
    scoreBar(doc, 112, y + 31, 78, data.overallConfidence, PURPLE);
  }
  y += 46;

  // E / S / G 카드 3열
  const esgItems = [
    { label: '환경 (E)',     score: data.eScore ?? 0, rgb: EMERALD },
    { label: '사회 (S)',     score: data.sScore ?? 0, rgb: [29, 78, 216] },
    { label: '지배구조 (G)', score: data.gScore ?? 0, rgb: PURPLE },
  ];
  const CW = 56, CGAP = 7, CX0 = 14;
  esgItems.forEach((item, i) => {
    const cx = CX0 + i * (CW + CGAP);
    setFill(doc, WHITE); doc.roundedRect(cx, y, CW, 38, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(cx, y, CW, 38, 3, 3, 'S');
    setFill(doc, item.rgb);
    doc.roundedRect(cx, y, CW, 3.5, 2, 2, 'F'); doc.rect(cx, y + 2, CW, 1.5, 'F');
    setF(doc, 8); setC(doc, MUTED);
    doc.text(item.label, cx + CW / 2, y + 14, { align: 'center' });
    setF(doc, 20); setC(doc, item.rgb);
    doc.text(String(item.score), cx + CW / 2, y + 29, { align: 'center' });
    setF(doc, 7); setC(doc, MUTED); doc.text('점', cx + CW / 2 + 9, y + 29);
    scoreBar(doc, cx + 6, y + 33, CW - 12, item.score, item.rgb);
  });
  y += 48;

  // 종합 의견 박스
  if (data.overallOpinion && y < 270) {
    const opText  = String(data.overallOpinion).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const opLines = doc.splitTextToSize(opText, 172);
    const opH     = Math.min(62, opLines.length * 5 + 14);
    setFill(doc, WHITE); doc.roundedRect(14, y, 182, opH, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, y, 182, opH, 3, 3, 'S');
    setFill(doc, EMERALD); doc.roundedRect(14, y, 182, 3.5, 2, 2, 'F'); doc.rect(14, y + 2, 182, 1.5, 'F');
    setF(doc, 7.5); setC(doc, MUTED); doc.text('종합 의견', 20, y + 11);
    setF(doc, 8.5); setC(doc, TEXT);
    doc.text(opLines.slice(0, Math.floor((opH - 16) / 5)), 20, y + 18);
    y += opH + 4;
  }

  // ── AUTO SIMULATION disclaimer 박스 ─────────────────────────────
  if (isAutoSimulation && y < 270) {
    const amberBg  = [254, 243, 199];
    const amberBdr = [217, 119, 6];
    setFill(doc, amberBg); doc.roundedRect(14, y, 182, 22, 3, 3, 'F');
    setDraw(doc, amberBdr); doc.setLineWidth(0.4); doc.roundedRect(14, y, 182, 22, 3, 3, 'S');
    setFill(doc, amberBdr); doc.rect(14, y, 3.5, 22, 'F');
    setF(doc, 8.5); setC(doc, [146, 64, 14]);
    doc.text('⚠  SIMULATION — 업종 benchmark 기반 ESG 사전 진단', 21, y + 7);
    setF(doc, 7.5); setC(doc, [180, 83, 9]);
    doc.text(
      '본 결과는 실제 ESG 증빙 감사(RAG Audit)가 수행되지 않았습니다. OCR·Retrieval·Evidence Matching이 실행되지 않은',
      21, y + 13.5
    );
    doc.text(
      '시뮬레이션 결과로, 공시·인증·투자자 보고 목적으로 활용할 수 없습니다.',
      21, y + 19
    );
    y += 28;
  }

  // ── Benchmark Estimation 알림 박스 ──────────────────────────────
  const isBenchmarkFallback = data.isBenchmarkFallback === true
    || data.benchmarkComparison?.companyDataSource === 'BENCHMARK'
    || data.benchmarkComparison?.companyDataSource === 'MOCK';
  if (isBenchmarkFallback && y < 275) {
    const amberBg = [254, 243, 199];
    const amberBdr = [217, 119, 6];
    setFill(doc, amberBg); doc.roundedRect(14, y, 182, 18, 3, 3, 'F');
    setDraw(doc, amberBdr); doc.setLineWidth(0.4); doc.roundedRect(14, y, 182, 18, 3, 3, 'S');
    setFill(doc, amberBdr); doc.rect(14, y, 3.5, 18, 'F');
    setF(doc, 8.5); setC(doc, [146, 64, 14]);
    doc.text('⚠  Benchmark Estimation Applied', 21, y + 7);
    setF(doc, 7.5); setC(doc, [180, 83, 9]);
    doc.text('실측 환경 데이터 부족 — 업종 평균 기반 추정치가 사용되었습니다. 실제 측정값 제출 시 정확도 향상됩니다.', 21, y + 14);
    y += 22;
  }

  // ── 수치 검증 실패 요약 박스 (lowMismatchCount > 0인 경우) ──────────
  const lowCount = data.lowMismatchCount ?? 0;
  if (lowCount > 0 && y < 270) {
    const isSevere = lowCount >= 4;
    const bgRgb = isSevere ? [254, 202, 202] : [254, 226, 226];
    const borderRgb = RED;
    setFill(doc, bgRgb); doc.roundedRect(14, y, 182, isSevere ? 20 : 16, 3, 3, 'F');
    setDraw(doc, borderRgb); doc.setLineWidth(0.4); doc.roundedRect(14, y, 182, isSevere ? 20 : 16, 3, 3, 'S');
    setF(doc, 8.5); setC(doc, RED);
    doc.text(
      isSevere
        ? `! 심각한 수치 불일치 감지: ${lowCount}개 항목이 증빙 문서 수치와 크게 다릅니다.`
        : `! 수치 불일치 감지: ${lowCount}개 항목에서 입력값과 증빙 문서 수치 간 차이가 발생했습니다.`,
      19, y + 8
    );
    if (data.gradeCeilingApplied) {
      setF(doc, 8); setC(doc, [180, 50, 30]);
      doc.text('수치 검증 실패로 Grade Ceiling 규칙이 적용되어 최종 등급이 제한되었습니다.', 19, y + 15);
    }
    y += (isSevere ? 20 : 16) + 6;
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 2: AI Verification Summary
  // ═══════════════════════════════════════════════════════
  {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, 'AI Verification Summary', [99, 102, 241]);

    let ys = 20;

    // ── 섹션 제목 ──────────────────────────────────────────
    setFill(doc, [99, 102, 241]); doc.rect(14, ys - 1, 3, 7, 'F');
    setF(doc, 11); setC(doc, TEXT); doc.text('AI Verification Summary', 20, ys + 4.5);
    ys += 14;

    // ── 핵심 지표 3열 카드: Verified / Weak / Contradiction ──
    // completeList: evidenceMatches + NO_EVIDENCE 합성 (missing 지표 포함) — 12개 지표 기준
    const completeList = buildCompleteListForPdf(data.evidenceMatches);
    const getVST = (ev) => {
      const c = ev.indicatorCode?.[0];
      if (c === 'E') {
        if (ev.numericMatchLevel === 'HIGH') return 'VERIFIED';
        if (ev.numericMatchLevel === 'MEDIUM') return 'WEAK';
        if (ev.numericMatchLevel === 'LOW') return 'CONTRADICTION';
        return 'NO_EVIDENCE';
      }
      if (ev.contradictionReason) return 'CONTRADICTION';
      if (!ev.isValidEvidence) return 'NO_EVIDENCE';
      const sim = ev.similarity != null ? Math.round(ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity) : 0;
      if (sim >= 85) return 'VERIFIED';
      if (sim >= 55) return 'WEAK';
      return 'NO_EVIDENCE';
    };
    const vstCounts = {
      VERIFIED:      completeList.filter(e => getVST(e) === 'VERIFIED').length,
      WEAK:          completeList.filter(e => getVST(e) === 'WEAK').length,
      CONTRADICTION: completeList.filter(e => getVST(e) === 'CONTRADICTION').length,
      NO_EVIDENCE:   completeList.filter(e => getVST(e) === 'NO_EVIDENCE').length,
    };
    const vstCards = [
      { label: 'VERIFIED',      count: vstCounts.VERIFIED,      rgb: EMERALD,         desc: '증빙 확인 완료' },
      { label: 'WEAK EVIDENCE', count: vstCounts.WEAK,          rgb: AMBER,            desc: '부분 증빙' },
      { label: 'CONTRADICTION', count: vstCounts.CONTRADICTION,  rgb: RED,              desc: '불일치 감지' },
      { label: 'NO EVIDENCE',   count: vstCounts.NO_EVIDENCE,    rgb: [100, 116, 139],  desc: '증빙 없음' },
    ];
    const vstCW = 41, vstGap = 5;
    vstCards.forEach((card, i) => {
      const cx = 14 + i * (vstCW + vstGap);
      setFill(doc, WHITE); doc.roundedRect(cx, ys, vstCW, 30, 2.5, 2.5, 'F');
      setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(cx, ys, vstCW, 30, 2.5, 2.5, 'S');
      setFill(doc, card.rgb); doc.roundedRect(cx, ys, vstCW, 3, 1.5, 1.5, 'F'); doc.rect(cx, ys + 1.5, vstCW, 1.5, 'F');
      setF(doc, 5.5); setC(doc, MUTED); doc.text(card.label, cx + vstCW / 2, ys + 11, { align: 'center' });
      setF(doc, 16); setC(doc, card.rgb); doc.text(String(card.count), cx + vstCW / 2, ys + 23, { align: 'center' });
      setF(doc, 6); setC(doc, MUTED); doc.text(card.desc, cx + vstCW / 2, ys + 28, { align: 'center' });
    });
    ys += 40;

    // ── E/S/G Radar Chart (manual polygon) ─────────────────
    setFill(doc, [99, 102, 241]); doc.rect(14, ys - 1, 3, 7, 'F');
    setF(doc, 10); setC(doc, TEXT); doc.text('E / S / G Radar Analysis', 20, ys + 4.5);
    ys += 12;

    const radarCx = 57, radarCy = ys + 38, radarR = 32;
    const eScore = data.eScore ?? 0;
    const sScore = data.sScore ?? 0;
    const gScore = data.gScore ?? 0;
    const angles = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI / 3), -Math.PI / 2 + (4 * Math.PI / 3)];
    const scores = [eScore, sScore, gScore];
    const labels = ['E 환경', 'S 사회', 'G 지배구조'];
    const rColors = [EMERALD, [29, 78, 216], PURPLE];

    // Background circles
    [0.25, 0.5, 0.75, 1].forEach(pct => {
      setDraw(doc, [70, 70, 80]); doc.setLineWidth(0.2);
      const pts = angles.map(a => ({ x: radarCx + Math.cos(a) * radarR * pct, y: radarCy + Math.sin(a) * radarR * pct }));
      doc.lines([[pts[1].x - pts[0].x, pts[1].y - pts[0].y], [pts[2].x - pts[1].x, pts[2].y - pts[1].y], [pts[0].x - pts[2].x, pts[0].y - pts[2].y]], pts[0].x, pts[0].y, [1, 1], 'S');
      setF(doc, 5); setC(doc, [80, 80, 90]);
      doc.text(String(Math.round(pct * 100)), radarCx + 1, radarCy - radarR * pct + 1);
    });

    // Axis lines
    angles.forEach((a, i) => {
      setDraw(doc, [80, 80, 90]); doc.setLineWidth(0.2);
      doc.line(radarCx, radarCy, radarCx + Math.cos(a) * radarR, radarCy + Math.sin(a) * radarR);
    });

    // Data polygon
    const dataPoints = angles.map((a, i) => ({
      x: radarCx + Math.cos(a) * radarR * (scores[i] / 100),
      y: radarCy + Math.sin(a) * radarR * (scores[i] / 100),
    }));
    setFill(doc, [99, 102, 241, 0.3]); setDraw(doc, [99, 102, 241]);
    doc.setFillColor(99, 102, 241, 0.25); doc.setDrawColor(99, 102, 241); doc.setLineWidth(1);
    doc.lines(
      [[dataPoints[1].x - dataPoints[0].x, dataPoints[1].y - dataPoints[0].y],
       [dataPoints[2].x - dataPoints[1].x, dataPoints[2].y - dataPoints[1].y],
       [dataPoints[0].x - dataPoints[2].x, dataPoints[0].y - dataPoints[2].y]],
      dataPoints[0].x, dataPoints[0].y, [1, 1], 'FD'
    );

    // Data points + score labels
    dataPoints.forEach((pt, i) => {
      setFill(doc, rColors[i]); doc.circle(pt.x, pt.y, 1.5, 'F');
      setF(doc, 7); setC(doc, rColors[i]);
      const ox = Math.cos(angles[i]) * 5, oy = Math.sin(angles[i]) * 5;
      doc.text(String(scores[i]), pt.x + ox, pt.y + oy, { align: 'center' });
    });

    // Axis labels
    angles.forEach((a, i) => {
      const lx = radarCx + Math.cos(a) * (radarR + 10);
      const ly = radarCy + Math.sin(a) * (radarR + 10);
      setF(doc, 6.5); setC(doc, rColors[i]);
      doc.text(labels[i], lx, ly, { align: 'center' });
    });

    // ── Strongest / Weakest 카드 (레이더 오른쪽) ─────────────
    const catScores = [{ cat: 'E 환경', score: eScore, rgb: EMERALD }, { cat: 'S 사회', score: sScore, rgb: [29, 78, 216] }, { cat: 'G 지배구조', score: gScore, rgb: PURPLE }];
    const strongest = [...catScores].sort((a, b) => b.score - a.score)[0];
    const weakest   = [...catScores].sort((a, b) => a.score - b.score)[0];

    const swX = 114;
    setFill(doc, WHITE); doc.roundedRect(swX, ys, 82, 38, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(swX, ys, 82, 38, 3, 3, 'S');
    setFill(doc, EMERALD); doc.roundedRect(swX, ys, 82, 3, 1.5, 1.5, 'F'); doc.rect(swX, ys + 1.5, 82, 1.5, 'F');
    setF(doc, 6.5); setC(doc, MUTED); doc.text('STRONGEST CATEGORY', swX + 41, ys + 10, { align: 'center' });
    setF(doc, 14); setC(doc, strongest.rgb); doc.text(strongest.cat, swX + 41, ys + 22, { align: 'center' });
    setF(doc, 8.5); setC(doc, strongest.rgb); doc.text(`${strongest.score}점`, swX + 41, ys + 31, { align: 'center' });
    scoreBar(doc, swX + 8, ys + 35, 66, strongest.score, strongest.rgb);

    setFill(doc, WHITE); doc.roundedRect(swX, ys + 44, 82, 38, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(swX, ys + 44, 82, 38, 3, 3, 'S');
    setFill(doc, AMBER); doc.roundedRect(swX, ys + 44, 82, 3, 1.5, 1.5, 'F'); doc.rect(swX, ys + 45.5, 82, 1.5, 'F');
    setF(doc, 6.5); setC(doc, MUTED); doc.text('WEAKEST CATEGORY', swX + 41, ys + 54, { align: 'center' });
    setF(doc, 14); setC(doc, weakest.rgb); doc.text(weakest.cat, swX + 41, ys + 66, { align: 'center' });
    setF(doc, 8.5); setC(doc, weakest.rgb); doc.text(`${weakest.score}점`, swX + 41, ys + 75, { align: 'center' });
    scoreBar(doc, swX + 8, ys + 79, 66, weakest.score, weakest.rgb);

    ys += 96;

    // ── Contradiction Summary ───────────────────────────────
    const contradictions = completeList.filter(e => getVST(e) === 'CONTRADICTION');
    if (contradictions.length > 0 && ys < 240) {
      setFill(doc, [99, 102, 241]); doc.rect(14, ys - 1, 3, 7, 'F');
      setF(doc, 10); setC(doc, TEXT); doc.text(`Contradiction Summary (${contradictions.length}건)`, 20, ys + 4.5);
      ys += 12;

      contradictions.slice(0, 6).forEach((ev, i) => {
        const ry = ys + i * 16;
        if (ry > 268) return;
        setFill(doc, [254, 226, 226]); doc.roundedRect(14, ry, 182, 13, 2, 2, 'F');
        setDraw(doc, RED); doc.setLineWidth(0.2); doc.roundedRect(14, ry, 182, 13, 2, 2, 'S');
        setFill(doc, RED); doc.roundedRect(14, ry, 3, 13, 1, 1, 'F');
        setF(doc, 7.5); setC(doc, RED);
        doc.text(`${ev.indicatorCode ?? '-'} · ${String(ev.indicatorTitle ?? '-').slice(0, 25)}`, 20, ry + 5);
        setF(doc, 7); setC(doc, [120, 50, 50]);
        const reason = ev.contradictionReason ?? (ev.numericMatchLevel === 'LOW' ? `수치 불일치 ${(ev.numericDiffPercent ?? 0).toFixed(1)}%` : '증빙 불일치');
        doc.text(String(reason).slice(0, 80), 20, ry + 10);
      });
      ys += Math.min(contradictions.length, 6) * 16 + 6;
    }

    // ── Confidence Tier badge ───────────────────────────────
    if (data.overallConfidence != null && ys < 268) {
      const confV   = data.overallConfidence;
      const confRgb = confV >= 70 ? EMERALD : confV >= 50 ? AMBER : RED;
      const confTier = confV >= 80 ? 'HIGH — 고신뢰 검증' : confV >= 60 ? 'MEDIUM — 보통 검증' : 'LOW — 추가 증빙 필요';
      setFill(doc, WHITE); doc.roundedRect(14, ys, 182, 18, 3, 3, 'F');
      setDraw(doc, confRgb); doc.setLineWidth(0.4); doc.roundedRect(14, ys, 182, 18, 3, 3, 'S');
      setFill(doc, confRgb); doc.roundedRect(14, ys, 3, 18, 1, 1, 'F');
      setF(doc, 8); setC(doc, MUTED); doc.text('AI Confidence Tier', 20, ys + 7);
      setF(doc, 14); setC(doc, confRgb); doc.text(`${confV}%`, 20, ys + 15);
      setF(doc, 8.5); setC(doc, confRgb); doc.text(confTier, 60, ys + 15);
      scoreBar(doc, 140, ys + 10, 50, confV, confRgb);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 3: Top Evidence Snippets
  // ═══════════════════════════════════════════════════════
  {
    const evs = data.evidenceMatches ?? [];
    const topEvs = [...evs]
      .filter(e => e.evidenceText || (e.numericMatchLevel != null && e.inputValue != null))
      .sort((a, b) => {
        const simA = a.similarity != null ? (a.similarity <= 1 ? a.similarity * 100 : a.similarity) : 0;
        const simB = b.similarity != null ? (b.similarity <= 1 ? b.similarity * 100 : b.similarity) : 0;
        return simB - simA;
      })
      .slice(0, 8);

    if (topEvs.length > 0) {
      doc.addPage();
      setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
      pageHeader(doc, 'Top Evidence Snippets', EMERALD);

      let yt = 20;
      setFill(doc, EMERALD); doc.rect(14, yt - 1, 3, 7, 'F');
      setF(doc, 11); setC(doc, TEXT); doc.text(`Top Evidence Snippets (${topEvs.length}건 · 유사도 상위)`, 20, yt + 4.5);
      yt += 14;

      setF(doc, 8); setC(doc, MUTED);
      doc.text('AI가 실제로 문서에서 검색·검증한 핵심 근거 텍스트입니다.', 14, yt);
      yt += 8;

      topEvs.forEach((ev, i) => {
        if (yt > 265) return;
        const catChar = ev.indicatorCode?.[0] ?? '-';
        const catRgb  = catChar === 'E' ? EMERALD : catChar === 'S' ? [29, 78, 216] : PURPLE;
        const simPct  = ev.similarity != null ? Math.round(ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity) : null;

        // card bg
        const cardH = ev.evidenceText ? 32 : 22;
        setFill(doc, WHITE); doc.roundedRect(14, yt, 182, cardH, 2.5, 2.5, 'F');
        setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, yt, 182, cardH, 2.5, 2.5, 'S');
        setFill(doc, catRgb); doc.roundedRect(14, yt, 3, cardH, 1, 1, 'F');

        // header row
        setF(doc, 7); setC(doc, catRgb);
        doc.text(`${catChar} · ${ev.indicatorCode ?? '-'}`, 20, yt + 6);
        setF(doc, 7.5); setC(doc, TEXT);
        doc.text(String(ev.indicatorTitle ?? '-').slice(0, 30), 45, yt + 6);

        // metadata chips
        const metaX = 14 + 182 - 2;
        if (ev.pageNumber != null) { setF(doc, 6); setC(doc, MUTED); doc.text(`p.${ev.pageNumber}`, metaX - 12, yt + 6, { align: 'right' }); }
        if (simPct != null) {
          const simCol = simPct >= 85 ? EMERALD : simPct >= 70 ? [29, 78, 216] : simPct >= 55 ? AMBER : RED;
          setF(doc, 6.5); setC(doc, simCol); doc.text(`sim ${simPct}%`, metaX - 28, yt + 6, { align: 'right' });
        }
        if (ev.retrievalRank != null) { setF(doc, 6); setC(doc, [120, 120, 130]); doc.text(`#${ev.retrievalRank}`, metaX - 48, yt + 6, { align: 'right' }); }

        // snippet
        if (ev.evidenceText) {
          const snippet = stripMd(ev.evidenceText).slice(0, 160);
          const snipLines = doc.splitTextToSize(snippet, 170);
          setF(doc, 7.5); setC(doc, [80, 80, 90]);
          doc.text(snipLines.slice(0, 2), 20, yt + 13);
        } else if (ev.numericMatchLevel != null) {
          setF(doc, 7.5); setC(doc, MUTED);
          doc.text(`입력값: ${ev.inputValue?.toLocaleString() ?? '-'} ${ev.unit ?? ''}   증빙값: ${ev.extractedValue?.toLocaleString() ?? '-'} ${ev.unit ?? ''}   차이: ${(ev.numericDiffPercent ?? 0).toFixed(1)}%`, 20, yt + 13);
        }

        yt += cardH + 4;
      });

      // ── AI Final Analysis Comment ────────────────────────
      if (yt < 255) {
        yt += 4;
        setFill(doc, [15, 23, 42]); doc.roundedRect(14, yt, 182, 36, 3, 3, 'F');
        setFill(doc, [99, 102, 241]); doc.roundedRect(14, yt, 182, 3, 1.5, 1.5, 'F'); doc.rect(14, yt + 1.5, 182, 1.5, 'F');
        setF(doc, 8.5); setC(doc, [147, 197, 253]); doc.text('AI Final Analysis Comment', 20, yt + 11);

        const eScore = data.eScore ?? 0, sScore = data.sScore ?? 0, gScore = data.gScore ?? 0;
        const catArr = [{ n: 'E 환경', s: eScore }, { n: 'S 사회', s: sScore }, { n: 'G 지배구조', s: gScore }];
        const strongest = catArr.sort((a, b) => b.s - a.s)[0];
        const weakestC  = [...catArr].sort((a, b) => a.s - b.s)[0];
        const grade = data.finalGrade ?? '?';
        const conf  = data.overallConfidence ?? 0;

        const comment = data.overallOpinion
          ? stripMd(data.overallOpinion).slice(0, 220)
          : `${data.companyName ?? '해당 기업'}의 ESG 분석 결과 종합 등급 ${grade}를 획득했습니다. 가장 강한 영역은 ${strongest.n}(${strongest.s}점)이며, 개선이 필요한 영역은 ${weakestC.n}(${weakestC.s}점)입니다. AI 검증 신뢰도는 ${conf}%로 평가되었습니다.`;
        const commentLines = doc.splitTextToSize(comment, 170);
        setF(doc, 8); setC(doc, [200, 210, 220]);
        doc.text(commentLines.slice(0, 3), 20, yt + 19);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 2 (orig): 기업 정보 + EcoPoint
  // ═══════════════════════════════════════════════════════
  const hasEco        = (data.ecoPoints ?? 0) > 0 || (data.carbonReductionKg ?? 0) > 0;
  const sScoreBefore  = data.sScoreBefore ?? null;
  const sScoreAfter   = data.sScoreAfter  ?? (hasEco ? data.sScore : null);
  const ecoBonus      = data.ecoScoreBonus ?? (sScoreBefore != null && sScoreAfter != null ? sScoreAfter - sScoreBefore : null);
  const partCnt       = data.participantCount ?? null;

  if (hasEco) {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, 'EcoPoint 반영 결과', EMERALD);

    let ye = 20;
    ye = sectionTitle(doc, 'EcoPoint 반영 결과', ye, EMERALD);

    // 주요 지표 4열
    const ecoMetrics = [
      data.ecoPoints      > 0 ? { label: '에코 포인트', value: data.ecoPoints.toLocaleString(), unit: 'P', rgb: EMERALD } : null,
      data.carbonReductionKg > 0 ? { label: '탄소 절감량', value: (data.carbonReductionKg / 1000).toFixed(2), unit: 'tCO₂', rgb: EMERALD } : null,
      data.equivalentTrees  > 0 ? { label: '나무 환산', value: Math.round(data.equivalentTrees).toLocaleString(), unit: '그루', rgb: EMERALD } : null,
      partCnt != null ? { label: '임직원 참여', value: partCnt.toLocaleString(), unit: '명', rgb: [29, 78, 216] } : null,
    ].filter(Boolean);

    const eMW = Math.min(55, (182 / Math.max(1, ecoMetrics.length)) - 5);
    const eGap = ecoMetrics.length > 1 ? (182 - ecoMetrics.length * eMW) / (ecoMetrics.length - 1) : 0;
    ecoMetrics.forEach((m, i) => {
      const ex = 14 + i * (eMW + eGap);
      setFill(doc, WHITE); doc.roundedRect(ex, ye, eMW, 36, 3, 3, 'F');
      setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(ex, ye, eMW, 36, 3, 3, 'S');
      setFill(doc, m.rgb); doc.roundedRect(ex, ye, eMW, 3.5, 2, 2, 'F'); doc.rect(ex, ye + 2, eMW, 1.5, 'F');
      setF(doc, 7); setC(doc, MUTED); doc.text(m.label, ex + eMW / 2, ye + 13, { align: 'center' });
      setF(doc, 17); setC(doc, m.rgb); doc.text(m.value, ex + eMW / 2, ye + 27, { align: 'center' });
      setF(doc, 7); setC(doc, MUTED); doc.text(m.unit, ex + eMW / 2, ye + 33, { align: 'center' });
    });
    ye += 46;

    // S 점수 before/after
    if (sScoreBefore != null && sScoreAfter != null) {
      setFill(doc, WHITE); doc.roundedRect(14, ye, 182, 42, 3, 3, 'F');
      setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, ye, 182, 42, 3, 3, 'S');
      setF(doc, 8); setC(doc, MUTED); doc.text('사회(S) 점수 변화', 20, ye + 10);

      // before
      setF(doc, 7); setC(doc, MUTED); doc.text('반영 전', 20, ye + 20);
      setF(doc, 12); setC(doc, [100, 116, 139]); doc.text(String(sScoreBefore), 20, ye + 30);
      miniBar(doc, 38, ye + 26, 120, sScoreBefore, [100, 116, 139]);

      // after
      setF(doc, 7); setC(doc, MUTED); doc.text('반영 후', 20, ye + 37);
      setF(doc, 12); setC(doc, EMERALD); doc.text(String(sScoreAfter), 20, ye + 38);
      miniBar(doc, 38, ye + 36, 120, sScoreAfter, EMERALD);

      if (ecoBonus != null && ecoBonus > 0) {
        setFill(doc, EMERALD_LIGHT); doc.roundedRect(166, ye + 14, 26, 18, 3, 3, 'F');
        setF(doc, 11); setC(doc, EMERALD); doc.text(`+${ecoBonus}`, 179, ye + 26, { align: 'center' });
      }
      ye += 52;
    } else if (ecoBonus != null && ecoBonus > 0) {
      setFill(doc, EMERALD_LIGHT); doc.roundedRect(14, ye, 182, 18, 3, 3, 'F');
      setF(doc, 8.5); setC(doc, EMERALD);
      doc.text(`EcoPoint 참여 활동이 사회(S) 점수에 +${ecoBonus}점 반영되었습니다.`, 105, ye + 11, { align: 'center' });
      ye += 28;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 3: Evidence 분석 근거 (MANUAL only — AUTO 제외)
  // ═══════════════════════════════════════════════════════
  if (!isAutoSimulation && data.evidenceMatches?.length > 0) {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, 'Evidence 분석 근거');

    let ye2 = 20;
    ye2 = sectionTitle(doc, 'Evidence 분석 근거', ye2);

    setF(doc, 8); setC(doc, MUTED);
    doc.text(`총 ${data.evidenceMatches.length}건  ·  K-ESG 지표별 원문 근거 RAG 매핑 결과`, 14, ye2);
    ye2 += 8;

    // 수치 불일치 경고 박스
    const hasLowMismatch = data.evidenceMatches.some(ev => ev.numericMatchLevel === 'LOW');
    if (hasLowMismatch) {
      setFill(doc, [254, 226, 226]); doc.roundedRect(14, ye2, 182, 12, 2, 2, 'F');
      setDraw(doc, RED); doc.setLineWidth(0.3); doc.roundedRect(14, ye2, 182, 12, 2, 2, 'S');
      setF(doc, 8); setC(doc, RED);
      doc.text('! 수치 불일치 감지: 입력 ESG 데이터와 증빙 문서 수치 간 큰 차이가 있습니다. 하단 수치검증 열을 확인하세요.', 19, ye2 + 8);
      ye2 += 18;
    }

    const toPctStr = (v) => {
      const p = toPct(v);
      return p != null ? `${p}%` : '-';
    };

    const hasNumeric = data.evidenceMatches.some(ev => ev.numericMatchLevel);

    autoTable(doc, {
      startY: ye2,
      head: [hasNumeric
        ? ['카테고리', '지표 코드', '지표명', '원문 근거', '유사도', '신뢰도', '수치검증', 'p.']
        : ['카테고리', '지표 코드', '지표명', '원문 근거', '유사도', '신뢰도', 'p.', '#']],
      body: data.evidenceMatches.slice(0, 45).map(ev => {
        const cat = ev.indicatorCode?.[0] ?? '-';
        const numericCell = ev.numericMatchLevel
          ? `${ev.numericMatchLevel}${ev.numericDiffPercent != null ? ` (${ev.numericDiffPercent.toFixed(1)}%)` : ''}`
          : '-';
        if (hasNumeric) {
          return [
            `${cat} · ${cat === 'E' ? '환경' : cat === 'S' ? '사회' : cat === 'G' ? '지배구조' : '-'}`,
            ev.indicatorCode ?? '-',
            String(ev.indicatorTitle ?? '-').slice(0, 18),
            String(ev.evidenceText ?? '-').slice(0, 50),
            toPctStr(ev.similarity),
            ev.confidenceLevel ?? '-',
            numericCell,
            ev.pageNumber != null ? `p.${ev.pageNumber}` : '-',
          ];
        }
        return [
          `${cat} · ${cat === 'E' ? '환경' : cat === 'S' ? '사회' : cat === 'G' ? '지배구조' : '-'}`,
          ev.indicatorCode ?? '-',
          String(ev.indicatorTitle ?? '-').slice(0, 18),
          String(ev.evidenceText ?? '-').slice(0, 55),
          toPctStr(ev.similarity),
          ev.confidenceLevel ?? '-',
          ev.pageNumber != null ? `p.${ev.pageNumber}` : '-',
          ev.retrievalRank != null ? `#${ev.retrievalRank}` : '-',
        ];
      }),
      styles:     { ...KOR, fontSize: 7, cellPadding: 2 },
      headStyles: { ...KOR, fillColor: NAVY, textColor: WHITE, fontSize: 7.5 },
      alternateRowStyles: { fillColor: BG2 },
      columnStyles: hasNumeric ? {
        0: { cellWidth: 22 },
        1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 28 },
        3: { cellWidth: 64 },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 22, halign: 'center' },
        7: { cellWidth: 10, halign: 'center' },
      } : {
        0: { cellWidth: 22 },
        1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 30 },
        3: { cellWidth: 72 },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 10, halign: 'center' },
        7: { cellWidth: 8,  halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          const confIdx = hasNumeric ? 5 : 5;
          if (hookData.column.index === confIdx) {
            const level = hookData.cell.raw;
            if (level === 'STRONG') hookData.cell.styles.textColor = EMERALD;
            if (level === 'HIGH')   hookData.cell.styles.textColor = EMERALD;
            if (level === 'MEDIUM') hookData.cell.styles.textColor = AMBER;
            if (level === 'WEAK')   hookData.cell.styles.textColor = AMBER;
            if (level === 'LOW')    hookData.cell.styles.textColor = RED;
          }
          if (hasNumeric && hookData.column.index === 6) {
            const raw = String(hookData.cell.raw ?? '');
            if (raw.startsWith('HIGH'))   hookData.cell.styles.textColor = EMERALD;
            if (raw.startsWith('MEDIUM')) { hookData.cell.styles.textColor = AMBER; hookData.cell.styles.fontStyle = 'bold'; }
            if (raw.startsWith('LOW'))    { hookData.cell.styles.textColor = RED;   hookData.cell.styles.fontStyle = 'bold'; }
          }
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 4: 업종 벤치마크 비교
  // ═══════════════════════════════════════════════════════
  const hasBench = (data.benchmarkComparison?.metrics?.length ?? 0) > 0;
  if (hasBench) {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, '업종 벤치마크 비교', PURPLE);

    let yb = 20;
    const industry = data.benchmarkComparison?.industry ?? '';
    yb = sectionTitle(doc, `업종 벤치마크 비교${industry ? ` — ${industry}` : ''}`, yb, PURPLE);

    const LOWER_BETTER = new Set(['kwh', 'mwh', 'gwh', 'tco2', 'tco2e', 'kg', 'm3', 'l', 'ton']);
    const lowerBetter  = (u = '') => LOWER_BETTER.has(u.toLowerCase());

    autoTable(doc, {
      startY: yb,
      head: [['지표명', '단위', '우리 기업', '업종 평균', '차이', '평가', '데이터 출처 (업종 평균)']],
      body: data.benchmarkComparison.metrics.map(m => {
        const cv  = m.company    ?? 0;
        const iv  = m.industryAvg ?? 0;
        const lib = lowerBetter(m.unit);
        const diff = iv > 0 ? ((cv - iv) / iv * 100) : null;
        const better = diff != null && (lib ? diff < 0 : diff > 0);
        return [
          m.name ?? '-',
          m.unit ?? '-',
          fmtNum(cv),
          fmtNum(iv),
          diff != null ? `${better ? '▼' : '▲'} ${Math.abs(diff).toFixed(1)}%` : '-',
          better ? '양호' : diff != null ? '개선 필요' : '-',
          m.source ?? '공공 통계 기반',
        ];
      }),
      styles:     { ...KOR, fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { ...KOR, fillColor: NAVY, textColor: WHITE, fontSize: 7.5 },
      alternateRowStyles: { fillColor: BG2 },
      columnStyles: {
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'right',  cellWidth: 22 },
        3: { halign: 'right',  cellWidth: 22 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'center', cellWidth: 18 },
        6: { cellWidth: 52, fontSize: 6.5, textColor: [120, 120, 130] },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 5) {
          hookData.cell.styles.textColor = hookData.cell.raw === '양호' ? EMERALD : RED;
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (hookData.section === 'body' && hookData.column.index === 4) {
          const val = hookData.cell.raw ?? '';
          hookData.cell.styles.textColor = val.startsWith('▼') ? EMERALD : RED;
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 5: Risk & Opportunity + GPT 총평
  // ═══════════════════════════════════════════════════════
  const hasRisk      = !!data.riskOpportunity;
  const reportSects  = parseReportSectionsForPdf(data.fullReport);

  if (hasRisk || reportSects.length > 0) {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, 'Risk & GPT 총평 분석', AMBER);

    let yr = 20;

    // 수치 검증 실패 요약 인박스 (Risk 섹션 앞)
    if ((data.lowMismatchCount ?? 0) > 0) {
      setFill(doc, [254, 226, 226]); doc.roundedRect(14, yr, 182, 10, 2, 2, 'F');
      setDraw(doc, RED); doc.setLineWidth(0.3); doc.roundedRect(14, yr, 182, 10, 2, 2, 'S');
      setF(doc, 8); setC(doc, RED);
      const severeStr = data.lowMismatchCount >= 4 ? '심각한 ' : '';
      const ceilStr = data.gradeCeilingApplied ? `  |  Grade Ceiling 적용 (등급 제한)` : '';
      doc.text(`! ${severeStr}수치 불일치: LOW ${data.lowMismatchCount}건${ceilStr}`, 19, yr + 6.5);
      yr += 16;
    }

    if (hasRisk) {
      yr = sectionTitle(doc, 'Risk & Opportunity 분석', yr, AMBER);
      const riskText = stripMd(data.riskOpportunity).slice(0, 900);
      setF(doc, 8.5); setC(doc, TEXT);
      const riskLines = doc.splitTextToSize(riskText, 182);
      const maxLines  = Math.min(riskLines.length, Math.floor((260 - yr) / 5));
      doc.text(riskLines.slice(0, maxLines), 14, yr);
      yr += maxLines * 5 + 10;
    }

    if (reportSects.length > 0 && yr < 270) {
      yr = sectionTitle(doc, 'AI 분석 리포트 (GPT 종합 진단)', yr, [29, 78, 216]);

      for (const sect of reportSects) {
        if (yr > 268) break;
        // 섹션 소제목
        setFill(doc, NAVY2); doc.roundedRect(14, yr, 182, 9, 2, 2, 'F');
        setF(doc, 8.5); setC(doc, WHITE);
        doc.text(sect.title, 18, yr + 6.5);
        yr += 13;

        const sText  = stripMd(sect.content).slice(0, 500);
        const sLines = doc.splitTextToSize(sText, 178);
        const avail  = Math.floor((268 - yr) / 5);
        const cut    = Math.min(sLines.length, avail);
        setF(doc, 8); setC(doc, TEXT);
        doc.text(sLines.slice(0, cut), 16, yr);
        yr += cut * 5 + 6;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 6: AI Verification Pipeline
  // ═══════════════════════════════════════════════════════
  if (!isAutoSimulation) {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, 'AI Verification Pipeline', [99, 102, 241]);

    let yv = 20;
    yv = sectionTitle(doc, 'AI Verification Pipeline', yv, [99, 102, 241]);

    // ── RAG 파이프라인 플로우 다이어그램 ──────────────────────────
    const steps = [
      { label: 'PDF Upload',       sub: 'Document Ingestion', rgb: [29, 78, 216] },
      { label: 'OCR Parse',        sub: 'Upstage API',        rgb: [99, 102, 241] },
      { label: 'Chunking',         sub: 'Sentence Splitting', rgb: [99, 102, 241] },
      { label: 'Vector Embed',     sub: 'ChromaDB Store',     rgb: [124, 58, 237] },
      { label: 'Retrieval',        sub: 'K-NN Search',        rgb: [124, 58, 237] },
      { label: 'Evidence Match',   sub: 'Similarity Filter',  rgb: [22, 163, 74] },
      { label: 'ESG Scoring',      sub: 'Grade Gating',       rgb: [22, 163, 74] },
    ];
    const SW = 23, SH = 16, SGAP = 3;
    const totalW = steps.length * SW + (steps.length - 1) * SGAP;
    const sx0 = (W - totalW) / 2;

    steps.forEach((s, i) => {
      const bx = sx0 + i * (SW + SGAP);
      setFill(doc, s.rgb); doc.roundedRect(bx, yv, SW, SH, 2.5, 2.5, 'F');
      setF(doc, 6.5); setC(doc, WHITE);
      doc.text(s.label, bx + SW / 2, yv + 6, { align: 'center' });
      setF(doc, 5.5); setC(doc, [200, 200, 220]);
      doc.text(s.sub, bx + SW / 2, yv + 11, { align: 'center' });
      // Arrow
      if (i < steps.length - 1) {
        const ax = bx + SW + 0.5;
        setDraw(doc, [120, 130, 150]); doc.setLineWidth(0.4);
        doc.line(ax, yv + SH / 2, ax + SGAP - 0.5, yv + SH / 2);
        setFill(doc, [120, 130, 150]);
        doc.triangle(ax + SGAP - 0.5, yv + SH / 2, ax + SGAP - 2.5, yv + SH / 2 - 1.5, ax + SGAP - 2.5, yv + SH / 2 + 1.5, 'F');
      }
    });
    yv += SH + 12;

    // ── 카테고리 검증 요약 ────────────────────────────────────────
    setFill(doc, [99, 102, 241]); doc.rect(14, yv - 1, 3, 7, 'F');
    setF(doc, 10); setC(doc, TEXT); doc.text('카테고리 검증 요약', 20, yv + 4.5);
    yv += 12;

    const toGradeLocal = (sc) => sc >= 90 ? 'S' : sc >= 80 ? 'A' : sc >= 70 ? 'B' : sc >= 60 ? 'C' : 'D';
    const catVerif = [
      { code: 'E', label: '환경 (Environmental)', weight: 40, score: data.eScore ?? 0, rgb: EMERALD,        grade: toGradeLocal(data.eScore ?? 0) },
      { code: 'S', label: '사회 (Social)',         weight: 30, score: data.sScore ?? 0, rgb: [29, 78, 216], grade: toGradeLocal(data.sScore ?? 0) },
      { code: 'G', label: '지배구조 (Governance)', weight: 30, score: data.gScore ?? 0, rgb: PURPLE,        grade: toGradeLocal(data.gScore ?? 0) },
    ];

    catVerif.forEach((cat, i) => {
      const rx = 14, rw = 182, rh = 22, ry = yv + i * (rh + 4);
      setFill(doc, WHITE); doc.roundedRect(rx, ry, rw, rh, 2.5, 2.5, 'F');
      setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(rx, ry, rw, rh, 2.5, 2.5, 'S');
      setFill(doc, cat.rgb); doc.roundedRect(rx, ry, 3.5, rh, 1.5, 1.5, 'F');

      setF(doc, 7); setC(doc, [80, 80, 90]);
      doc.text(cat.code, rx + 10, ry + 7, { align: 'center' });
      setF(doc, 8.5); setC(doc, TEXT);
      doc.text(cat.label, rx + 18, ry + 7);
      setF(doc, 7); setC(doc, MUTED);
      doc.text(`가중치: ${cat.weight}%`, rx + 18, ry + 15);

      const gr = gradeRgb(cat.grade);
      setF(doc, 16); setC(doc, gr);
      doc.text(String(cat.grade), rx + rw - 40, ry + 14, { align: 'center' });
      setF(doc, 12); setC(doc, cat.rgb);
      doc.text(`${cat.score}점`, rx + rw - 22, ry + 14, { align: 'right' });

      scoreBar(doc, rx + 18, ry + 18, rw - 60, cat.score, cat.rgb);
    });
    yv += catVerif.length * 26 + 8;

    // ── Confidence 산출 공식 설명 ──────────────────────────────────
    setFill(doc, [99, 102, 241]); doc.rect(14, yv - 1, 3, 7, 'F');
    setF(doc, 10); setC(doc, TEXT); doc.text('AI Confidence 산출 공식', 20, yv + 4.5);
    yv += 12;

    setFill(doc, WHITE); doc.roundedRect(14, yv, 182, 54, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, yv, 182, 54, 3, 3, 'S');
    setFill(doc, [99, 102, 241]); doc.roundedRect(14, yv, 182, 4, 2, 2, 'F'); doc.rect(14, yv + 2, 182, 2, 'F');

    const confRows = [
      { factor: 'Avg Similarity',   weight: '×40',  desc: 'RAG 검색 청크의 평균 코사인 유사도 (ChromaDB)' },
      { factor: 'Coverage Ratio',   weight: '×30',  desc: 'RAG Evidence 보유 지표 수 / 전체 지표 수' },
      { factor: 'Page Diversity',   weight: '×15',  desc: '유효 Evidence가 검색된 고유 페이지 수 (최대 5p 기준)' },
      { factor: 'Base',             weight: '+15',  desc: '최소 신뢰도 보장 (항상 적용)' },
      { factor: 'Contradiction',    weight: '-10/건', desc: 'Evidence 불일치·부정 신호 감지 시 차감' },
    ];

    confRows.forEach((row, idx) => {
      const ry2 = yv + 9 + idx * 9;
      setFill(doc, idx % 2 === 0 ? BG2 : WHITE);
      doc.rect(15, ry2 - 1, 180, 8.5, 'F');
      setF(doc, 8); setC(doc, [99, 102, 241]); doc.text(row.factor, 20, ry2 + 5);
      setF(doc, 8); setC(doc, AMBER); doc.text(row.weight, 78, ry2 + 5);
      setF(doc, 7.5); setC(doc, MUTED); doc.text(row.desc, 98, ry2 + 5);
    });

    yv += 62;

    // ── 종합 Confidence 결과 박스 ────────────────────────────────
    if ((data.overallConfidence ?? 0) > 0) {
      const confVal = data.overallConfidence;
      const confRgb = confVal >= 70 ? EMERALD : confVal >= 50 ? AMBER : RED;
      setFill(doc, WHITE); doc.roundedRect(14, yv, 182, 24, 3, 3, 'F');
      setDraw(doc, confRgb); doc.setLineWidth(0.4); doc.roundedRect(14, yv, 182, 24, 3, 3, 'S');
      setF(doc, 8); setC(doc, MUTED); doc.text('종합 AI 검증 신뢰도', 22, yv + 9);
      setF(doc, 18); setC(doc, confRgb); doc.text(`${confVal}%`, 22, yv + 20);
      scoreBar(doc, 75, yv + 14, 110, confVal, confRgb);
      const tier = confVal >= 80 ? 'HIGH — 고신뢰 검증 결과' : confVal >= 60 ? 'MEDIUM — 보통 수준의 검증 품질' : 'LOW — 추가 증빙 제출 권장';
      setF(doc, 8); setC(doc, confRgb); doc.text(tier, 187, yv + 20, { align: 'right' });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 7: ESG 점수 카드 상세 (breakdown)
  // ═══════════════════════════════════════════════════════
  const breakdown = data.esgChart?.breakdown ?? [];
  if (breakdown.length > 0) {
    doc.addPage();
    setFill(doc, BG); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, '지표별 세부 점수', EMERALD);

    let yd = 20;
    yd = sectionTitle(doc, `K-ESG 지표별 세부 점수 (${breakdown.length}개)`, yd);

    const GRADE_RGB_MAP = {
      S: PURPLE, A: EMERALD, B: [29, 78, 216], C: AMBER, D: RED, 'N/A': MUTED,
    };

    autoTable(doc, {
      startY: yd,
      head: [['지표 코드', '지표명', '점수', '등급', '신뢰도', '점수 바']],
      body: breakdown.map(b => [
        b.kesgCode ?? '-',
        String(b.title ?? '-').slice(0, 30),
        b.score != null ? `${b.score}점` : '-',
        b.grade ?? 'N/A',
        b.confidence != null ? `${b.confidence}%` : '-',
        '',
      ]),
      styles:     { ...KOR, fontSize: 8, cellPadding: 2.5 },
      headStyles: { ...KOR, fillColor: NAVY, textColor: WHITE },
      alternateRowStyles: { fillColor: BG2 },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 66 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 44 },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          if (hookData.column.index === 3) {
            const g = hookData.cell.raw;
            hookData.cell.styles.textColor = GRADE_RGB_MAP[g] ?? MUTED;
          }
        }
      },
      didDrawCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 5) {
          const row   = breakdown[hookData.row.index];
          if (!row) return;
          const score = row.score ?? 0;
          const rgb   = GRADE_RGB_MAP[row.grade ?? 'N/A'] ?? MUTED;
          const bx    = hookData.cell.x + 2;
          const by    = hookData.cell.y + hookData.cell.height / 2 - 1.5;
          const bw    = hookData.cell.width - 4;
          setFill(doc, BORDER); doc.roundedRect(bx, by, bw, 3, 1, 1, 'F');
          const filled = Math.max(2, bw * (score / 100));
          setFill(doc, rgb); doc.roundedRect(bx, by, filled, 3, 1, 1, 'F');
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  전체 페이지 푸터
  // ═══════════════════════════════════════════════════════
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (fontOk) doc.setFont('NanumGothic', 'normal'); else doc.setFont('helvetica', 'normal');
    pageFooter(doc, companyName, analysisId, p, total);
  }

  doc.save(`esg-report-${companyName.slice(0, 10)}-${analysisId}.pdf`);
};
