import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { K_ESG_WEIGHTS } from '../../context/AnalysisContext';

const loadNanumGothicFont = async (doc) => {
  const response = await fetch('/fonts/NanumGothic-Regular.ttf');
  if (!response.ok) throw new Error(`폰트 파일 응답 오류 HTTP ${response.status} — public/fonts/NanumGothic-Regular.ttf 경로를 확인하세요.`);

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // 대용량 TTF 파일에서 btoa 스택 오버플로 방지를 위한 청크 처리
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < uint8Array.length; i += CHUNK) {
    binary += String.fromCharCode(...uint8Array.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);

  doc.addFileToVFS('NanumGothic-Regular.ttf', base64);
  doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'normal');
  doc.setFont('NanumGothic', 'normal');
};

const getCachedReport = () => {
  try {
    const cached = JSON.parse(localStorage.getItem('esg_report_cache') || 'null');
    return cached?.sections?.length ? cached : null;
  } catch { return null; }
};

// ── 색상 팔레트 ──────────────────────────────────────────────────
const P = {
  navy:    [15,  23,  42],
  navyMd:  [30,  58,  95],
  blue:    [29,  78, 216],
  blueL:   [239,246,255],
  teal:    [13, 148, 136],
  green:   [22, 163,  74],
  greenL:  [220,252,231],
  amber:   [217,119,  6],
  amberL:  [254,243,199],
  red:     [220,  38,  38],
  redL:    [254,226,226],
  purple:  [124,  58, 237],
  purpleL: [237,233,254],
  bg:      [248,250,252],
  card:    [255,255,255],
  border:  [226,232,240],
  shadow:  [203,213,225],
  text:    [15,  23,  42],
  muted:   [100,116,139],
  light:   [148,163,184],
  white:   [255,255,255],
  grade: {
    S: [124, 58, 237],
    A: [22, 163,  74],
    B: [29,  78, 216],
    C: [217,119,  6],
    D: [220,  38,  38],
  },
};

const gradeRgb = (g) => P.grade[String(g).toUpperCase()] || P.grade.D;

const setF = (doc, size) => {
  doc.setFont('NanumGothic', 'normal');
  doc.setFontSize(size);
};

const setColor = (doc, rgb) => { doc.setTextColor(...rgb); };

// ── 카드 (흰 배경 + 테두리) ─────────────────────────────────────
const drawCard = (doc, x, y, w, h, opts = {}) => {
  const { radius = 3, color = P.card, shadow = true } = opts;
  if (shadow) {
    doc.setFillColor(...P.shadow);
    doc.roundedRect(x + 0.7, y + 0.7, w, h, radius, radius, 'F');
  }
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, h, radius, radius, 'F');
  doc.setDrawColor(...P.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, radius, radius, 'S');
};

// ── 새 페이지: 배경 + 미니 헤더 (상단 9mm 네이비 바) ─────────────
const initPage = (doc, sectionLabel) => {
  doc.addPage();
  doc.setFillColor(...P.bg);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(...P.navy);
  doc.rect(0, 0, 210, 9, 'F');
  doc.setFillColor(...P.blue);
  doc.rect(0, 0, 210, 1.8, 'F');
  setF(doc, 6.5);
  setColor(doc, [147, 197, 253]);
  doc.text('ECO POINT  |  ESG Management Platform', 18, 6.3);
  if (sectionLabel) {
    setColor(doc, [148, 163, 184]);
    doc.text(sectionLabel, 192, 6.3, { align: 'right' });
  }
  return 18;
};

// ── 스코어바 (수평) ────────────────────────────────────────────
const drawScoreBar = (doc, x, y, w, score, rgb) => {
  const pct = Math.max(0, Math.min(100, score || 0)) / 100;
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(x, y, w, 4.5, 2, 2, 'F');
  if (pct > 0.02) {
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, Math.max(6, w * pct), 4.5, 2, 2, 'F');
  }
};

// ── 섹션 타이틀 바 ────────────────────────────────────────────
const sectionTitle = (doc, x, y, text, rgb, sectionLabel) => {
  if (y > 264) {
    y = initPage(doc, sectionLabel || text);
  }
  doc.setFillColor(...rgb);
  doc.roundedRect(x, y, 4, 9, 1.5, 1.5, 'F');
  setF(doc, 12.5);
  setColor(doc, P.text);
  doc.text(text, x + 8, y + 7);
  doc.setDrawColor(...P.border);
  doc.setLineWidth(0.25);
  doc.line(x, y + 11, x + 174, y + 11);
  return y + 17;
};

// ── 공간 확보 (부족하면 새 페이지) ──────────────────────────────
const ensureSpace = (doc, y, needed, sectionLabel) => {
  if (y + needed > 276) {
    return initPage(doc, sectionLabel || '');
  }
  return y;
};

// ── 4단 불렛 파서 ─────────────────────────────────────────────
const parseFourBullets = (text) => {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const markerRe = /\[(현황[^\]]*|(?:가이드라인\s*)?준수\s*여부|성과\s*평가|성과|개선\s*제언|개선)\]/g;
  const parts = plain.split(markerRe);
  if (parts.length < 4) return null;
  const result = { 현황: '', 준수: '', 성과: '', 제언: '' };
  for (let i = 1; i < parts.length; i += 2) {
    const marker = parts[i] || '';
    const content = (parts[i + 1] || '').trim();
    if (marker.includes('현황'))                         result.현황 = content;
    else if (marker.includes('준수'))                    result.준수 = content;
    else if (marker.includes('성과'))                    result.성과 = content;
    else if (marker.includes('제언') || marker.includes('개선')) result.제언 = content;
  }
  return Object.values(result).some(v => v.length > 5) ? result : null;
};

