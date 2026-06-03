import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── 업종별 동적 가중치 (AnalysisResultPage / exportAnalysisResult와 동기화) ─
const _IND_TYPE_ESG = {
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
const _IND_W_ESG = {
  MFG:    { E:0.50, S:0.25, G:0.25 },
  ENERGY: { E:0.55, S:0.25, G:0.20 },
  FIN:    { E:0.25, S:0.40, G:0.35 },
  IT:     { E:0.30, S:0.40, G:0.30 },
  DEFAULT:{ E:0.40, S:0.30, G:0.30 },
};
const getReportWeights = () => {
  const ksic = typeof localStorage !== 'undefined' ? (localStorage.getItem('esg_ksicCode') ?? '') : '';
  const type = _IND_TYPE_ESG[ksic.substring(0, 2)] ?? 'DEFAULT';
  return _IND_W_ESG[type];
};
// K_ESG_WEIGHTS shim — exportESGReport 내부에서만 사용
const K_ESG_WEIGHTS = getReportWeights();

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
  doc.text('GreenTrace  |  ESG 진단 플랫폼', 18, 6.3);
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
  // 연한 배경 밴드 (alpha 미지원 → 명도 혼합으로 대체)
  const lightBg = [
    Math.min(255, Math.round(rgb[0] * 0.10 + 242)),
    Math.min(255, Math.round(rgb[1] * 0.10 + 242)),
    Math.min(255, Math.round(rgb[2] * 0.10 + 242)),
  ];
  doc.setFillColor(...lightBg);
  doc.roundedRect(x, y - 1, 174, 13, 2, 2, 'F');
  doc.setFillColor(...rgb);
  doc.roundedRect(x, y - 1, 5, 13, 2, 2, 'F');
  setF(doc, 13.5);
  setColor(doc, P.text);
  doc.text(text, x + 10, y + 7.5);
  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.5);
  doc.line(x, y + 14, x + 174, y + 14);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...P.border);
  return y + 20;
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
  setF(doc, 6.5); setColor(doc, P.text); doc.text('지역 평균', sx + 46, ly + 2.5);
  doc.setFillColor(...P.red); doc.rect(sx + 76, ly + 1, 8, 1.5, 'F');
  setF(doc, 6.5); setColor(doc, P.text); doc.text('지역 월평균 기준선', sx + 86, ly + 2.5);
  return ly + 9;
};

