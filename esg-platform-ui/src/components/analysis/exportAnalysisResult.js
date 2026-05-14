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

  const W           = 210;
  const dateStr     = new Date().toLocaleDateString('ko-KR');
  const companyName = data.companyName ?? '기업 ESG 분석';
  const gradeC      = gradeRgb(data.finalGrade);
  const analyzedAt  = (data.analyzedAt ?? dateStr).slice(0, 10);

  // ═══════════════════════════════════════════════════════
  //  PAGE 1: 표지 (Cover)
  // ═══════════════════════════════════════════════════════
  // 상단 네이비 배경
  setFill(doc, NAVY); doc.rect(0, 0, W, 110, 'F');
  // 등급 컬러 상단 라인
  setFill(doc, gradeC); doc.rect(0, 0, W, 3.5, 'F');

  // 플랫폼 레이블
  setF(doc, 7.5); setC(doc, [147, 197, 253]);
  doc.text('ECO POINT  |  ESG Management Platform', 14, 18);

  // 기업명
  setF(doc, 24); setC(doc, WHITE);
  const nameLines = doc.splitTextToSize(companyName, 150);
  doc.text(nameLines, 14, 38);

  // 리포트 타이틀
  setF(doc, 13); setC(doc, [199, 210, 254]);
  doc.text('ESG 분석 결과 보고서', 14, 60);

  // 메타 정보
  setF(doc, 8); setC(doc, [148, 163, 184]);
  doc.text(`분석 ID: ${analysisId}  |  분석일: ${analyzedAt}  |  업종: ${data.industry ?? '-'}`, 14, 101);

  // 등급 원형 배지
  setFill(doc, gradeC); doc.circle(182, 55, 20, 'F');
  setFill(doc, [255, 255, 255, 0.1]);
  doc.setLineWidth(0.8); setDraw(doc, [...gradeC.map(c => Math.min(255, c + 40))]);
  doc.circle(182, 55, 20, 'S');
  setF(doc, 22); setC(doc, WHITE);
  doc.text(String(data.finalGrade ?? '?'), 182, 63, { align: 'center' });
  setF(doc, 7); setC(doc, [199, 210, 254]);
  doc.text('종합 등급', 182, 82, { align: 'center' });

  // 본문 배경
  setFill(doc, BG); doc.rect(0, 110, W, 178, 'F');

  let y = 122;

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
  //  PAGE 2: 기업 정보 + EcoPoint
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
  //  PAGE 3: Evidence 분석 근거
  // ═══════════════════════════════════════════════════════
  if (data.evidenceMatches?.length > 0) {
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
            if (level === 'HIGH')   hookData.cell.styles.textColor = EMERALD;
            if (level === 'MEDIUM') hookData.cell.styles.textColor = AMBER;
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
      head: [['지표명', '단위', '우리 기업', '업종 평균', '차이', '평가']],
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
        ];
      }),
      styles:     { ...KOR, fontSize: 8.5, cellPadding: 3 },
      headStyles: { ...KOR, fillColor: NAVY, textColor: WHITE },
      alternateRowStyles: { fillColor: BG2 },
      columnStyles: {
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'right',  cellWidth: 26 },
        3: { halign: 'right',  cellWidth: 26 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 22 },
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
  //  PAGE 6: ESG 점수 카드 상세 (breakdown)
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