// ── 4단 불렛 렌더링 ─────────────────────────────────────────
const renderFourBullets = (doc, text, sx, sy, totalW, sectionLabel) => {
  setF(doc, 8.5); // 높이 계산과 렌더링에 동일 폰트 보장
  const bullets = parseFourBullets(text);
  if (!bullets) {
    const plain = (text || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 2000);
    if (!plain) return sy;
    const allLines = doc.splitTextToSize(plain, totalW - 16);
    // 한 카드에 담을 수 있는 최대 줄 수 (페이지 내 가용 높이 기준)
    const maxLines = Math.floor((258 - 14) / 4.8); // ~50줄
    const lines = allLines.slice(0, maxLines);
    const h = Math.max(24, lines.length * 4.8 + 14);
    let y = ensureSpace(doc, sy, h, sectionLabel);
    drawCard(doc, sx, y, totalW, h);
    doc.setFillColor(...P.blue); doc.rect(sx, y, 3, h, 'F');
    setF(doc, 8.5); setColor(doc, P.text);
    doc.text(lines, sx + 8, y + 8);
    return y + h + 5;
  }

  const defs = [
    { key: '현황', label: '현황',     rgb: P.blue,   bg: P.blueL },
    { key: '준수', label: '준수 여부', rgb: P.green,  bg: P.greenL },
    { key: '성과', label: '성과',     rgb: P.amber,  bg: P.amberL },
    { key: '제언', label: '개선 제언', rgb: P.purple, bg: P.purpleL },
  ];
  const cols = 2;
  const cw   = (totalW - 6) / cols;
  const pad  = 4;

  const heights = defs.map(d => {
    const c = bullets[d.key] || '';
    if (!c) return 0;
    return 8 + doc.splitTextToSize(c, cw - pad * 2 - 4).length * 4.5 + pad * 2;
  });

  const r1h = Math.max(heights[0] || 0, heights[1] || 0, 24);
  const r2h = Math.max(heights[2] || 0, heights[3] || 0, 24);

  let y = ensureSpace(doc, sy, r1h + r2h + 8, sectionLabel);

  for (let row = 0; row < 2; row++) {
    const rh = row === 0 ? r1h : r2h;
    y = ensureSpace(doc, y, rh + 4, sectionLabel);
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const d   = defs[idx];
      const c   = bullets[d.key] || '';
      if (!c) continue;
      const cx = sx + col * (cw + 6);
      doc.setFillColor(...d.bg);
      doc.roundedRect(cx, y, cw, rh, 2.5, 2.5, 'F');
      doc.setFillColor(...d.rgb);
      doc.roundedRect(cx, y, 3.5, rh, 1.5, 1.5, 'F');
      doc.rect(cx + 2, y, 1.5, rh, 'F');
      setF(doc, 7.5); setColor(doc, d.rgb);
      doc.text(d.label, cx + 7, y + pad + 3.5);
      setF(doc, 8.5); setColor(doc, P.text);
      const lines = doc.splitTextToSize(c, cw - pad * 2 - 4);
      doc.text(lines, cx + 7, y + pad + 9);
    }
    y += rh + 4;
  }
  return y + 2;
};

// ── 등급 원형 뱃지 ──────────────────────────────────────────
const drawGradeCircle = (doc, grade, cx, cy, r = 18) => {
  const rgb = gradeRgb(grade);
  // 외곽 링 (반투명 효과 근사)
  doc.setFillColor(
    Math.min(255, rgb[0] + 130),
    Math.min(255, rgb[1] + 110),
    Math.min(255, rgb[2] + 100)
  );
  doc.circle(cx, cy, r + 5, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r + 2, 'F');
  doc.setFillColor(...rgb);
  doc.circle(cx, cy, r, 'F');
  setF(doc, r > 16 ? 22 : 18);
  setColor(doc, P.white);
  doc.text(String(grade || '?'), cx, cy + (r > 16 ? 4 : 3), { align: 'center' });
};

