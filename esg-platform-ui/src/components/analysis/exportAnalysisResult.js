import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── 색상 팔레트 ──────────────────────────────────────────────────────
const GRADE_RGB = {
  S: [105, 55, 220], A: [34, 148, 85], B: [55, 100, 200],
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
const EMERALD = [34,  148, 85];
const EMERALD_LIGHT = [209, 250, 229];
const AMBER   = [217, 119, 6];
const RED     = [220, 38,  38];
const PURPLE  = [105, 55,  220];
const KOR     = { font: 'NanumGothic', fontStyle: 'normal' };

// ESG 카테고리 색상
const ESG_RGB = { E: EMERALD, S: [55, 100, 200], G: [217, 119, 6] };
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

// Single-line boilerplate detector — only exact test/dummy description lines, not doc titles with real content
const isBoilerplateLine = (line) => {
  const t = line.trim();
  if (!t || t.length < 4) return false;
  const lw = t.toLowerCase();
  if (lw.includes('retrieval 테스트') || lw.includes('retrieval테스트')) return true;
  if (lw.includes('성능 검증을 위해 작성')) return true;
  if (lw.includes('테스트 보고서입니다') || lw.includes('테스트보고서입니다')) return true;
  if (lw.includes('테스트 문서입니다') || lw.includes('테스트문서입니다')) return true;
  if (lw.includes('테스트 데이터입니다') || lw.includes('테스트데이터입니다')) return true;
  if (lw.includes('샘플 텍스트') || lw.includes('샘플텍스트')) return true;
  if (lw.includes('mock data') || lw.includes('mockdata')) return true;
  if (lw.includes('dummy data') || lw.includes('dummydata')) return true;
  if (lw.includes('sample text') || lw.includes('sampletext')) return true;
  // Short title-only lines (< 80 chars): "Social Test Report", "Test Report"
  if (t.length < 80) {
    if (lw.includes('social test report')) return true;
    if (/^test\s+report\s*$/i.test(t) || /^test\s+document\s*$/i.test(t)) return true;
    // "ESG Governance / Social Test Report" — short title with "test", no real policy words
    if (lw.includes('esg governance') && lw.includes('test')
        && !lw.includes('정책') && !lw.includes('규범') && !lw.includes('시스템')
        && !lw.includes('위원회') && !lw.includes('이사회') && !lw.includes('담당')) return true;
  }
  return false;
};

// Sentence-level stripping — removes boilerplate lines, preserves real ESG policy sentences
const stripBoilerplateLines = (text) => {
  if (!text) return '';
  return text.split('\n').filter(line => !isBoilerplateLine(line)).join('\n').trim();
};

// True only if the ENTIRE text is boilerplate — no real ESG content survives stripping
const isTestEvidence = (text) => {
  if (!text) return false;
  const cleaned = stripBoilerplateLines(text);
  return cleaned.length < 20 && text.trim().length > 0;
};

// Title-pattern detector — heading lines, doc-title-only chunks, very short non-evidence text
const isTitleOnlySnippet = (text) => {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 12) return true;  // Too short to be real evidence
  if (/^#{1,4}\s/.test(t)) return true;
  if (/^(강한\s+)?esg\s*(지속가능경영)?\s*보고서\s*\d*/i.test(t) && t.length < 50) return true;
  if (/^[가-힣\s]+보고서\s*\d+\s*$/i.test(t) && t.length < 40) return true;
  if (isTestEvidence(t)) return true;
  return false;
};

// Markdown table → concise one-liner (e.g. "month:2026-01 · electricity:50,000 · gas:600")
const processEvidenceSnippet = (text) => {
  if (!text) return '';
  // Strip boilerplate title lines before processing (preserves real policy content)
  const trimmed = stripBoilerplateLines(text.trim());
  if (!trimmed) return '';
  // Reject title-only / heading content
  if (isTitleOnlySnippet(trimmed)) return '';
  if (trimmed.startsWith('|')) {
    const rows = trimmed.split('\n').filter(r => /\|/.test(r) && !/^\s*\|[\s\-:|]+\|/.test(r));
    if (rows.length >= 2) {
      const hdrs = rows[0].split('|').map(c => c.trim()).filter(Boolean);
      const vals = rows[1].split('|').map(c => c.trim()).filter(Boolean);
      const pairs = hdrs.slice(0, 5).map((h, i) => vals[i] ? `${h}:${vals[i]}` : h).join(' · ');
      return pairs || stripMd(trimmed).slice(0, 160);
    }
  }
  const stripped = stripMd(trimmed).slice(0, 160);
  // Final check after stripping markdown — re-validate length
  return stripped.length < 8 ? '' : stripped;
};

// [1] overallOpinion 정합성: orphaned fragments 및 contradiction 0건일 때 stale mismatch 문구 제거
const sanitizeOpinion = (text, lowMismatchCount) => {
  if (!text) return text;
  let cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+지표는\s+존재하지\s+않았습니다[.!?。]?/g, '')
    .replace(/[^.!?。]*미확인\s*지표[^.!?。]*존재하지\s*않[^.!?。]*[.!?。]?/g, '')
    .replace(/확인되지\s+않았습니다\s*지표는\s+없습니다[.!?。]?/g, '')
    .replace(/[^.!?。]*확인되지\s+않[^.!?。]*지표는\s+없습니다[.!?。]?/g, '')
    .replace(/[^.!?。]*지표는\s+없습니다[.!?。]?/g, '')
    .replace(/[^.!?。]*(?:일부|특정)\s*지표에 대한[^.!?。]*(?:증빙은?\s*)?확인되지 않았습니다[.!?。]?/g, '')
    .replace(/[^.!?。]*(?:일부|특정)\s*지표에 대한[^.!?。]*제한적[^.!?。]*[.!?。]?/g, '')
    .replace(/[^.!?。]*증빙[^.!?。]*확인되지\s*않았습니다[.!?。]?/g, '')
    .replace(/\.\s*확인되지\s*않았습니다[.!?。]?/g, '.')
    .replace(/확인되지\s*않았습니다[.!?。]?\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if ((lowMismatchCount ?? 0) > 0) return cleaned;
  return cleaned
    .replace(/[^.!?。]*[EeSsGg]-\d{3}[^.!?。]*(?:불일치|차이|mismatch|오차|허용)[^.!?。]*[.!?。]?/g, '')
    .replace(/[^.!?。]*(?:수치 불일치|데이터 불일치|mismatch)[^.!?。]*[.!?。]?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const fmtNum = (v) => {
  if (v == null) return '-';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
};

const toPct = (v) => (v == null ? null : Math.round(v <= 1 ? v * 100 : v));

// G-303 governance phrase 우선순위 (UI buildCompleteIndicatorList와 동일 로직)
const _G303_GOV_PHRASES_PDF = [
  'esg 전담 부서','esg전담부서','esg 담당 조직','esg담당조직',
  '지속가능경영 조직','지속가능경영조직','대표이사 직속 esg','대표이사직속esg',
  '대표이사 직속','전담 부서','전담부서','담당 조직','담당조직',
  'esg 위원회','esg위원회','지속가능경영위원회','esg팀',
];
const _hasG303GovPhrase = (text) => {
  if (!text) return false;
  const n = text.toLowerCase().replace(/\s+/g, '');
  return _G303_GOV_PHRASES_PDF.some(p => n.includes(p.toLowerCase().replace(/\s+/g, '')));
};
const _g303Pri = (ev) => {
  if (_hasG303GovPhrase(ev.evidenceText ?? ev.text)) return 2;
  if (ev.matchedCluster?.startsWith('EXPLICIT:')) return 1;
  return 0;
};

// ── 전체 K-ESG 지표 코드 → 표시명 (Verification Summary의 단일 소스) ──
// [2] UI 와 동일한 15개 지표 — completeIndicatorList 단일 소스 기준
const ALL_INDICATOR_CODES_PDF = {
  'E-101': '전력 사용량',   'E-102': '가스 사용량',  'E-103': '탄소 배출량',
  'E-104': '폐기물 발생량', 'E-105': '용수 사용량',
  'S-201': '산업안전 교육', 'S-202': '산업재해 발생', 'S-203': 'ESG 교육 실시',
  'S-204': '임직원 참여',   'S-205': '협력사 ESG 평가',
  'G-301': '윤리경영 정책', 'G-302': '내부 신고 시스템', 'G-303': 'ESG 담당 조직',
  'G-304': '외부 감사 수행 여부', 'G-305': '이사회 독립성',
};

// NO EVIDENCE 지표별 권장 증빙 문구
const NO_EVIDENCE_RECOMMEND = {
  'E-101': '연간 전력 사용량(kWh) 공시 또는 에너지 사용 명세서 제출 권장',
  'E-102': '연간 가스 사용량(Nm3) 공시 또는 연료 구매 명세 제출 권장',
  'E-103': 'Scope 1/2 탄소 배출량(tCO2eq) 산정 결과 공시 권장',
  'E-104': '연간 폐기물 발생량(톤) 및 처리 방법 명세 제출 권장',
  'E-105': '연간 용수 사용량(m3) 공시 또는 수도 사용 명세 제출 권장',
  'S-201': '산업안전 교육 시행 횟수·이수율 KPI 공시 또는 교육 이수 기록 제출 권장',
  'S-202': '산업재해 발생 건수·재해율 공식 공시 또는 산재 통계 데이터 제출 권장',
  'S-203': 'ESG 교육 시행 실적(횟수·이수율) 공시 또는 교육 계획서 제출 권장',
  'S-204': '임직원 참여 프로그램 실적(참여율·건수) 공시 권장',
  'S-205': '협력사 ESG 평가 기준 및 평가 결과 공시 또는 평가 양식 제출 권장',
  'G-301': '윤리경영 강령·행동규범 문서 또는 내부 규정 제출 권장',
  'G-302': '내부 신고 채널 운영 현황 및 접수·처리 실적 공시 권장',
  'G-303': 'ESG 전담 위원회·조직도 및 담당 임원 지정 내역 공시 권장',
  'G-304': '외부 감사인 선임 내역 및 감사 보고서 제출 권장',
  'G-305': '이사회 구성 현황(사외이사 비율) 및 독립성 기준 공시 권장',
};

/**
 * evidenceMatches에 없는 지표를 NO_EVIDENCE 합성 항목으로 추가해 완전한 목록 반환.
 * getVST() 계산의 단일 소스 역할을 합니다.
 */
// E 지표 numeric 우선순위 (PDF에서도 UI와 동일 기준 적용)
const _numericPriPdf = (ev) =>
  ev?.numericMatchLevel === 'HIGH'   ? 3 :
  ev?.numericMatchLevel === 'MEDIUM' ? 2 :
  ev?.numericMatchLevel === 'LOW'    ? 1 : 0;

const buildCompleteListForPdf = (evidenceMatches) => {
  const byCode = new Map();
  for (const ev of (evidenceMatches ?? [])) {
    const code = ev.indicatorCode;
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing) { byCode.set(code, ev); continue; }
    // E 지표: numericMatchLevel 있는 evidence 최우선 선택 (numeric verification 우선)
    if (code.startsWith('E-')) {
      const evNum = _numericPriPdf(ev);
      const exNum = _numericPriPdf(existing);
      if (evNum > exNum) { byCode.set(code, ev); continue; }
      if (exNum > evNum) continue;
    }
    // G-303: governance phrase 포함 evidence 최우선 (UI buildCompleteIndicatorList와 동일 기준)
    if (code === 'G-303') {
      const evPri = _g303Pri(ev);
      const exPri = _g303Pri(existing);
      if (evPri > exPri) { byCode.set(code, ev); continue; }
      if (exPri > evPri) continue;
    }
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
  doc.text('GreenTrace  |  ESG 진단 플랫폼', 14, 7);
  if (label) { setC(doc, [148, 163, 184]); doc.text(label, 196, 7, { align: 'right' }); }
};

const pageFooter = (doc, companyName, analysisId, pageNum, total) => {
  const y = 289;
  setDraw(doc, [210, 215, 225]); doc.setLineWidth(0.2); doc.line(0, y, 210, y);
  setF(doc, 6); setC(doc, [155, 165, 180]);
  doc.text(`GreenTrace  |  ESG 진단 플랫폼  ·  ${companyName}  ·  ${analysisId}`, 14, y + 4.5);
  doc.text(`${pageNum} / ${total}`, 196, y + 4.5, { align: 'right' });
};

const sectionTitle = (doc, text, y, accentRgb = NAVY) => {
  setFill(doc, accentRgb); doc.rect(14, y - 1, 3, 8, 'F');
  setF(doc, 12); setC(doc, TEXT);
  doc.text(text, 20, y + 5.5);
  return y + 14;
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

// ── 업종별 가중치 (AnalysisResultPage와 동기화) ─────────────────────────
const IND_TYPE_MAP_PDF = {
  '06':'ENERGY','07':'ENERGY','08':'ENERGY',
  '10':'MFG','11':'MFG','12':'MFG','13':'MFG','14':'MFG','15':'MFG','16':'MFG','17':'MFG','18':'MFG',
  '19':'ENERGY','20':'ENERGY','21':'MFG','22':'MFG','23':'ENERGY','24':'ENERGY',
  '25':'MFG','26':'MFG','27':'MFG','28':'MFG','29':'MFG','30':'MFG','31':'MFG','32':'MFG','33':'MFG',
  '35':'ENERGY','36':'ENERGY',
  '45':'FIN','46':'FIN','47':'FIN','49':'FIN','50':'FIN','51':'FIN','52':'FIN','53':'FIN',
  '55':'FIN','56':'FIN',
  '58':'IT','59':'IT','60':'IT','61':'IT','62':'IT','63':'IT',
  '64':'FIN','65':'FIN','66':'FIN',
  '70':'IT','71':'IT','72':'IT','73':'IT',
};
const IND_W_MAP_PDF = {
  MFG:    { E:50, S:25, G:25, label:'제조·중공업' },
  ENERGY: { E:55, S:25, G:20, label:'에너지·화학' },
  FIN:    { E:25, S:40, G:35, label:'금융·서비스' },
  IT:     { E:30, S:40, G:30, label:'IT·플랫폼' },
  DEFAULT:{ E:40, S:30, G:30, label:'기본 (K-ESG)' },
};
const getPdfWeights = (ksicCode) => {
  const type = IND_TYPE_MAP_PDF[(ksicCode ?? '').substring(0, 2)] ?? 'DEFAULT';
  return IND_W_MAP_PDF[type];
};

// ── safe triangle (▲▼) alternatives ────────────────────────────────
const UP_ARROW   = 'UP  ';   // ▲ 대체
const DOWN_ARROW = 'DOWN';   // ▼ 대체

// ── 벤치마크 기반 Risk & Opportunity 문구 생성 (PDF 전용) ────────────────────
const buildRiskOpportunityPdf = (benchMetrics, eScore, sScore, gScore, industry) => {
  const ind = industry || '동 업종';
  const riskItems = [];
  const oppItems  = [];
  const LOWER_BETTER_KEYS = ['탄소', '가스', '전력', '폐기', '용수'];

  (benchMetrics ?? []).forEach(m => {
    if (m.company == null || m.industryAvg == null || m.industryAvg === 0) return;
    const diff = (m.company - m.industryAvg) / m.industryAvg * 100;
    const pct  = Math.abs(diff).toFixed(0);
    const key  = LOWER_BETTER_KEYS.find(k => (m.name ?? '').includes(k)) ?? '';
    const lb   = !!key;

    if (lb && diff > 5) {
      const msgs = {
        탄소: `탄소 배출량이 ${ind} 평균 대비 +${pct}% 높아 Scope 1·2 배출 관리 강화가 필요합니다.`,
        가스: `가스 사용량이 ${ind} 평균 대비 +${pct}% 높아 에너지 비용 및 배출 리스크가 존재합니다.`,
        전력: `전력 사용량이 ${ind} 평균 대비 +${pct}% 높아 에너지 효율 개선 조치가 권고됩니다.`,
        폐기: `폐기물 발생량이 ${ind} 평균 대비 +${pct}% 높아 자원 순환 체계 점검이 필요합니다.`,
        용수: `용수 사용량이 ${ind} 평균 대비 +${pct}% 높아 수자원 관리 효율화가 요구됩니다.`,
      };
      if (msgs[key]) riskItems.push(msgs[key]);
    } else if (lb && diff < -5) {
      const msgs = {
        탄소: `탄소 배출량이 ${ind} 평균보다 ${pct}% 낮아 탄소 감축 관리 체계가 효과적으로 운영되고 있습니다.`,
        가스: `가스 사용량이 ${ind} 평균보다 ${pct}% 낮아 에너지 효율 운영 성과가 확인됩니다.`,
        전력: `전력 사용량이 ${ind} 평균보다 ${pct}% 낮아 에너지 절감 운영 효율이 양호합니다.`,
        폐기: `폐기물 발생량이 ${ind} 평균보다 ${pct}% 낮아 자원 순환 및 폐기물 관리 효율성이 양호합니다.`,
        용수: `용수 사용량이 ${ind} 평균보다 ${pct}% 낮아 친환경 자원 운영 기반이 확보되어 있습니다.`,
      };
      if (msgs[key]) oppItems.push(msgs[key]);
    }
  });

  if (riskItems.length === 0 && oppItems.length === 0)
    riskItems.push(`${ind} 업종 벤치마크 데이터가 충분하지 않아 상세 비교가 제한됩니다.`);

  return '[리스크]\n' + riskItems.join('\n\n') + '\n\n[기회]\n' + oppItems.join('\n\n');
};

// ── 메인 Export ─────────────────────────────────────────────────────
export const exportAnalysisResult = async (data, analysisId, esgPoolCurrent = null) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let fontOk = false;
  try { await loadFont(doc); fontOk = true; } catch { doc.setFont('helvetica', 'normal'); }

  const W              = 210;
  const now            = new Date();
  const dateStr        = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const generatedAt    = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  doc.text('GreenTrace  |  ESG 진단 플랫폼', 14, 16);

  // Main title
  setF(doc, 22); setC(doc, WHITE);
  doc.text('ESG 진단 보고서', 14, 35);

  // Report subtitle — business description, no developer terms
  setF(doc, 8.5); setC(doc, [148, 163, 184]);
  doc.text(
    isAutoSimulation
      ? '업종 벤치마크 기반 ESG 사전 진단 보고서'
      : 'K-ESG 기준 기업 ESG 진단 보고서',
    14, 47
  );

  // 구분선
  setDraw(doc, [40, 55, 80]); doc.setLineWidth(0.3);
  doc.line(14, 54, 150, 54);

  // 기업명
  setF(doc, 19); setC(doc, WHITE);
  const nameLines = doc.splitTextToSize(companyName, 130);
  doc.text(nameLines, 14, 68);

  // 업종 + 분석일
  setF(doc, 7.5); setC(doc, [148, 163, 184]);
  doc.text(`${data.industry ?? '-'}  ·  ${analyzedAt}`, 14, 82);

  // 감사 상태 badge — 한국어 비즈니스 용어
  const isBenchmarkFallbackCover = data.isBenchmarkFallback === true
    || data.benchmarkComparison?.companyDataSource === 'BENCHMARK'
    || data.benchmarkComparison?.companyDataSource === 'MOCK';
  const auditBadgeLabel = isAutoSimulation
    ? '사전 진단'
    : isBenchmarkFallbackCover
    ? '추정 포함'
    : (data.lowMismatchCount ?? 0) > 0 || (data.overallConfidence ?? 100) < 50
    ? '검토 필요'
    : '검증 완료';
  const auditBadgeRgb = auditBadgeLabel === '검증 완료' ? EMERALD
    : auditBadgeLabel === '검토 필요' ? AMBER
    : auditBadgeLabel === '추정 포함' ? [100, 116, 139]
    : [100, 116, 139];
  setFill(doc, auditBadgeRgb);
  doc.roundedRect(14, 91, 36, 7.5, 2, 2, 'F');
  setF(doc, 7); setC(doc, WHITE);
  doc.text(auditBadgeLabel, 32, 96.3, { align: 'center' });

  // 하단 메타 정보 — 조용하고 작게
  setF(doc, 6.5); setC(doc, [100, 116, 139]);
  doc.text(`보고서 ID: ${analysisId}`, 14, 108);
  doc.text(generatedAt, 196, 108, { align: 'right' });

  // 종합 등급 pill (enterprise style — 원형 배지 대체)
  const pillW = 36, pillH = 26, pillX = 158, pillY = 35;
  setFill(doc, gradeC); doc.roundedRect(pillX, pillY, pillW, pillH, 5, 5, 'F');
  setF(doc, 6); setC(doc, [255, 255, 255, 180]);
  doc.text('등급', pillX + pillW / 2, pillY + 7, { align: 'center' });
  setF(doc, 20); setC(doc, WHITE);
  doc.text(String(data.finalGrade ?? '?'), pillX + pillW / 2, pillY + 22, { align: 'center' });

  // 본문 배경
  setFill(doc, WHITE); doc.rect(0, 115, W, 173, 'F');

  let y = 127;

  // 총점 + 신뢰도
  setFill(doc, BG); doc.roundedRect(14, y, 86, 38, 3, 3, 'F');
  setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, y, 86, 38, 3, 3, 'S');
  setFill(doc, gradeC); doc.roundedRect(14, y, 86, 4, 2, 2, 'F'); doc.rect(14, y + 2, 86, 2, 'F');
  setF(doc, 7.5); setC(doc, MUTED); doc.text('종합 점수', 57, y + 13, { align: 'center' });
  setF(doc, 30); setC(doc, gradeC); doc.text(String(data.totalScore ?? 0), 57, y + 27, { align: 'center' });
  setF(doc, 8); setC(doc, MUTED); doc.text('/ 100점', 72, y + 27);
  scoreBar(doc, 20, y + 34, 74, data.totalScore ?? 0, gradeC);

  if (data.overallConfidence != null) {
    setFill(doc, BG); doc.roundedRect(106, y, 90, 38, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(106, y, 90, 38, 3, 3, 'S');
    setFill(doc, PURPLE); doc.roundedRect(106, y, 90, 4, 2, 2, 'F'); doc.rect(106, y + 2, 90, 2, 'F');
    setF(doc, 7.5); setC(doc, MUTED); doc.text('검증 수준', 151, y + 13, { align: 'center' });
    setF(doc, 14); setC(doc, PURPLE); doc.text(`${data.overallConfidence}%`, 151, y + 23, { align: 'center' });
    scoreBar(doc, 112, y + 33, 78, data.overallConfidence, PURPLE);
  }
  y += 50;

  // E / S / G 카드 3열
  const esgItems = [
    { label: '환경 (E)',     score: data.eScore ?? 0, rgb: EMERALD },
    { label: '사회 (S)',     score: data.sScore ?? 0, rgb: [55, 100, 200] },
    { label: '지배구조 (G)', score: data.gScore ?? 0, rgb: PURPLE },
  ];
  const CW = 56, CGAP = 7, CX0 = 14;
  esgItems.forEach((item, i) => {
    const cx = CX0 + i * (CW + CGAP);
    setFill(doc, BG); doc.roundedRect(cx, y, CW, 40, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(cx, y, CW, 40, 3, 3, 'S');
    setFill(doc, item.rgb);
    doc.roundedRect(cx, y, CW, 3.5, 2, 2, 'F'); doc.rect(cx, y + 2, CW, 1.5, 'F');
    setF(doc, 8); setC(doc, MUTED);
    doc.text(item.label, cx + CW / 2, y + 15, { align: 'center' });
    setF(doc, 20); setC(doc, item.rgb);
    doc.text(String(item.score), cx + CW / 2, y + 30, { align: 'center' });
    setF(doc, 7); setC(doc, MUTED); doc.text('점', cx + CW / 2 + 9, y + 30);
    scoreBar(doc, cx + 6, y + 35, CW - 12, item.score, item.rgb);
  });
  y += 52;

  // 종합 감사 의견 박스 — dynamic height, auto-wrap 적용
  if (data.overallOpinion && y < 275) {
    const opText  = sanitizeOpinion(
      String(data.overallOpinion).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      data.lowMismatchCount
    );
    setF(doc, 8.5);
    const opLines = doc.splitTextToSize(opText, 168);
    const lineH   = 5.2;
    const headerH = 16;
    // 페이지 잔여 공간에 맞게 줄 수 조정 (최소 2줄 보장)
    const availH  = 280 - y - headerH - 6;
    const maxLines = Math.max(2, Math.floor(availH / lineH));
    const visLines = opLines.slice(0, maxLines);
    const opH     = Math.max(28, visLines.length * lineH + headerH + 4);
    setFill(doc, BG); doc.roundedRect(14, y, 182, opH, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(14, y, 182, opH, 3, 3, 'S');
    setFill(doc, EMERALD); doc.roundedRect(14, y, 182, 3.5, 2, 2, 'F'); doc.rect(14, y + 2, 182, 1.5, 'F');
    setF(doc, 7.5); setC(doc, MUTED); doc.text('종합 진단 의견', 20, y + 11);
    setF(doc, 8.5); setC(doc, TEXT);
    doc.text(visLines, 20, y + headerH + 2);
    y += opH + 4;
  }

  // ── 분석 유형 안내 ────────────────────────────────────────────────────
  if (isAutoSimulation && y < 272) {
    setFill(doc, BG); doc.roundedRect(14, y, 182, 12, 2, 2, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.15); doc.roundedRect(14, y, 182, 12, 2, 2, 'S');
    setFill(doc, MUTED); doc.rect(14, y, 3, 12, 'F');
    setF(doc, 7.5); setC(doc, MUTED);
    doc.text('제출된 ESG 데이터 및 업종 벤치마크 기준을 바탕으로 생성된 분석 결과입니다.', 20, y + 8, { maxWidth: 170 });
    y += 17;
  }

  // ── Benchmark Estimation 안내 ─────────────────────────────────────
  const isBenchmarkFallback = data.isBenchmarkFallback === true
    || data.benchmarkComparison?.companyDataSource === 'BENCHMARK'
    || data.benchmarkComparison?.companyDataSource === 'MOCK';
  if (isBenchmarkFallback && !isAutoSimulation && y < 276) {
    setFill(doc, BG); doc.roundedRect(14, y, 182, 11, 2, 2, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.15); doc.roundedRect(14, y, 182, 11, 2, 2, 'S');
    setF(doc, 7.5); setC(doc, MUTED);
    doc.text('일부 지표에 업종 평균 추정값이 반영되었습니다.', 20, y + 7.5, { maxWidth: 170 });
    y += 15;
  }

  // ── 수치 검증 결과 안내 ──────────────────────────────────────────────
  const lowCount = data.lowMismatchCount ?? 0;
  if (lowCount > 0 && y < 270) {
    const isSevere = lowCount >= 4;
    const hasGC = !!data.gradeCeilingApplied;
    const boxH = hasGC ? 18 : 12;
    setFill(doc, BG); doc.roundedRect(14, y, 182, boxH, 2, 2, 'F');
    setDraw(doc, isSevere ? [220, 38, 38] : BORDER); doc.setLineWidth(0.2);
    doc.roundedRect(14, y, 182, boxH, 2, 2, 'S');
    setFill(doc, isSevere ? RED : AMBER); doc.rect(14, y, 3, boxH, 'F');
    setF(doc, 8); setC(doc, isSevere ? RED : AMBER);
    doc.text(
      `수치 검증 결과 ${lowCount}개 항목에서 입력값과 증빙 수치 간 차이가 확인되었습니다.`,
      20, y + 8
    );
    if (hasGC) {
      setF(doc, 7.5); setC(doc, MUTED);
      doc.text('수치 불일치로 인해 최종 등급이 상한 조정되었습니다.', 20, y + 14);
    }
    y += boxH + 6;
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 2: AI Verification Summary
  // ═══════════════════════════════════════════════════════
  {
    doc.addPage();
    setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, '진단 결과 요약', [99, 102, 241]);

    let ys = 20;

    ys = sectionTitle(doc, '진단 결과 요약', ys, [99, 102, 241]);

    // ── 핵심 지표 3열 카드: Verified / Weak / Contradiction ──
    // completeList: evidenceMatches + NO_EVIDENCE 합성 (missing 지표 포함) — 12개 지표 기준
    const completeList = buildCompleteListForPdf(data.evidenceMatches);
    // G-303 entity keyword check (align with UI getVerificationStatus)
    const G303_ENTITY_PDF = ['esg팀','esg위원회','지속가능경영위원회','esg전담','esg 전담',
      '전담조직','전담 조직','담당부서','담당 부서','esg담당조직','esg 담당조직',
      'esg조직','esg 조직','esg tf','governance committee','sustainability team'];

    // UI HIGH_WEIGHT_PATTERNS 동기화 — evidenceText 기반 승격 (matchedKeywords DTO 미포함 보완)
    const PDF_HIGH_WEIGHT = [
      '전담 조직','내부 신고','참여율','교육 시행','이수율','안전교육','ESG 조직',
      '신고 시스템','운영 중','내부제보','신고채널',
      '윤리경영 위원회','위원회 운영','윤리경영','행동강령','준법경영','컴플라이언스',
      '반부패 정책','청렴 서약','이사회 독립','사외이사','외부감사','외부 감사',
      '제3자 검증','내부고발','ESG 담당','ESG 위원회','지속가능경영 위원회',
      '신고센터','제보센터','핫라인','내부 신고 시스템',
      'ISO45001','iso45001','TRIR','LTIR','안전보건경영시스템','무재해 달성',
      '중대재해 0건','재발방지 대책','안전교육 이수율',
      '사회공헌 투자','자원봉사 시간','봉사활동 시간','ESG 교육 이수율',
    ];
    const _hasHW = (text) => PDF_HIGH_WEIGHT.some(p => (text ?? '').includes(p));
    const _hasPct = (text) => /\d+\s*%|\d+\s*명|\d+\s*건|\d+\s*회/.test(text ?? '');

    // Evidence Classification Enum — UI getVerificationStatus와 동일 기준
    const getVST = (ev) => {
      const c = ev.indicatorCode?.[0];
      if (c === 'E') {
        if (ev.numericMatchLevel === 'HIGH')   return 'VERIFIED';
        if (ev.numericMatchLevel === 'MEDIUM') return 'PARTIAL';
        if (ev.numericMatchLevel === 'LOW')    return 'CONTRADICTION';
        if (ev.evidenceText || ev.isValidEvidence) return 'PARTIAL';
        return 'NO_EVIDENCE';
      }
      if (ev.contradictionReason) return 'CONTRADICTION';
      if (!ev.isValidEvidence)    return 'NO_EVIDENCE';

      // [G-303] entity gate — 조직 키워드 없으면 NO_EVIDENCE
      if (ev.indicatorCode === 'G-303') {
        const t = (ev.evidenceText ?? '').toLowerCase().replaceAll(' ', '');
        if (!G303_ENTITY_PDF.some(k => t.includes(k.replaceAll(' ', '')))) return 'NO_EVIDENCE';
      }

      // UI "직접 근거 확인" 배지와 동일 기준: isValidEvidence=true → VERIFIED
      // (UI line 4297: ev.isValidEvidence === true → "직접 근거 확인")
      return 'VERIFIED';
    };
    const vstCounts = {
      VERIFIED:      completeList.filter(e => getVST(e) === 'VERIFIED').length,
      PARTIAL:       completeList.filter(e => getVST(e) === 'PARTIAL').length,
      CONTRADICTION: completeList.filter(e => getVST(e) === 'CONTRADICTION').length,
      NO_EVIDENCE:   completeList.filter(e => getVST(e) === 'NO_EVIDENCE').length,
    };
    const vstCards = [
      { label: '확인',       count: vstCounts.VERIFIED,      rgb: EMERALD,         desc: '진단 근거 확인' },
      { label: '부분 확인',  count: vstCounts.PARTIAL,       rgb: AMBER,            desc: '부분 근거 확인' },
      { label: '불일치',     count: vstCounts.CONTRADICTION,  rgb: RED,              desc: '수치 차이 감지' },
      { label: '미확인',     count: vstCounts.NO_EVIDENCE,    rgb: [100, 116, 139],  desc: '근거 미확인' },
    ];
    const vstCW = 41, vstGap = 5;
    vstCards.forEach((card, i) => {
      const cx = 14 + i * (vstCW + vstGap);
      setFill(doc, BG); doc.roundedRect(cx, ys, vstCW, 30, 2.5, 2.5, 'F');
      setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(cx, ys, vstCW, 30, 2.5, 2.5, 'S');
      setFill(doc, card.rgb); doc.roundedRect(cx, ys, vstCW, 3, 1.5, 1.5, 'F'); doc.rect(cx, ys + 1.5, vstCW, 1.5, 'F');
      setF(doc, 5.5); setC(doc, MUTED); doc.text(card.label, cx + vstCW / 2, ys + 11, { align: 'center' });
      setF(doc, 16); setC(doc, card.rgb); doc.text(String(card.count), cx + vstCW / 2, ys + 23, { align: 'center' });
      setF(doc, 6); setC(doc, MUTED); doc.text(card.desc, cx + vstCW / 2, ys + 28, { align: 'center' });
    });
    ys += 40;

    // ── NO EVIDENCE 지표 목록 (보완 필요 지표) — 전체 출력, 페이지 오버플로우 시 다음 페이지 ──
    const noEvidenceList = completeList.filter(e => getVST(e) === 'NO_EVIDENCE');
    if (noEvidenceList.length > 0) {
      const ROW_H = 14;           // 지표 1행 높이
      const HEADER_H = 12;        // "추가 증빙 권장 지표" 헤더 높이
      const PAGE_BOTTOM = 272;    // 페이지 하단 여백 경계

      // 현재 페이지에 헤더+최소 1행이라도 들어갈 공간이 없으면 새 페이지
      if (ys + HEADER_H + ROW_H > PAGE_BOTTOM) {
        doc.addPage(); ys = 18;
      }

      // 헤더 렌더링
      setFill(doc, [248, 250, 252]); doc.roundedRect(14, ys, 182, HEADER_H, 2.5, 2.5, 'F');
      setDraw(doc, [100, 116, 139]); doc.setLineWidth(0.2); doc.roundedRect(14, ys, 182, HEADER_H, 2.5, 2.5, 'S');
      setF(doc, 7.5); setC(doc, [100, 116, 139]);
      doc.text(`추가 증빙 권장 지표 (${noEvidenceList.length}개)`, 20, ys + 8);
      ys += HEADER_H;

      // 지표 행 렌더링 — 페이지 경계 초과 시 새 페이지
      noEvidenceList.forEach((ev) => {
        if (ys + ROW_H > PAGE_BOTTOM) {
          doc.addPage(); ys = 18;
          // 새 페이지 연속 헤더
          setFill(doc, [248, 250, 252]); doc.roundedRect(14, ys, 182, HEADER_H, 2.5, 2.5, 'F');
          setDraw(doc, [100, 116, 139]); doc.setLineWidth(0.2); doc.roundedRect(14, ys, 182, HEADER_H, 2.5, 2.5, 'S');
          setF(doc, 7.5); setC(doc, [100, 116, 139]); doc.text('추가 증빙 권장 지표 (이어서)', 20, ys + 8);
          ys += HEADER_H;
        }
        const catChar = ev.indicatorCode?.[0] ?? '-';
        const catRgb = catChar === 'E' ? EMERALD : catChar === 'S' ? [55, 100, 200] : PURPLE;
        setFill(doc, [248, 250, 252]); doc.rect(14, ys, 182, ROW_H, 'F');
        setDraw(doc, BORDER); doc.setLineWidth(0.15); doc.rect(14, ys, 182, ROW_H, 'S');
        setFill(doc, catRgb); doc.roundedRect(20, ys + 5, 2, 4, 0.5, 0.5, 'F');
        setF(doc, 7.5); setC(doc, TEXT);
        doc.text(`${ev.indicatorCode ?? '-'} — ${String(ev.indicatorTitle ?? ALL_INDICATOR_CODES_PDF[ev.indicatorCode] ?? '-').slice(0, 30)}`, 25, ys + 5.5);
        const rec = NO_EVIDENCE_RECOMMEND[ev.indicatorCode ?? ''];
        if (rec) { setF(doc, 6); setC(doc, MUTED); doc.text(rec.slice(0, 65), 25, ys + 11); }
        ys += ROW_H;
      });
      ys += 6;
    }

    // ── E/S/G 영역별 점수 분포 ─────────────────────────────────
    setFill(doc, [99, 102, 241]); doc.rect(14, ys - 1, 3, 8, 'F');
    setF(doc, 12); setC(doc, TEXT); doc.text('ESG 영역별 점수 분포', 20, ys + 5.5);
    ys += 14;

    const radarCx = 57, radarCy = ys + 38, radarR = 32;
    const eScore = data.eScore ?? 0;
    const sScore = data.sScore ?? 0;
    const gScore = data.gScore ?? 0;
    const angles = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI / 3), -Math.PI / 2 + (4 * Math.PI / 3)];
    const scores = [eScore, sScore, gScore];
    const labels = ['E 환경', 'S 사회', 'G 지배구조'];
    const rColors = [EMERALD, [55, 100, 200], PURPLE];

    // Background grid triangles — light gray (enterprise dashboard style)
    [0.25, 0.5, 0.75, 1].forEach(pct => {
      setDraw(doc, [215, 220, 232]); doc.setLineWidth(0.15);
      const pts = angles.map(a => ({ x: radarCx + Math.cos(a) * radarR * pct, y: radarCy + Math.sin(a) * radarR * pct }));
      doc.lines([[pts[1].x - pts[0].x, pts[1].y - pts[0].y], [pts[2].x - pts[1].x, pts[2].y - pts[1].y], [pts[0].x - pts[2].x, pts[0].y - pts[2].y]], pts[0].x, pts[0].y, [1, 1], 'S');
      setF(doc, 5); setC(doc, [180, 185, 200]);
      doc.text(String(Math.round(pct * 100)), radarCx + 1, radarCy - radarR * pct + 1);
    });

    // Axis lines — light
    angles.forEach((a, i) => {
      setDraw(doc, [215, 220, 232]); doc.setLineWidth(0.2);
      doc.line(radarCx, radarCy, radarCx + Math.cos(a) * radarR, radarCy + Math.sin(a) * radarR);
    });

    // Data polygon — very light fill + prominent blue stroke
    const dataPoints = angles.map((a, i) => ({
      x: radarCx + Math.cos(a) * radarR * (scores[i] / 100),
      y: radarCy + Math.sin(a) * radarR * (scores[i] / 100),
    }));
    doc.setFillColor(228, 237, 255); doc.setDrawColor(29, 78, 216); doc.setLineWidth(2.5);
    doc.lines(
      [[dataPoints[1].x - dataPoints[0].x, dataPoints[1].y - dataPoints[0].y],
       [dataPoints[2].x - dataPoints[1].x, dataPoints[2].y - dataPoints[1].y],
       [dataPoints[0].x - dataPoints[2].x, dataPoints[0].y - dataPoints[2].y]],
      dataPoints[0].x, dataPoints[0].y, [1, 1], 'FD'
    );

    // Vertex dots — white ring + category color center (강조 강화)
    dataPoints.forEach((pt, i) => {
      setDraw(doc, rColors[i]); doc.setLineWidth(1.5);
      doc.setFillColor(255, 255, 255); doc.circle(pt.x, pt.y, 5.0, 'FD');
      setFill(doc, rColors[i]); doc.circle(pt.x, pt.y, 3.0, 'F');
      setF(doc, 8); setC(doc, rColors[i]);
      const ox = Math.cos(angles[i]) * 6, oy = Math.sin(angles[i]) * 6;
      doc.text(String(scores[i]), pt.x + ox, pt.y + oy, { align: 'center' });
    });

    // Axis labels — contrast 강화
    angles.forEach((a, i) => {
      const lx = radarCx + Math.cos(a) * (radarR + 10);
      const ly = radarCy + Math.sin(a) * (radarR + 10);
      setF(doc, 8); setC(doc, rColors[i]);
      doc.text(labels[i], lx, ly, { align: 'center' });
    });

    // ── Strongest / Weakest 카드 (레이더 오른쪽) ─────────────
    const catScores = [{ cat: 'E 환경', score: eScore, rgb: EMERALD }, { cat: 'S 사회', score: sScore, rgb: [55, 100, 200] }, { cat: 'G 지배구조', score: gScore, rgb: PURPLE }];
    const strongest = [...catScores].sort((a, b) => b.score - a.score)[0];
    const weakest   = [...catScores].sort((a, b) => a.score - b.score)[0];

    const swX = 114;
    setFill(doc, BG); doc.roundedRect(swX, ys, 82, 38, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(swX, ys, 82, 38, 3, 3, 'S');
    setFill(doc, EMERALD); doc.roundedRect(swX, ys, 82, 3, 1.5, 1.5, 'F'); doc.rect(swX, ys + 1.5, 82, 1.5, 'F');
    setF(doc, 6.5); setC(doc, MUTED); doc.text('강점 영역', swX + 41, ys + 10, { align: 'center' });
    setF(doc, 14); setC(doc, strongest.rgb); doc.text(strongest.cat, swX + 41, ys + 22, { align: 'center' });
    setF(doc, 8.5); setC(doc, strongest.rgb); doc.text(`${strongest.score}점`, swX + 41, ys + 31, { align: 'center' });
    scoreBar(doc, swX + 8, ys + 35, 66, strongest.score, strongest.rgb);

    setFill(doc, BG); doc.roundedRect(swX, ys + 44, 82, 38, 3, 3, 'F');
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(swX, ys + 44, 82, 38, 3, 3, 'S');
    setFill(doc, AMBER); doc.roundedRect(swX, ys + 44, 82, 3, 1.5, 1.5, 'F'); doc.rect(swX, ys + 45.5, 82, 1.5, 'F');
    setF(doc, 6.5); setC(doc, MUTED); doc.text('개선 필요 영역', swX + 41, ys + 54, { align: 'center' });
    setF(doc, 14); setC(doc, weakest.rgb); doc.text(weakest.cat, swX + 41, ys + 66, { align: 'center' });
    setF(doc, 8.5); setC(doc, weakest.rgb); doc.text(`${weakest.score}점`, swX + 41, ys + 75, { align: 'center' });
    scoreBar(doc, swX + 8, ys + 79, 66, weakest.score, weakest.rgb);

    ys += 96;

    // ── Contradiction Summary ───────────────────────────────
    const contradictions = completeList.filter(e => getVST(e) === 'CONTRADICTION');
    if (contradictions.length > 0 && ys < 240) {
      setFill(doc, RED); doc.rect(14, ys - 1, 3, 8, 'F');
      setF(doc, 12); setC(doc, TEXT); doc.text(`수치 불일치 감지 (${contradictions.length}건)`, 20, ys + 5.5);
      ys += 14;

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
    if (ys + 34 > 272) { doc.addPage(); ys = 18; }
    if (data.overallConfidence != null) {
      const confV   = data.overallConfidence;
      const confRgb = confV >= 70 ? EMERALD : confV >= 50 ? AMBER : [180, 140, 80];
      const confTier = confV >= 80 ? '높음 — 검증 완성도 우수' : confV >= 60 ? '보통 — 부분 검증 포함' : '낮음 — 검증 범위 제한';
      setFill(doc, BG); doc.roundedRect(14, ys, 182, 26, 3, 3, 'F');
      setDraw(doc, confRgb); doc.setLineWidth(0.3); doc.roundedRect(14, ys, 182, 26, 3, 3, 'S');
      setFill(doc, confRgb); doc.roundedRect(14, ys, 3, 26, 1, 1, 'F');
      setF(doc, 8); setC(doc, MUTED); doc.text('검증 수준', 20, ys + 7);
      setF(doc, 14); setC(doc, confRgb); doc.text(`${confV}%`, 20, ys + 17);
      setF(doc, 8.5); setC(doc, confRgb); doc.text(confTier, 60, ys + 17);
      scoreBar(doc, 140, ys + 12, 50, confV, confRgb);
      setF(doc, 6.5); setC(doc, MUTED);
      doc.text('관련성 등급: 높음 85+ | 보통 65~84 | 낮음 65 미만', 20, ys + 24);
      ys += 34;
    }

    // ── EcoPoint 반영 결과 (검증수준 바로 아래) ──────────────
    const _hasEcoP2 = (data.ecoPoints ?? 0) > 0 || (data.carbonReductionKg ?? 0) > 0 || (data.ecoSBonus ?? 0) > 0 || (data.esgPoolBefore ?? 0) > 0 || esgPoolCurrent != null;
    if (_hasEcoP2) {
      const _ecoBonus    = data.ecoScoreBonus ?? data.ecoSBonus ?? null;
      const _reflectedEP = _ecoBonus != null && _ecoBonus > 0 ? _ecoBonus * 1000 : null;
      const _poolBefore  = data.esgPoolBefore ?? data.ecoPoints ?? null;
      // 현재 남은 EcoPoint: DB 저장값 → 실시간 잔액 → 계산값 순 우선
      const _remaining   = data.esgPoolAfter != null
                         ? Number(data.esgPoolAfter)
                         : esgPoolCurrent != null
                         ? Number(esgPoolCurrent)
                         : _poolBefore != null && _reflectedEP != null
                         ? Math.max(0, Number(_poolBefore) - _reflectedEP)
                         : null;

      // 새 페이지가 필요하면 추가
      if (ys > 240) { doc.addPage(); setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F'); pageHeader(doc, 'EcoPoint 반영 결과', EMERALD); ys = 20; }

      setFill(doc, EMERALD); doc.rect(14, ys - 1, 3, 8, 'F');
      setF(doc, 11); setC(doc, TEXT); doc.text('EcoPoint 반영 결과', 20, ys + 5.5);
      ys += 14;

      // 3카드: ESG 반영 포인트 → Social(S) 가점 → 현재 남은 EcoPoint
      const _ecoCards = [
        { label: 'ESG 반영 포인트',    value: _reflectedEP != null ? _reflectedEP.toLocaleString() : '-', unit: 'EP',  rgb: EMERALD },
        { label: 'Social(S) 가점',     value: _ecoBonus != null && _ecoBonus > 0 ? `+${_ecoBonus}` : '-', unit: '점',  rgb: [37, 99, 235] },
        { label: '현재 남은 EcoPoint', value: _remaining != null ? _remaining.toLocaleString() : '-',      unit: 'EP',  rgb: [100, 116, 139] },
      ];
      const _cW = 55, _cGap = (182 - 3 * _cW) / 2;
      _ecoCards.forEach((m, i) => {
        const ex = 14 + i * (_cW + _cGap);
        setFill(doc, WHITE); doc.roundedRect(ex, ys, _cW, 34, 3, 3, 'F');
        setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.roundedRect(ex, ys, _cW, 34, 3, 3, 'S');
        setFill(doc, m.rgb); doc.roundedRect(ex, ys, _cW, 3, 1.5, 1.5, 'F'); doc.rect(ex, ys + 1.5, _cW, 1.5, 'F');
        setF(doc, 6); setC(doc, MUTED); doc.text(m.label, ex + _cW / 2, ys + 11, { align: 'center' });
        setF(doc, 15); setC(doc, m.rgb); doc.text(m.value, ex + _cW / 2, ys + 24, { align: 'center' });
        setF(doc, 7); setC(doc, MUTED); doc.text(m.unit, ex + _cW / 2, ys + 31, { align: 'center' });
        // 화살표
        if (i < _ecoCards.length - 1) {
          setF(doc, 10); setC(doc, [180, 180, 180]);
          doc.text('>', ex + _cW + _cGap / 2, ys + 18, { align: 'center' });
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 3 (구 카드섹션 자리) — 아래 통합 테이블로 대체됨
  // ═══════════════════════════════════════════════════════
  if (false) {
    const evs = data.evidenceMatches ?? [];

    // G-303: governance phrase 우선 evidence를 per-indicator 대표로 먼저 선택,
    // 이후 나머지 지표는 similarity 기준 정렬 — UI/PDF single source 보장
    const byCode = new Map();
    for (const ev of evs) {
      const code = ev.indicatorCode;
      if (!code || !(ev.evidenceText || (ev.numericMatchLevel != null && ev.inputValue != null))) continue;
      // Skip test/mock/dummy evidence from top snippets
      if (isTestEvidence(ev.evidenceText ?? '')) continue;
      const existing = byCode.get(code);
      if (!existing) { byCode.set(code, ev); continue; }
      if (code === 'G-303') {
        const evPri = _g303Pri(ev);
        const exPri = _g303Pri(existing);
        if (evPri > exPri) { byCode.set(code, ev); continue; }
        if (exPri > evPri) continue;
      }
      const evSim = ev.similarity != null ? (ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity) : 0;
      const exSim = existing.similarity != null ? (existing.similarity <= 1 ? existing.similarity * 100 : existing.similarity) : 0;
      if (evSim > exSim) byCode.set(code, ev);
    }

    const topEvs = [...byCode.values()]
      .sort((a, b) => {
        // G-303 governance phrase → 항상 맨 앞
        const aG303Gov = a.indicatorCode === 'G-303' && _g303Pri(a) === 2;
        const bG303Gov = b.indicatorCode === 'G-303' && _g303Pri(b) === 2;
        if (aG303Gov && !bG303Gov) return -1;
        if (!aG303Gov && bG303Gov) return 1;
        const simA = a.similarity != null ? (a.similarity <= 1 ? a.similarity * 100 : a.similarity) : 0;
        const simB = b.similarity != null ? (b.similarity <= 1 ? b.similarity * 100 : b.similarity) : 0;
        return simB - simA;
      })
      .slice(0, 12);

    if (topEvs.length > 0) {
      doc.addPage();
      setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F');
      pageHeader(doc, '지표별 진단 근거', EMERALD);

      let yt = 20;
      yt = sectionTitle(doc, `지표별 진단 근거 (${topEvs.length}건)`, yt, EMERALD);

      setF(doc, 7.5); setC(doc, MUTED);
      doc.text('각 K-ESG 지표에 대해 확인된 주요 진단 근거입니다.', 14, yt);
      yt += 7;

      topEvs.forEach((ev, i) => {
        if (yt > 268) return;
        const catChar = ev.indicatorCode?.[0] ?? '-';
        const catRgb  = catChar === 'E' ? EMERALD : catChar === 'S' ? [55, 100, 200] : PURPLE;
        const simPct  = ev.similarity != null ? Math.round(ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity) : null;

        // card bg — compact height
        const cardH = ev.evidenceText ? 26 : 17;
        setFill(doc, BG); doc.roundedRect(14, yt, 182, cardH, 2, 2, 'F');
        setDraw(doc, BORDER); doc.setLineWidth(0.15); doc.roundedRect(14, yt, 182, cardH, 2, 2, 'S');
        setFill(doc, catRgb); doc.roundedRect(14, yt, 3, cardH, 1, 1, 'F');

        // header row
        setF(doc, 6.5); setC(doc, catRgb);
        doc.text(`${catChar} · ${ev.indicatorCode ?? '-'}`, 20, yt + 5.5);
        setF(doc, 7.5); setC(doc, TEXT);
        doc.text(String(ev.indicatorTitle ?? '-').slice(0, 32), 44, yt + 5.5);

        // metadata chip — rank + relevance% combined (no page number)
        const metaX = 14 + 182 - 3;
        const chipParts = [];
        if (simPct != null) chipParts.push(`${simPct}%`);
        if (chipParts.length > 0) {
          const simCol = simPct != null && simPct >= 85 ? EMERALD : simPct != null && simPct >= 65 ? [55, 100, 200] : MUTED;
          setF(doc, 6); setC(doc, simCol);
          doc.text(chipParts.join(' · '), metaX, yt + 5.5, { align: 'right' });
        }

        // snippet
        if (ev.evidenceText) {
          const snippet = processEvidenceSnippet(ev.evidenceText);
          const snipLines = doc.splitTextToSize(snippet, 170);
          setF(doc, 7.5); setC(doc, [80, 80, 90]);
          doc.text(snipLines.slice(0, 2), 20, yt + 12);
        } else if (ev.numericMatchLevel != null) {
          setF(doc, 7.5); setC(doc, MUTED);
          doc.text(`입력값: ${ev.inputValue?.toLocaleString() ?? '-'} ${ev.unit ?? ''}   증빙값: ${ev.extractedValue?.toLocaleString() ?? '-'} ${ev.unit ?? ''}   차이: ${(ev.numericDiffPercent ?? 0).toFixed(1)}%`, 20, yt + 12);
        }

        yt += cardH + 3;
      });

      // ── AI Final Analysis Comment ────────────────────────
      if (yt < 255) {
        yt += 4;
        setFill(doc, [238, 242, 255]); doc.roundedRect(14, yt, 182, 36, 3, 3, 'F');
        setDraw(doc, [99, 102, 241]); doc.setLineWidth(0.3); doc.roundedRect(14, yt, 182, 36, 3, 3, 'S');
        setFill(doc, [99, 102, 241]); doc.roundedRect(14, yt, 182, 3, 1.5, 1.5, 'F'); doc.rect(14, yt + 1.5, 182, 1.5, 'F');
        setF(doc, 8.5); setC(doc, [67, 56, 202]); doc.text('종합 진단 의견', 20, yt + 11);

        const eScore = data.eScore ?? 0, sScore = data.sScore ?? 0, gScore = data.gScore ?? 0;
        const catArr = [{ n: 'E 환경', s: eScore }, { n: 'S 사회', s: sScore }, { n: 'G 지배구조', s: gScore }];
        const strongest = catArr.sort((a, b) => b.s - a.s)[0];
        const weakestC  = [...catArr].sort((a, b) => a.s - b.s)[0];
        const grade = data.finalGrade ?? '?';
        const conf  = data.overallConfidence ?? 0;

        const comment = data.overallOpinion
          ? sanitizeOpinion(stripMd(data.overallOpinion), data.lowMismatchCount).slice(0, 220)
          : `${data.companyName ?? '해당 기업'}의 ESG 분석 결과 종합 등급 ${grade}를 획득했습니다. 가장 강한 영역은 ${strongest.n}(${strongest.s}점)이며, 개선이 필요한 영역은 ${weakestC.n}(${weakestC.s}점)입니다. 데이터 검증 수준은 ${conf}%입니다.`;
        const commentLines = doc.splitTextToSize(comment, 170);
        setF(doc, 8); setC(doc, TEXT);
        doc.text(commentLines.slice(0, 3), 20, yt + 19);
      }
    }
  }

  // flowY: 마지막 autoTable 종료 위치 추적 → 이후 섹션의 페이지 분기 기준
  let flowY = 999;

  // ═══════════════════════════════════════════════════════
  //  PAGE 3: K-ESG 15개 지표 통합 진단 근거 테이블
  // ═══════════════════════════════════════════════════════
  if (!isAutoSimulation) {
    doc.addPage();
    setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, '지표별 진단 근거', EMERALD);

    let ye = 20;
    ye = sectionTitle(doc, 'K-ESG 지표별 진단 근거 검증', ye, EMERALD);
    setF(doc, 7.5); setC(doc, MUTED);
    doc.text('K-ESG 15개 지표에 대한 문서 근거 검색 및 검증 결과입니다.', 14, ye);
    ye += 8;

    // buildCompleteIndicatorList 로직 (UI와 동일: VERIFIED 우선 선택)
    const _evsByCode = new Map();
    for (const ev of (data.evidenceMatches ?? [])) {
      const code = ev.indicatorCode;
      if (!code) continue;
      if (isTestEvidence(ev.evidenceText ?? '')) continue;
      const existing = _evsByCode.get(code);
      if (!existing) { _evsByCode.set(code, ev); continue; }

      // G-303: governance phrase 우선
      if (code === 'G-303') {
        const ep = _g303Pri(ev), xp = _g303Pri(existing);
        if (ep > xp) { _evsByCode.set(code, ev); continue; }
        if (xp > ep) continue;
      }
      // E 지표: numericMatchLevel 우선
      if (code.startsWith('E-')) {
        const _np = (e) => e.numericMatchLevel === 'HIGH' ? 3 : e.numericMatchLevel === 'MEDIUM' ? 2 : e.numericMatchLevel === 'LOW' ? 1 : 0;
        const en = _np(ev), xn = _np(existing);
        if (en > xn) { _evsByCode.set(code, ev); continue; }
        if (xn > en) continue;
      }
      // S/G: VERIFIED/EXPLICIT 우선
      const evIsV = ev.verificationStatus === 'VERIFIED' || ev.matchedCluster?.startsWith('EXPLICIT:');
      const exIsV = existing.verificationStatus === 'VERIFIED' || existing.matchedCluster?.startsWith('EXPLICIT:');
      if (evIsV && !exIsV) { _evsByCode.set(code, ev); continue; }
      if (!evIsV && exIsV) continue;
      const es = Math.max(ev.similarity ?? 0, ev.finalScore ?? 0);
      const xs = Math.max(existing.similarity ?? 0, existing.finalScore ?? 0);
      if (es > xs) _evsByCode.set(code, ev);
    }

    // 15개 지표 고정 행 생성 (ALL_INDICATOR_CODES_PDF 순서)
    const _tableRows = Object.entries(ALL_INDICATOR_CODES_PDF).map(([code, title]) => {
      const ev  = _evsByCode.get(code);
      const cat = code[0];

      if (!ev) return [code, title, '근거 없음', '—', '—'];

      // 진단 근거 문장
      let evidenceStr;
      if (cat === 'E' && ev.numericMatchLevel != null && ev.inputValue != null) {
        const u = ev.unit ? ` ${ev.unit}` : '';
        evidenceStr = ev.extractedValue != null
          ? `추출값 ${fmtNum(ev.extractedValue)}${u} 확인 (입력값 ${fmtNum(ev.inputValue)}${u}, 차이 ${(ev.numericDiffPercent ?? 0).toFixed(1)}%)`
          : `입력값 ${fmtNum(ev.inputValue)}${u} 수치 검증됨`;
      } else {
        evidenceStr = processEvidenceSnippet(ev.evidenceText ?? '') || '—';
      }

      // 신뢰도 — E 카테고리는 numericMatchLevel 기반, S/G는 semantic similarity 기반
      const sp = toPct(ev.similarity);
      const relStr = (cat === 'E' && ev.numericMatchLevel != null)
        ? (ev.numericMatchLevel === 'HIGH' ? '97%' : ev.numericMatchLevel === 'MEDIUM' ? '72%' : '38%')
        : (sp != null ? `${sp}%` : (ev.numericMatchLevel ? '수치' : '—'));

      // 검증 상태
      let vstStr;
      if      (ev.numericMatchLevel === 'HIGH')                                                     vstStr = '수치 일치';
      else if (ev.numericMatchLevel === 'MEDIUM')                                                    vstStr = '수치 근사';
      else if (ev.numericMatchLevel === 'LOW')                                                       vstStr = '검토 필요';
      else if (ev.verificationStatus === 'VERIFIED' || ev.matchedCluster?.startsWith('EXPLICIT:')) vstStr = '확인됨';
      else if (sp != null && sp >= 75)                                                              vstStr = '확인됨';
      else if (sp != null && sp >= 60)                                                              vstStr = '부분 확인';
      else if (sp != null && sp >= 45)                                                              vstStr = '참고 수준';
      else if (ev.evidenceText)                                                                      vstStr = '참고 수준';
      else                                                                                           vstStr = '근거 없음';

      return [code, title, vstStr, relStr, evidenceStr];
    });

    autoTable(doc, {
      startY: ye,
      head: [['지표', '지표명', '검증 상태', '신뢰도', '진단 근거 문장']],
      body: _tableRows,
      styles:     { ...KOR, fontSize: 7.5, cellPadding: 3.5, lineColor: BORDER, lineWidth: 0.2, valign: 'middle' },
      headStyles: { ...KOR, fillColor: [240, 243, 248], textColor: TEXT, fontSize: 8, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 26 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 108 },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (hookData) => {
        if (hookData.section !== 'body') return;
        const rowCode = String(hookData.row.raw?.[0] ?? '');
        const rowCat  = rowCode[0];
        // 지표 코드 컬럼: 카테고리 색상
        if (hookData.column.index === 0) {
          hookData.cell.styles.textColor = rowCat === 'E' ? EMERALD : rowCat === 'S' ? [55, 100, 200] : [217, 119, 6];
          hookData.cell.styles.fontStyle = 'bold';
        }
        // 검증 상태 색상
        if (hookData.column.index === 2) {
          const v = String(hookData.cell.raw ?? '');
          if (v === '확인됨'   || v === '수치 일치') hookData.cell.styles.textColor = EMERALD;
          if (v === '부분 확인' || v === '수치 근사') hookData.cell.styles.textColor = AMBER;
          if (v === '검토 필요')                     hookData.cell.styles.textColor = RED;
          if (v === '참고 수준' || v === '근거 없음') hookData.cell.styles.textColor = MUTED;
        }
        // 신뢰도 색상
        if (hookData.column.index === 3) {
          const pv = parseInt(hookData.cell.raw, 10);
          if (!isNaN(pv)) hookData.cell.styles.textColor = pv >= 85 ? EMERALD : pv >= 65 ? [55, 100, 200] : MUTED;
        }
        // 근거 없음 행 전체 음소거
        if (hookData.row.raw?.[2] === '근거 없음') {
          hookData.cell.styles.textColor = [180, 180, 190];
        }
      },
      willDrawCell: (hookData) => {
        if (hookData.section !== 'body' || hookData.column.index !== 0) return;
        const rc  = String(hookData.row.raw?.[0] ?? '')[0];
        const rgb = rc === 'E' ? EMERALD : rc === 'S' ? [55, 100, 200] : [217, 119, 6];
        setFill(doc, rgb);
        doc.rect(hookData.cell.x, hookData.cell.y, 2, hookData.cell.height, 'F');
      },
    });

    flowY = (doc.lastAutoTable?.finalY ?? 280) + 10;
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 4: 업종 벤치마크 비교
  // ═══════════════════════════════════════════════════════
  const hasBench = (data.benchmarkComparison?.metrics?.length ?? 0) > 0;
  if (hasBench) {
    let yb;
    if (flowY + 45 < 252) {
      // 여유 공간 있음 — 같은 페이지에서 이어서
      setDraw(doc, BORDER); doc.setLineWidth(0.25);
      doc.line(14, flowY - 4, 196, flowY - 4);
      yb = flowY;
    } else {
      doc.addPage();
      setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F');
      pageHeader(doc, '업종 벤치마크 비교', PURPLE);
      yb = 20;
    }
    const industry = data.benchmarkComparison?.industry ?? '';
    yb = sectionTitle(doc, `업종 벤치마크 비교${industry ? ` — ${industry}` : ''}`, yb, PURPLE);

    const normU = (u = '') => u.toLowerCase()
      .replace(/₀/g,'0').replace(/₁/g,'1').replace(/₂/g,'2').replace(/₃/g,'3')
      .replace(/₄/g,'4').replace(/₅/g,'5').replace(/₆/g,'6').replace(/₇/g,'7')
      .replace(/₈/g,'8').replace(/₉/g,'9').replace(/[^a-z0-9-]/g,'');
    const LOWER_BETTER = new Set(['kwh','mwh','gwh','tco2','tco2e','kg','m3','l','ton','mj','kgco2']);
    const LIB_KEYS = ['배출','사용량','폐기물','용수','에너지','전력','가스','탄소','온실'];
    const lowerBetter  = (u = '', n = '') =>
      LOWER_BETTER.has(normU(u)) || LIB_KEYS.some(k => n.includes(k));

    autoTable(doc, {
      startY: yb,
      head: [['지표명', '단위', '우리 기업', '업종 평균', '차이', '평가', '데이터 출처 (업종 평균)']],
      body: data.benchmarkComparison.metrics.map(m => {
        // 가스: 백엔드에서 Nm³ 단위로 직접 전달됨 (CSV gas_nm3 기준, 변환 없음)
        const isGas = (m.unit ?? '').toLowerCase().includes('nm') || (m.name ?? '').includes('가스');
        const cv  = m.company    ?? 0;
        const iv  = m.industryAvg ?? 0;
        const displayUnit = m.unit ?? '-';
        const lib = lowerBetter(m.unit, m.name ?? '');
        const diff = iv > 0 ? ((cv - iv) / iv * 100) : null;
        const better = diff != null && (lib ? diff < 0 : diff > 0);
        return [
          m.name ?? '-',
          displayUnit,
          isGas ? cv.toFixed(1) : fmtNum(cv),
          isGas ? iv.toFixed(1) : fmtNum(iv),
          diff != null ? `${better ? '[-]' : '[+]'} ${Math.abs(diff).toFixed(1)}%` : '-',
          better ? '양호' : diff != null ? '개선 필요' : '-',
          m.source ?? '공공 통계 기반',
        ];
      }),
      styles:     { ...KOR, fontSize: 7.5, cellPadding: 3.5, lineColor: BORDER, lineWidth: 0.2 },
      headStyles: { ...KOR, fillColor: [240, 243, 248], textColor: TEXT, fontSize: 7.5, cellPadding: 4 },
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
          // [3] fontStyle: 'bold' 제거 — NanumGothic bold 미등록 시 한글 인코딩 깨짐 방지
          hookData.cell.styles.textColor = hookData.cell.raw === '양호' ? EMERALD : RED;
        }
        if (hookData.section === 'body' && hookData.column.index === 4) {
          const val = String(hookData.cell.raw ?? '');
          hookData.cell.styles.textColor = val.startsWith('[-]') ? EMERALD : val.startsWith('[+]') ? RED : MUTED;
        }
      },
    });
    flowY = (doc.lastAutoTable?.finalY ?? 280) + 10;
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 5: Risk & Opportunity 분석
  // ═══════════════════════════════════════════════════════
  const hasRisk = !!data.riskOpportunity || (data.benchmarkComparison?.metrics?.length ?? 0) > 0;

  if (hasRisk) {
    let yr;
    if (flowY + 50 < 252) {
      // 여유 공간 있음 — 같은 페이지에서 이어서
      setDraw(doc, BORDER); doc.setLineWidth(0.25);
      doc.line(14, flowY - 4, 196, flowY - 4);
      yr = flowY;
    } else {
      doc.addPage();
      setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F');
      pageHeader(doc, '리스크 & 기회 분석', AMBER);
      yr = 20;
    }

    // 수치 검증 결과 안내 (R&O 섹션 앞)
    if ((data.lowMismatchCount ?? 0) > 0) {
      setFill(doc, BG); doc.roundedRect(14, yr, 182, 10, 2, 2, 'F');
      setDraw(doc, BORDER); doc.setLineWidth(0.15); doc.roundedRect(14, yr, 182, 10, 2, 2, 'S');
      setFill(doc, AMBER); doc.rect(14, yr, 3, 10, 'F');
      setF(doc, 7.5); setC(doc, MUTED);
      const ceilStr = data.gradeCeilingApplied ? '  ·  등급 상한 조정 적용' : '';
      doc.text(`수치 검증 결과 ${data.lowMismatchCount}건 차이 확인${ceilStr}`, 20, yr + 6.5);
      yr += 14;
    }

    if (hasRisk) {
      yr = sectionTitle(doc, '리스크 & 기회 분석', yr, AMBER);
      // 벤치마크 실수치 기반 문구 우선 사용; 없으면 GPT 생성 텍스트 fallback
      const benchText = (data.benchmarkComparison?.metrics?.length ?? 0) > 0
        ? buildRiskOpportunityPdf(
            data.benchmarkComparison.metrics,
            data.eScore ?? 0, data.sScore ?? 0, data.gScore ?? 0,
            data.benchmarkComparison?.industry ?? ''
          )
        : null;
      const riskRaw = benchText
        || sanitizeOpinion(data.riskOpportunity, data.lowMismatchCount)
        || '';
      const riskText = stripMd(riskRaw).slice(0, 1400);

      // [리스크] / [기회] 섹션 파싱 → consulting bullet summary
      const parseRO = (text) => {
        const riskPart = (text.split('[기회]')[0] ?? '').replace('[리스크]', '').trim();
        const oppPart  = (text.split('[기회]')[1] ?? '').trim();
        const toItems  = (s) => s.split(/\n\n+/).map(l => l.trim()).filter(l => l.length > 8);
        return { risks: toItems(riskPart), opps: toItems(oppPart) };
      };
      const { risks, opps } = parseRO(riskText);

      // ── 리스크 요인 ──────────────────────────────────────────────────
      if (risks.length > 0 && yr < 262) {
        setDraw(doc, [195, 200, 210]); doc.setLineWidth(0.25); doc.line(14, yr, 196, yr);
        yr += 3;
        setF(doc, 7.5); setC(doc, [195, 60, 60]);
        doc.text('리스크 요인', 14, yr + 4.5);
        yr += 9;
        setDraw(doc, [218, 222, 230]); doc.setLineWidth(0.12); doc.line(14, yr, 196, yr);
        yr += 5;

        setF(doc, 8.5);
        risks.slice(0, 5).forEach((item) => {
          if (yr > 264) return;
          const lines = doc.splitTextToSize(item, 168);
          setC(doc, [205, 65, 65]); doc.text('•', 16, yr);
          setC(doc, TEXT); doc.text(lines, 22, yr);
          yr += lines.length * 5.8 + 3;
        });
        yr += 7;
      }

      // ── 기회 요인 ────────────────────────────────────────────────────
      if (opps.length > 0 && yr < 265) {
        setDraw(doc, [195, 200, 210]); doc.setLineWidth(0.25); doc.line(14, yr, 196, yr);
        yr += 3;
        setF(doc, 7.5); setC(doc, EMERALD);
        doc.text('기회 요인', 14, yr + 4.5);
        yr += 9;
        setDraw(doc, [218, 222, 230]); doc.setLineWidth(0.12); doc.line(14, yr, 196, yr);
        yr += 5;

        setF(doc, 8.5);
        opps.slice(0, 5).forEach((item) => {
          if (yr > 272) return;
          const lines = doc.splitTextToSize(item, 168);
          setC(doc, EMERALD); doc.text('•', 16, yr);
          setC(doc, TEXT); doc.text(lines, 22, yr);
          yr += lines.length * 5.8 + 3;
        });
        yr += 4;
      }
      yr += 3;
    }

  }

  // ═══════════════════════════════════════════════════════
  //  PAGE 6: ESG 점수 카드 상세 (breakdown)
  // ═══════════════════════════════════════════════════════
  const breakdown = data.esgChart?.breakdown ?? [];
  if (breakdown.length > 0) {
    doc.addPage();
    setFill(doc, WHITE); doc.rect(0, 0, W, 297, 'F');
    pageHeader(doc, '지표별 세부 점수', EMERALD);

    let yd = 20;
    yd = sectionTitle(doc, `K-ESG 지표별 세부 점수 (${breakdown.length}개)`, yd);

    const GRADE_RGB_MAP = {
      S: PURPLE, A: EMERALD, B: [55, 100, 200], C: AMBER, D: RED, 'N/A': MUTED,
    };

    autoTable(doc, {
      startY: yd,
      head: [['지표 코드', '지표명', '점수', '등급', '검증 수준', '점수 바']],
      body: breakdown.map(b => [
        b.kesgCode ?? '-',
        String(b.title ?? '-').slice(0, 30),
        b.score != null ? `${b.score}점` : '-',
        b.grade ?? 'N/A',
        b.confidence != null ? `${b.confidence}%` : '-',
        '',
      ]),
      styles:     { ...KOR, fontSize: 8, cellPadding: 2.5, lineColor: BORDER, lineWidth: 0.2 },
      headStyles: { ...KOR, fillColor: [240, 243, 248], textColor: TEXT },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 66 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
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