// ── 세부 지표 autoTable ──────────────────────────────────────
const drawIndicatorTable = (doc, section, headerColor, startY) => {
  if (!section.subIndicators?.length) return startY ?? doc.lastAutoTable?.finalY ?? 0;
  const KOR = { font: 'NanumGothic', fontStyle: 'normal' };
  // E 카테고리에 동일 데이터 공유 안내 주석 추가
  const isEnv = (section.category === 'Environment');
  autoTable(doc, {
    startY: startY != null ? startY : (doc.lastAutoTable?.finalY ?? 0) + 6,
    head: [['K-ESG 코드', '지표명', '점수', '등급', '진단 코멘트', '검증 수준']],
    body: (section.subIndicators || []).map(s => [
      s.kesgCode || '-',
      s.title || '-',
      s.score != null ? `${s.score}점` : '-',
      s.grade || '-',
      (s.comment || '-').replace(/\[[^\]]+\]/g, '').trim(),
      `${s.confidenceScore ?? 0}%`,
    ]),
    styles:      { ...KOR, fontSize: 8, cellPadding: 4.5, minCellHeight: 10, textColor: P.text },
    headStyles:  { ...KOR, fillColor: headerColor, textColor: P.white, fontSize: 9, cellPadding: 5 },
    alternateRowStyles: { fillColor: P.bg },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
    },
    willDrawCell: (data) => {
      // 한글 폰트 일관성 보장 — didDrawCell이 doc 상태를 변경해도 다음 셀에 영향 없도록
      if (data.section === 'body') {
        doc.setFont('NanumGothic', 'normal');
        doc.setTextColor(...P.text);
      }
    },
    didDrawCell: (data) => {
      if (data.column.index === 3 && data.section === 'body') {
        const g = String(data.cell.raw).toUpperCase();
        if (g !== '-') {
          doc.setFillColor(...gradeRgb(g));
          doc.roundedRect(data.cell.x + 1, data.cell.y + 1.5, data.cell.width - 2, data.cell.height - 3, 1.5, 1.5, 'F');
          setF(doc, 8); setColor(doc, P.white);
          doc.text(g, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
          // 폰트 상태 복원
          doc.setFont('NanumGothic', 'normal');
          doc.setTextColor(...P.text);
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
  const dateStr = today.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
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
  const weightLabel = `K-ESG 가중평균 (E ${eW}% + S ${sW}% + G ${gW}%)`;

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
  // 상단 우측 얇은 강조선
  doc.setFillColor(29, 78, 216);
  doc.rect(180, 0, 30, 1.5, 'F');

  // 브랜드
  setF(doc, 8); setColor(doc, [147, 197, 253]);
  doc.text('GreenTrace  |  ESG 진단 플랫폼', 18, 18);

  // 기업명 (대형)
  setF(doc, 23); setColor(doc, P.white);
  const nameLines = doc.splitTextToSize(companyName, 140);
  doc.text(nameLines, 18, 40);

  // 부제목
  setF(doc, 12.5); setColor(doc, [199, 210, 254]);
  const subY = 40 + nameLines.length * 8.8 + 5;
  doc.text('ESG 진단 보고서', 18, subY);

  // 진단 기준 태그
  setF(doc, 7.5); setColor(doc, [148, 163, 184]);
  doc.text('K-ESG 가이드라인 기반 진단 | 산업통상자원부, 2021', 18, subY + 8);

  // 발행 정보
  setF(doc, 8); setColor(doc, [148, 163, 184]);
  const regionTag = region ? `  |  ${region}` : '';
  doc.text(`${analysisRange}  |  ${industry}${regionTag}`, 18, 96);
  doc.text(`발행일: ${dateStr}  |  기준: K-ESG 가이드라인 (산업통상자원부, 2021)`, 18, 103);

  // 등급 뱃지 (우측 — pill 스타일)
  const gradeRgbC = gradeRgb(grade);
  const gradeLightC = [
    Math.min(255, Math.round(gradeRgbC[0] * 0.15 + 235)),
    Math.min(255, Math.round(gradeRgbC[1] * 0.15 + 235)),
    Math.min(255, Math.round(gradeRgbC[2] * 0.15 + 235)),
  ];
  doc.setFillColor(...gradeLightC);
  doc.roundedRect(161, 44, 32, 14, 5, 5, 'F');
  doc.setFillColor(...gradeRgbC);
  doc.roundedRect(161, 44, 32, 14, 5, 5, 'S');
  setF(doc, 12); setColor(doc, gradeRgbC);
  doc.text(`${grade}등급`, 177, 54, { align: 'center' });
  // 신뢰도 + 분석 완료 pill
  doc.setFillColor(...[255,255,255]);
  doc.roundedRect(161, 62, 32, 10, 4, 4, 'F');
  doc.setDrawColor(...P.border); doc.setLineWidth(0.25);
  doc.roundedRect(161, 62, 32, 10, 4, 4, 'S');
  setF(doc, 7.5); setColor(doc, P.muted);
  const confLblPill = gradeC[0] < 100 ? '높음' : 'HIGH';
  doc.text('분석 완료', 177, 69, { align: 'center' });

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
    setF(doc, 20); setColor(doc, c.rgb);
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
  y = initPage(doc, '경영진 요약');
  y = sectionTitle(doc, 18, y, '2. 경영진 요약 — ESG 진단 분석 결과', P.navy, '경영진 요약');

  // Audit Confidence 배너
  const auditConf   = effectiveReport?.overallConfidence ?? 0;
  const auditConfLbl = auditConf >= 70 ? 'HIGH' : auditConf >= 50 ? 'MEDIUM' : 'LOW';
  const auditConfRgb = auditConf >= 70 ? P.green : auditConf >= 50 ? P.amber : [180, 140, 80];

  // 등급 + Confidence 듀얼 배너
  const banH = 22;
  doc.setFillColor(...gradeC);
  doc.roundedRect(18, y, 88, banH, 3.5, 3.5, 'F');
  setF(doc, 9.5); setColor(doc, P.white);
  doc.text(`ESG 종합 등급: ${grade}`, 62, y + 14, { align: 'center' });
  setF(doc, 7); setColor(doc, [199, 210, 254]);
  doc.text(weightLabel, 62, y + 20, { align: 'center' });

  doc.setFillColor(...auditConfRgb);
  doc.roundedRect(110, y, 82, banH, 3.5, 3.5, 'F');
  setF(doc, 9.5); setColor(doc, P.white);
  doc.text(`검증 수준: ${auditConfLbl === 'HIGH' ? '높음' : auditConfLbl === 'MEDIUM' ? '보통' : '낮음'}`, 151, y + 14, { align: 'center' });
  setF(doc, 7); setColor(doc, [199, 210, 254]);
  doc.text(`${Math.round(auditConf)}점 | K-ESG 진단 기준`, 151, y + 20, { align: 'center' });
  y += 30;

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

  // 종합 진단 의견 요약 (최대 1200자 — 텍스트 박스 잘림 방지)
  y = sectionTitle(doc, 18, y, '종합 진단 의견 요약', P.blue, '경영진 요약');
  const _rawOpinion = effectiveReport?.overallOpinion ||
    (effectiveReport?.fullReport || '').replace(/<[^>]+>/g, ' ');
  const opinionText = ((effectiveReport?.lowMismatchCount ?? 0) > 0
    ? _rawOpinion
    : _rawOpinion
        .replace(/[^.!?。]*[EeSsGg]-\d{3}[^.!?。]*(?:불일치|차이|mismatch)[^.!?。]*[.!?。]?\s*/g, '')
        .replace(/\s{2,}/g, ' ').trim()
  ).slice(0, 1200);
  y = renderFourBullets(doc, opinionText, 18, y, 174, '경영진 요약');

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
    const diffVal = annualReductionPercent ?? 0;
    // 판정 기준: -10% 이하 절감 = 우수 / -10~+10% = 평균 수준 / +10% 초과 = 개선 필요
    const benchJudge = diffVal <= -10 ? '[우수]' : diffVal <= 10 ? '[평균 수준]' : '[개선 필요]';
    const statusTxt = better
      ? `${rn || ''} ${ind || ''} 업종 평균 대비 ${diffAbs}% 절감 ${benchJudge} - 환경 효율 상위권`
      : `${rn || ''} ${ind || ''} 업종 평균 대비 ${diffAbs}% 초과 배출 ${benchJudge} - 에너지 집중 관리 필요`;

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
        ['전기+가스 합계 (tCO2eq)',
         `${annualMyTotal.toFixed(1)} t`,
         `${annualRegionAvgTotal.toFixed(1)} t`,
         `${better ? '[절감]' : '[초과]'} ${Math.abs(annualMyTotal - annualRegionAvgTotal).toFixed(1)} t`],
        ['데이터 출처', '기업 DB 실측치', `${rn || ''} 한전,가스공사 공공 API`, 'K-ESG F-201 기준'],
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
    doc.text('월별 탄소 배출량 비교 (tCO2eq) - 공공 API 지역 데이터 기반', 18, y);
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
        `최다 초과: ${worst.monthLabel} - 우리 기업 ${worst.myEmissionTco2.toFixed(1)} t vs 지역 평균 ${worst.regionAvgEmissionTco2.toFixed(1)} t (${Math.abs(worst.reductionPercent).toFixed(1)}% 초과)`,
        24, y + 12
      );
      y += 21;
    }

    setF(doc, 7.5); setColor(doc, P.muted);
    const note = better
      ? `본 기업의 전력/가스 사용 효율이 ${rn || ''} 동종업계 평균을 상회합니다. 환경(E) 부문 점수에 긍정적으로 반영되었습니다. (출처: 한전 지역별 전력사용량, 가스공사 도시가스 사용량 공공 API)`
      : `전력/가스 사용량이 ${rn || ''} 동종업계 평균을 초과합니다. 에너지 효율 개선 시 환경(E) 점수가 상승합니다. (출처: 한전 지역별 전력사용량, 가스공사 도시가스 사용량 공공 API)`;
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
  y = initPage(doc, '환경 (E) 부문 진단');
  y = sectionTitle(doc, 18, y, '4. 환경 (E) 부문 진단 결과', P.green, '환경 (E) 부문');

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
    y = sectionTitle(doc, 18, y, '세부 지표별 진단', P.green, '환경 (E) 부문');
    // E-101~105 공유 데이터 안내
    y = ensureSpace(doc, y, 14, '환경 (E) 부문');
    doc.setFillColor(...P.greenL);
    doc.roundedRect(18, y, 174, 11, 2, 2, 'F');
    doc.setFillColor(...P.green); doc.rect(18, y, 3, 11, 'F');
    setF(doc, 7.5); setColor(doc, P.green);
    doc.text('* E-101~E-105 지표는 동일 환경 데이터 테이블에서 전기/가스/탄소/폐기물/수자원 수치를 각각 검증합니다 - 복수 지표가 동일 원문을 참조하는 것은 정상 동작입니다.', 24, y + 7.5, { maxWidth: 168 });
    y += 15;
    // 신뢰도 LOW 설명 — 환경 점수는 수치 일치율(HIGH/MEDIUM/LOW) 기준으로 산정되며, 유사도 신뢰도와 별개로 적용됩니다.
    const lowConfE = (eS.subIndicators || []).filter(s => (s.confidenceScore ?? 100) < 50);
    if (lowConfE.length > 0) {
      y = ensureSpace(doc, y, 13, '환경 (E) 부문');
      doc.setFillColor(...P.bg);
      doc.roundedRect(18, y, 174, 10, 2, 2, 'F');
      doc.setDrawColor(220, 185, 120); doc.setLineWidth(0.15);
      doc.roundedRect(18, y, 174, 10, 2, 2, 'S');
      doc.setFillColor(180, 140, 80); doc.rect(18, y, 3, 10, 'F');
      setF(doc, 7.5); setColor(doc, P.muted);
      doc.text(`※ 검증 수준 낮음(${lowConfE.length}개 항목): 문서 관련성 점수가 낮지만 환경(E) 최종 점수는 수치 일치율 기준으로 산정됩니다. 참고 지표이며 점수에 직접 영향을 주지 않습니다.`, 24, y + 7, { maxWidth: 168 });
      y += 14;
    }
    drawIndicatorTable(doc, eS, P.green, y);
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 5 — 사회 (S)
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '사회 (S) 부문 진단');
  y = sectionTitle(doc, 18, y, '5. 사회 (S) 부문 진단 결과', P.blue, '사회 (S) 부문');

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
      `임직원 에코 포인트 성과 반영 - ${Number(effectiveReport.ecoPoints).toLocaleString()} EP, 탄소 ${effectiveReport.carbonReductionKg} kg 절감`,
      24, y + 9
    );
    y += 20;
  }

  y = renderFourBullets(doc, sS.comment || '', 18, y, 174, '사회 (S) 부문');

  if (sS.subIndicators?.length > 0) {
    y = ensureSpace(doc, y, 24, '사회 (S) 부문');
    y = sectionTitle(doc, 18, y, '세부 지표별 진단', P.blue, '사회 (S) 부문');
    // S 지표 단일 근거 공유 안내 — S-201·203·204는 복수 지표가 동일 교육/참여 문서를 참조할 수 있음
    const sCodes = new Set((sS.subIndicators || []).map(s => s.kesgCode));
    const hasSharedS = ['S-201','S-203','S-204'].filter(c => sCodes.has(c)).length >= 2;
    if (hasSharedS) {
      y = ensureSpace(doc, y, 13, '사회 (S) 부문');
      doc.setFillColor(...P.blueL);
      doc.roundedRect(18, y, 174, 10, 2, 2, 'F');
      doc.setFillColor(...P.blue); doc.rect(18, y, 3, 10, 'F');
      setF(doc, 7.5); setColor(doc, P.blue);
      doc.text('* S-201/S-203/S-204 지표는 안전/ESG/참여 교육 관련 동일 문서를 각각 검증합니다 - 복수 지표가 동일 원문을 참조하는 것은 정상 동작입니다.', 24, y + 7, { maxWidth: 168 });
      y += 14;
    }
    drawIndicatorTable(doc, sS, P.blue, y);
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 6 — 지배구조 (G)
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '지배구조 (G) 부문 진단');
  y = sectionTitle(doc, 18, y, '6. 지배구조 (G) 부문 진단 결과', P.purple, '지배구조 (G) 부문');

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
    y = sectionTitle(doc, 18, y, '세부 지표별 진단', P.purple, '지배구조 (G) 부문');
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
    y = initPage(doc, 'K-ESG 지표 진단 근거');
    y = sectionTitle(doc, 18, y, '7. K-ESG 지표 진단 근거 검증 테이블', P.navy, 'K-ESG 지표 진단 근거');

    setF(doc, 8.5); setColor(doc, P.muted);
    doc.text(`총 ${evidence.length}개 지표 진단 근거 검증 결과`, 18, y);
    y += 9;

    // 관련성/검증상태 변환 헬퍼
    const toRelevance = (c) => {
      const cu = (c ?? '').toUpperCase();
      if (cu === 'HIGH')   return '높음';
      if (cu === 'MEDIUM') return '보통';
      if (cu === 'LOW')    return '낮음';
      return '-';
    };
    const toVerStatus = (c) => {
      const cu = (c ?? '').toUpperCase();
      if (cu === 'HIGH')   return '근거 확인';
      if (cu === 'MEDIUM') return '부분 확인';
      if (cu === 'LOW')    return '검토 필요';
      return '근거 미확인';
    };

    autoTable(doc, {
      startY: y,
      head: [['지표 코드', '지표명', '진단 근거', '관련성', '검증 상태']],
      body: evidence.map(e => [
        e.kesgCode || '-',
        (e.indicator || '').slice(0, 18),
        (e.evidence || '').slice(0, 65),
        toRelevance(e.consistency),
        toVerStatus(e.consistency),
      ]),
      styles:      { ...KOR, fontSize: 8.5, cellPadding: 4.5, lineColor: P.border, lineWidth: 0.2 },
      headStyles:  { ...KOR, fillColor: P.bg, textColor: P.text, fontSize: 9, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 82 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
      },
      willDrawCell: (data) => {
        if (data.section === 'body') {
          doc.setFont('NanumGothic', 'normal');
          doc.setTextColor(...P.text);
        }
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 3) {
            const v = data.cell.raw;
            if (v === '높음') data.cell.styles.textColor = P.green;
            if (v === '보통') data.cell.styles.textColor = P.amber;
            if (v === '낮음') data.cell.styles.textColor = P.red;
          }
          if (data.column.index === 4) {
            const v = String(data.cell.raw ?? '');
            if (v === '근거 확인') data.cell.styles.textColor = P.green;
            if (v === '부분 확인') data.cell.styles.textColor = P.amber;
            if (v === '검토 필요') data.cell.styles.textColor = P.red;
            if (v === '근거 미확인') data.cell.styles.textColor = P.muted;
          }
        }
      },
      margin: { left: 18, right: 18 },
    });
    pageNum = 8;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 8/9 — Evidence Verification Summary
  // ═══════════════════════════════════════════════════════════
  {
    y = initPage(doc, '근거 검증 결과');
    y = sectionTitle(doc, 18, y, `${pageNum}. 근거 검증 결과 요약`, P.navy, '근거 검증 결과');

    // 검증 상태별 통계
    const verStats = { verified: 0, partial: 0, contradiction: 0, noEvidence: 0 };
    for (const e of evidence) {
      const c = (e.consistency || '').toUpperCase();
      if (c === 'HIGH')          verStats.verified++;
      else if (c === 'MEDIUM')   verStats.partial++;
      else if (c === 'LOW')      verStats.contradiction++;
      else                       verStats.noEvidence++;
    }
    // 근거 없는 항목 추가
    const TOTAL_IND = 15; // E(5) + S(5) + G(5)
    const docEvCount = Math.min(evidence.length, TOTAL_IND);
    verStats.noEvidence += Math.max(0, TOTAL_IND - docEvCount);
    const verTotal = verStats.verified + verStats.partial + verStats.contradiction + verStats.noEvidence;

    // 상태별 카드 4개
    const statDefs = [
      { label: '감사 확인',   count: verStats.verified,      rgb: P.green,  bg: P.greenL,  desc: '감사 근거 확인' },
      { label: '부분 확인',  count: verStats.partial,       rgb: P.blue,   bg: P.blueL,   desc: '부분 근거 확인' },
      { label: '불일치',     count: verStats.contradiction, rgb: P.red,    bg: P.redL,    desc: '수치 불일치 감지' },
      { label: '근거 미확인', count: verStats.noEvidence,   rgb: P.muted,  bg: P.bg,      desc: '명시 근거 미확인' },
    ];
    const cw4 = 40, cGap4 = 5;
    statDefs.forEach((s, i) => {
      const cx = 18 + i * (cw4 + cGap4);
      drawCard(doc, cx, y, cw4, 38);
      doc.setFillColor(...s.rgb);
      doc.roundedRect(cx, y, cw4, 3.5, 2, 2, 'F');
      doc.rect(cx, y + 2, cw4, 1.5, 'F');
      setF(doc, 7); setColor(doc, P.muted);
      const lLines = doc.splitTextToSize(s.label, cw4 - 6);
      doc.text(lLines, cx + cw4 / 2, y + 10, { align: 'center' });
      setF(doc, 20); setColor(doc, s.rgb);
      doc.text(String(s.count), cx + cw4 / 2, y + 27, { align: 'center' });
      setF(doc, 7); setColor(doc, P.muted);
      doc.text(s.desc, cx + cw4 / 2, y + 34, { align: 'center' });
    });
    y += 46;

    // 검증 현황 진행 막대 (가로 적층)
    y = ensureSpace(doc, y, 20, '근거 검증 결과');
    setF(doc, 8.5); setColor(doc, P.text);
    doc.text('K-ESG 지표 검증 현황 분포', 18, y);
    y += 6;

    const barTotalW = 174;
    const barH = 7;
    let bx = 18;
    const barDefs = [
      { count: verStats.verified,      rgb: P.green,  label: '감사 확인' },
      { count: verStats.partial,       rgb: P.blue,   label: '부분 확인' },
      { count: verStats.contradiction, rgb: P.red,    label: '불일치' },
      { count: verStats.noEvidence,    rgb: P.muted,  label: '근거 미확인' },
    ];
    for (const bd of barDefs) {
      if (verTotal === 0 || bd.count === 0) continue;
      const bw = (bd.count / verTotal) * barTotalW;
      doc.setFillColor(...bd.rgb);
      doc.rect(bx, y, bw, barH, 'F');
      bx += bw;
    }
    doc.setDrawColor(...P.border); doc.setLineWidth(0.2);
    doc.roundedRect(18, y, barTotalW, barH, 2, 2, 'S');
    y += barH + 4;

    // 범례
    let lgX = 18;
    barDefs.forEach(bd => {
      if (bd.count === 0) return;
      doc.setFillColor(...bd.rgb);
      doc.roundedRect(lgX, y, 5, 3, 1, 1, 'F');
      setF(doc, 6.5); setColor(doc, P.muted);
      doc.text(`${bd.label} (${bd.count})`, lgX + 7, y + 2.5);
      lgX += 42;
    });
    y += 10;

    // 영역별 Verification 요약 테이블
    y = ensureSpace(doc, y, 50, '근거 검증 결과');
    y = sectionTitle(doc, 18, y, '영역별 검증 결과 요약', P.blue, '근거 검증 결과');

    const catEvidence = (cat) => evidence.filter(e => (e.kesgCode || e.indicatorCode || '').startsWith(cat));
    const catSummary  = (cat) => {
      const evs = catEvidence(cat);
      const ver = evs.filter(e => (e.consistency || '').toUpperCase() === 'HIGH').length;
      const par = evs.filter(e => (e.consistency || '').toUpperCase() === 'MEDIUM').length;
      const con = evs.filter(e => (e.consistency || '').toUpperCase() === 'LOW').length;
      const none = Math.max(0, 5 - evs.length);
      return { ver, par, con, none, total: 5 };
    };
    const catRows = [
      { cat: '환경 (E)', ...catSummary('E'), rgb: P.green },
      { cat: '사회 (S)', ...catSummary('S'), rgb: P.blue },
      { cat: '지배구조 (G)', ...catSummary('G'), rgb: P.purple },
    ];

    autoTable(doc, {
      startY: y,
      head: [['영역', '감사 확인', '부분 확인', '불일치', '근거 미확인', '커버리지']],
      body: catRows.map(r => [
        r.cat,
        `${r.ver}개`,
        `${r.par}개`,
        `${r.con}개`,
        `${r.none}개`,
        `${Math.round(((r.ver + r.par) / r.total) * 100)}%`,
      ]),
      styles:      { ...KOR, fontSize: 8.5, cellPadding: 3.5 },
      headStyles:  { ...KOR, fillColor: P.navyMd, textColor: P.white },
      alternateRowStyles: { fillColor: P.bg },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { halign: 'center', textColor: P.green },
        2: { halign: 'center', textColor: P.blue },
        3: { halign: 'center', textColor: P.red },
        4: { halign: 'center', textColor: P.muted },
        5: { halign: 'center' },
      },
      margin: { left: 18, right: 18 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // NO EVIDENCE 지표 식별 목록 (어느 지표가 근거 없음인지 명시)
    const ALL_IND_CODES = {
      'E-101':'전력 사용량','E-102':'가스 사용량','E-103':'탄소 배출량','E-104':'폐기물 발생량','E-105':'용수 사용량',
      'S-201':'산업안전 교육','S-202':'산업재해 발생','S-203':'ESG 교육','S-204':'임직원 참여 프로그램','S-205':'지역사회 공헌',
      'G-301':'윤리경영 정책','G-302':'내부 신고 시스템','G-303':'ESG 담당 조직','G-304':'외부 감사','G-305':'이사회 독립성',
    };
    const detectedCodes  = new Set(evidence.map(e => e.kesgCode || e.indicatorCode).filter(Boolean));
    const noEvidenceList = Object.entries(ALL_IND_CODES).filter(([code]) => !detectedCodes.has(code));
    if (noEvidenceList.length > 0) {
      y = ensureSpace(doc, y, 18, '근거 검증 결과');
      doc.setFillColor(...P.bg);
      doc.roundedRect(18, y, 174, 14, 2.5, 2.5, 'F');
      doc.setFillColor(...P.muted); doc.rect(18, y, 3, 14, 'F');
      setF(doc, 7.5); setColor(doc, P.muted);
      doc.text(`NO EVIDENCE 지표 (${noEvidenceList.length}건): ${noEvidenceList.map(([c, n]) => `${c} ${n}`).join(', ')}`, 24, y + 9, { maxWidth: 162 });
      y += 18;
    }

    // Audit Confidence 요약
    const overallConf = effectiveReport?.overallConfidence ?? 0;
    const confLabel   = overallConf >= 70 ? '높음' : overallConf >= 50 ? '보통' : '낮음';
    const confRgb     = overallConf >= 70 ? P.green : overallConf >= 50 ? P.amber : [180, 140, 80];
    y = ensureSpace(doc, y, 22, '근거 검증 결과');
    doc.setFillColor(...confRgb);
    doc.roundedRect(18, y, 174, 18, 3, 3, 'F');
    setF(doc, 10); setColor(doc, P.white);
    doc.text(
      `검증 수준: ${confLabel} | ${Math.round(overallConf)}점 | 진단 커버리지 ${Math.round(((verStats.verified + verStats.partial) / Math.max(1, verTotal)) * 100)}%`,
      105, y + 12, { align: 'center' }
    );
    y += 24;

    pageNum++;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE — AI Audit Recommendations (개선 제언)
  // ═══════════════════════════════════════════════════════════
  y = initPage(doc, '개선 권고사항');
  y = sectionTitle(doc, 18, y, `${pageNum}. 개선 권고사항`, P.navy, '개선 권고사항');

  doc.setFillColor(...gradeC);
  doc.roundedRect(18, y, 174, 20, 3.5, 3.5, 'F');
  setF(doc, 12); setColor(doc, P.white);
  doc.text(`최종 종합 ESG 등급: ${grade} | K-ESG 가이드라인 기반 진단 결과`, 105, y + 13, { align: 'center' });
  y += 27;

  // E/S/G별 우선순위 권고
  const gradeToP = (g) => {
    const gU = String(g).toUpperCase();
    if (gU === 'D') return { label: 'HIGH',   cls: P.red,   bg: P.redL };
    if (gU === 'C') return { label: 'MEDIUM', cls: P.amber, bg: P.amberL };
    return                  { label: 'LOW',   cls: P.green, bg: P.greenL };
  };
  const recRows = [
    { cat: '환경(E)',     grade: eS.grade || '-', priority: gradeToP(eS.grade),
      text: (eS.recommendation || (eS.comment || '').replace(/\[.*?\]/g, '').trim() || '환경 지표 계량 데이터 보강 및 탄소 배출 감축 로드맵 수립 권장').slice(0, 100) },
    { cat: '사회(S)',     grade: sS.grade || '-', priority: gradeToP(sS.grade),
      text: (sS.recommendation || (sS.comment || '').replace(/\[.*?\]/g, '').trim() || '임직원 안전·교육·사회공헌 실적 정량화 및 ESG 보고서 기재 강화 권장').slice(0, 100) },
    { cat: '지배구조(G)', grade: gS.grade || '-', priority: gradeToP(gS.grade),
      text: (gS.recommendation || (gS.comment || '').replace(/\[.*?\]/g, '').trim() || '이사회 독립성·감사위원회 운영 실적·내부 신고 시스템 공시 강화 권장').slice(0, 100) },
  ];

  for (const rec of recRows) {
    y = ensureSpace(doc, y, 26, '개선 권고사항');
    const prioH = 24;
    doc.setFillColor(...rec.priority.bg);
    doc.roundedRect(18, y, 174, prioH, 2.5, 2.5, 'F');
    doc.setFillColor(...rec.priority.cls);
    doc.roundedRect(18, y, 4, prioH, 1.5, 1.5, 'F');
    doc.rect(20.5, y, 1.5, prioH, 'F');

    // Priority badge
    doc.setFillColor(...rec.priority.cls);
    doc.roundedRect(25, y + 6, 18, 7, 3, 3, 'F');
    setF(doc, 7); setColor(doc, P.white);
    doc.text(rec.priority.label, 34, y + 11.5, { align: 'center' });

    setF(doc, 9); setColor(doc, P.text);
    doc.text(rec.cat, 47, y + 9);
    if (rec.grade !== '-') {
      doc.setFillColor(...gradeRgb(rec.grade));
      doc.roundedRect(64, y + 5, 11, 7, 2.5, 2.5, 'F');
      setF(doc, 7.5); setColor(doc, P.white);
      doc.text(rec.grade, 69.5, y + 10.5, { align: 'center' });
    }
    setF(doc, 8); setColor(doc, P.muted);
    const recLines = doc.splitTextToSize(rec.text, 144);
    doc.text(recLines.slice(0, 1), 47, y + 18);
    y += prioH + 5;
  }

  y += 4;

  // 임직원 에코 포인트 성과
  if (effectiveReport?.ecoPoints > 0) {
    y = ensureSpace(doc, y, 50, '개선 권고사항');
    y = sectionTitle(doc, 18, y, '임직원 에코 포인트 성과', P.green, '개선 권고사항');
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

  // ═══════════════════════════════════════════════════════════
  // PAGE — Audit Methodology & Appendix
  // ═══════════════════════════════════════════════════════════
  pageNum++;
  y = initPage(doc, '진단 방법론 & 부록');
  y = sectionTitle(doc, 18, y, `${pageNum}. 진단 방법론`, P.navy, '진단 방법론 & 부록');

  y = ensureSpace(doc, y, 50, '진단 방법론 & 부록');
  autoTable(doc, {
    startY: y,
    head: [['단계', '평가 프로세스', '내용']],
    body: [
      ['01', '문서 수집 및 분류', 'ESG 증빙 문서 원문 수집 후 K-ESG 지표별 섹션 분류'],
      ['02', '지표 매핑 및 근거 탐색', '지표별 키워드 기반 관련 증빙 문서 섹션 추출 및 색인'],
      ['03', '수치 및 내용 검증', '환경 지표 수치 대조, 사회·지배구조 내용 일관성 분석'],
      ['04', '등급 산출 및 의견 생성', 'K-ESG 가중치 기반 점수 산출, 영역별 진단 의견 작성'],
    ],
    styles:       { ...KOR, fontSize: 8.5, cellPadding: 4 },
    headStyles:   { ...KOR, fillColor: P.navy, textColor: P.white, fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fillColor: P.bg, textColor: P.muted },
      1: { cellWidth: 52, textColor: P.blue },
      2: { textColor: P.text },
    },
    theme: 'plain',
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 10;

  y += 4;

  // Appendix — 소스 파일 정보
  y = ensureSpace(doc, y, 36, '진단 방법론 & 부록');
  y = sectionTitle(doc, 18, y, '부록 — 분석 기준 및 참고 자료', P.blue, '진단 방법론 & 부록');

  autoTable(doc, {
    startY: y,
    head: [['구분', '내용']],
    body: [
      ['분석 기업',       companyName],
      ['분석 기준',       `K-ESG 가이드라인 (산업통상자원부, 2021)`],
      ['분석 기간',       analysisRange],
      ['업종',            industry],
      ['진단 시스템',     'GreenTrace ESG 진단 엔진'],
      ['증빙 색인',       '제출 문서 기반 자동 색인'],
      ['증빙 문서 수',    `${evidence.length}개 증빙 문서 참조`],
      ['발행일',          dateStr],
    ],
    styles:       { ...KOR, fontSize: 8.5, cellPadding: 3 },
    headStyles:   { ...KOR, fillColor: P.navyMd, textColor: P.white },
    columnStyles: {
      0: { cellWidth: 35, fillColor: P.bg, textColor: P.muted },
      1: { textColor: P.text },
    },
    theme: 'plain',
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // 면책 고지
  y = ensureSpace(doc, y, 32, '진단 방법론 & 부록');
  doc.setFillColor(...P.bg);
  doc.roundedRect(18, y, 174, 28, 3, 3, 'F');
  doc.setDrawColor(...P.border); doc.setLineWidth(0.3);
  doc.roundedRect(18, y, 174, 28, 3, 3, 'S');
  setF(doc, 7.5); setColor(doc, P.muted);
  const disclaimer = doc.splitTextToSize(
    '본 보고서는 GreenTrace ESG 진단 플랫폼이 K-ESG 가이드라인(산업통상자원부, 2021)을 기준으로 제출된 ESG 데이터 및 증빙 문서를 바탕으로 자동 생성하였습니다. '
    + '본 보고서는 공식 ESG 인증 보고서를 대체하지 않으며, 금융기관 제출 또는 투자 의사결정 시 전문 ESG 컨설팅 기관의 검토를 병행하시기 바랍니다.',
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
    doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.2); doc.line(0, 289, W, 289);
    setF(doc, 6); setColor(doc, [155, 165, 180]);
    doc.text(`GreenTrace  |  ESG 진단 플랫폼  ·  ${companyName}  ·  ${quarter}`, 18, 293.5);
    doc.text(`${p} / ${totalPages}`, 192, 293.5, { align: 'right' });
  }

  const safeDate = today.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\. /g, '-').replace('.', '');
  doc.save(`${companyName}_ESG성과분석리포트_${safeDate}.pdf`);
};