// ── 탄소 벤치마크 막대 차트 ──────────────────────────────────
const drawBenchmarkChart = (doc, bd, sx, sy, totalW) => {
  if (!bd?.monthlyData?.length) return sy;
  const months = bd.monthlyData;
  const maxVal = Math.max(...months.map(m => Math.max(m.myEmissionTco2 ?? 0, m.regionAvgEmissionTco2 ?? 0)), 1);
  const chartH = 52;
  const slotW  = totalW / 12;
  const barW   = slotW * 0.33;
  const baseY  = sy + chartH;
  const sh     = (v) => (v / maxVal) * chartH;

  [0.25, 0.5, 0.75, 1.0].forEach(r => {
    const ly = sy + chartH * (1 - r);
    doc.setDrawColor(...P.border); doc.setLineWidth(0.15);
    doc.line(sx, ly, sx + totalW, ly);
    setF(doc, 6.5); setColor(doc, P.muted);
    doc.text((maxVal * r).toFixed(1), sx - 1, ly + 1.5, { align: 'right' });
  });

  months.forEach((m, i) => {
    const slotX = sx + i * slotW;
    const myH   = sh(m.myEmissionTco2 ?? 0);
    const avgH  = sh(m.regionAvgEmissionTco2 ?? 0);
    doc.setFillColor(...(m.betterThanAverage ? P.blue : P.red));
    doc.roundedRect(slotX + 0.5, baseY - myH, barW, myH, 1, 1, 'F');
    doc.setFillColor(147, 197, 253);
    doc.roundedRect(slotX + barW + 1.5, baseY - avgH, barW, avgH, 1, 1, 'F');
    setF(doc, 6); setColor(doc, P.muted);
    doc.text(`${i + 1}월`, slotX + slotW / 2, baseY + 7, { align: 'center' });
  });

  const avgM = (bd.annualRegionAvgTotal ?? 0) / 12;
  const refY = baseY - sh(avgM);
  doc.setDrawColor(...P.red); doc.setLineWidth(0.5);
  for (let x = sx; x < sx + totalW; x += 4) {
    doc.line(x, refY, Math.min(x + 2.5, sx + totalW), refY);
  }
  setF(doc, 6.5); setColor(doc, P.red);
  doc.text(`지역 월평균 ${avgM.toFixed(1)} t`, sx + totalW - 1, refY - 1.5, { align: 'right' });

  const ly = baseY + 10;
  doc.setFillColor(...P.blue); doc.roundedRect(sx, ly, 5, 3, 1, 1, 'F');
  setF(doc, 6.5); setColor(doc, P.text); doc.text('우리 기업', sx + 7, ly + 2.5);
  doc.setFillColor(147, 197, 253); doc.roundedRect(sx + 38, ly, 5, 3, 1, 1, 'F');
  doc.text('지역 평균', sx + 46, ly + 2.5);
  doc.setFillColor(...P.red); doc.rect(sx + 76, ly + 1, 8, 1.5, 'F');
  doc.text('지역 월평균 기준선', sx + 86, ly + 2.5);
  return ly + 9;
};

// ── 세부 지표 autoTable ──────────────────────────────────────
const drawIndicatorTable = (doc, section, headerColor, startY) => {
  if (!section.subIndicators?.length) return startY ?? doc.lastAutoTable?.finalY ?? 0;
  const KOR = { font: 'NanumGothic', fontStyle: 'normal' };
  autoTable(doc, {
    startY: startY != null ? startY : (doc.lastAutoTable?.finalY ?? 0) + 6,
    head: [['K-ESG 코드', '지표명', '점수', '등급', 'AI 진단 코멘트', '신뢰도']],
    body: (section.subIndicators || []).map(s => [
      s.kesgCode || '-',
      s.title || '-',
      s.score != null ? `${s.score}점` : '-',
      s.grade || '-',
      (s.comment || '-').replace(/\[[^\]]+\]/g, '').trim(),
      `${s.confidenceScore ?? 0}%`,
    ]),
    styles:      { ...KOR, fontSize: 7.8, cellPadding: 3 },
    headStyles:  { ...KOR, fillColor: headerColor, textColor: P.white, fontSize: 8.5 },
    alternateRowStyles: { fillColor: P.bg },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
    },
    didDrawCell: (data) => {
      if (data.column.index === 3 && data.section === 'body') {
        const g = String(data.cell.raw).toUpperCase();
        if (g !== '-') {
          doc.setFillColor(...gradeRgb(g));
          doc.roundedRect(data.cell.x + 1, data.cell.y + 1.5, data.cell.width - 2, data.cell.height - 3, 1.5, 1.5, 'F');
          setF(doc, 8); setColor(doc, P.white);
          doc.text(g, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    },
    margin: { left: 18, right: 18 },
  });
  return doc.lastAutoTable.finalY;
};

// ══════════════════════════════════════════════════════════════
// 메인 익스포트
// ══════════════════════════════════════════════════════════════
export const exportESGReport = async (
  reportData,
  companyId,
  _unused = {},
  companyInfo = {},
  carbonStats = [],
  benchmarkData = null
) => {
  const effectiveReport = (reportData?.sections?.length ? reportData : getCachedReport()) || reportData || {};

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  try {
    await loadNanumGothicFont(doc);
  } catch (err) {
    throw new Error(`[PDF] 한글 폰트 로드 실패 — ${err.message}`);
  }

  const W       = 210;
  const today   = new Date();
  const dateStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const quarter = `${today.getFullYear()}년 ${Math.ceil((today.getMonth() + 1) / 3)}분기`;

  const companyName = companyInfo.name
    || effectiveReport?.companyName
    || benchmarkData?.companyName
    || localStorage.getItem('esg_companyName')
    || `기업 ID ${companyId}`;

  const analysisYear  = companyInfo.analysisYear  || today.getFullYear();
  const industry      = companyInfo.industry      || benchmarkData?.industryName || '제조업';
  const region        = companyInfo.region        || benchmarkData?.regionName   || '';
  const analysisRange = companyInfo.analysisRange || `${analysisYear}년 1월 ~ 12월`;

  const sections = effectiveReport?.sections || [];
  const eS = sections.find(s => s.category === 'Environment')  || {};
  const sS = sections.find(s => s.category === 'Social')       || {};
  const gS = sections.find(s => s.category === 'Governance')   || {};

  const grade  = effectiveReport?.finalGrade || '?';
  const gradeC = gradeRgb(grade);
  const KOR    = { font: 'NanumGothic', fontStyle: 'normal' };
  const eW = K_ESG_WEIGHTS.E * 100;
  const sW = K_ESG_WEIGHTS.S * 100;
  const gW = K_ESG_WEIGHTS.G * 100;
  const weightLabel = `K-ESG 가중평균 (E×${eW}% + S×${sW}% + G×${gW}%)`;

  let y = 0;

  // ═══════════════════════════════════════════════════════════
  // PAGE 1 — 표지
  // ═══════════════════════════════════════════════════════════
  // 상단 네이비 헤더 영역
  doc.setFillColor(...P.navy);
  doc.rect(0, 0, W, 118, 'F');
  // 최상단 강조 선
  doc.setFillColor(...P.blue);
  doc.rect(0, 0, W, 3, 'F');
  // 장식 원 (우측 배경)
  doc.setFillColor(...P.navyMd);
  doc.circle(188, 75, 50, 'F');
  doc.setFillColor(29, 78, 216);
  doc.circle(175, 20, 22, 'F');

  // 브랜드
  setF(doc, 8.5); setColor(doc, [147, 197, 253]);
  doc.text('ECO POINT  |  ESG Management Platform', 18, 18);

  // 기업명 (대형)
  setF(doc, 23); setColor(doc, P.white);
  const nameLines = doc.splitTextToSize(companyName, 140);
  doc.text(nameLines, 18, 40);

  // 부제목
  setF(doc, 13); setColor(doc, [199, 210, 254]);
  const subY = 40 + nameLines.length * 8.8 + 5;
  doc.text('ESG 성과 분석 리포트', 18, subY);

  // 발행 정보
  setF(doc, 8); setColor(doc, [148, 163, 184]);
  const regionTag = region ? `  |  ${region}` : '';
  doc.text(`${analysisRange}  |  ${industry}${regionTag}`, 18, 96);
  doc.text(`발행일: ${dateStr}  |  평가 기준: K-ESG 가이드라인 (산업통상자원부, 2021)`, 18, 103);

  // 등급 뱃지 (우측)
  drawGradeCircle(doc, grade, 179, 58, 22);
  setF(doc, 7.5); setColor(doc, [199, 210, 254]);
  doc.text('종합 ESG 등급', 179, 85, { align: 'center' });

  // 하단 밝은 영역
  doc.setFillColor(...P.bg);
  doc.rect(0, 118, W, 179, 'F');

  y = 127;

  // E/S/G 스코어 카드 (3열)
  const cardDefs = [
    { label: '환경 (E)',     score: eS.score, grade: eS.grade, rgb: P.green,  w: eW },
    { label: '사회 (S)',     score: sS.score, grade: sS.grade, rgb: P.blue,   w: sW },
    { label: '지배구조 (G)', score: gS.score, grade: gS.grade, rgb: P.purple, w: gW },
  ];
  const cW3 = 54, cGap = 8, cX0 = 18;

  cardDefs.forEach((c, i) => {
    const cx = cX0 + i * (cW3 + cGap);
    drawCard(doc, cx, y, cW3, 52);
    // 상단 컬러 바
    doc.setFillColor(...c.rgb);
    doc.roundedRect(cx, y, cW3, 4.5, 2, 2, 'F');
    doc.rect(cx, y + 2.5, cW3, 2, 'F');
    // 레이블 + 가중치
    setF(doc, 7.5); setColor(doc, P.muted);
    doc.text(c.label, cx + cW3 / 2, y + 13, { align: 'center' });
    setF(doc, 6.5); setColor(doc, c.rgb);
    doc.text(`가중 ${c.w}%`, cx + cW3 / 2, y + 20, { align: 'center' });
    // 점수 (대형)
    const scoreStr = c.score != null ? String(c.score) : '-';
    setF(doc, 22); setColor(doc, c.rgb);
    doc.text(scoreStr, cx + cW3 / 2, y + 36, { align: 'center' });
    setF(doc, 8); setColor(doc, P.muted);
    if (c.score != null) doc.text('점', cx + cW3 / 2 + 9, y + 36);
    // 스코어바
    if (c.score != null) drawScoreBar(doc, cx + 7, y + 41, cW3 - 14, c.score, c.rgb);
    // 등급 필
    if (c.grade) {
      const gc = gradeRgb(c.grade);
      doc.setFillColor(...gc);
      doc.roundedRect(cx + cW3 - 18, y + 39, 12, 6.5, 3, 3, 'F');
      setF(doc, 8); setColor(doc, P.white);
      doc.text(c.grade, cx + cW3 - 12, y + 44, { align: 'center' });
    }
  });

  y += 60;

  // 종합 등급 배너
  doc.setFillColor(...gradeC);
  doc.roundedRect(18, y, 174, 18, 3, 3, 'F');
  setF(doc, 10.5); setColor(doc, P.white);
  doc.text(`최종 종합 ESG 등급: ${grade}  |  ${weightLabel}`, 105, y + 12, { align: 'center' });
  y += 24;

  // 기업 개요 테이블 카드
  y = sectionTitle(doc, 18, y, '1. 기업 개요', P.navy);
  drawCard(doc, 18, y, 174, 34);
  autoTable(doc, {
    startY: y + 4,
    body: [
      ['기업명', companyName, '분석 기간', analysisRange],
      ['업종',   industry,    '발행일',    dateStr],
    ],
    styles:       { ...KOR, fontSize: 9, cellPadding: 3.5 },
    columnStyles: {
      0: { textColor: P.muted, cellWidth: 24, fillColor: P.bg },
      1: { textColor: P.text,  cellWidth: 62 },
      2: { textColor: P.muted, cellWidth: 24, fillColor: P.bg },
      3: { textColor: P.text,  cellWidth: 62 },
    },
    theme: 'plain',
    margin: { left: 22, right: 22 },
  });

  // ═══════════════════════════════════════════════════════════
  // PAGE 2 — 종합 평가 요약 + 전문가 소견
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '종합 평가 요약');
  y = sectionTitle(doc, 18, y, '2. 종합 평가 요약 및 전문가 소견', P.navy, '종합 평가 요약');

  // 등급 배너
  doc.setFillColor(...gradeC);
  doc.roundedRect(18, y, 174, 20, 3.5, 3.5, 'F');
  setF(doc, 12); setColor(doc, P.white);
  doc.text(`최종 종합 ESG 등급: ${grade}  |  ${weightLabel}`, 105, y + 13, { align: 'center' });
  y += 27;

  // ESG 스코어바 카드
  y = sectionTitle(doc, 18, y, 'ESG 부문별 성과 현황', P.blue, '종합 평가 요약');
  drawCard(doc, 18, y, 174, 50);

  const barRows = [
    { label: '환경 (E)',     score: eS.score, grade: eS.grade, rgb: P.green,  w: eW },
    { label: '사회 (S)',     score: sS.score, grade: sS.grade, rgb: P.blue,   w: sW },
    { label: '지배구조 (G)', score: gS.score, grade: gS.grade, rgb: P.purple, w: gW },
  ];

  barRows.forEach((b, i) => {
    const by = y + 8 + i * 14;
    setF(doc, 8.5); setColor(doc, P.text);
    doc.text(b.label, 24, by + 4.5);
    setF(doc, 7.5); setColor(doc, P.muted);
    doc.text(`${b.w}%`, 58, by + 4.5);
    if (b.score != null) {
      drawScoreBar(doc, 66, by, 86, b.score, b.rgb);
      setF(doc, 9.5); setColor(doc, b.rgb);
      doc.text(`${b.score}점`, 156, by + 4.5);
    } else {
      setF(doc, 8.5); setColor(doc, P.muted);
      doc.text('—', 156, by + 4.5);
    }
    if (b.grade) {
      doc.setFillColor(...gradeRgb(b.grade));
      doc.roundedRect(170, by - 0.5, 13, 6, 3, 3, 'F');
      setF(doc, 8); setColor(doc, P.white);
      doc.text(b.grade, 176.5, by + 4, { align: 'center' });
    }
  });
  y += 58;

  // 부문별 핵심 진단 요약 테이블
  y = ensureSpace(doc, y, 42, '종합 평가 요약');
  autoTable(doc, {
    startY: y,
    head: [['부문', '점수', '등급', '핵심 진단 요약']],
    body: [
      ['환경 (E)',     `${eS.score ?? '-'}점`, eS.grade ?? '-',
       (eS.comment || '').replace(/\[.*?\]/g, '').trim()],
      ['사회 (S)',     `${sS.score ?? '-'}점`, sS.grade ?? '-',
       (sS.comment || '').replace(/\[.*?\]/g, '').trim()],
      ['지배구조 (G)', `${gS.score ?? '-'}점`, gS.grade ?? '-',
       (gS.comment || '').replace(/\[.*?\]/g, '').trim()],
    ],
    styles:      { ...KOR, fontSize: 9, cellPadding: 3.5 },
    headStyles:  { ...KOR, fillColor: P.navy, textColor: P.white },
    alternateRowStyles: { fillColor: P.bg },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 14, halign: 'center' },
    },
    didDrawCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const g = String(data.cell.raw).toUpperCase();
        if (g !== '-') {
          doc.setFillColor(...gradeRgb(g));
          doc.roundedRect(data.cell.x + 1, data.cell.y + 1.5, data.cell.width - 2, data.cell.height - 3, 1.5, 1.5, 'F');
          setF(doc, 8.5); setColor(doc, P.white);
          doc.text(g, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    },
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 12;

  // 전문가 종합 소견
  y = sectionTitle(doc, 18, y, '전문가 종합 소견', P.blue, '종합 평가 요약');
  const opinionText = (effectiveReport?.overallOpinion ||
    (effectiveReport?.fullReport || '').replace(/<[^>]+>/g, ' ')).slice(0, 800);
  y = renderFourBullets(doc, opinionText, 18, y, 174, '종합 평가 요약');

  // ═══════════════════════════════════════════════════════════
  // PAGE 3 — 탄소 배출 벤치마킹
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '탄소 배출 벤치마킹');
  y = sectionTitle(doc, 18, y, '3. 공공 API 기반 탄소 배출 벤치마킹', P.blue, '탄소 배출 벤치마킹');

  if (benchmarkData?.monthlyData?.length) {
    const { annualMyTotal, annualRegionAvgTotal, annualReductionPercent,
            regionName: rn, industryName: ind } = benchmarkData;
    const better  = annualMyTotal <= annualRegionAvgTotal;
    const diffAbs = Math.abs(annualReductionPercent ?? 0).toFixed(1);
    const statusTxt = better
      ? `${rn || ''} ${ind || ''} 업종 평균 대비 ${diffAbs}% 절감 — 환경 효율 우수`
      : `${rn || ''} ${ind || ''} 업종 평균 대비 ${diffAbs}% 초과 배출 — 집중 관리 필요`;

    doc.setFillColor(...(better ? P.green : P.red));
    doc.roundedRect(18, y, 174, 16, 3, 3, 'F');
    setF(doc, 9.5); setColor(doc, P.white);
    const bLines = doc.splitTextToSize(statusTxt, 168);
    doc.text(bLines, 105, y + (bLines.length > 1 ? 6.5 : 10.5), { align: 'center' });
    y += 22;

    autoTable(doc, {
      startY: y,
      head: [['구분', '우리 기업 (연간)', '지역 업종 평균 (연간)', '비교']],
      body: [
        ['전기+가스 합계 (tCO₂eq)',
         `${annualMyTotal.toFixed(1)} t`,
         `${annualRegionAvgTotal.toFixed(1)} t`,
         `${better ? '▼' : '▲'} ${Math.abs(annualMyTotal - annualRegionAvgTotal).toFixed(1)} t`],
        ['데이터 출처', '기업 DB 실측치', `${rn || ''} 한전·가스공사 공공 API`, 'K-ESG F-201 기준'],
      ],
      styles:       { ...KOR, fontSize: 8.5, cellPadding: 3.5 },
      headStyles:   { ...KOR, fillColor: P.navy, textColor: P.white },
      alternateRowStyles: { fillColor: P.bg },
      columnStyles: {
        1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' },
      },
      margin: { left: 18, right: 18 },
    });
    y = doc.lastAutoTable.finalY + 12;

    setF(doc, 9); setColor(doc, P.text);
    doc.text('월별 탄소 배출량 비교 (tCO₂eq) — 공공 API 지역 데이터 기반', 18, y);
    y += 7;

    y = ensureSpace(doc, y, 90, '탄소 배출 벤치마킹');
    y = drawBenchmarkChart(doc, benchmarkData, 26, y, 158);
    y += 8;

    const badMonths = benchmarkData.monthlyData.filter(m => !m.betterThanAverage);
    if (badMonths.length > 0) {
      y = ensureSpace(doc, y, 22, '탄소 배출 벤치마킹');
      doc.setFillColor(...P.redL);
      doc.roundedRect(18, y, 174, 15, 2.5, 2.5, 'F');
      doc.setFillColor(...P.red); doc.rect(18, y, 3, 15, 'F');
      setF(doc, 8.5); setColor(doc, P.red);
      doc.text(`평균 초과 월: ${badMonths.map(m => m.monthLabel).join(', ')}`, 24, y + 6.5);
      const worst = badMonths.reduce((a, b) =>
        Math.abs(b.reductionPercent) > Math.abs(a.reductionPercent) ? b : a);
      setF(doc, 8); setColor(doc, P.text);
      doc.text(
        `최다 초과: ${worst.monthLabel} — 우리 기업 ${worst.myEmissionTco2.toFixed(1)} t vs 지역 평균 ${worst.regionAvgEmissionTco2.toFixed(1)} t (${Math.abs(worst.reductionPercent).toFixed(1)}% 초과)`,
        24, y + 12
      );
      y += 21;
    }

    setF(doc, 7.5); setColor(doc, P.muted);
    const note = better
      ? `본 기업의 전력·가스 사용 효율이 ${rn || ''} 동종업계 평균을 상회합니다. 환경(E) 부문 점수에 긍정적으로 반영되었습니다. (출처: 한전 지역별 전력사용량, 한국가스공사 도시가스 사용량 공공 API)`
      : `전력·가스 사용량이 ${rn || ''} 동종업계 평균을 초과합니다. 에너지 효율 개선 시 환경(E) 점수가 상승합니다. (출처: 한전 지역별 전력사용량, 한국가스공사 도시가스 사용량 공공 API)`;
    const noteLines = doc.splitTextToSize(note, 174);
    y = ensureSpace(doc, y, noteLines.length * 4.5 + 4, '탄소 배출 벤치마킹');
    doc.text(noteLines, 18, y);
    y += noteLines.length * 4.5 + 4;

  } else {
    drawCard(doc, 18, y, 174, 26);
    doc.setFillColor(...P.muted); doc.rect(18, y, 3, 26, 'F');
    setF(doc, 9); setColor(doc, P.muted);
    doc.text('공공 API 벤치마크 데이터가 없습니다. 분석 후 PDF를 다시 생성해주세요.', 24, y + 15);
    y += 34;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 4 — 환경 (E)
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '환경 (E) 부문 정밀 진단');
  y = sectionTitle(doc, 18, y, '4. AI 정성 분석 — 환경 (E) 부문', P.green, '환경 (E) 부문');

  y = ensureSpace(doc, y, 30, '환경 (E) 부문');
  drawCard(doc, 18, y, 174, 28);
  doc.setFillColor(...P.green);
  doc.roundedRect(18, y, 174, 4.5, 2, 2, 'F'); doc.rect(18, y + 2.5, 174, 2, 'F');
  setF(doc, 10.5); setColor(doc, P.green);
  doc.text(`환경(E) 종합 점수: ${eS.score ?? '-'}점`, 24, y + 18);
  if (eS.score != null) drawScoreBar(doc, 92, y + 13.5, 58, eS.score, P.green);
  setColor(doc, P.muted);
  doc.text(`등급: ${eS.grade || '-'}`, 158, y + 18);
  y += 35;

  y = renderFourBullets(doc, eS.comment || '', 18, y, 174, '환경 (E) 부문');

  if (eS.subIndicators?.length > 0) {
    y = ensureSpace(doc, y, 24, '환경 (E) 부문');
    y = sectionTitle(doc, 18, y, '세부 지표별 정밀 진단', P.green, '환경 (E) 부문');
    drawIndicatorTable(doc, eS, P.green, y);
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 5 — 사회 (S)
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '사회 (S) 부문 정밀 진단');
  y = sectionTitle(doc, 18, y, '5. AI 정성 분석 — 사회 (S) 부문', P.blue, '사회 (S) 부문');

  y = ensureSpace(doc, y, 30, '사회 (S) 부문');
  drawCard(doc, 18, y, 174, 28);
  doc.setFillColor(...P.blue);
  doc.roundedRect(18, y, 174, 4.5, 2, 2, 'F'); doc.rect(18, y + 2.5, 174, 2, 'F');
  setF(doc, 10.5); setColor(doc, P.blue);
  doc.text(`사회(S) 종합 점수: ${sS.score ?? '-'}점`, 24, y + 18);
  if (sS.score != null) drawScoreBar(doc, 92, y + 13.5, 58, sS.score, P.blue);
  setColor(doc, P.muted);
  doc.text(`등급: ${sS.grade || '-'}`, 158, y + 18);
  y += 35;

  if (effectiveReport?.ecoPoints > 0) {
    y = ensureSpace(doc, y, 18, '사회 (S) 부문');
    doc.setFillColor(...P.greenL);
    doc.roundedRect(18, y, 174, 14, 2.5, 2.5, 'F');
    doc.setFillColor(...P.green); doc.rect(18, y, 3.5, 14, 'F');
    setF(doc, 8.5); setColor(doc, [6, 95, 70]);
    doc.text(
      `임직원 에코 포인트 성과 반영 — ${Number(effectiveReport.ecoPoints).toLocaleString()} EP → 탄소 ${effectiveReport.carbonReductionKg} kg 절감`,
      24, y + 9
    );
    y += 20;
  }

  y = renderFourBullets(doc, sS.comment || '', 18, y, 174, '사회 (S) 부문');

  if (sS.subIndicators?.length > 0) {
    y = ensureSpace(doc, y, 24, '사회 (S) 부문');
    y = sectionTitle(doc, 18, y, '세부 지표별 정밀 진단', P.blue, '사회 (S) 부문');
    drawIndicatorTable(doc, sS, P.blue, y);
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 6 — 지배구조 (G)
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '지배구조 (G) 부문 정밀 진단');
  y = sectionTitle(doc, 18, y, '6. AI 정성 분석 — 지배구조 (G) 부문', P.purple, '지배구조 (G) 부문');

  y = ensureSpace(doc, y, 30, '지배구조 (G) 부문');
  drawCard(doc, 18, y, 174, 28);
  doc.setFillColor(...P.purple);
  doc.roundedRect(18, y, 174, 4.5, 2, 2, 'F'); doc.rect(18, y + 2.5, 174, 2, 'F');
  setF(doc, 10.5); setColor(doc, P.purple);
  doc.text(`지배구조(G) 종합 점수: ${gS.score ?? '-'}점`, 24, y + 18);
  if (gS.score != null) drawScoreBar(doc, 92, y + 13.5, 58, gS.score, P.purple);
  setColor(doc, P.muted);
  doc.text(`등급: ${gS.grade || '-'}`, 158, y + 18);
  y += 35;

  y = renderFourBullets(doc, gS.comment || '', 18, y, 174, '지배구조 (G) 부문');

  if (gS.subIndicators?.length > 0) {
    y = ensureSpace(doc, y, 24, '지배구조 (G) 부문');
    y = sectionTitle(doc, 18, y, '세부 지표별 정밀 진단', P.purple, '지배구조 (G) 부문');
    drawIndicatorTable(doc, gS, P.purple, y);
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 7 — 원문 근거 매핑 (optional)
  // ═══════════════════════════════════════════════════════════
  const evidence = (effectiveReport?.evidenceMapping || []).map(e => ({
    ...e,
    page: e.page ?? e.page_number ?? e.pageNumber ?? null,
  }));

  let pageNum = 7;

  if (evidence.length > 0) {
    y = initPage(doc, 'K-ESG 원문 근거 매핑');
    y = sectionTitle(doc, 18, y, '7. K-ESG 지표 원문 근거 매핑 테이블', P.navy, 'K-ESG 원문 근거 매핑');

    setF(doc, 8.5); setColor(doc, P.muted);
    doc.text(`총 ${evidence.length}개 지표 원문 인용 — AI 분석 근거 투명성 공시 (K-ESG F-303 기준)`, 18, y);
    y += 5;
    setF(doc, 7.5); setColor(doc, P.amber);
    doc.text('※ [p.] 컬럼은 사용자가 업로드한 PDF의 페이지 번호입니다 (K-ESG 가이드라인 페이지 아님)', 18, y);
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [['지표명', 'K-ESG 코드', '원문 인용', 'p.', '일치도', '신뢰도', '점수', '등급']],
      body: evidence.map(e => [
        (e.indicator || '').slice(0, 22),
        e.kesgCode || '-',
        (e.evidence || '').slice(0, 55),
        e.page != null ? String(e.page) : '-',
        e.consistency || '-',
        `${e.confidenceScore ?? 0}%`,
        e.score != null ? `${e.score}점` : '-',
        e.grade || '-',
      ]),
      styles:      { ...KOR, fontSize: 7.5, cellPadding: 2.5 },
      headStyles:  { ...KOR, fillColor: P.navy, textColor: P.white, fontSize: 8 },
      alternateRowStyles: { fillColor: P.bg },
      columnStyles: {
        0: { cellWidth: 26 }, 1: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 14, halign: 'center' }, 6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 12, halign: 'center' },
      },
      didDrawCell: (data) => {
        if (data.column.index === 7 && data.section === 'body') {
          const g = String(data.cell.raw).toUpperCase();
          if (g !== '-') {
            doc.setFillColor(...gradeRgb(g));
            doc.roundedRect(data.cell.x + 1, data.cell.y + 1.5, data.cell.width - 2, data.cell.height - 3, 1.5, 1.5, 'F');
            setF(doc, 7.5); setColor(doc, P.white);
            doc.text(g, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
          }
        }
      },
      margin: { left: 18, right: 18 },
    });
    pageNum = 8;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 7/8 — 종합 평가 및 개선 제언
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '종합 평가 및 개선 제언');
  y = sectionTitle(doc, 18, y, `${pageNum}. 종합 평가 및 개선 제언`, P.navy, '종합 평가 및 개선 제언');

  doc.setFillColor(...gradeC);
  doc.roundedRect(18, y, 174, 20, 3.5, 3.5, 'F');
  setF(doc, 12); setColor(doc, P.white);
  doc.text(`최종 종합 ESG 등급: ${grade}`, 105, y + 13, { align: 'center' });
  y += 27;

  autoTable(doc, {
    startY: y,
    head: [['부문', '등급', '주요 개선 과제']],
    body: [
      ['환경(E)', eS.grade || '-',
       eS.recommendation || (eS.comment || '').replace(/\[.*?\]/g, '').trim()
       || '환경 지표 데이터 보강 및 온실가스 감축 로드맵 수립 권장'],
      ['사회(S)', sS.grade || '-',
       sS.recommendation || (sS.comment || '').replace(/\[.*?\]/g, '').trim()
       || '사회 지표 데이터 보강 및 임직원 참여 프로그램 확대 권장'],
      ['지배구조(G)', gS.grade || '-',
       gS.recommendation || (gS.comment || '').replace(/\[.*?\]/g, '').trim()
       || '이사회 다양성 강화 및 ESG 정보 공시 체계 고도화 권장'],
    ],
    styles:       { ...KOR, fontSize: 9, cellPadding: 4 },
    headStyles:   { ...KOR, fillColor: P.navy, textColor: P.white },
    alternateRowStyles: { fillColor: P.bg },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: 16, halign: 'center' },
    },
    didDrawCell: (data) => {
      if (data.column.index === 1 && data.section === 'body') {
        const g = String(data.cell.raw).toUpperCase();
        if (g !== '-') {
          doc.setFillColor(...gradeRgb(g));
          doc.roundedRect(data.cell.x + 1, data.cell.y + 1.5, data.cell.width - 2, data.cell.height - 3, 1.5, 1.5, 'F');
          setF(doc, 8.5); setColor(doc, P.white);
          doc.text(g, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    },
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 12;

  // 임직원 에코 포인트 성과
  if (effectiveReport?.ecoPoints > 0) {
    y = ensureSpace(doc, y, 50, '종합 평가 및 개선 제언');
    y = sectionTitle(doc, 18, y, `${pageNum + 1 - (evidence.length > 0 ? 0 : 1)}. 임직원 에코 포인트 성과`, P.green, '종합 평가 및 개선 제언');
    drawCard(doc, 18, y, 174, 34);
    doc.setFillColor(...P.green);
    doc.roundedRect(18, y, 174, 4.5, 2, 2, 'F'); doc.rect(18, y + 2.5, 174, 2, 'F');
    [
      ['에코 포인트 총합', `${Number(effectiveReport.ecoPoints).toLocaleString()} EP`],
      ['탄소 절감량',       `${effectiveReport.carbonReductionKg ?? 0} kg CO₂eq`],
      ['소나무 식재 환산',  `${effectiveReport.equivalentTrees ?? 0}그루`],
    ].forEach(([lbl, val], i) => {
      const ix = 24 + i * 58;
      setF(doc, 7.5); setColor(doc, P.muted); doc.text(lbl, ix, y + 16);
      setF(doc, 11);  setColor(doc, P.green); doc.text(val, ix, y + 26);
    });
    y += 40;
  }

  // 면책 고지
  y = ensureSpace(doc, y, 32, '종합 평가 및 개선 제언');
  doc.setFillColor(...P.bg);
  doc.roundedRect(18, y, 174, 28, 3, 3, 'F');
  doc.setDrawColor(...P.border); doc.setLineWidth(0.3);
  doc.roundedRect(18, y, 174, 28, 3, 3, 'S');
  setF(doc, 7.5); setColor(doc, P.muted);
  const disclaimer = doc.splitTextToSize(
    '본 리포트는 ECO POINT ESG Management Platform의 AI 분석 엔진이 K-ESG 가이드라인(산업통상자원부, 2021)을 기준으로 작성하였습니다. '
    + 'AI 분석 특성상 실제 ESG 공시 자료와 일부 차이가 발생할 수 있으며, 공식 ESG 인증 보고서를 대체하지 않습니다. '
    + '금융기관 제출 또는 투자 의사결정 시 전문 ESG 컨설팅 기관의 검토를 병행하시기 바랍니다.',
    170
  );
  doc.text(disclaimer, 22, y + 9);

  // ═══════════════════════════════════════════════════════════
  // 전체 페이지 푸터 적용 — 배경 재덮어쓰기 없음 (핵심 버그 수정)
  // ═══════════════════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // ★ if (p > 1) 배경 rect 제거 — 이게 기존 공백 페이지 버그의 원인이었음 ★
    doc.setFillColor(...P.navy);
    doc.rect(0, 288, W, 9, 'F');
    doc.setFillColor(...P.blue);
    doc.rect(0, 288, W, 1.5, 'F');
    setF(doc, 7); setColor(doc, [203, 213, 225]);
    doc.text(`ECO POINT ESG Management Platform  ·  ${companyName}  ·  ${quarter}`, 18, 293.5);
    setColor(doc, [147, 197, 253]);
    doc.text(`${p} / ${totalPages}`, 192, 293.5, { align: 'right' });
  }

  const safeDate = today.toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '');
  doc.save(`${companyName}_ESG성과분석리포트_${safeDate}.pdf`);
};
