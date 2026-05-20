import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList, CartesianGrid,
} from 'recharts';
import api from '../../api/api';
import {
  ArrowLeft, AlertCircle, Loader2, ChevronDown, ChevronUp,
  Leaf, Users, Building2, TrendingUp, Shield,
  FileText, Zap, Info, Download, CheckCircle2, AlertTriangle,
  X, Hash, BarChart2, Cpu, Clock, PlayCircle,
  Activity, Search, CheckCircle,
} from 'lucide-react';

const IS_DEV = import.meta.env.DEV;
import { exportAnalysisResult } from '../../components/analysis/exportAnalysisResult';

let _marked = null;
try { _marked = (await import('marked')).marked; } catch { /* fallback */ }

// ── 상수 ─────────────────────────────────────────────────────────────────

const GRADE_COLOR = {
  S: '#a855f7', A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#ef4444',
};

const GRADE_CLS = {
  S:    'bg-purple-50 text-purple-700 border-purple-200',
  A:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  B:    'bg-blue-50 text-blue-700 border-blue-200',
  C:    'bg-amber-50 text-amber-700 border-amber-200',
  D:    'bg-red-50 text-red-600 border-red-200',
  'N/A': 'bg-gray-100 text-gray-500 border-gray-200',
};

const ESG_COLOR = { E: '#059669', S: '#3b82f6', G: '#f59e0b' };
const ESG_LABEL = { E: '환경', S: '사회', G: '지배구조' };
const ESG_ICON  = { E: Leaf, S: Users, G: Building2 };

const CONF_CLS = {
  STRONG: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  HIGH:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-600 border-amber-200',
  WEAK:   'bg-amber-50 text-amber-500 border-amber-200',
  LOW:    'bg-red-50 text-red-500 border-red-200',
};

const CONF_ITEMS = [
  { label: 'AI 문맥 유사도',    desc: 'K-ESG 지표와 문서 간 AI 문맥 유사도',            tooltip: 'AI가 검색한 문서 구간의 평균 유사도입니다. 65% 이상이면 유효 검증 근거로 인정됩니다.' },
  { label: '근거 일관성',       desc: '검증 근거 텍스트 내 논리 일관성 지수',            tooltip: '동일 지표에 대해 복수 구간이 일관된 내용을 담고 있을수록 높은 점수를 받습니다.' },
  { label: '수치 일치율',       desc: '수치 데이터 추출 및 검증 일치율',                tooltip: '제출된 E 지표 수치와 실제 문서에서 추출된 수치의 일치 여부입니다. 불일치 시 점수가 낮아집니다.' },
  { label: '문서 신뢰도',       desc: '문서 출처 및 공시 자료 신뢰도 가중치',            tooltip: '공시된 ESG 리포트·지속가능경영 보고서일수록 신뢰도 가중치가 높습니다.' },
];

const GRADE_DESCRIPTION = {
  S: 'ESG 전 영역 수치가 증빙 데이터와 완전히 일치합니다.',
  A: '제출된 수치와 증빙 데이터가 대부분 일치합니다.',
  B: '일부 항목에서 수치 차이가 발견되어 등급이 제한되었습니다.',
  C: '여러 항목에서 증빙 수치 차이가 발견되었습니다.',
  D: '다수 항목에서 증빙 불일치가 감지되어 심각한 수준입니다.',
};

// Numeric match level → 스타일 맵 (EvidenceCard에서 공유)
const MATCH_STYLE = {
  HIGH:   { color: '#16a34a', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'HIGH' },
  MEDIUM: { color: '#d97706', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'MEDIUM' },
  LOW:    { color: '#dc2626', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-600',     label: 'LOW' },
};

// ── Verification Status 체계 ─────────────────────────────────────────────
const VSTATUS = {
  VERIFIED:      { label: '근거 확인됨',    color: '#16a34a', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: '✓' },
  WEAK:          { label: '일부 근거 부족', color: '#d97706', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: '~' },
  CONTRADICTION: { label: '불일치 감지',   color: '#dc2626', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-600',     icon: '✕' },
  NO_EVIDENCE:   { label: '문서 근거 없음', color: '#6b7280', bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-500',    icon: '—' },
};

const getVerificationStatus = (ev) => {
  const catChar = ev.indicatorCode?.[0];
  if (catChar === 'E') {
    if (ev.numericMatchLevel === 'HIGH')   return 'VERIFIED';
    if (ev.numericMatchLevel === 'MEDIUM') return 'WEAK';
    if (ev.numericMatchLevel === 'LOW')    return 'CONTRADICTION';
    return 'NO_EVIDENCE';
  }
  if (ev.contradictionReason)              return 'CONTRADICTION';
  if (!ev.isValidEvidence)                 return 'NO_EVIDENCE';
  const sim = toPct(ev.similarity) ?? 0;
  if (sim >= 85)                           return 'VERIFIED';
  if (sim >= 55)                           return 'WEAK';
  return 'NO_EVIDENCE';
};

// Evidence 품질 티어
const getSimTier = (simPct) => {
  if (simPct == null) return null;
  if (simPct >= 85) return { label: '높음',   color: '#059669' };
  if (simPct >= 70) return { label: '양호',   color: '#3b82f6' };
  if (simPct >= 55) return { label: '보통',   color: '#f59e0b' };
  return               { label: '낮음',   color: '#ef4444' };
};

// ── XAI: 지표별 AI 판단 근거 자연어 생성 ─────────────────────────────────
const generateIndicatorCommentary = (ev) => {
  const catChar = ev.indicatorCode?.[0];
  const vstKey  = getVerificationStatus(ev);
  const title   = ev.indicatorTitle ?? ev.indicatorCode ?? '해당 지표';
  const sim     = toPct(ev.similarity);
  const diff    = ev.numericDiffPercent != null ? Number(ev.numericDiffPercent).toFixed(1) : null;
  const inVal   = ev.inputValue   != null ? Number(ev.inputValue).toLocaleString()   : null;
  const exVal   = ev.extractedValue != null ? Number(ev.extractedValue).toLocaleString() : null;
  const unit    = ev.unit ?? '';
  const page    = ev.pageNumber != null ? `p.${ev.pageNumber}` : null;
  const pageNote = page ? ` (${page})` : '';

  if (catChar === 'E') {
    if (vstKey === 'VERIFIED') {
      return `제출된 수치(${inVal}${unit ? ' ' + unit : ''})와 문서 증빙값이 ±${diff}% 이내로 일치합니다. 계량 데이터의 신뢰도가 높아 정확한 수치로 확인되었습니다.`;
    }
    if (vstKey === 'WEAK') {
      return `제출 수치(${inVal})와 문서 추출값(${exVal}) 간 ${diff}% 차이가 발생했습니다. 측정 기준 또는 단위 환산 오류 가능성이 있으므로 재확인이 권장됩니다.`;
    }
    if (vstKey === 'CONTRADICTION') {
      return `수치 불일치가 ${diff}% 이상 감지되었습니다. 제출값(${inVal})과 문서 내 추출값(${exVal})이 유의미하게 다릅니다. 데이터 출처와 측정 연도를 재검토해 주세요.`;
    }
    return '해당 지표에 대한 수치 데이터를 문서에서 추출하지 못했습니다. 항목을 명시적으로 기재하거나 별도 증빙 자료를 첨부해 주세요.';
  }

  // S/G 카테고리
  if (vstKey === 'VERIFIED') {
    return `'${title}' 관련 증빙이 유사도 ${sim}%로 문서 내에서 확인되었습니다${pageNote}. AI가 실제 정책·제도·실적 텍스트를 직접 읽고 검증했습니다.`;
  }
  if (vstKey === 'WEAK') {
    return `'${title}' 관련 근거가 검출되었으며(유사도 ${sim}%), 추가 정책·정량 데이터가 포함되면 신뢰도가 향상될 수 있습니다. 구체적인 기재를 권장합니다.`;
  }
  if (vstKey === 'CONTRADICTION') {
    const reason = ev.contradictionReason ? ` — ${ev.contradictionReason}` : '';
    return `'${title}' 항목에서 논리적 모순 신호가 감지되었습니다${reason}. 관련 증빙 내용을 재검토해 주세요.`;
  }
  return `'${title}' 관련 증빙 텍스트를 문서에서 찾지 못했습니다. 해당 항목에 대한 정책, 실적 또는 절차 기술이 보고서에 누락되어 있는 것으로 판단됩니다.`;
};

// S/G 지표 코드 → 표시명 (사용자 선택 기준: S 5개, G 5개)
const SG_INDICATORS = {
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
// 사용자 선택 지표 수 기준 (AnalysisPage SOCIAL_ITEMS / GOV_ITEMS 와 동기)
const S_SELECTED_TOTAL = 5;
const G_SELECTED_TOTAL = 5;

const E_INDICATORS = {
  'E-101': '전력 사용량',
  'E-102': '가스 사용량',
  'E-103': '탄소 배출량',
  'E-104': '폐기물 발생량',
  'E-105': '용수 사용량',
};

// 전체 K-ESG 지표 코드 → 표시명 (E + S + G)
const ALL_INDICATOR_CODES = { ...E_INDICATORS, ...SG_INDICATORS };

/**
 * evidenceMatches 를 기반으로 완전한 지표 목록을 구성합니다.
 * - evidenceMatches에 있는 항목: 그대로 포함 (indicatorCode별 최고 similarity 우선)
 * - ALL_INDICATOR_CODES에 있지만 evidenceMatches에 없는 항목:
 *   isValidEvidence=false의 NO_EVIDENCE 합성 항목으로 추가
 * 이 함수가 반환하는 목록이 모든 Verification Summary의 단일 소스입니다.
 */
function buildCompleteIndicatorList(evidenceMatches) {
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
  for (const [code, title] of Object.entries(ALL_INDICATOR_CODES)) {
    if (!byCode.has(code)) {
      byCode.set(code, {
        indicatorCode:    code,
        indicatorTitle:   title,
        isValidEvidence:  false,
        similarity:       null,
        numericMatchLevel: null,
        _synthetic:       true,
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
}

// 분석 파이프라인 단계 정의
const PIPELINE_STEPS = [
  { label: 'PDF 업로드',            desc: '증빙 문서 업로드' },
  { label: 'OCR 파싱',              desc: '텍스트 추출' },
  { label: '청크 분할',             desc: '문서 청크 분할' },
  { label: '벡터 임베딩',           desc: '벡터 임베딩' },
  { label: 'AI 문맥 분석',          desc: 'K-ESG 지표 검색' },
  { label: '키워드 필터',           desc: '지표 키워드 필터' },
  { label: '검증 근거 확인',        desc: '수치 검증' },
  { label: 'ESG 점수 산정',         desc: '최종 점수 산정' },
];

// GPT 리포트 섹션 정의
const REPORT_SECTION_DEFS = [
  { key: 'summary',      icon: FileText,      color: '#818cf8', keywords: ['종합 총평', '개요', '총평', 'ESG 종합', '분석 결과', '종합 평가'] },
  { key: 'strengths',    icon: CheckCircle2,  color: '#059669', keywords: ['주요 강점', '강점', '우수', 'Strength'] },
  { key: 'risks',        icon: AlertTriangle, color: '#ef4444', keywords: ['위험', 'Risk', '리스크', '취약', '위험 요소', '위험요소'] },
  { key: 'improvements', icon: Zap,           color: '#f59e0b', keywords: ['개선', '권장', '권고', '향후', 'Improvement', '추진 과제'] },
  { key: 'benchmark',    icon: TrendingUp,    color: '#a855f7', keywords: ['업종', '평균 대비', '비교', 'Benchmark', '섹터', '동종'] },
];

// ── GPT 리포트 파서 ────────────────────────────────────────────────────
const identifySectionDef = (title) => {
  for (const def of REPORT_SECTION_DEFS) {
    if (def.keywords.some(k => title.includes(k))) return def;
  }
  return { key: 'other', icon: Info, color: '#a1a1aa' };
};

const parseReportSections = (fullReport) => {
  if (!fullReport?.trim()) return [];
  const sections = [];
  const regex = /^#{1,3}\s+(.+)$/gm;
  let match;
  let lastIndex = 0;
  let lastTitle = null;
  let lastDef   = null;

  while ((match = regex.exec(fullReport)) !== null) {
    if (lastTitle !== null) {
      const content = fullReport.slice(lastIndex, match.index).trim();
      if (content) sections.push({ title: lastTitle, ...lastDef, content });
    }
    lastTitle = match[1].trim();
    lastDef   = identifySectionDef(lastTitle);
    lastIndex = match.index + match[0].length;
  }
  if (lastTitle !== null) {
    const content = fullReport.slice(lastIndex).trim();
    if (content) sections.push({ title: lastTitle, ...lastDef, content });
  }
  if (sections.length === 0 && fullReport.trim()) {
    return [{ key: 'summary', title: 'ESG 종합 분석', ...REPORT_SECTION_DEFS[0], content: fullReport }];
  }
  return sections;
};

// ── 유틸리티 ──────────────────────────────────────────────────────────
const gradeBarColor = (g) => GRADE_COLOR[g] ?? '#52525b';

const fmtBenchNum = (v) => {
  if (v == null) return '-';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
};

const LOWER_IS_BETTER_UNITS = new Set(['kwh', 'mwh', 'gwh', 'tco2', 'tco2e', 'kg', 'm3', 'l', 'ton', 'kg-co2']);
const lowerIsBetter = (unit = '') => LOWER_IS_BETTER_UNITS.has(unit.toLowerCase());

const getConfLevel = (pct) => {
  if (pct == null) return null;
  if (pct >= 70) return 'HIGH';
  if (pct >= 50) return 'MEDIUM';
  return 'LOW';
};

const toPct = (v) => (v == null ? null : Math.round(v <= 1 ? v * 100 : v));

const fmtDiff = (d) => {
  if (d == null) return '—';
  const capped = Math.min(d, 999);
  if (capped < 0.01) return '0%';
  return `${capped.toFixed(2)}%${d > 999 ? '+' : ''}`;
};

// ── 마크다운 렌더러 ───────────────────────────────────────────────────
const renderMd = (text) => {
  if (!text) return '';
  try {
    if (_marked) return typeof _marked.parse === 'function' ? _marked.parse(text) : _marked(text);
  } catch { /* fallthrough */ }
  return text
    .replace(/^#### (.+)$/gm, '<h4 style="color:#4b5563;margin:1.2em 0 .3em;font-size:.875em;font-weight:700">$1</h4>')
    .replace(/^### (.+)$/gm,  '<h3 style="color:#374151;margin:1.4em 0 .4em;font-size:.95em;font-weight:800">$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2 style="color:#1f2937;margin:1.6em 0 .5em;font-size:1.05em;font-weight:900;letter-spacing:-.01em">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#111827;font-weight:700">$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em style="color:#6b7280">$1</em>')
    .replace(/^- (.+)$/gm,     '<li style="margin:.3em 0;padding-left:.3em">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)/g, '<ul style="margin:.6em 0;padding-left:1.2em;list-style:disc">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:.7em 0">')
    .replace(/^/, '<p style="margin:0">')
    .replace(/$/, '</p>');
};

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────

function GradeBadge({ grade, size = 'sm' }) {
  const cls = GRADE_CLS[grade] ?? GRADE_CLS['N/A'];
  const sz  = size === 'xl'
    ? 'text-4xl font-bold px-5 py-2 rounded-2xl tracking-tight'
    : size === 'lg'
    ? 'text-2xl font-bold px-4 py-1.5 rounded-xl'
    : 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg';
  return (
    <span className={`inline-flex items-center border ${cls} ${sz}`} style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em' }}>
      {grade ?? 'N/A'}
    </span>
  );
}

function SectionCard({ title, icon: Icon, iconColor, children, className = '', action }) {
  return (
    <div className={`saas-card overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {Icon && (
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${iconColor ?? '#059669'}12` }}
              >
                <Icon size={13} style={{ color: iconColor ?? '#059669' }} />
              </span>
            )}
            <span className="text-[13px] font-semibold text-gray-800">{title}</span>
          </div>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function ScoreProgressBar({ score, color, height = 'h-1.5', estimated = false }) {
  return (
    <div className={`${height} bg-gray-100 rounded-full overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(0, Math.min(100, score ?? 0))}%`,
          background: estimated
            ? 'repeating-linear-gradient(90deg, #f59e0b 0px, #f59e0b 8px, transparent 8px, transparent 14px)'
            : color,
          opacity: estimated ? 0.6 : 1,
        }}
      />
    </div>
  );
}

// ── Keyword Highlight ────────────────────────────────────────────────────
function HighlightedText({ text, keywords = [] }) {
  if (!text) return null;
  const filtered = keywords.filter(k => k && k.length >= 2);
  if (!filtered.length) return <span className="whitespace-pre-line">{text}</span>;
  const escaped = filtered.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  try {
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span className="whitespace-pre-line">
        {parts.map((part, i) => {
          const hit = filtered.some(k => k.toLowerCase() === part.toLowerCase());
          return hit
            ? <mark key={i} className="bg-emerald-100 text-emerald-700 rounded-sm px-0.5 not-italic font-semibold">{part}</mark>
            : <span key={i}>{part}</span>;
        })}
      </span>
    );
  } catch { return <span className="whitespace-pre-line">{text}</span>; }
}

// ── Audit Console ────────────────────────────────────────────────────────
function AuditConsole({ data, analysisSummary, blockedIndicators, isBenchmarkFallback }) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState({ E: true, S: true, G: false, FINAL: true });
  const toggle = (k) => setOpenGroups(p => ({ ...p, [k]: !p[k] }));
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data, analysisSummary, blockedIndicators]);

  const fmtMs = (ms) => {
    if (ms == null) return null;
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
  };

  const SEV_STYLE = {
    SUCCESS: { icon: '✓', color: '#059669', bg: 'bg-emerald-50 border-emerald-100', label: '완료' },
    WARN:    { icon: '!', color: '#d97706', bg: 'bg-amber-50 border-amber-100',     label: '주의' },
    ERROR:   { icon: '✕', color: '#dc2626', bg: 'bg-red-50 border-red-100',         label: '오류' },
    INFO:    { icon: '·', color: '#9ca3af', bg: 'bg-gray-50 border-gray-100',       label: '정보' },
  };

  const groups = React.useMemo(() => {
    const eFailed = analysisSummary?.e?.failed ?? 0;
    const eTotal  = analysisSummary?.e?.total  ?? 5;
    const eHigh   = analysisSummary?.e?.high   ?? 0;
    const eMed    = analysisSummary?.e?.medium ?? 0;
    const eLow    = analysisSummary?.e?.low    ?? 0;

    const sBlocked = blockedIndicators.filter(([c]) => c.startsWith('S'));
    const gBlocked = blockedIndicators.filter(([c]) => c.startsWith('G'));
    const sTotal   = Object.keys(SG_INDICATORS).filter(k => k.startsWith('S')).length;
    const gTotal   = Object.keys(SG_INDICATORS).filter(k => k.startsWith('G')).length;

    const ocrMs    = data?.ocrTimeMs;
    const ragMs    = data?.ragTimeMs;
    const verifyMs = data?.verifyTimeMs;
    const totalMs  = data?.processingTimeMs;
    const eElapsed = (ocrMs ?? 0) + (verifyMs ?? 0);
    const sElapsed = ragMs ? Math.round(ragMs * 0.5) : null;
    const gElapsed = ragMs ? Math.round(ragMs * 0.5) : null;
    const fElapsed = totalMs ? Math.max(0, totalMs - eElapsed - (ragMs ?? 0)) : null;

    const evs      = data?.evidenceMatches ?? [];
    const sValid   = evs.filter(e => e.indicatorCode?.startsWith('S') && e.isValidEvidence).length;
    const gValid   = evs.filter(e => e.indicatorCode?.startsWith('G') && e.isValidEvidence).length;
    const sBlockedN = sBlocked.length;
    const gBlockedN = gBlocked.length;
    const sCov     = sTotal > 0 ? ((sTotal - sBlockedN) / sTotal).toFixed(2) : '1.00';
    const gCov     = gTotal > 0 ? ((gTotal - gBlockedN) / gTotal).toFixed(2) : '1.00';

    const isCsvBased = !ocrMs && (eHigh + eMed) > 0;

    const E = [];
    if (isCsvBased) {
      E.push({ sev: 'SUCCESS', msg: 'CSV 기반 수치 검증 사용', latency: null });
      E.push({ sev: 'SUCCESS', msg: `${eHigh + eMed}개 지표 검증 완료`, latency: fmtMs(verifyMs) });
    } else {
      if (data?.ocrFallback)
        E.push({ sev: 'WARN',    msg: '문서 일부 페이지의 텍스트 인식에 제한이 있었습니다.', latency: fmtMs(ocrMs) });
      else
        E.push({ sev: 'SUCCESS', msg: '문서 텍스트 인식(OCR) 완료', latency: fmtMs(ocrMs) });

      if (eFailed >= eTotal && eTotal > 0)
        E.push({ sev: 'ERROR', msg: `환경 데이터 자동 추출에 제한이 있어 업종 평균 기반 추정 평가가 적용되었습니다. (${eFailed}/${eTotal}개 항목)` });
      else if (eFailed > 0)
        E.push({ sev: 'WARN',  msg: `환경 데이터 일부 항목(${eFailed}개) 수치 추출에 제한이 있었습니다.`, latency: fmtMs(verifyMs) });
      else
        E.push({ sev: 'SUCCESS', msg: `환경 데이터 수치 추출 완료 (${eTotal}개 항목)`, latency: fmtMs(verifyMs) });

      if (isBenchmarkFallback)
        E.push({ sev: 'INFO', msg: '환경(E) 실측 데이터 미제출 — 체크리스트 기반 평가 적용. 업종 비교는 별도 탭에서 확인 가능.' });

      if (eLow > 0)
        E.push({ sev: eLow >= 3 ? 'ERROR' : 'WARN', msg: `환경 데이터 ${eLow}개 항목에서 입력값과 증빙 수치 간 차이가 감지되었습니다.` });
      else if (eHigh + eMed > 0)
        E.push({ sev: 'SUCCESS', msg: `환경 데이터 수치 검증 완료 — 양호 ${eHigh}건, 근사 일치 ${eMed}건` });
    }

    const S = [];
    S.push({ sev: 'SUCCESS', msg: '문서 AI 문맥 분석 준비 완료', latency: ragMs ? fmtMs(Math.round(ragMs * 0.35)) : null });
    S.push({ sev: 'SUCCESS', msg: `사회(S) 지표 관련 근거 수집 완료 — 검증 ${sValid}건, 미검출 ${sBlockedN}건`, latency: ragMs ? fmtMs(Math.round(ragMs * 0.65)) : null });
    if (sBlockedN > 0)
      S.push({ sev: 'WARN', msg: `사회(S) 지표 ${sBlockedN}/${sTotal}개에서 충분한 증빙 근거를 찾지 못했습니다.` });
    else
      S.push({ sev: 'SUCCESS', msg: `사회(S) 지표 ${sTotal}개 전체 근거 검증 완료` });

    const G = [];
    G.push({ sev: 'SUCCESS', msg: `지배구조(G) 지표 관련 근거 수집 완료 — 검증 ${gValid}건, 미검출 ${gBlockedN}건` });
    if (gBlockedN > 0)
      G.push({ sev: 'WARN', msg: `지배구조(G) 지표 ${gBlockedN}/${gTotal}개에서 충분한 증빙 근거를 찾지 못했습니다.` });
    else
      G.push({ sev: 'SUCCESS', msg: `지배구조(G) 지표 ${gTotal}개 전체 근거 검증 완료` });

    const FINAL = [];
    if (data?.gradeCeilingApplied)
      FINAL.push({ sev: 'WARN', msg: `수치 불일치로 인해 등급 상한이 적용되었습니다 → 최종 등급: ${data.finalGrade}` });
    if ((data?.overallConfidence ?? 100) < 50)
      FINAL.push({ sev: 'WARN', msg: `분석 신뢰도가 낮아 등급 상한이 적용되었습니다 (최대 B등급).` });
    FINAL.push({ sev: 'INFO', msg: `최종 등급: ${data?.finalGrade ?? '?'}  ·  종합 점수: ${data?.totalScore ?? 0}점 / 100점` });
    FINAL.push({ sev: 'SUCCESS', msg: `분석 완료 — 분석 신뢰도 ${data?.overallConfidence ?? '?'}%`, latency: fmtMs(totalMs) });

    return [
      { key: 'E',     label: '환경(E) 검증',  sublabel: '수치 데이터 교차 검증',          color: '#059669', elapsed: eElapsed > 0 ? fmtMs(eElapsed) : null, hasOcrFallback: !!data?.ocrFallback, hasBenchmarkFallback: isBenchmarkFallback, entries: E },
      { key: 'S',     label: '사회(S) 분석',  sublabel: 'AI 문맥 분석 · 사회 지표',       color: '#3b82f6', elapsed: fmtMs(sElapsed), hasOcrFallback: false, hasBenchmarkFallback: false, entries: S },
      { key: 'G',     label: '지배구조(G) 분석', sublabel: 'AI 문맥 분석 · 지배구조 지표', color: '#f59e0b', elapsed: fmtMs(gElapsed), hasOcrFallback: false, hasBenchmarkFallback: false, entries: G },
      { key: 'FINAL', label: '최종 평가',      sublabel: '점수 산정 및 등급 결정',          color: '#a855f7', elapsed: fmtMs(fElapsed), hasOcrFallback: false, hasBenchmarkFallback: false, entries: FINAL },
    ];
  }, [data, analysisSummary, blockedIndicators, isBenchmarkFallback]);

  return (
    <div className="saas-card overflow-hidden">
      {/* 패널 토글 헤더 */}
      <button
        onClick={() => setPanelOpen(v => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Activity size={13} className="text-gray-500" />
        </span>
        <span className="text-[13px] font-semibold text-gray-700">AI 분석 파이프라인 로그</span>
        <span className="text-[11px] text-gray-400 ml-1">단계별 처리 타임라인</span>
        <span className="ml-auto text-gray-300">{panelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>

      {panelOpen && (
        <>
          <div className="border-t border-gray-100" />
          <div ref={scrollRef} className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
            {groups.map((grp, gi) => {
              const open = openGroups[grp.key] ?? true;
              const hasWarn = grp.entries.some(e => e.sev === 'WARN' || e.sev === 'ERROR');
              const lastIdx = grp.entries.length - 1;
              const allDone = grp.entries.every(e => e.sev === 'SUCCESS' || e.sev === 'INFO');
              return (
                <div key={grp.key}>
                  <button
                    onClick={() => toggle(grp.key)}
                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    {/* Step indicator */}
                    <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{
                        borderColor: allDone ? '#059669' : hasWarn ? '#f59e0b' : grp.color,
                        color: allDone ? '#059669' : hasWarn ? '#f59e0b' : grp.color,
                        background: allDone ? '#ecfdf5' : hasWarn ? '#fffbeb' : 'white',
                      }}>
                      {gi + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-700">{grp.label}</span>
                    <span className="text-[11px] text-gray-400">{grp.sublabel}</span>
                    {grp.elapsed && (
                      <span className="text-[10px] font-mono text-gray-400 ml-1" style={{ fontFamily: "'Inter', sans-serif" }}>{grp.elapsed}</span>
                    )}
                    {grp.hasOcrFallback && <span className="badge badge-medium">OCR 제한</span>}
                    {grp.hasBenchmarkFallback && <span className="badge badge-medium">업종 평균 적용</span>}
                    {hasWarn && !grp.hasOcrFallback && !grp.hasBenchmarkFallback && (
                      <span className="badge badge-medium">주의</span>
                    )}
                    <span className="ml-auto text-gray-300">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                  </button>

                  {open && (
                    <div className="px-6 pb-4 space-y-1.5">
                      {grp.entries.map((entry, i) => {
                        const st = SEV_STYLE[entry.sev] ?? SEV_STYLE.INFO;
                        const isLatest = grp.key === 'FINAL' && i === lastIdx;
                        return (
                          <div key={i} className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl border ${st.bg} ${isLatest ? 'ring-1 ring-emerald-200' : ''}`}>
                            <span className="shrink-0 mt-0.5 text-[13px] font-bold w-4 text-center" style={{ color: st.color }}>{st.icon}</span>
                            <span className="flex-1 text-[12px] text-gray-600 leading-relaxed">{entry.msg}</span>
                            {entry.latency && (
                              <span className="shrink-0 text-[11px] text-gray-400 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>{entry.latency}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Evidence Quality Progress Bar ───────────────────────────────────────
function EvidenceQualityBar({ simPct }) {
  const tier = getSimTier(simPct);
  if (simPct == null || tier == null) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-[9px] text-gray-500 w-16 shrink-0 font-medium">품질 지수</span>
      <div className="relative flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${simPct}%`, background: tier.color, opacity: 0.9 }}
        />
        {[55, 70, 85].map(mark => (
          <div key={mark} className="absolute top-0 bottom-0 w-px bg-gray-300" style={{ left: `${mark}%` }} />
        ))}
      </div>
      <span className="text-[9px] font-black w-14 shrink-0 text-right font-mono" style={{ color: tier.color }}>
        {simPct}% · {tier.label}
      </span>
    </div>
  );
}

// ── Evidence Card (Audit Style — v2) ────────────────────────────────────
function EvidenceCard({ ev, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const catChar    = ev.indicatorCode?.[0];
  const catColor   = ESG_COLOR[catChar] ?? '#a1a1aa';
  const catLabel   = ESG_LABEL[catChar] ?? null;
  const isECategory = catChar === 'E' || ev.indicatorCode?.startsWith('E-') || Object.keys(E_INDICATORS).includes(ev.indicatorCode);

  const hasNumericData   = ev.numericMatchLevel != null && ev.inputValue != null;
  const isNumericPrimary = hasNumericData && ev.similarity == null;
  const matchStyle       = MATCH_STYLE[ev.numericMatchLevel] ?? null;

  const diffPct    = ev.numericDiffPercent ?? 0;
  const diffBarW   = Math.min(100, (diffPct / 40) * 100);
  const diffBarCol = diffPct <= 5 ? '#059669' : diffPct <= 20 ? '#f59e0b' : '#ef4444';

  const similarityPct = toPct(ev.similarity);
  const finalScorePct = toPct(ev.finalScore);
  const scoreColor    = finalScorePct >= 70 ? '#059669' : finalScorePct >= 50 ? '#f59e0b' : '#ef4444';
  const simColor      = similarityPct >= 70 ? '#059669' : similarityPct >= 50 ? '#f59e0b' : '#ef4444';

  const sourceFile = ev.sourceFile ?? ev.sourceFileName;
  const shortFile  = sourceFile ? sourceFile.split(/[/\\]/).pop() : null;
  const isLong     = !isNumericPrimary && (ev.evidenceText?.length ?? 0) > 200;

  // ── Verification Status ──────────────────────────────────────────────
  const vstKey = getVerificationStatus(ev);
  const vst    = VSTATUS[vstKey];

  // ── Source metadata row ──────────────────────────────────────────────
  const simTier = getSimTier(similarityPct);
  const metaParts = [
    ev.pageNumber != null ? `p.${ev.pageNumber}` : null,
    // E 카테고리는 수치 검증 기반이므로 similarity 표시 제외
    (!isECategory && similarityPct != null) ? `유사도 ${similarityPct}%` : null,
    (!isECategory && simTier) ? simTier.label : (!isECategory ? (ev.confidenceLevel === 'HIGH' ? '높음' : ev.confidenceLevel === 'MEDIUM' ? '보통' : ev.confidenceLevel === 'LOW' ? '낮음' : null) : null),
    ev.retrievalRank != null ? `검색 ${ev.retrievalRank}위` : null,
  ].filter(Boolean);

  // title keywords for highlight
  const titleKws = (ev.indicatorTitle ?? '')
    .split(/[\s·]+/)
    .filter(k => k.length >= 2 && !['여부', '발생', '실시', '수립', '운영', '구축', '관련'].includes(k));

  // card border color by status
  const cardBorder =
    vstKey === 'VERIFIED'      ? 'border-emerald-200 hover:border-emerald-300' :
    vstKey === 'WEAK'          ? 'border-amber-200  hover:border-amber-300' :
    vstKey === 'CONTRADICTION' ? 'border-red-200    hover:border-red-300' :
                                 'border-gray-200   hover:border-gray-300';
  const cardBg =
    vstKey === 'VERIFIED'      ? 'bg-white' :
    vstKey === 'WEAK'          ? 'bg-white' :
    vstKey === 'CONTRADICTION' ? 'bg-red-50/50' :
                                 'bg-gray-50';

  return (
    <div
      className={`group border rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-gray-200/80 ${cardBorder} ${cardBg}`}
      style={vstKey === 'CONTRADICTION' ? { boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.2), 0 0 10px rgba(239,68,68,0.05)' } : undefined}
    >
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {catLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0"
              style={{ color: catColor, borderColor: `${catColor}40`, background: `${catColor}10` }}>
              {catChar} · {catLabel}
            </span>
          )}
          <span className="text-[10px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200"
            style={{ color: catColor }}>
            {ev.indicatorCode ?? '-'}
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
            isECategory ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-gray-100 border-gray-200 text-gray-500'
          }`}>
            {isECategory ? '수치 검증' : 'AI 문맥 분석'}
          </span>
          <span className="text-sm font-semibold text-gray-800 leading-tight">{ev.indicatorTitle ?? '-'}</span>
        </div>

        {/* Verification Status Badge */}
        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${vst.bg} ${vst.border} ${vst.text}`}>
          <span>{vst.icon}</span>
          <span>{vst.label}</span>
        </span>
      </div>

      {/* ── Source Metadata row ── */}
      {metaParts.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {metaParts.map((part, i) => (
            <React.Fragment key={i}>
              <span className="text-[9px] font-mono text-gray-400 tabular-nums"
                style={i === 2 && simTier ? { color: simTier.color, fontWeight: 700 } : undefined}>
                {part}
              </span>
              {i < metaParts.length - 1 && <span className="text-[9px] text-gray-300">·</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── CONTRADICTION 배너 ── */}
      {vstKey === 'CONTRADICTION' && (
        <div className="flex items-center gap-2 mb-2.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle size={11} className="text-red-500 shrink-0" />
          <span className="text-[10px] font-bold text-red-600">
            {isECategory ? '수치 불일치 감지' : '불일치 신호'}
          </span>
          {ev.contradictionReason && (
            <span className="ml-auto text-[10px] text-red-500/80 font-medium truncate max-w-[140px]">
              {ev.contradictionReason}
            </span>
          )}
        </div>
      )}

      {/* ── Numeric Audit Table (E) ── */}
      {hasNumericData && (
        <div className={`rounded-xl border overflow-hidden mb-2 ${
          ev.numericMatchLevel === 'HIGH'   ? 'border-emerald-200 bg-emerald-50/50' :
          ev.numericMatchLevel === 'MEDIUM' ? 'border-amber-200 bg-amber-50/50' :
                                              'border-red-200 bg-red-50/50'
        }`}>
          <div className="flex items-center px-3.5 py-2 gap-3">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">입력값</span>
            <span className="text-xs font-mono font-bold text-gray-800 tabular-nums">
              {ev.inputValue?.toLocaleString()}{' '}
              <span className="text-gray-400 font-normal text-[10px]">{ev.unit ?? ''}</span>
            </span>
          </div>
          <div className="flex items-center px-3.5 py-2 gap-3 border-t border-gray-200">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">증빙값</span>
            <span className={`text-xs font-mono font-bold tabular-nums ${matchStyle?.text ?? 'text-gray-800'}`}>
              {ev.extractedValue?.toLocaleString()}{' '}
              <span className="font-normal text-[10px] opacity-70">{ev.unit ?? ''}</span>
            </span>
          </div>
          <div className="flex items-center px-3.5 py-2 gap-3 border-t border-gray-200">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">차이율</span>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-base font-black font-mono tabular-nums shrink-0 leading-none" style={{ color: diffBarCol }}>
                {fmtDiff(diffPct)}
              </span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${diffBarW}%`, background: diffBarCol }} />
              </div>
            </div>
          </div>
          <div className="flex items-center px-3.5 py-2 gap-3 border-t border-gray-200">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">판정</span>
            <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg border ${matchStyle?.bg} ${matchStyle?.border} ${matchStyle?.text}`}>
              {ev.numericMatchLevel === 'HIGH' ? 'HIGH ✓  일치' : ev.numericMatchLevel === 'MEDIUM' ? 'MEDIUM ~  근사 일치' : 'LOW ✕  불일치'}
            </span>
          </div>
        </div>
      )}

      {/* ── E 카테고리 수치 미제출 안내 (numeric data 없는 E 지표) ── */}
      {isECategory && !hasNumericData && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-sky-50 border border-sky-200 mb-2">
          <Info size={11} className="text-sky-500 shrink-0" />
          <p className="text-[10px] text-sky-700 font-medium">수치 입력값 없음 — E 지표 수치 데이터가 제출되지 않았습니다.</p>
        </div>
      )}

      {/* ── Evidence Snippet (highlighted, S/G only) ── */}
      {!isECategory && !isNumericPrimary && ev.evidenceText && (
        <>
          {ev.matchedGuideline && (
            <div className="mb-2 flex items-start gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <Info size={10} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="text-[10px] text-gray-500 leading-relaxed italic">{ev.matchedGuideline}</span>
            </div>
          )}
          <div className="relative">
            <p className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-800 transition-colors">
              <HighlightedText
                text={!expanded && isLong ? ev.evidenceText.slice(0, 200) + '…' : ev.evidenceText}
                keywords={titleKws}
              />
            </p>
          </div>
          {isLong && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              className="mt-1 text-[10px] font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
            >
              {expanded ? '접기 ▲' : '전체 보기 ▼'}
            </button>
          )}
        </>
      )}

      {/* ── Evidence Quality Progress Bar (S/G only) ── */}
      {!hasNumericData && similarityPct != null && (
        <div className="mt-2.5 space-y-1.5">
          <EvidenceQualityBar simPct={similarityPct} />
          {finalScorePct != null && finalScorePct !== similarityPct && (
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] text-gray-500 w-16 shrink-0 font-medium">종합 점수</span>
              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${finalScorePct}%`, background: scoreColor }} />
              </div>
              <span className="text-[9px] font-bold tabular-nums font-mono w-14 text-right shrink-0" style={{ color: scoreColor }}>
                {finalScorePct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Expandable Detail Panel ── */}
      {detailOpen && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 animate-in slide-in-from-top-1 duration-150">
          {ev.evidenceText && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">전체 텍스트</p>
              <p className="text-[10px] text-gray-600 leading-relaxed font-mono whitespace-pre-line">
                <HighlightedText text={ev.evidenceText} keywords={titleKws} />
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '페이지',       value: ev.pageNumber != null ? `p.${ev.pageNumber}` : '—' },
              isECategory
                ? { label: '검증 방식', value: '수치 검증 기반' }
                : { label: '문맥 유사도', value: similarityPct != null ? `${similarityPct}%` : '—' },
              { label: 'AI 검색 순위', value: ev.retrievalRank != null ? `#${ev.retrievalRank}` : '—' },
              { label: '신뢰도 등급',   value: ev.confidenceLevel === 'HIGH' ? '높음' : ev.confidenceLevel === 'MEDIUM' ? '보통' : ev.confidenceLevel === 'LOW' ? '낮음' : '—' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                <p className="text-[8px] text-gray-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                <p className="text-[11px] font-black font-mono text-gray-700">{item.value}</p>
              </div>
            ))}
          </div>
          {ev.contradictionReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold text-red-600 uppercase tracking-wider mb-1">불일치 사유</p>
              <p className="text-[10px] text-red-500 leading-relaxed">{ev.contradictionReason}</p>
            </div>
          )}
          {ev.chunkText && ev.chunkText !== ev.evidenceText && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">문서 구간</p>
              <p className="text-[10px] text-gray-500 leading-relaxed font-mono">
                {ev.chunkText.length > 300 ? ev.chunkText.slice(0, 300) + '…' : ev.chunkText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── XAI 판단 근거 (인라인) ── */}
      <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 flex items-start gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest shrink-0 mt-0.5 leading-none">AI</span>
        <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-2">
          {generateIndicatorCommentary(ev)}
        </p>
      </div>

      {/* ── Footer row ── */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {shortFile && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <FileText size={10} className="text-gray-400 shrink-0" />
            <span className="text-[9px] text-gray-400 truncate">{shortFile}</span>
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setDetailOpen(v => !v); }}
          className="text-[9px] font-bold text-gray-400 hover:text-emerald-600 transition-colors shrink-0 flex items-center gap-1 ml-auto"
        >
          {detailOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          {detailOpen ? '접기' : '상세 보기'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect?.(ev); }}
          className="text-[9px] font-bold px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 hover:text-emerald-700 hover:border-emerald-200 transition-colors shrink-0"
        >
          전체 감사
        </button>
      </div>
    </div>
  );
}

// ── Retrieval Transparency Panel (기본 숨김, AdvancedAnalysisPanel로 통합됨) ──
function RetrievalTransparencyPanel({ evidences, isAutoSimulation }) {
  const [open, setOpen] = useState(false);

  const total      = evidences.length;
  const withSim    = evidences.filter(e => e.similarity != null || e.numericMatchLevel != null).length;
  const validated  = evidences.filter(e => e.isValidEvidence === true || e.numericMatchLevel === 'HIGH' || e.numericMatchLevel === 'MEDIUM').length;
  const verified   = evidences.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
  const retrievedEst = evidences.reduce((acc, e) => acc + (e.retrievedCount ?? 3), 0);

  if (isAutoSimulation) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-xs font-semibold text-gray-500">
          AI 분석 과정
        </span>
        <span className="ml-auto text-gray-400">{open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { label: '검색',   count: retrievedEst, color: '#3b82f6', desc: 'AI 유사도 검색' },
              { label: '필터',   count: withSim,      color: '#8b5cf6', desc: '유사도 기준 통과' },
              { label: '정리',   count: validated,    color: '#f59e0b', desc: '중복 제거' },
              { label: '검증',   count: verified,     color: '#059669', desc: '최종 검증 근거' },
            ].map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="text-sm font-black tabular-nums px-2.5 py-1.5 rounded-lg border"
                    style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                    {s.count}
                  </div>
                  <span className="text-xs text-gray-600 font-semibold">{s.label}</span>
                  <span className="text-xs text-gray-400">{s.desc}</span>
                </div>
                {i < arr.length - 1 && <span className="text-gray-300 mx-1 shrink-0">→</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            총 <span className="text-gray-700 font-bold">{retrievedEst}</span>개 문장 검색 →
            필터링 후 <span className="text-gray-700 font-bold">{withSim}</span>개 →
            중복 제거 <span className="text-gray-700 font-bold">{validated}</span>개 →
            최종 검증 근거 <span style={{ color: '#16a34a' }} className="font-bold">{verified}</span>건
          </p>
        </div>
      )}
    </div>
  );
}

// ── 고급 AI 분석 통합 패널 (사용자 친화 버전) ─────────────────────────────
function AdvancedAnalysisPanel({ data, allIndicators, isAutoSimulation }) {
  const [open, setOpen] = useState(false);
  if (!data || isAutoSimulation) return null;

  const evs        = data.evidenceMatches ?? [];
  const total      = allIndicators.length;
  const verified   = allIndicators.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
  const weak       = allIndicators.filter(e => getVerificationStatus(e) === 'WEAK').length;
  const noEv       = allIndicators.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length;
  const covPct     = total > 0 ? Math.round(verified / total * 100) : 0;
  const conf       = data.overallConfidence ?? null;
  const retrieved  = evs.reduce((acc, e) => acc + (e.retrievedCount ?? 3), 0);
  const validated  = evs.filter(e => e.isValidEvidence === true || e.numericMatchLevel === 'HIGH' || e.numericMatchLevel === 'MEDIUM').length;

  return (
    <div className="saas-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <Search size={14} className="text-indigo-500" />
        </span>
        <div>
          <span className="text-sm font-semibold text-gray-700">고급 AI 분석 보기</span>
          <span className="text-xs text-gray-400 ml-2">AI 검증 과정 · 근거 상세 · 지표별 판단 근거</span>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 hidden sm:block">
            검증 완료 <span className="font-bold text-emerald-600">{verified}</span>건
            · 신뢰도 <span className="font-bold" style={{ color: conf != null && conf >= 65 ? '#16a34a' : conf != null && conf >= 50 ? '#d97706' : '#dc2626' }}>{conf ?? '—'}%</span>
          </span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {/* 핵심 요약 지표 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '분석 신뢰도', value: conf != null ? `${conf}%` : '—', color: conf != null && conf >= 65 ? '#16a34a' : conf != null && conf >= 50 ? '#d97706' : '#dc2626', sub: '분석 신뢰도' },
              { label: '검증 근거 수', value: `${verified}건`, color: '#16a34a', sub: `전체 ${total}개 지표 중` },
              { label: '증빙 충족률', value: `${covPct}%`, color: covPct >= 70 ? '#16a34a' : covPct >= 50 ? '#d97706' : '#dc2626', sub: `전체 ${total}개 지표 기준` },
              { label: '근거 부족 항목', value: `${noEv}건`, color: noEv === 0 ? '#16a34a' : noEv <= 2 ? '#d97706' : '#dc2626', sub: '보완 필요' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1.5">{item.label}</p>
                <p className="text-xl font-black tabular-nums" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>

          {/* AI 문서 검색 과정 (Retrieval Transparency) */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">AI 문맥 분석 과정</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { label: '검색된 문장', count: retrieved, color: '#3b82f6', desc: 'AI 유사도 검색' },
                { label: '유사도 필터',  count: evs.filter(e => e.similarity != null || e.numericMatchLevel != null).length, color: '#8b5cf6', desc: '임계값 통과' },
                { label: '중복 제거',   count: validated, color: '#f59e0b', desc: '지표별 정리' },
                { label: '최종 검증',  count: verified,  color: '#059669', desc: '검증 완료' },
              ].map((s, i, arr) => (
                <React.Fragment key={s.label}>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="text-lg font-black font-mono tabular-nums px-3 py-2 rounded-xl border"
                      style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                      {s.count}
                    </div>
                    <span className="text-xs font-semibold text-gray-600">{s.label}</span>
                    <span className="text-xs text-gray-400">{s.desc}</span>
                  </div>
                  {i < arr.length - 1 && <span className="text-gray-300 text-lg mx-1 shrink-0">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 지표별 AI 판단 근거 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">지표별 AI 판단 근거</p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {allIndicators.map((ev) => {
                const vstKey  = getVerificationStatus(ev);
                const vst     = VSTATUS[vstKey];
                const comment = generateIndicatorCommentary(ev);
                const catChar = ev.indicatorCode?.[0];
                const catCol  = ESG_COLOR[catChar] ?? '#a1a1aa';
                return (
                  <div key={ev.indicatorCode} className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${vst.bg} ${vst.border}`}>
                    <div className="flex flex-col items-center gap-1 shrink-0 min-w-[60px]">
                      <span className="text-xs font-black font-mono px-1.5 py-0.5 rounded-md"
                        style={{ color: catCol, background: `${catCol}15`, border: `1px solid ${catCol}30` }}>
                        {ev.indicatorCode}
                      </span>
                      <span className={`text-xs font-bold ${vst.text}`}>{vst.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700 mb-0.5">{ev.indicatorTitle ?? ev.indicatorCode}</p>
                      <p className={`text-xs leading-relaxed ${vst.text} opacity-90`}>{comment}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calibration Dashboard (Dev Mode) ─────────────────────────────────────
function CalibrationDashboard({ data }) {
  const [open, setOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  if (!IS_DEV || !data) return null;

  const evs = data.evidenceMatches ?? [];
  const ksicCode = localStorage.getItem('esg_ksicCode') ?? '';

  // ── 업종 가중치 (EsgScoreConstants 미러) ──────────────────────────────
  const IND_TYPE = {
    '06':'ENERGY','07':'ENERGY','08':'ENERGY',
    '10':'MFG','11':'MFG','12':'MFG','13':'MFG','14':'MFG','15':'MFG',
    '16':'MFG','17':'MFG','18':'MFG','21':'MFG','22':'MFG','25':'MFG',
    '26':'MFG','27':'MFG','28':'MFG','29':'MFG','30':'MFG','31':'MFG',
    '32':'MFG','33':'MFG','19':'ENERGY','20':'ENERGY','23':'ENERGY',
    '24':'ENERGY','35':'ENERGY','36':'ENERGY',
    '58':'IT','59':'IT','60':'IT','61':'IT','62':'IT','63':'IT',
    '70':'IT','71':'IT','72':'IT','73':'IT',
    '45':'FIN','46':'FIN','47':'FIN','64':'FIN','65':'FIN','66':'FIN',
  };
  const IND_W = {
    MFG:    { E:0.50, S:0.25, G:0.25, label:'제조·중공업' },
    ENERGY: { E:0.55, S:0.25, G:0.20, label:'에너지·화학' },
    FIN:    { E:0.25, S:0.40, G:0.35, label:'금융·서비스' },
    IT:     { E:0.30, S:0.40, G:0.30, label:'IT·플랫폼' },
    DEFAULT:{ E:0.40, S:0.30, G:0.30, label:'기본 (K-ESG)' },
  };
  const iType = IND_TYPE[ksicCode.substring(0, 2)] ?? 'DEFAULT';
  const iw    = IND_W[iType];

  // ── Similarity histogram (buckets 0.55~1.00, step 0.05) ──────────────
  const simBuckets = [0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
  const simCounts  = simBuckets.map((lo, i) => {
    const hi = simBuckets[i + 1] ?? 1.01;
    return evs.filter(e => e.similarity != null && e.similarity >= lo && e.similarity < hi).length;
  });
  const simMax = Math.max(1, ...simCounts);

  // ── Score distribution (by 10-point bins) ────────────────────────────
  const scoreBins  = [0,10,20,30,40,50,60,70,80,90];
  const scoreData  = [data.eScore ?? 0, data.sScore ?? 0, data.gScore ?? 0];
  const ESGC       = ['#059669','#3b82f6','#f59e0b'];
  const ESGLabel   = ['E','S','G'];

  // ── Evidence stats ───────────────────────────────────────────────────
  const totalEv    = evs.length;
  const validEv    = evs.filter(e => e.isValidEvidence).length;
  const contraEv   = evs.filter(e => e.contradictionReason).length;
  const simValues  = evs.map(e => e.similarity).filter(Boolean);
  const avgSim     = simValues.length ? (simValues.reduce((a,b) => a+b,0) / simValues.length) : 0;
  const medSim     = (() => {
    if (!simValues.length) return 0;
    const s = [...simValues].sort((a,b) => a-b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m-1]+s[m])/2 : s[m];
  })();

  // ── Grade distribution ────────────────────────────────────────────────
  const grades     = ['S','A','B','C','D'];
  const gradeColor = { S:'#a855f7', A:'#059669', B:'#3b82f6', C:'#f59e0b', D:'#ef4444' };

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-dashed border-gray-300 rounded-xl text-left group hover:border-purple-400 transition-colors"
      >
        <span className="text-[8px] font-black text-purple-500 uppercase tracking-widest">DEV</span>
        <BarChart2 size={10} className="text-purple-500" />
        <span className="text-[10px] font-bold text-gray-600 group-hover:text-gray-800">AI 분석 보정 현황</span>
        <span className="text-[9px] text-gray-400 ml-1">— 유사도 분포 · 점수 · 근거 · 업종 가중치</span>
        <span className="ml-auto text-gray-400">{open ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}</span>
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-4 animate-in slide-in-from-top-1 duration-200">
          {/* Row 1: Industry weights + Score bars */}
          <div className="grid grid-cols-2 gap-4">
            {/* Industry weights panel */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">
                업종 가중치 — KSIC {ksicCode || 'N/A'} · {iw.label}
              </p>
              {[['E','환경', iw.E, '#059669'], ['S','사회', iw.S, '#3b82f6'], ['G','지배구조', iw.G, '#f59e0b']].map(([cat, lbl, w, col]) => (
                <div key={cat} className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-black font-mono w-4" style={{ color: col }}>{cat}</span>
                  <span className="text-[9px] text-gray-500 w-14">{lbl}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w*100}%`, background: col }} />
                  </div>
                  <span className="text-[9px] font-black tabular-nums font-mono w-10 text-right" style={{ color: col }}>
                    {Math.round(w*100)}%
                  </span>
                </div>
              ))}
              <div className="mt-3 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2">
                {[['E', data.eScore, '#059669'], ['S', data.sScore, '#3b82f6'], ['G', data.gScore, '#f59e0b']].map(([c, sc, col]) => (
                  <div key={c} className="text-center">
                    <p className="text-[8px] text-gray-500 uppercase">{c} 점수</p>
                    <p className="text-base font-black tabular-nums font-mono" style={{ color: col }}>{sc ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence stats panel */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">근거 통계</p>
              {[
                { label: '전체 근거 수',   value: totalEv,                         color: '#a1a1aa' },
                { label: '유효 근거 수',   value: validEv,                         color: '#059669' },
                { label: '불일치 건수',    value: contraEv,                        color: '#ef4444' },
                { label: '평균 유사도',    value: `${(avgSim * 100).toFixed(1)}%`, color: '#3b82f6' },
                { label: '전체 신뢰도',    value: `${data.overallConfidence ?? '?'}%`, color: '#f59e0b' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-0.5">
                  <span className="text-[9px] text-gray-500">{row.label}</span>
                  <span className="text-[9px] font-black tabular-nums font-mono" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Grade + contradiction */}
          <div className="grid grid-cols-2 gap-4">
            {/* Final grade card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">최종 등급</p>
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black tabular-nums font-mono" style={{ color: gradeColor[data.finalGrade] ?? '#a1a1aa' }}>
                  {data.finalGrade ?? '?'}
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-500">총점: <span className="font-black text-gray-800">{data.totalScore ?? '?'}</span></p>
                  <p className="text-[9px] text-gray-500">신뢰도: <span className="font-black" style={{ color: (data.overallConfidence ?? 0) >= 70 ? '#059669' : '#f59e0b' }}>{data.overallConfidence ?? '?'}%</span></p>
                  {data.gradeCeilingApplied && (
                    <p className="text-[8px] font-bold text-amber-500">⚠ 등급 상한 적용됨</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contradiction details */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">
                불일치 항목 분석 ({contraEv}건)
              </p>
              {contraEv === 0 ? (
                <p className="text-[9px] text-emerald-500 font-bold">✓ 불일치 항목 없음</p>
              ) : (
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {evs.filter(e => e.contradictionReason).map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] font-black text-red-500 shrink-0">{e.indicatorCode}</span>
                      <span className="text-[8px] text-red-400 leading-tight">{e.contradictionReason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 고급 상세 보기 accordion (Similarity Distribution + Calibration Flags) */}
          <button
            onClick={() => setAdvOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-left group hover:border-gray-300 transition-colors"
          >
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">고급 AI 분석 보기</span>
            <span className="text-[9px] text-gray-300 ml-1">— 유사도 분포 · 검증 상태 플래그</span>
            <span className="ml-auto text-gray-400">{advOpen ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}</span>
          </button>
          {advOpen && (
            <div className="grid grid-cols-1 gap-3">
              {/* Similarity histogram */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">
                  유사도 분포 (검색된 근거 청크)
                </p>
                <div className="flex items-end gap-1 h-20">
                  {simBuckets.map((lo, i) => {
                    const cnt  = simCounts[i];
                    const h    = Math.max(2, (cnt / simMax) * 100);
                    const col  = lo >= 0.80 ? '#059669' : lo >= 0.65 ? '#3b82f6' : lo >= 0.55 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={lo} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[7px] text-gray-500 tabular-nums">{cnt > 0 ? cnt : ''}</span>
                        <div className="w-full rounded-sm transition-all duration-500"
                          style={{ height: `${h}%`, background: col, opacity: 0.8 }}
                          title={`${Math.round(lo*100)}%-${Math.round((lo+0.05)*100)}%: ${cnt}개`}
                        />
                        <span className="text-[6px] text-gray-500 tabular-nums">{Math.round(lo*100)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {[
                    { label:'SIM_LOW=55%', color:'#f59e0b' }, { label:'SIM_MED=70%', color:'#3b82f6' },
                    { label:'SIM_HIGH=80%', color:'#059669' }, { label:'SIM_S_GATE=84%', color:'#a855f7' },
                  ].map(t => (
                    <span key={t.label} className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="text-[7px] font-mono text-gray-500">{t.label}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Calibration flags */}
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">검증 상태 플래그</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { ok: avgSim >= 0.70, label: `평균 유사도 ${(avgSim*100).toFixed(1)}%` },
                    { ok: contraEv === 0, label: `불일치 ${contraEv}건` },
                    { ok: validEv >= 5,   label: `유효 근거 ${validEv}건` },
                    { ok: (data.overallConfidence ?? 0) >= 50, label: `신뢰도 ${data.overallConfidence ?? 0}%` },
                    { ok: !data.gradeCeilingApplied, label: '등급 상한' + (data.gradeCeilingApplied ? ' 적용됨' : ' 정상') },
                  ].map((f, i) => (
                    <span key={i} className={`text-[8px] font-bold px-2 py-0.5 rounded border font-mono ${
                      f.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                           : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {f.ok ? '✓' : '✕'} {f.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── XAI Commentary Panel ─────────────────────────────────────────────────
// allIndicators: buildCompleteIndicatorList() 반환값 (NO_EVIDENCE 합성 포함, 이미 dedup·정렬됨)
function XAICommentaryPanel({ allIndicators, isAutoSimulation }) {
  const [open, setOpen] = useState(false);

  if (isAutoSimulation || !allIndicators?.length) return null;

  // allIndicators는 buildCompleteIndicatorList()에서 이미 dedup·정렬됨
  const items = allIndicators;

  const vstCounts = {
    VERIFIED:      items.filter(e => getVerificationStatus(e) === 'VERIFIED').length,
    WEAK:          items.filter(e => getVerificationStatus(e) === 'WEAK').length,
    CONTRADICTION: items.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length,
    NO_EVIDENCE:   items.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length,
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <span className="flex items-center gap-1.5">
          <Cpu size={9} className="text-purple-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-700 transition-colors">
            지표별 AI 판단 근거
          </span>
        </span>
        <span className="text-xs text-gray-400 ml-1">— 이 등급이 산출된 이유</span>
        <div className="flex items-center gap-1.5 ml-2">
          {vstCounts.VERIFIED      > 0 && <span className="text-[8px] font-bold text-emerald-600 tabular-nums">{vstCounts.VERIFIED}✓</span>}
          {vstCounts.WEAK          > 0 && <span className="text-[8px] font-bold text-amber-500 tabular-nums">{vstCounts.WEAK}~</span>}
          {vstCounts.CONTRADICTION > 0 && <span className="text-[8px] font-bold text-red-500 tabular-nums">{vstCounts.CONTRADICTION}✕</span>}
          {vstCounts.NO_EVIDENCE   > 0 && <span className="text-[8px] font-bold text-gray-400 tabular-nums">{vstCounts.NO_EVIDENCE}—</span>}
        </div>
        <span className="ml-auto text-gray-400 shrink-0">{open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2 animate-in slide-in-from-top-1 duration-150">
          {/* summary row */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
            <Cpu size={10} className="text-purple-500 shrink-0" />
            <span className="text-[9px] text-gray-500">
              총 <span className="text-gray-800 font-bold">{items.length}</span>개 지표 분석 완료 —
              검증 <span className="text-emerald-600 font-bold">{vstCounts.VERIFIED}</span>건,
              근거 부족 <span className="text-amber-500 font-bold">{vstCounts.WEAK}</span>건,
              불일치 <span className="text-red-500 font-bold">{vstCounts.CONTRADICTION}</span>건,
              증빙 없음 <span className="text-gray-400 font-bold">{vstCounts.NO_EVIDENCE}</span>건
            </span>
          </div>

          {/* per-indicator commentary */}
          {items.map((ev) => {
            const vstKey  = getVerificationStatus(ev);
            const vst     = VSTATUS[vstKey];
            const comment = generateIndicatorCommentary(ev);
            const catChar = ev.indicatorCode?.[0];
            const catCol  = ESG_COLOR[catChar] ?? '#a1a1aa';

            return (
              <div
                key={ev.indicatorCode}
                className={`rounded-xl px-3.5 py-2.5 border flex items-start gap-3 ${vst.bg} ${vst.border}`}
              >
                {/* left: code + status */}
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5 min-w-[64px]">
                  <span
                    className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded-md"
                    style={{ color: catCol, background: `${catCol}15`, border: `1px solid ${catCol}30` }}
                  >
                    {ev.indicatorCode}
                  </span>
                  <span className={`text-[8px] font-bold text-center ${vst.text}`}>
                    {vst.icon} {vstKey === 'NO_EVIDENCE' ? '미검출' : vstKey === 'CONTRADICTION' ? '불일치' : vstKey === 'VERIFIED' ? '검증' : '부족'}
                  </span>
                </div>
                {/* right: title + commentary */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-700 mb-0.5 leading-tight">
                    {ev.indicatorTitle ?? ev.indicatorCode}
                  </p>
                  <p className={`text-[9px] leading-relaxed ${vst.text} opacity-90`}>
                    {comment}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GPT 리포트 카드 ───────────────────────────────────────────────────
function GptReportCard({ section, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = section.icon;

  return (
    <div className="saas-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-all duration-150 group"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            style={{ background: `${section.color}15` }}
          >
            <Icon size={15} style={{ color: section.color }} />
          </span>
          <span className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors">
            {section.title}
          </span>
        </div>
        {open
          ? <ChevronUp size={15} className="text-gray-400" />
          : <ChevronDown size={15} className="text-gray-400" />
        }
      </button>
      {open && (
        <div className="px-6 pb-6 pt-2 border-t border-gray-100">
          <div
            className="text-sm text-gray-600 leading-relaxed"
            style={{ lineHeight: '1.9' }}
            dangerouslySetInnerHTML={{ __html: renderMd(section.content) }}
          />
        </div>
      )}
    </div>
  );
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-dark">
      {label && <p className="text-white/60 mb-1.5 text-[10px] uppercase tracking-wide">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="tabular-nums text-xs" style={{ color: p.color ?? p.fill ?? '#e5e7eb' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
          {p.payload?.unit ? ` ${p.payload.unit}` : ''}
        </p>
      ))}
    </div>
  );
};

const RadarTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="tooltip-dark">
      <p className="text-white/70 text-xs">
        {d.payload?.subject}:{' '}
        <strong className="text-white tabular-nums">{d.value}점</strong>
      </p>
    </div>
  );
};

// ── 점수 정규화 ───────────────────────────────────────────────────────
const normalizeScore = (raw) => {
  const radar     = raw?.esgChart?.radar ?? [];
  const fromRadar = (cat) => radar.find(r => r.category === cat)?.score ?? 0;
  return {
    ...raw,
    eScore:     raw.eScore     > 0 ? raw.eScore     : fromRadar('E'),
    sScore:     raw.sScore     > 0 ? raw.sScore     : fromRadar('S'),
    gScore:     raw.gScore     > 0 ? raw.gScore     : fromRadar('G'),
    totalScore: raw.totalScore > 0 ? raw.totalScore : (raw.esgChart?.totalScore ?? 0),
  };
};

// ── 점수 산정 해설 빌더 ───────────────────────────────────────────────
function buildAnalysisSummary(data) {
  if (!data) return null;
  const evs = data.evidenceMatches ?? [];

  // ── E 카테고리 (E-101~E-105 = 5개 지표) ──────────────────────────────
  const eEvs    = evs.filter(e => e.indicatorCode?.startsWith('E') && e.numericMatchLevel != null);
  const eHigh   = eEvs.filter(e => e.numericMatchLevel === 'HIGH').length;
  const eMed    = eEvs.filter(e => e.numericMatchLevel === 'MEDIUM').length;
  const eLow    = eEvs.filter(e => e.numericMatchLevel === 'LOW').length;
  const eTotal  = 5;
  const eFailed = eTotal - eEvs.length;
  const eAvgDiff = eEvs.length > 0
    ? eEvs.reduce((s, e) => s + (e.numericDiffPercent ?? 0), 0) / eEvs.length : null;
  const isAllEFailed = eEvs.length === 0 && eTotal > 0;
  const eSummary = isAllEFailed
    ? '기업 실측 데이터 추출에 실패하여 업종 평균 벤치마크 기반 추정 평가가 적용되었습니다.'
    : eFailed >= 3
    ? `${eFailed}개 항목의 수치 추출에 실패했습니다. 업종 평균 기반 추정치가 부분 적용되었습니다.`
    : eLow >= 3
    ? `${eLow}개 항목의 증빙 수치가 입력값과 크게 달라 점수가 하향 조정되었습니다.`
    : eLow >= 1
    ? `일부 항목에서 수치 차이가 감지되어 신뢰도에 영향이 있습니다. 해당 항목의 재검토를 권장합니다.`
    : eHigh === eEvs.length && eEvs.length > 0
    ? '모든 증빙 수치가 입력값과 일치합니다. 신뢰도 높은 평가입니다.'
    : '대부분의 증빙 수치가 입력값과 일치합니다.';
  const eTone = isAllEFailed ? 'amber' : eLow >= 2 ? 'red' : eLow === 1 ? 'amber' : eFailed >= 3 ? 'amber' : 'emerald';

  // ── S 카테고리 (사용자 선택 기준 5개 지표) ────────────────────────────
  const sEvs        = evs.filter(e => e.indicatorCode?.startsWith('S'));
  const sUniq       = new Set(sEvs.map(e => e.indicatorCode)).size;
  const sTotal      = S_SELECTED_TOTAL; // 사용자 선택 지표 수 기준 (5개)
  const sAttempted  = sUniq;            // evidenceMatches 에 등장한 S 코드 수
  const sMissing    = Math.max(0, sTotal - sUniq);
  const sLowConf    = sEvs.filter(e => e.confidenceLevel === 'LOW').length;
  const sHasUnsupported = sAttempted < sTotal; // 일부 지표 AI 미지원 가능성
  const sSummary = sMissing >= 2
    ? `${sMissing}개 지표에서 증빙 문서를 확인하지 못했습니다. 체크리스트 기반 점수가 적용되었습니다.`
    : sMissing === 1
    ? '1개 지표에서 증빙 검출이 미흡합니다. 관련 문서 보완을 권장합니다.'
    : sLowConf > 0
    ? '증빙이 검출되었으나 일부 항목의 문서 근거 신뢰도가 낮습니다.'
    : '사회 지표 관련 증빙이 충분히 확인되었습니다.';
  const sTone = sMissing >= 2 ? 'red' : sMissing === 1 ? 'amber' : 'emerald';

  // ── G 카테고리 (사용자 선택 기준 5개 지표) ────────────────────────────
  const gEvs        = evs.filter(e => e.indicatorCode?.startsWith('G'));
  const gUniq       = new Set(gEvs.map(e => e.indicatorCode)).size;
  const gTotal      = G_SELECTED_TOTAL; // 사용자 선택 지표 수 기준 (5개)
  const gAttempted  = gUniq;            // evidenceMatches 에 등장한 G 코드 수
  const gMissing    = Math.max(0, gTotal - gUniq);
  const gLowConf    = gEvs.filter(e => e.confidenceLevel === 'LOW').length;
  const gHasUnsupported = gAttempted < gTotal; // 일부 지표 AI 미지원 가능성
  const gSummary = gMissing >= 2
    ? `${gMissing}개 지표에서 증빙 문서를 확인하지 못했습니다. 체크리스트 기반 점수가 적용되었습니다.`
    : gMissing === 1
    ? '1개 지표에서 증빙 검출이 미흡합니다.'
    : gLowConf > 0
    ? '증빙이 검출되었으나 일부 항목의 문서 근거 신뢰도가 낮습니다.'
    : '지배구조 지표 관련 증빙이 충분히 확인되었습니다.';
  const gTone = gMissing >= 2 ? 'red' : gMissing === 1 ? 'amber' : 'emerald';

  // 카운트 검증 콘솔 로그 (내부 디버깅용)
  console.log('[S/G 지표 카운트 검증]', {
    S: { selected: sTotal, retrievalAttempted: sAttempted, verificationSuccess: sUniq },
    G: { selected: gTotal, retrievalAttempted: gAttempted, verificationSuccess: gUniq },
  });

  return {
    e: { high: eHigh, medium: eMed, low: eLow, total: eTotal, failed: eFailed,
         avgDiff: eAvgDiff, summary: eSummary, tone: eTone },
    s: { withEvidence: sUniq, total: sTotal, missing: sMissing, lowConf: sLowConf,
         attempted: sAttempted, hasUnsupported: sHasUnsupported, summary: sSummary, tone: sTone },
    g: { withEvidence: gUniq, total: gTotal, missing: gMissing, lowConf: gLowConf,
         attempted: gAttempted, hasUnsupported: gHasUnsupported, summary: gSummary, tone: gTone },
  };
}

// ── 최종 평가 요약 빌더 ────────────────────────────────────────────────
function buildFinalSummary({ finalGrade, confidence, lowCount, avgDiff, evidenceCount, isBenchmarkFallback, isFullBenchmark }) {
  const low   = lowCount ?? 0;
  const conf  = confidence ?? 0;
  const diff  = avgDiff   ?? 0;
  const grade = finalGrade ?? '';

  if (isFullBenchmark) {
    return { text: '환경(E) 수치 데이터가 제출되지 않아 체크리스트 기반으로만 평가가 진행되었습니다. PDF 또는 CSV 파일 제출 시 정확도가 향상됩니다.', tone: 'amber' };
  }
  if (isBenchmarkFallback) {
    return { text: '환경(E) 실측 데이터 없이 평가가 진행되었습니다. 수치 데이터를 제출하면 정확도가 향상됩니다.', tone: 'amber' };
  }
  if (grade === 'S') {
    return { text: '제출된 증빙 데이터와 입력값이 완전히 일치하며 ESG 전 영역 신뢰도가 최고 수준으로 평가되었습니다.', tone: 'emerald' };
  }
  if (grade === 'A') {
    return { text: '제출된 증빙 데이터와 입력값이 대부분 일치하며 ESG 관리 신뢰도가 높게 평가되었습니다.', tone: 'emerald' };
  }
  if (grade === 'B') {
    if (low >= 1)
      return { text: `일부 항목에서 증빙 수치 차이(${low}건)가 발견되어 등급이 제한되었으나 전반적으로 양호한 수준입니다.`, tone: 'amber' };
    return { text: '일부 항목에서 경미한 차이가 발견되었으나 전반적으로 양호한 수준입니다.', tone: 'amber' };
  }
  if (grade === 'C') {
    return { text: `여러 항목(${low}건)에서 입력값과 증빙 데이터 간 차이가 발견되어 신뢰도가 제한되었습니다.`, tone: 'red' };
  }
  if (grade === 'D') {
    return { text: `다수 항목(${low}건)에서 심각한 증빙 불일치가 감지되어 신뢰도가 매우 낮게 평가되었습니다.`, tone: 'red' };
  }
  // fallback
  if (low >= 3)
    return { text: '입력값과 증빙 데이터 간 차이가 발견되어 일부 항목의 신뢰도가 낮게 평가되었습니다.', tone: 'red' };
  return { text: 'ESG 데이터와 증빙 문서를 기반으로 평가가 완료되었습니다.', tone: 'zinc' };
}

// ── Evidence 상세 모달 ─────────────────────────────────────────────────
function EvidenceDetailModal({ ev, onClose }) {
  if (!ev) return null;
  const catChar    = ev.indicatorCode?.[0];
  const catColor   = ESG_COLOR[catChar] ?? '#a1a1aa';
  const catLabel   = ESG_LABEL[catChar] ?? catChar;
  const isECategory = catChar === 'E';
  // E 카테고리는 Numeric 섹션 표시, S/G는 Semantic 섹션 표시
  const isNumeric  = isECategory;
  const matchStyle = MATCH_STYLE[ev.numericMatchLevel] ?? null;
  const diffPct   = ev.numericDiffPercent ?? 0;
  const diffBarW  = Math.min(100, (diffPct / 40) * 100);
  const diffBarCol = diffPct <= 5 ? '#059669' : diffPct <= 20 ? '#f59e0b' : '#ef4444';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-100 flex items-center justify-between px-5 py-3.5 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono"
              style={{ color: catColor, borderColor: `${catColor}40`, background: `${catColor}10` }}>
              {catChar} · {catLabel}
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200" style={{ color: catColor }}>
              {ev.indicatorCode ?? '-'}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              isECategory ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-gray-100 border-gray-200 text-gray-500'
            }`}>
              {isECategory ? '수치 검증' : 'AI 문맥 분석'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* 지표명 */}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">지표명</p>
            <p className="text-base font-bold text-gray-900">{ev.indicatorTitle ?? '-'}</p>
          </div>

          {/* ── E 카테고리: Numeric 검증 상세 ── */}
          {isNumeric && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1.5">
                수치 검증 상세
              </p>

              {/* 판정 배지 */}
              {matchStyle && (
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-black px-3 py-1 rounded-full border ${matchStyle.bg} ${matchStyle.border} ${matchStyle.text}`}>
                    {matchStyle.label}
                  </span>
                  {ev.numericMatchLevel === 'HIGH' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                      ✓ 검증 완료
                    </span>
                  )}
                </div>
              )}

              {/* 감사표 */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium w-28 shrink-0">입력값</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-800">
                        {ev.inputValue != null ? Number(ev.inputValue).toLocaleString() : '-'}
                        {ev.unit ? <span className="ml-1 text-gray-400 font-normal text-xs">{ev.unit}</span> : null}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">문서 추출값</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-800">
                        {ev.extractedValue != null ? Number(ev.extractedValue).toLocaleString() : '-'}
                        {ev.unit ? <span className="ml-1 text-gray-400 font-normal text-xs">{ev.unit}</span> : null}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">오차율</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-base tabular-nums" style={{ color: diffBarCol }}>
                            {fmtDiff(diffPct)}
                          </span>
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${diffBarW}%`, background: diffBarCol }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">판정 기준</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        HIGH ≤5% · MEDIUM ≤20% · LOW &gt;20%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Numeric Diff Visualization */}
              {ev.inputValue != null && (
                (() => {
                  const inp  = parseFloat(ev.inputValue)  ?? 0;
                  const extr = parseFloat(ev.extractedValue ?? ev.inputValue) ?? 0;
                  const maxV = Math.max(Math.abs(inp), Math.abs(extr), 1);
                  const inpPct  = Math.round((Math.abs(inp)  / maxV) * 100);
                  const extrPct = Math.round((Math.abs(extr) / maxV) * 100);
                  const diffPctDisplay = ev.numericDiffPercent ?? 0;
                  const barColor = diffPctDisplay <= 5 ? '#059669' : diffPctDisplay <= 20 ? '#f59e0b' : '#ef4444';
                  const fmtV = (v) => {
                    const abs = Math.abs(v);
                    if (abs >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`;
                    if (abs >= 1_000)     return `${(v/1_000).toFixed(1)}K`;
                    return v.toLocaleString();
                  };
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">수치 차이 시각화</p>
                      {/* input bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 w-12 shrink-0 text-right">입력값</span>
                        <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gray-400 transition-all duration-700" style={{ width: `${inpPct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-gray-700 tabular-nums w-16 shrink-0">{fmtV(inp)}</span>
                      </div>
                      {/* extracted bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 w-12 shrink-0 text-right">추출값</span>
                        <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${extrPct}%`, background: barColor }} />
                        </div>
                        <span className="text-[10px] font-mono font-bold tabular-nums w-16 shrink-0" style={{ color: barColor }}>
                          {ev.extractedValue != null ? fmtV(extr) : '—'}
                        </span>
                      </div>
                      {/* diff label */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <span className="text-[9px] text-gray-500 font-mono">diff</span>
                        <span className="text-sm font-black font-mono tabular-nums" style={{ color: barColor }}>
                          {diffPctDisplay > 0 ? '+' : ''}{diffPctDisplay.toFixed(1)}%
                        </span>
                        {ev.extractedValue != null && (
                          <span className="text-[9px] text-gray-400 font-mono">
                            ({fmtV(Math.abs(extr - inp))}{ev.unit ? ` ${ev.unit}` : ''})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* 검증 방식 설명 */}
              <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1">검증 방법</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  CSV/PDF 문서에서 해당 지표의 수치를 추출하여 입력값과 직접 비교합니다.
                  정규식 및 단위 정규화를 적용하며, 추출 실패 시 마크다운 전체 텍스트에서 재시도합니다.
                </p>
              </div>
            </div>
          )}

          {/* ── S/G 카테고리: Semantic 상세 ── */}
          {!isNumeric && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1.5">
                AI 문맥 분석 상세
              </p>

              {/* 점수 행 */}
              <div className="grid grid-cols-2 gap-3">
                {ev.similarity != null && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">AI 유사도</p>
                    <p className="text-2xl font-black tabular-nums font-mono" style={{
                      color: toPct(ev.similarity) >= 70 ? '#059669' : toPct(ev.similarity) >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {toPct(ev.similarity)}%
                    </p>
                  </div>
                )}
                {ev.finalScore != null && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">최종 점수</p>
                    <p className="text-2xl font-black tabular-nums font-mono" style={{
                      color: toPct(ev.finalScore) >= 70 ? '#059669' : toPct(ev.finalScore) >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {toPct(ev.finalScore)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Keyword Gate 결과 */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">키워드 검증 결과</p>
                <div className="flex items-center gap-2">
                  {ev.isValidEvidence === true
                    ? <><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /><span className="text-xs text-emerald-700 font-semibold">통과 — 필수 키워드 검출됨</span></>
                    : <><AlertTriangle size={13} className="text-amber-500 shrink-0" /><span className="text-xs text-amber-700 font-semibold">차단 — 필수 키워드 미검출</span></>
                  }
                </div>
                {ev.confidenceLevel && (
                  <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded border ${CONF_CLS[ev.confidenceLevel] ?? CONF_CLS.LOW}`}>
                    신뢰도: {ev.confidenceLevel === 'HIGH' ? '높음' : ev.confidenceLevel === 'MEDIUM' ? '보통' : '낮음'}
                  </span>
                )}
              </div>

              {/* 검출 문장 snippet */}
              {ev.evidenceText && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2">검증 근거 텍스트</p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line font-mono">
                    {ev.evidenceText.length > 400 ? ev.evidenceText.slice(0, 400) + '…' : ev.evidenceText}
                  </p>
                </div>
              )}

              {/* 가이드라인 매칭 */}
              {ev.matchedGuideline && (
                <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">연계 가이드라인</p>
                  <p className="text-xs text-gray-500 italic leading-relaxed">{ev.matchedGuideline}</p>
                </div>
              )}

              {/* 검증 방식 설명 — Semantic */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">분석 방법</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  문서 의미 유사도(70%) + 키워드 검증(30%) 복합 점수로 관련 문장을 검색합니다.
                  키워드 검증 미통과 시 차단 처리되며, 해당 지표 검증 근거가 미인정됩니다.
                </p>
              </div>
            </div>
          )}

          {/* 소스 파일 */}
          {(ev.sourceFile ?? ev.sourceFileName) && (
            <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
              <FileText size={11} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 truncate">{(ev.sourceFile ?? ev.sourceFileName).split(/[/\\]/).pop()}</span>
              {ev.pageNumber != null && (
                <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 ml-auto shrink-0">
                  p.{ev.pageNumber}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Retrieval Trace Table ─────────────────────────────────────────────
function AIRetrievalTraceTable({ rows, onSelect }) {
  const [expandedCode, setExpandedCode] = useState(null);

  const getSimColor = (pct) => {
    if (pct == null) return '#9ca3af';
    if (pct >= 85) return '#059669';
    if (pct >= 70) return '#3b82f6';
    if (pct >= 55) return '#f59e0b';
    return '#ef4444';
  };

  if (!rows.length) return null;

  return (
    <div className="data-table rounded-xl overflow-hidden">
      {/* Table header — desktop only */}
      <div className="hidden sm:grid sm:grid-cols-[148px_1fr_70px_96px_118px_44px] bg-gray-50 border-b border-gray-200 px-4 py-3 gap-3 items-center">
        {['지표', '검색 근거', '유사도', '검증 상태', '출처', '페이지'].map(h => (
          <span key={h} className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{h}</span>
        ))}
      </div>

      <div className="divide-y divide-gray-100">
        {rows.map((ev, idx) => {
          const vstKey   = getVerificationStatus(ev);
          const vst      = VSTATUS[vstKey];
          const simPct   = toPct(ev.similarity);
          const simColor = getSimColor(simPct);
          const isECat   = ev.indicatorCode?.[0] === 'E';
          const catColor = isECat ? '#059669' : ev.indicatorCode?.[0] === 'S' ? '#3b82f6' : '#f59e0b';
          const snippet  = ev.evidenceText
            ? ev.evidenceText.slice(0, 95) + (ev.evidenceText.length > 95 ? '…' : '')
            : null;
          const srcFile  = (ev.sourceFile ?? ev.sourceFileName)?.split(/[/\\]/).pop() ?? null;
          const isOpen   = expandedCode === (ev.indicatorCode ?? idx);

          return (
            <React.Fragment key={ev.indicatorCode ?? idx}>
              {/* ── Main Row ── */}
              <button
                className={`w-full text-left transition-colors duration-150 ${isOpen ? 'bg-indigo-50/40' : 'hover:bg-gray-50'} ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                onClick={() => setExpandedCode(isOpen ? null : (ev.indicatorCode ?? idx))}
              >
                {/* Desktop */}
                <div className="hidden sm:grid sm:grid-cols-[148px_1fr_70px_96px_118px_44px] px-4 py-3 gap-3 items-center">
                  {/* Indicator */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] font-black font-mono leading-none" style={{ color: catColor }}>
                      {ev.indicatorCode}
                    </span>
                    <span className="text-[10px] text-gray-600 leading-tight truncate pr-1">
                      {ev.indicatorTitle ?? '—'}
                    </span>
                  </div>
                  {/* Snippet */}
                  <div className="min-w-0">
                    {snippet
                      ? <span className="text-[10px] text-gray-500 font-mono line-clamp-1">{snippet}</span>
                      : <span className="text-[10px] text-gray-300 italic">— 검색 결과 없음</span>
                    }
                  </div>
                  {/* Similarity */}
                  <div className="flex flex-col items-start gap-0.5">
                    {simPct != null ? (
                      <>
                        <span className="text-xs font-black font-mono tabular-nums leading-none" style={{ color: simColor }}>
                          {simPct}%
                        </span>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                          <div className="h-full rounded-full" style={{ width: `${simPct}%`, background: simColor }} />
                        </div>
                      </>
                    ) : isECat ? (
                      <span className="text-[9px] text-sky-500 font-bold">수치</span>
                    ) : (
                      <span className="text-[9px] text-gray-300">—</span>
                    )}
                  </div>
                  {/* Status */}
                  <div>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap inline-flex items-center gap-0.5 ${vst.bg} ${vst.border} ${vst.text}`}>
                      <span>{vst.icon}</span>
                      <span>{vst.label}</span>
                    </span>
                  </div>
                  {/* Source */}
                  <div className="min-w-0">
                    {srcFile
                      ? <span className="text-[9px] text-gray-400 font-mono truncate block max-w-[110px]">{srcFile}</span>
                      : <span className="text-[9px] text-gray-300">—</span>
                    }
                  </div>
                  {/* Page */}
                  <div>
                    {ev.pageNumber != null
                      ? <span className="text-[9px] font-mono text-gray-500 bg-gray-100 px-1 py-0.5 rounded">p.{ev.pageNumber}</span>
                      : <span className="text-[9px] text-gray-300">—</span>
                    }
                  </div>
                </div>

                {/* Mobile: compact */}
                <div className="sm:hidden flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col gap-0.5 shrink-0 w-20">
                    <span className="text-[10px] font-black font-mono" style={{ color: catColor }}>{ev.indicatorCode}</span>
                    <span className={`text-[8px] font-black px-1 py-0.5 rounded border inline-block ${vst.bg} ${vst.border} ${vst.text}`}>
                      {vst.icon} {vst.label}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-700 font-medium truncate">{ev.indicatorTitle}</p>
                    {snippet && <p className="text-[9px] text-gray-400 font-mono truncate">{snippet}</p>}
                  </div>
                  {simPct != null && (
                    <span className="text-xs font-black font-mono shrink-0" style={{ color: simColor }}>{simPct}%</span>
                  )}
                </div>
              </button>

              {/* ── Expanded Detail Panel ── */}
              {isOpen && (
                <div className="px-4 pt-3 pb-4 bg-slate-50 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Left: evidence text + guideline */}
                    <div className="space-y-2">
                      {ev.evidenceText ? (
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1.5">검증 근거 텍스트</p>
                          <p className="text-[10px] text-gray-600 leading-relaxed font-mono whitespace-pre-line">
                            {ev.evidenceText.length > 380 ? ev.evidenceText.slice(0, 380) + '…' : ev.evidenceText}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
                          <p className="text-[10px] text-gray-400 italic">문서에서 검증 근거 텍스트를 찾지 못했습니다.</p>
                        </div>
                      )}
                      {ev.matchedGuideline && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                          <p className="text-[8px] font-black text-indigo-400 uppercase tracking-wider mb-1">연계 가이드라인</p>
                          <p className="text-[10px] text-indigo-700 leading-relaxed italic">{ev.matchedGuideline}</p>
                        </div>
                      )}
                    </div>

                    {/* Right: retrieval metrics + validation */}
                    <div className="space-y-2">
                      {/* Retrieval scores */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-2">AI 검색 지표</p>
                        <div className="space-y-1.5">
                          {[
                            { label: 'AI 유사도',   value: simPct != null ? `${simPct}%` : '—', color: simPct != null ? simColor : '#9ca3af' },
                            { label: '최종 점수',   value: toPct(ev.finalScore) != null ? `${toPct(ev.finalScore)}%` : '—', color: '#6366f1' },
                            { label: '검색 순위',   value: ev.retrievalRank != null ? `#${ev.retrievalRank}` : '—', color: '#374151' },
                            { label: '페이지',      value: ev.pageNumber != null ? `p.${ev.pageNumber}` : '—', color: '#374151' },
                          ].map(item => (
                            <div key={item.label} className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-400">{item.label}</span>
                              <span className="font-black font-mono" style={{ color: item.color }}>{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Validation result */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-2">검증 결과</p>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${vst.bg} ${vst.border} ${vst.text}`}>
                            {vst.icon} {vst.label}
                          </span>
                          {ev.confidenceLevel && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${CONF_CLS[ev.confidenceLevel] ?? CONF_CLS.LOW}`}>
                              신뢰도 {ev.confidenceLevel === 'HIGH' ? '높음' : ev.confidenceLevel === 'MEDIUM' ? '보통' : '낮음'}
                            </span>
                          )}
                        </div>
                        {ev.isValidEvidence !== undefined && (
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100">
                            {ev.isValidEvidence
                              ? <CheckCircle size={10} className="text-emerald-500 shrink-0" />
                              : <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                            }
                            <span className={`text-[9px] font-semibold ${ev.isValidEvidence ? 'text-emerald-700' : 'text-amber-700'}`}>
                              키워드 필터 {ev.isValidEvidence ? '통과' : '차단됨'}
                            </span>
                          </div>
                        )}
                        {isECat && ev.inputValue != null && (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            {[
                              { lbl: '입력값', val: `${Number(ev.inputValue).toLocaleString()} ${ev.unit ?? ''}`, color: '#374151' },
                              ev.extractedValue != null && { lbl: '증빙값', val: `${Number(ev.extractedValue).toLocaleString()} ${ev.unit ?? ''}`, color: MATCH_STYLE[ev.numericMatchLevel]?.color ?? '#374151' },
                              ev.numericDiffPercent != null && { lbl: '차이율', val: fmtDiff(ev.numericDiffPercent), color: ev.numericDiffPercent <= 5 ? '#059669' : ev.numericDiffPercent <= 20 ? '#f59e0b' : '#ef4444' },
                            ].filter(Boolean).map(item => (
                              <div key={item.lbl} className="flex justify-between text-[10px]">
                                <span className="text-gray-400">{item.lbl}</span>
                                <span className="font-mono font-black" style={{ color: item.color }}>{item.val}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {ev.contradictionReason && (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                            <p className="text-[9px] text-red-500 leading-relaxed">{ev.contradictionReason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Judgment */}
                  <div className="mt-2.5 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-violet-50 border border-violet-100">
                    <Cpu size={10} className="text-violet-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[8px] font-black text-violet-400 uppercase tracking-wider mb-0.5">AI 판단 근거</p>
                      <p className="text-[10px] text-violet-700 leading-relaxed">{generateIndicatorCommentary(ev)}</p>
                    </div>
                  </div>

                  {/* Full detail button */}
                  {onSelect && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelect(ev); }}
                      className="mt-2 text-[10px] font-semibold text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
                    >
                      <FileText size={9} /> Full detail → <span className="font-mono">{ev.indicatorCode}</span>
                    </button>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Confidence Tooltip ────────────────────────────────────────────────
function ConfidenceTooltip() {
  return (
    <div className="relative inline-flex items-center group cursor-help ml-1">
      <Info size={11} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
      <div className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl p-3.5 text-xs text-gray-600 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 shadow-lg pointer-events-none">
        <p className="font-bold text-gray-800 mb-1">분석 신뢰도</p>
        <p className="text-gray-400 text-[10px] mb-2 italic">실제 검증 성공률이 아닌 검증 근거 충족 정도입니다.</p>
        <p className="text-gray-600 leading-relaxed">
          제출 증빙과 ESG 지표 간 검증 근거 충족 정도입니다.{' '}
          <span className="text-sky-600 font-semibold">E 카테고리</span>는 수치 검증,{' '}
          <span className="text-emerald-600 font-semibold">S/G 카테고리</span>는 AI 문맥 분석 결과를 기반으로 산출합니다.
        </p>
        <div className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            수치 불일치 증가 → 신뢰도 감소
          </p>
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            AI 검증 근거 부족 → 신뢰도 감소
          </p>
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            업종 평균 추정 적용 → -10점 보정
          </p>
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            HIGH match 비율 높을수록 신뢰도 증가
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────

const VALID_TABS = ['summary', 'evidence', 'benchmark', 'ai-report', 'audit-log'];

export default function AnalysisResultPage() {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [evTab, setEvTab]               = useState('ALL');
  const [activeTab, setActiveTab]       = useState(() => {
    // hash 우선(#evidence 등), 없으면 ?tab= param
    const hash = window.location.hash.replace('#', '');
    if (VALID_TABS.includes(hash)) return hash;
    const t = searchParams.get('tab');
    return VALID_TABS.includes(t) ? t : 'summary';
  });
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [demoLabel, setDemoLabel]       = useState(null);

  // ── UX: 상세 섹션 접힘/펼침 상태 (기본 접힘) ────────────────────────
  const [showNumericDetail,      setShowNumericDetail]      = useState(false);
  const [showScoreDetail,        setShowScoreDetail]        = useState(false);
  const [showFullRecommendations,setShowFullRecommendations]= useState(false);
  const [showConfidenceDetail,   setShowConfidenceDetail]   = useState(false);
  const [showBlockedDetail,      setShowBlockedDetail]      = useState(false);
  const [showAdvancedEvidence,   setShowAdvancedEvidence]   = useState(false);

  // ── hash 기반 탭 전환 + 섹션 스크롤 ─────────────────────────────────
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!VALID_TABS.includes(hash)) return;
    setActiveTab(hash);
    setTimeout(() => {
      const el = document.getElementById(`section-${hash}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, [location.hash]);

  const handlePdfExport = async () => {
    if (!data || isPdfLoading) return;
    setIsPdfLoading(true);
    try {
      await exportAnalysisResult(data, analysisId);
    } catch (e) {
      console.error('[PDF Export]', e);
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleDemoRun = async (scenario) => {
    try {
      const mod = await import(`../../data/demo-${scenario}.json`);
      setData(normalizeScore(mod.default));
      setLoading(false);
      setError(null);
      setDemoLabel(scenario);
    } catch (e) {
      console.error('[Demo]', e);
    }
  };

  useEffect(() => {
    if (!IS_DEV) return;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '1') handleDemoRun('good');
      if (e.key === '2') handleDemoRun('warning');
      if (e.key === '3') handleDemoRun('missing-evidence');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/v1/analysis/${analysisId}/result`)
      .then(r => {
        const raw = r.data;
        // ── benchmark 디버그 로그 ──────────────────────────────────────────
        console.log('[BenchmarkDebug] benchmarkComparison:', raw?.benchmarkComparison);
        console.log('[BenchmarkDebug] metrics:', raw?.benchmarkComparison?.metrics);
        console.log('[BenchmarkDebug] companyDataSource:', raw?.benchmarkComparison?.companyDataSource);
        // ─────────────────────────────────────────────────────────────────
        const normalized = normalizeScore(raw);
        console.log('[ESG Result] raw:', raw, '→ normalized:', normalized);
        setData(normalized);
        setLoading(false);
      })
      .catch(e => { setError(e.response?.data?.message ?? e.message); setLoading(false); });
  }, [analysisId]);

  const radarData     = useMemo(() => data?.esgChart?.radar?.map(r => ({ subject: r.label, score: r.score, fullMark: 100 })) ?? [], [data]);
  const evidenceList  = useMemo(() => {
    const list = data?.evidenceMatches ?? [];
    const filtered = evTab === 'ALL' ? list : list.filter(e => e.indicatorCode?.startsWith(evTab));
    // LOW → MEDIUM → HIGH → semantic(numeric 없음) 순 정렬 (문제 항목을 앞에)
    const SORT_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return [...filtered].sort((a, b) => {
      const oa = a.numericMatchLevel != null ? (SORT_ORDER[a.numericMatchLevel] ?? 3) : 4;
      const ob = b.numericMatchLevel != null ? (SORT_ORDER[b.numericMatchLevel] ?? 3) : 4;
      return oa - ob;
    });
  }, [data, evTab]);
  const benchMetrics    = useMemo(() => {
    const bc = data?.benchmarkComparison;
    if (!bc) return [];
    // 1순위: 서버가 직접 제공한 metrics 배열
    if (Array.isArray(bc.metrics) && bc.metrics.length > 0) return bc.metrics;
    // 2순위: 구버전 응답 / metrics 누락 시 scalar 필드에서 복원
    console.warn('[BenchmarkDebug] metrics 배열 없음 — scalar 필드로 재구성');
    return [
      { name: '전력 사용량',  unit: 'kWh',  company: bc.companyElectricityKwh  ?? null, industryAvg: bc.industryAvgElectricityKwh  ?? null },
      { name: '가스 사용량',  unit: 'MJ',   company: bc.companyGasMj           ?? null, industryAvg: bc.industryAvgGasMj           ?? null },
      { name: '탄소 배출량',  unit: 'tCO₂', company: bc.companyCarbonTco2      ?? null, industryAvg: bc.industryAvgCarbonTco2      ?? null },
      { name: '폐기물 발생량',unit: 'kg',   company: bc.companyWasteKg         ?? null, industryAvg: bc.industryAvgWasteKg         ?? null },
      { name: '용수 사용량',  unit: 'm³',   company: bc.companyWaterM3         ?? null, industryAvg: bc.industryAvgWaterM3         ?? null },
    ].filter(m => m.company != null || m.industryAvg != null);
  }, [data]);
  const reportSections  = useMemo(() => parseReportSections(data?.fullReport), [data]);
  const analysisSummary = useMemo(() => buildAnalysisSummary(data), [data]);

  // ── E 카테고리 수치 검증 집계 (검증 요약 섹션용) ──────────────────────
  const verificationStats = useMemo(() => {
    const numEvs = data?.evidenceMatches?.filter(
      e => e.numericMatchLevel != null && e.numericDiffPercent != null
    ) ?? [];
    const highCount   = numEvs.filter(e => e.numericMatchLevel === 'HIGH').length;
    const mediumCount = numEvs.filter(e => e.numericMatchLevel === 'MEDIUM').length;
    const lowCount    = numEvs.filter(e => e.numericMatchLevel === 'LOW').length;
    const total       = numEvs.length;
    const avgDiff     = total > 0
      ? numEvs.reduce((s, e) => s + (e.numericDiffPercent ?? 0), 0) / total
      : null;
    const highRatio   = total > 0 ? highCount / total : 0;

    // 신뢰도 레벨 + 요약 문구
    let trustLabel, trustCls, summaryText, summaryColor;
    if (lowCount === 0 && highRatio >= 0.8) {
      trustLabel  = 'HIGH 신뢰';
      trustCls    = 'bg-emerald-50 border-emerald-200 text-emerald-700';
      summaryText = '제출된 증빙 데이터와 입력 수치가 대부분 일치합니다.';
      summaryColor = 'text-gray-700';
    } else if (lowCount <= 1) {
      trustLabel  = '보통 신뢰';
      trustCls    = 'bg-amber-50 border-amber-200 text-amber-700';
      summaryText = '일부 항목에서 경미한 차이가 발견되었습니다.';
      summaryColor = 'text-amber-700';
    } else {
      trustLabel  = '검토 필요';
      trustCls    = 'bg-red-50 border-red-200 text-red-600';
      summaryText = '입력값과 증빙 데이터 간 유의미한 차이가 발견되었습니다.';
      summaryColor = 'text-red-600';
    }

    return { highCount, mediumCount, lowCount, avgDiff, total,
             trustLabel, trustCls, summaryText, summaryColor };
  }, [data]);

  // 검증 방식 분류
  const verificationMode = useMemo(() => {
    const evs = data?.evidenceMatches ?? [];
    const hasNumeric  = evs.some(e => e.numericMatchLevel != null);
    const hasSemantic = evs.some(e => e.numericMatchLevel == null && e.similarity != null);
    if (hasNumeric && hasSemantic) return 'hybrid';
    if (hasNumeric)  return 'numeric';
    return 'semantic';
  }, [data]);

  // S/G 지표 중 evidence에 미감지된 항목 목록
  const blockedIndicators = useMemo(() => {
    const detected = new Set((data?.evidenceMatches ?? []).map(e => e.indicatorCode));
    return Object.entries(SG_INDICATORS).filter(([code]) => !detected.has(code));
  }, [data]);

  // 모든 지표를 포함한 완전한 목록 (NO_EVIDENCE 합성 포함)
  // Verification Summary의 단일 소스 — UI·PDF·AuditConsole이 모두 이것을 기준으로 삼습니다.
  const completeIndicatorList = useMemo(
    () => buildCompleteIndicatorList(data?.evidenceMatches),
    [data]
  );

  // 지표별 세부 점수 데이터 — backend breakdown 우선, 없으면 evidenceMatches 기반 fallback
  const breakdownData = useMemo(() => {
    const raw = data?.esgChart?.breakdown ?? [];
    console.log('[ESG Chart] esgChart.breakdown length:', raw.length, '| raw:', raw);
    if (raw.length > 0) {
      return raw.map(item => ({
        ...item,
        title: ALL_INDICATOR_CODES[item.kesgCode] ?? ALL_INDICATOR_CODES[item.indicatorCode] ?? item.label ?? item.name ?? item.indicatorName ?? item.title ?? item.kesgCode ?? item.indicatorCode,
      }));
    }
    // Fallback: completeIndicatorList로 검증 기반 점수 추정
    const MATCH_SCORE = { HIGH: 90, MEDIUM: 72, LOW: 45 };
    const result = completeIndicatorList.map(ev => {
      const catChar = ev.indicatorCode?.[0];
      let score;
      if (catChar === 'E') {
        score = ev.numericMatchLevel ? (MATCH_SCORE[ev.numericMatchLevel] ?? 30) : 30;
      } else {
        const sim = ev.similarity != null ? Math.round(ev.similarity * 100) : null;
        score = ev.isValidEvidence ? (sim != null ? Math.max(50, sim) : 75) : 35;
      }
      const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
      return { kesgCode: ev.indicatorCode, title: ev.indicatorTitle ?? ALL_INDICATOR_CODES[ev.indicatorCode] ?? ev.indicatorCode, score, grade, confidence: null, isFallback: true };
    });
    console.log('[ESG Chart] fallback breakdownData from evidenceMatches:', result.length);
    return result;
  }, [data, completeIndicatorList]);

  // 분석 제한 사항 공지 목록
  const limitationNotices = useMemo(() => {
    if (!data) return [];
    const notices = [];
    const evCount  = data.evidenceMatches?.length ?? 0;
    const sgEvs    = data.evidenceMatches?.filter(e => e.indicatorCode?.match(/^[SG]/)) ?? [];
    const lowConf  = (data.overallConfidence ?? 100) < 50;

    if (verificationStats.lowCount > 0)
      notices.push({ tone: 'amber', text: `수치 불일치 ${verificationStats.lowCount}건이 감지되어 해당 항목의 신뢰도가 낮게 평가될 수 있습니다.` });
    if (blockedIndicators.length > 0)
      notices.push({ tone: 'amber', text: `${blockedIndicators.length}개 S/G 지표는 증빙 부족으로 체크리스트 기반 평가가 적용되었습니다.` });
    if (evCount > 0 && evCount < 3)
      notices.push({ tone: 'zinc', text: 'Evidence 건수가 충분하지 않아 일부 지표 평가 정확도가 낮을 수 있습니다.' });
    if (lowConf && sgEvs.length < 2)
      notices.push({ tone: 'zinc', text: 'OCR 품질에 따라 일부 수치 추출 정확도가 달라질 수 있습니다.' });
    if (data.ragBased === false)
      notices.push({ tone: 'zinc', text: 'AI 문서 분석 대신 체크리스트 기반 평가가 적용되었습니다.' });

    return notices;
  }, [data, verificationStats.lowCount, blockedIndicators]);

  // E 카테고리 수치 비교 행 — API 직접 inputValue/extractedValue/unit 사용
  const numericRows = useMemo(() => {
    const UNIT_FALLBACK = { 'E-101': 'kWh', 'E-102': 'MJ', 'E-103': 'tCO₂', 'E-104': 'kg', 'E-105': 'm³' };
    const seen = new Set();
    return (data?.evidenceMatches ?? [])
      .filter(e => e.numericMatchLevel != null && (e.indicatorCode?.startsWith('E') || Object.keys(E_INDICATORS).includes(e.indicatorCode)))
      .filter(e => { if (seen.has(e.indicatorCode)) return false; seen.add(e.indicatorCode); return true; })
      .map(e => ({
        ...e,
        inputValue:     e.inputValue     ?? null,
        extractedValue: e.extractedValue ?? null,
        unit:           e.unit           ?? UNIT_FALLBACK[e.indicatorCode] ?? '',
        indicatorTitle: e.indicatorTitle ?? ALL_INDICATOR_CODES[e.indicatorCode] ?? e.indicatorCode,
      }));
  }, [data]);

  // Hero TOP ISSUE 패널 — 가장 중요한 단일 이슈 요약 (extraction failure 최우선)
  const topIssue = useMemo(() => {
    const lowCount  = verificationStats.lowCount;
    const sgMissing = blockedIndicators.length;
    const eFailed   = analysisSummary?.e?.failed ?? 0;
    const eTotal    = analysisSummary?.e?.total  ?? 5;
    if (eFailed >= eTotal)
      return { tone: 'amber', title: '환경 데이터 자동 추출 오류', msg: `환경(E) 데이터 ${eFailed}건 수치를 자동 추출하지 못해 업종 평균 기반 추정 평가가 적용되었습니다. 실측 데이터를 제출하면 정확도가 향상됩니다.` };
    if (eFailed >= 3)
      return { tone: 'amber', title: '환경 데이터 일부 추출 오류', msg: `환경(E) ${eFailed}개 항목 수치 자동 추출에 제한이 있어 업종 평균 기반 추정치가 부분 적용되었습니다.` };
    if (lowCount >= 3)
      return { tone: 'red',     title: '환경 수치 불일치',       msg: `환경(E) 수치 불일치 ${lowCount}건이 감지되었습니다. 입력값과 증빙 문서 간 오차가 허용 범위를 초과하여 신뢰도가 낮게 평가되었습니다.` };
    if (lowCount >= 1)
      return { tone: 'amber',   title: '수치 불일치 주의',       msg: `환경(E) ${lowCount}개 항목에서 수치 차이가 감지되었습니다. 해당 항목의 증빙 문서를 재검토하세요.` };
    if (sgMissing >= 3)
      return { tone: 'amber',   title: '검증 근거 부족',         msg: `S/G 카테고리 ${sgMissing}개 지표에서 AI 검증 근거를 찾지 못했습니다. 관련 정책 문서 및 보고서 추가를 권장합니다.` };
    if (sgMissing >= 1)
      return { tone: 'zinc',    title: '검증 근거 일부 미흡',    msg: `${sgMissing}개 S/G 지표에서 검증 근거 검출이 미흡합니다. 관련 문서를 보완하면 점수가 향상될 수 있습니다.` };
    return   { tone: 'emerald', title: '안정',                   msg: '수치 불일치 및 검증 근거 부족 항목이 없습니다. ESG 데이터 신뢰도가 안정적입니다.' };
  }, [verificationStats.lowCount, blockedIndicators.length, analysisSummary]);

  // AUTO 사전 진단 여부 — API 응답 우선, localStorage 폴백
  const isAutoSimulation = useMemo(() => {
    if (data?.isAutoSimulation === true) return true;
    return localStorage.getItem('esg_isAutoSimulation') === 'true';
  }, [data]);

  // Benchmark fallback 감지 — companyDataSource 우선, E 추출 실패 3건 이상 보조
  const isBenchmarkFallback = useMemo(() => {
    const src = data?.benchmarkComparison?.companyDataSource ?? data?.isBenchmarkFallback;
    if (src === true || src === 'BENCHMARK' || src === 'MOCK') return true;
    return (analysisSummary?.e?.failed ?? 0) >= (analysisSummary?.e?.total ?? 5);
  }, [data, analysisSummary]);

  // 신뢰도-점수 불일치 감지 (점수 높은데 confidence 낮은 경우)
  const confidenceMismatch = useMemo(() => {
    const score = data?.totalScore ?? 0;
    const conf  = data?.overallConfidence ?? 100;
    if (score >= 80 && conf < 50) return { score, conf };
    return null;
  }, [data]);

  // E evidence 전혀 없는 완전 benchmark fallback 감지
  const isFullBenchmark = useMemo(() => {
    if (!isBenchmarkFallback) return false;
    return (data?.evidenceMatches ?? []).filter(e => e.indicatorCode?.startsWith('E')).length === 0;
  }, [data, isBenchmarkFallback]);

  // 신뢰도는 백엔드 산출값 그대로 표시 — benchmark는 score/confidence에 개입하지 않음
  const adjustedConfidence = useMemo(() => {
    return data?.overallConfidence ?? 100;
  }, [data]);

  // Audit 조치 권고 목록 (즉시 조치 필요 섹션)
  const auditRecommendations = useMemo(() => {
    if (!data || isAutoSimulation) return [];
    const recs = [];
    const gBlocked = blockedIndicators.filter(([c]) => c.startsWith('G'));
    const sBlocked = blockedIndicators.filter(([c]) => c.startsWith('S'));
    const eFailed  = analysisSummary?.e?.failed ?? 0;
    const eTotal   = analysisSummary?.e?.total  ?? 5;
    const lowCnt   = verificationStats.lowCount;
    if (lowCnt >= 2)
      recs.push({ sev: 'HIGH', code: 'E-MISMATCH', title: '환경 데이터 수치 불일치', desc: `${lowCnt}개 환경(E) 지표에서 입력값과 증빙 수치 간 오차가 허용 범위를 초과합니다.` });
    else if (lowCnt === 1)
      recs.push({ sev: 'MED',  code: 'E-MISMATCH', title: '수치 불일치 주의',       desc: '1개 환경(E) 지표에서 입력값과 증빙 수치 간 차이가 발생했습니다. 해당 항목의 재검토를 권장합니다.' });
    if (eFailed >= eTotal && eTotal > 0)
      recs.push({ sev: 'HIGH', code: 'E-EXTRACT',  title: '수치 추출 실패',         desc: `환경(E) ${eFailed}개 지표 전체에서 수치 추출에 실패하여 업종 평균 기반 추정치가 적용되었습니다.` });
    else if (eFailed >= 3)
      recs.push({ sev: 'MED',  code: 'E-EXTRACT',  title: '부분 수치 추출 실패',   desc: `환경(E) ${eFailed}개 지표에서 수치 추출에 실패했습니다. 증빙 파일 포맷 및 데이터 기재 여부를 확인하세요.` });
    if (gBlocked.length >= 2)
      recs.push({ sev: 'HIGH', code: 'G-EVIDENCE', title: '지배구조 근거 부족',     desc: `${gBlocked.length}개 지배구조(G) 지표에서 AI 검증 근거가 검출되지 않았습니다. 관련 정책 문서를 보완하세요.` });
    else if (gBlocked.length === 1)
      recs.push({ sev: 'MED',  code: 'G-EVIDENCE', title: '지배구조 증빙 부족',     desc: '1개 지배구조(G) 지표에서 AI 검증 근거가 검출되지 않았습니다. 해당 정책 문서를 보완하세요.' });
    if (sBlocked.length >= 2)
      recs.push({ sev: 'MED',  code: 'S-EVIDENCE', title: '사회 지표 증빙 부족',   desc: `${sBlocked.length}개 사회(S) 지표에서 AI 검증 근거가 검출되지 않았습니다. 관련 보고서 내용을 보완하세요.` });
    else if (sBlocked.length === 1)
      recs.push({ sev: 'LOW',  code: 'S-EVIDENCE', title: '사회 지표 증빙 미흡',   desc: '1개 사회(S) 지표에서 AI 검증 근거 검출이 미흡합니다. 문서 보완 시 점수 향상 가능합니다.' });
    if (isBenchmarkFallback && !isFullBenchmark && recs.every(r => r.code !== 'E-EXTRACT'))
      recs.push({ sev: 'LOW',  code: 'E-BENCHMARK', title: '업종 평균 추정 적용', desc: '일부 환경(E) 지표에 업종 평균 추정치가 적용되었습니다. 실측 데이터 제출 시 정확도가 향상됩니다.' });
    return recs.slice(0, 5);
  }, [data, isAutoSimulation, blockedIndicators, analysisSummary, verificationStats, isBenchmarkFallback, isFullBenchmark]);

  // ── 로딩 ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="flex flex-col items-center gap-5">
        <div className="w-14 h-14 rounded-2xl border border-gray-200 flex items-center justify-center bg-white shadow-sm">
          <Loader2 size={22} className="text-emerald-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-gray-700">분석 결과 로딩 중</p>
          <p className="text-[12px] text-gray-400 mt-1">잠시만 기다려 주세요</p>
        </div>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100">
          <AlertCircle size={22} className="text-red-400" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-gray-700">{error ?? '결과를 불러올 수 없습니다.'}</p>
          <p className="text-[12px] text-gray-400 mt-1">분석 ID: {analysisId}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-[12px] text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> 돌아가기
        </button>
      </div>
    </div>
  );

  const d               = data;
  const gradeAccentColor = GRADE_COLOR[d.finalGrade] ?? '#52525b';

  // Hero 파생 값
  const evidenceCovPct = completeIndicatorList.length > 0
    ? Math.round(completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length / completeIndicatorList.length * 100)
    : 0;
  const auditStatus = isAutoSimulation
    ? 'SIMULATION'
    : isBenchmarkFallback
    ? 'ESTIMATED'
    : verificationStats.lowCount === 0 && adjustedConfidence >= 65 && blockedIndicators.length === 0
    ? 'VERIFIED'
    : 'PARTIAL';

  // EcoPoint 관련 파생 값
  const hasEco         = d.ecoPoints > 0 || d.carbonReductionKg > 0;
  const sScoreBefore   = d.sScoreBefore   ?? null;
  const sScoreAfter    = d.sScoreAfter    ?? (hasEco ? d.sScore : null);
  const ecoScoreBonus  = d.ecoScoreBonus  ?? (sScoreBefore != null && sScoreAfter != null ? sScoreAfter - sScoreBefore : null);
  const participantCnt = d.participantCount ?? null;
  const hasBeforeAfter = sScoreBefore != null && sScoreAfter != null;
  const finalSummary   = buildFinalSummary({
    finalGrade:          d.finalGrade,
    confidence:          d.overallConfidence,
    lowCount:            d.lowMismatchCount ?? verificationStats.lowCount,
    avgDiff:             verificationStats.avgDiff,
    evidenceCount:       d.evidenceCount,
    isBenchmarkFallback,
    isFullBenchmark,
  });

  return (
    <>
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-5">

        {/* ── 뒤로가기 + Demo + PDF ─────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={13} /> 이전으로
          </button>
          <div className="flex items-center gap-2">
            {IS_DEV && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-900/20 border border-purple-700/30">
                <PlayCircle size={11} className="text-purple-400 shrink-0" />
                <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider mr-0.5">Demo</span>
                {[
                  { key: 'good',             label: 'GOOD',    shortcut: '1', cls: 'bg-emerald-900/30 border-emerald-600/30 text-emerald-300 hover:bg-emerald-800/40' },
                  { key: 'warning',          label: 'WARN',    shortcut: '2', cls: 'bg-amber-900/30   border-amber-600/30   text-amber-300   hover:bg-amber-800/40' },
                  { key: 'missing-evidence', label: 'MISSING', shortcut: '3', cls: 'bg-red-900/30     border-red-600/30     text-red-300     hover:bg-red-800/40' },
                ].map(({ key, label, shortcut, cls }) => (
                  <button key={key} onClick={() => handleDemoRun(key)} title={`Shortcut: ${shortcut}`}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${cls} ${demoLabel === key ? 'ring-1 ring-white/20' : ''}`}>
                    {label}
                    <span className="text-[8px] opacity-50 font-mono">[{shortcut}]</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handlePdfExport}
              disabled={isPdfLoading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-xs font-semibold text-gray-700 hover:text-gray-900 shadow-sm transition-all duration-150 disabled:opacity-50"
            >
              {isPdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              PDF 다운로드
            </button>
          </div>
        </div>
        {demoLabel && IS_DEV && (() => {
          const evs  = completeIndicatorList;   // NO_EVIDENCE 합성 포함
          const conf = d?.overallConfidence ?? 0;
          const verifiedCnt = evs.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
          const weakCnt     = evs.filter(e => getVerificationStatus(e) === 'WEAK').length;
          const contradictCnt = evs.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length;
          const avgSim = evs.filter(e => e.similarity != null).length > 0
            ? Math.round(evs.reduce((s, e) => s + (toPct(e.similarity) ?? 0), 0) / evs.filter(e => e.similarity != null).length)
            : 0;
          const META = {
            'good':             { label: '정상',     cls: 'bg-emerald-900/20 border-emerald-700/30', textCls: 'text-emerald-300', scenario: '강한 ESG 문서 업로드 — A/S 등급' },
            'warning':          { label: '주의',     cls: 'bg-amber-900/20   border-amber-700/30',   textCls: 'text-amber-300',   scenario: '체크리스트 + 약한 PDF — C/B 등급' },
            'missing-evidence': { label: '증빙 없음', cls: 'bg-red-900/20     border-red-700/30',     textCls: 'text-red-300',     scenario: '증빙 없음 — D 등급 / 벤치마크' },
          };
          const m = META[demoLabel] ?? META['good'];
          return (
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${m.cls} flex-wrap`}>
              <div className="flex items-center gap-2">
                <PlayCircle size={11} className={`${m.textCls} shrink-0 animate-pulse`} />
                <span className={`text-[10px] font-black uppercase tracking-widest font-mono ${m.textCls}`}>◉ DEMO</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono ${m.textCls} border-current`}>{m.label}</span>
                <span className="text-[9px] text-gray-500">{m.scenario}</span>
              </div>
              {/* Live metrics display */}
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <span className="text-[9px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold">
                  ✓ {verifiedCnt} 검증 완료
                </span>
                {weakCnt > 0 && (
                  <span className="text-[9px] font-mono bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded font-bold">
                    ~ {weakCnt} 근거 부족
                  </span>
                )}
                {contradictCnt > 0 && (
                  <span className="text-[9px] font-mono bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded font-bold">
                    ✕ {contradictCnt} contradiction
                  </span>
                )}
                {avgSim > 0 && (
                  <span className="text-[9px] font-mono bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                    avg sim {avgSim}%
                  </span>
                )}
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-bold ${
                  conf >= 70 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : conf >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  conf {conf}%
                </span>
              </div>
              <button onClick={() => setDemoLabel(null)} className="text-[9px] text-gray-400 hover:text-gray-700 transition-colors font-mono shrink-0">
                ✕
              </button>
            </div>
          );
        })()}

        {/* ── Hero 헤더 ─────────────────────────────────────── */}
        <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${gradeAccentColor} 0%, transparent 60%)` }} />
          <div className="absolute top-0 left-0 w-64 h-32 pointer-events-none" style={{ background: `radial-gradient(ellipse at 0% 0%, ${gradeAccentColor}10 0%, transparent 70%)` }} />

          {/* ── AI Audit Summary Header ── */}
          <div className="relative px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${gradeAccentColor}15` }}>
                <Cpu size={14} style={{ color: gradeAccentColor }} />
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-400">AI ESG 자동 진단 결과</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5 truncate max-w-[300px]">
                  {d.companyName ?? 'ESG 분석 결과'}
                  {d.industry && <span className="text-gray-400 font-normal ml-2 text-xs">· {d.industry}</span>}
                </p>
              </div>
            </div>
            {/* Audit Status Badge */}
            {(() => {
              const STATUS_CFG = {
                VERIFIED:   { label: '검증 완료',       cls: 'bg-emerald-50 border-emerald-400 text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
                PARTIAL:    { label: '일부 검증',       cls: 'bg-amber-50 border-amber-400 text-amber-700',       dot: 'bg-amber-500' },
                ESTIMATED:  { label: '업종 평균 추정',  cls: 'bg-orange-50 border-orange-400 text-orange-700',    dot: 'bg-orange-500' },
                SIMULATION: { label: '사전 진단',       cls: 'bg-gray-100 border-gray-300 text-gray-600',         dot: 'bg-gray-400' },
              };
              const s = STATUS_CFG[auditStatus] ?? STATUS_CFG.PARTIAL;
              return (
                <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border font-bold text-[11px] tracking-wide whitespace-nowrap ${s.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                  {s.label}
                </div>
              );
            })()}
          </div>

          {/* ── 4 KPI Metrics Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-b border-gray-100">
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">ESG 등급</p>
              <div className="flex items-baseline gap-2">
                <span className="kpi-number" style={{ color: gradeAccentColor, fontSize: '2.5rem' }}>
                  {d.finalGrade ?? '—'}
                </span>
                {d.gradeCeilingApplied && !isAutoSimulation && (
                  <span className="badge badge-high" style={{ fontSize: '10px' }}>제한</span>
                )}
              </div>
              <p className="kpi-sublabel mt-2">{isAutoSimulation ? 'Simulation' : 'K-ESG 기준'}</p>
            </div>
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">종합 점수</p>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="kpi-number" style={{ color: (d.totalScore ?? 0) >= 70 ? '#059669' : (d.totalScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444', fontSize: '2.5rem' }}>
                  {d.totalScore ?? 0}
                </span>
                <span className="text-[13px] text-gray-400 font-medium mb-0.5">/ 100</span>
              </div>
              <ScoreProgressBar score={d.totalScore ?? 0} color={(d.totalScore ?? 0) >= 70 ? '#059669' : (d.totalScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444'} height="h-1.5" />
            </div>
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">분석 신뢰도</p>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="kpi-number" style={{ color: adjustedConfidence >= 65 ? '#059669' : adjustedConfidence >= 50 ? '#f59e0b' : '#ef4444', fontSize: '2.5rem' }}>
                  {adjustedConfidence}
                </span>
                <span className="text-[13px] text-gray-400 font-medium mb-0.5">%</span>
              </div>
              <ScoreProgressBar score={adjustedConfidence} color={adjustedConfidence >= 65 ? '#059669' : adjustedConfidence >= 50 ? '#f59e0b' : '#ef4444'} height="h-1.5" />
            </div>
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">AI 검증 현황</p>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="kpi-number" style={{ color: evidenceCovPct >= 70 ? '#059669' : evidenceCovPct >= 50 ? '#f59e0b' : '#ef4444', fontSize: '2.5rem' }}>
                  {evidenceCovPct}
                </span>
                <span className="text-[13px] text-gray-400 font-medium mb-0.5">%</span>
              </div>
              {(() => {
                const verified = completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
                const detected = completeIndicatorList.filter(e => getVerificationStatus(e) !== 'NO_EVIDENCE').length;
                const noEv     = completeIndicatorList.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length;
                return (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[11px] text-emerald-600 font-medium">검증 완료 {verified}건</p>
                    <p className="text-[11px] text-gray-400">근거 탐지 {detected}건</p>
                    <p className="text-[11px] text-gray-400">미검출 {noEv}건</p>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="relative px-8 py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono" style={{ color: gradeAccentColor, borderColor: `${gradeAccentColor}40`, background: `${gradeAccentColor}10` }}>
                  K-ESG
                </span>
                {isAutoSimulation ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 border-amber-200 text-amber-700">
                    업종 평균 사전 진단
                  </span>
                ) : verificationMode === 'hybrid' ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide bg-emerald-50 border-emerald-200 text-emerald-700">
                    통합 ESG 검증
                  </span>
                ) : verificationMode === 'numeric' ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide bg-sky-50 border-sky-200 text-sky-700">
                    수치 검증
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide bg-gray-100 border-gray-200 text-gray-500">
                    AI 문맥 분석
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight truncate">
                {d.companyName ?? '기업 ESG 분석 결과'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                {d.industry && (
                  <span className="flex items-center gap-1"><Building2 size={11} className="shrink-0" />{d.industry}</span>
                )}
                {isAutoSimulation ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-amber-500/15 text-amber-400 border-amber-500/30">
                    <AlertTriangle size={10} className="shrink-0" />
                    업종 평균 사전 진단 · AI 분석 미수행
                  </span>
                ) : d.overallConfidence != null && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                    adjustedConfidence < 40 ? 'bg-red-500/15 text-red-400 border-red-500/30'
                    : adjustedConfidence < 65 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  }`}>
                    <Shield size={10} className="shrink-0" />
                    분석 신뢰도 {adjustedConfidence}%
                    {adjustedConfidence < d.overallConfidence && (
                      <span className="text-gray-400 font-mono text-[8px] ml-0.5">(raw:{d.overallConfidence}%)</span>
                    )}
                    <ConfidenceTooltip />
                  </span>
                )}
                {d.analyzedAt && (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Clock size={10} className="shrink-0" />
                    {d.analyzedAt.replace('T', ' ').slice(0, 19)}
                    {d.processingTimeMs != null && (
                      <span className="ml-1 text-gray-400">· {(d.processingTimeMs / 1000).toFixed(1)}s</span>
                    )}
                  </span>
                )}
              </div>
              {/* 등급 해석 텍스트 */}
              {d.finalGrade && GRADE_DESCRIPTION[d.finalGrade] && (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-gray-500">
                  <Info size={11} className="text-gray-400 shrink-0" />
                  {GRADE_DESCRIPTION[d.finalGrade]}
                </p>
              )}
              {/* 최종 평가 요약 */}
              {finalSummary && (
                <div className={`mt-3 px-4 py-2.5 rounded-xl border text-sm leading-relaxed ${
                  finalSummary.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  finalSummary.tone === 'amber'   ? 'bg-amber-50  border-amber-200  text-amber-800'    :
                  finalSummary.tone === 'red'     ? 'bg-red-50    border-red-200    text-red-700'      :
                                                    'bg-gray-50   border-gray-200   text-gray-700'
                }`}>
                  {finalSummary.text}
                  {finalSummary.gradeAdjusted && (
                    <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 border-amber-300 text-amber-700 align-middle">
                      등급 보정 적용
                    </span>
                  )}
                </div>
              )}
              {/* AUTO SIMULATION disclaimer */}
              {isAutoSimulation && (
                <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-r-xl border border-l-0 bg-amber-50 border-amber-200"
                  style={{ borderLeft: '3px solid #f59e0b' }}>
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-0.5">업종 벤치마크 기반 사전 진단</p>
                    <p className="text-[10px] text-amber-600 leading-relaxed">
                      본 결과는 실제 ESG 문서 분석이 수행되지 않은 업종 평균 기반 사전 진단입니다.
                      AI 문맥 분석·신뢰도 산정 파이프라인이 실행되지 않은 시뮬레이션 결과로,
                      실제 ESG 인증 또는 공시 목적으로 활용할 수 없습니다.
                    </p>
                  </div>
                </div>
              )}
              {/* TOP ISSUE 패널 — SaaS audit alert 스타일 (MANUAL only) */}
              {!isAutoSimulation && topIssue && (
                <div
                  className={`mt-3 flex items-start gap-3 px-4 py-3 rounded-r-xl border border-l-0 ${
                    topIssue.tone === 'red'     ? 'bg-red-50   border-red-200'     :
                    topIssue.tone === 'amber'   ? 'bg-amber-50 border-amber-200'   :
                    topIssue.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200' :
                                                  'bg-gray-50  border-gray-200'
                  }`}
                  style={{ borderLeft: `3px solid ${
                    topIssue.tone === 'red'     ? '#ef4444' :
                    topIssue.tone === 'amber'   ? '#f59e0b' :
                    topIssue.tone === 'emerald' ? '#059669' :
                                                  '#9ca3af'
                  }` }}
                >
                  <div className="shrink-0 mt-0.5">
                    {topIssue.tone === 'red'     && <AlertTriangle size={13} className="text-red-500" />}
                    {topIssue.tone === 'amber'   && <AlertTriangle size={13} className="text-amber-500" />}
                    {topIssue.tone === 'emerald' && <CheckCircle2 size={13} className="text-emerald-500" />}
                    {topIssue.tone === 'zinc'    && <Info size={13} className="text-gray-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold text-gray-400">핵심 이슈</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                        topIssue.tone === 'red'     ? 'bg-red-100   border-red-200   text-red-700'     :
                        topIssue.tone === 'amber'   ? 'bg-amber-100 border-amber-200 text-amber-700'   :
                        topIssue.tone === 'emerald' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
                                                      'bg-gray-100  border-gray-200  text-gray-600'
                      }`}>{topIssue.title}</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${
                      topIssue.tone === 'red'     ? 'text-red-600'     :
                      topIssue.tone === 'amber'   ? 'text-amber-700'   :
                      topIssue.tone === 'emerald' ? 'text-emerald-700' :
                                                    'text-gray-500'
                    }`}>{topIssue.msg}</p>
                  </div>
                </div>
              )}
              {/* 신뢰도-점수 불일치 경고 (MANUAL only) */}
              {!isAutoSimulation && confidenceMismatch && (
                <div className="mt-2 flex items-start gap-2.5 px-4 py-2.5 rounded-xl border bg-amber-50 border-amber-200">
                  <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    증빙 부족 상태에서 체크리스트 기반 점수가 반영되었습니다.
                    분석 신뢰도({confidenceMismatch.conf}%)과 종합 점수({confidenceMismatch.score}) 간 불일치가 존재합니다.
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <GradeBadge grade={d.finalGrade} size="lg" />
              {d.gradeCeilingApplied && !isAutoSimulation && (
                <span className="text-[9px] font-bold text-red-400 whitespace-nowrap">⚠ 검증 실패 등급 제한</span>
              )}
              {d.analyzedAt && (
                <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                  <Clock size={9} />
                  {d.analyzedAt.replace('T', ' ').slice(0, 16)}
                </div>
              )}
            </div>
          </div>
          {/* 분석 처리 시간 푸터 */}
          <div className="border-t border-gray-100 px-8 py-2.5 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Clock size={9} className="shrink-0" />
              {d.processingTimeMs != null
                ? `분석 소요 시간 ${(d.processingTimeMs / 1000).toFixed(1)}초`
                : `분석 완료 · ${(d.analyzedAt ?? '').replace('T', ' ').slice(0, 16)}`}
            </span>
            {d.ocrFallback === true && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold bg-amber-50 border-amber-200 text-amber-600">
                ⚠ OCR 제한
              </span>
            )}
            <span className="ml-auto text-[10px] font-mono text-gray-300">ID: {analysisId}</span>
          </div>
        </div>

        {/* ── 시스템 배너 — AUTO: 사전 진단 / MANUAL: RAG 검증 ─────── */}
        {isAutoSimulation ? (
          <div className="flex items-start gap-4 px-5 py-4 rounded-xl border"
            style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.06) 0%, rgba(120,53,15,0.03) 100%)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={15} className="text-amber-400" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-700 mb-1">ESG 사전 진단 결과</p>
              <p className="text-xs text-gray-500 leading-relaxed mb-2.5">
                본 결과는 실제 ESG 문서 분석이 수행되지 않은 업종 평균 기반 사전 진단입니다.
                문서 OCR·AI 문맥 분석·증빙 매핑 파이프라인은 실행되지 않았습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                  <BarChart2 size={10} className="shrink-0" /> E · 업종 벤치마크 추정
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
                  <Hash size={10} className="shrink-0" /> S/G · 체크리스트 기반 평가
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600">
                  <X size={10} className="shrink-0" /> AI 문서 분석 미수행
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl border bg-white border-gray-200 shadow-sm">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 size={13} className="text-emerald-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-700">AI 자동 ESG 진단 완료</p>
              <p className="text-xs text-gray-400 mt-0.5">
                환경(E) 수치 검증 · 사회(S)/지배구조(G) AI 문맥 분석 · K-ESG 기준 자동 평가
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                <BarChart2 size={10} className="shrink-0" /> 수치 검증
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
                <Hash size={10} className="shrink-0" /> AI 문맥 분석
              </span>
            </div>
          </div>
        )}

        {/* ── E / S / G 스코어 카드 ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['E', 'S', 'G']).map((cat) => {
            const score   = cat === 'E' ? d.eScore : cat === 'S' ? d.sScore : d.gScore;
            const radarPt = d.esgChart?.radar?.find(r => r.category === cat);
            const color   = ESG_COLOR[cat];
            const Icon    = ESG_ICON[cat];
            const safe    = score ?? 0;
            return (
              <div key={cat} className="relative bg-white border border-gray-200 rounded-2xl p-6 overflow-hidden hover:border-gray-300 transition-all duration-200 group shadow-sm">
                <div className="absolute top-0 left-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: color }} />
                <div className="absolute bottom-0 left-0 right-0 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ background: `linear-gradient(0deg, ${color}08 0%, transparent 100%)` }} />
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                      <Icon size={17} style={{ color }} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color }}>
                          {cat === 'E' ? 'Environmental' : cat === 'S' ? 'Social' : 'Governance'}
                        </p>
                        {cat === 'E' && isFullBenchmark && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-amber-50 border-amber-300 text-amber-700 font-mono uppercase tracking-wider">
                            추정
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-700 leading-none mt-0.5">
                        {cat === 'E'
                          ? (isBenchmarkFallback ? '환경(E) 추정 점수' : '환경')
                          : cat === 'S' ? '사회' : '지배구조'}
                      </p>
                    </div>
                  </div>
                  <GradeBadge grade={radarPt?.grade} />
                </div>
                <div className="mb-3">
                  <span className="kpi-number" style={{ fontSize: '2.25rem', color: safe >= 70 ? color : safe >= 50 ? '#f59e0b' : '#ef4444' }}>{safe}</span>
                  <span className="text-sm text-gray-400 ml-1">점</span>
                </div>
                <ScoreProgressBar
                  score={safe}
                  color={cat === 'E' && isBenchmarkFallback ? '#f59e0b' : color}
                  height="h-2"
                  estimated={cat === 'E' && isBenchmarkFallback}
                />
                <div className="flex items-center justify-between mt-2">
                  {cat === 'E' && isBenchmarkFallback && (analysisSummary?.e?.failed ?? 0) >= (analysisSummary?.e?.total ?? 5)
                    ? <span className="text-[9px] font-bold text-amber-600 font-mono uppercase tracking-wider">수치 추출 실패</span>
                    : <p className="text-[10px] text-gray-500 tabular-nums">{safe} / 100</p>
                  }
                  {/* 검증 방법 라벨 */}
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    isAutoSimulation && cat === 'E'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : cat === 'E'
                        ? isFullBenchmark
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : isBenchmarkFallback
                          ? 'bg-amber-50 border-amber-200 text-amber-600'
                          : 'bg-sky-50 border-sky-200 text-sky-700'
                        : isAutoSimulation
                        ? 'bg-gray-100 border-gray-200 text-gray-500'
                        : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}>
                    {cat === 'E'
                      ? isAutoSimulation
                        ? '업종 시뮬레이션'
                        : isFullBenchmark
                        ? '업종 평균 추정 분석'
                        : isBenchmarkFallback ? '업종 평균 추정' : '수치 검증'
                      : isAutoSimulation ? '체크리스트 기반' : 'AI 문맥 분석'}
                  </span>
                </div>
                {cat === 'E' && (isAutoSimulation || isBenchmarkFallback) && (
                  <div className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle size={10} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[9px] text-amber-600 leading-relaxed">
                      {isAutoSimulation
                        ? '업종 평균 기반 ESG 사전 진단입니다. 실제 AI 문서 분석은 수행되지 않았습니다.'
                        : isFullBenchmark
                        ? '실제 환경 증빙 검증이 아닌 업종 벤치마크 기반 추정 평가입니다.'
                        : '실측 환경 데이터 검증이 아닌 업종 벤치마크 기반 추정 평가입니다.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 점수 보정 안내 ───────────────────────────────── */}
        {!isAutoSimulation && d.eScore != null && d.totalScore != null && Math.abs(d.totalScore - Math.round(d.eScore * 0.4 + (d.sScore ?? 0) * 0.3 + (d.gScore ?? 0) * 0.3)) > 2 && (
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700">
            <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">최종 종합 분석 과정에서 업종 가중치 및 전체 ESG 밸런스 보정이 적용되었습니다.</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                E · S · G 카테고리 점수와 최종 종합 점수가 다를 수 있습니다. 이는 업종 특성 가중치 반영, 전체 ESG 밸런스 조정,
                증빙 품질 반영 등의 보정 과정이 적용되었기 때문입니다.
              </p>
            </div>
          </div>
        )}

        {/* ── 핵심 리스크 (항상 표시 · 탭 위) ───────────────── */}
        {auditRecommendations.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
              <span className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={13} className="text-red-500" />
              </span>
              <span className="text-sm font-semibold text-gray-800">즉시 조치 필요</span>
            </div>
            <div className="divide-y divide-gray-100">
              {auditRecommendations.slice(0, 3).map((rec, i) => {
                const SEV = {
                  HIGH: { cls: 'bg-red-50 text-red-700 border-red-200',     dot: 'bg-red-500',    label: 'HIGH' },
                  MED:  { cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'MED' },
                  LOW:  { cls: 'bg-gray-100 text-gray-600 border-gray-200',  dot: 'bg-gray-400',  label: 'LOW' },
                };
                const s = SEV[rec.sev] ?? SEV.LOW;
                return (
                  <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <span className={`mt-0.5 shrink-0 text-[9px] font-black px-2 py-0.5 rounded border tracking-wider ${s.cls}`}>{s.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-gray-800 mb-0.5">{rec.title}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{rec.desc}</p>
                    </div>
                    <span className="text-[9px] font-mono text-gray-300 shrink-0 mt-0.5 hidden sm:block">{rec.code}</span>
                  </div>
                );
              })}
            </div>
            {auditRecommendations.length === 0 && (
              <div className="px-5 py-4 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <p className="text-sm text-emerald-700 font-medium">즉각 조치가 필요한 항목이 없습니다.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Result Tab Navigation ───────────────────────── */}
        <div className="flex items-center gap-0 border-b border-gray-200 -mx-8 px-8 overflow-x-auto">
          {[
            {
              id: 'summary',
              label: '요약',
              badge: auditRecommendations.filter(r => r.sev === 'HIGH').length > 0
                ? { count: auditRecommendations.filter(r => r.sev === 'HIGH').length, cls: 'bg-red-50 text-red-600 border border-red-200' }
                : null,
            },
            {
              id: 'evidence',
              label: '증빙 분석',
              badge: { count: `${completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length}/${completeIndicatorList.length}`, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
            },
            {
              id: 'benchmark',
              label: '업종 비교',
              badge: benchMetrics.length > 0 ? { count: benchMetrics.length, cls: 'bg-gray-100 text-gray-600 border border-gray-200' } : null,
            },
            { id: 'ai-report', label: 'AI 리포트' },
            { id: 'audit-log', label: '분석 로그' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchParams({ tab: tab.id }, { replace: true });
              }}
              className={[
                'flex items-center gap-2 px-4 py-3.5 text-[13px] font-medium border-b-2 -mb-px transition-all duration-150 whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label}
              {tab.badge && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-opacity duration-150 ${tab.badge.cls}`}>
                  {tab.badge.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 섹션 앵커 (hash scroll 대상) */}
        <div id="section-summary" />

        {/* ── 수치 검증 실패 경고 배너 ─────────────────────── */}
        {(d.lowMismatchCount > 0) && activeTab === 'summary' && (
          <div className="flex items-start gap-3 rounded-2xl border px-5 py-4 bg-red-50 border-red-200">
            <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-red-700">
                  {d.lowMismatchCount >= 4 ? '심각한 수치 불일치 감지' : '수치 불일치 감지'}
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                  검증 실패 {d.lowMismatchCount}건
                </span>
                {d.gradeCeilingApplied && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700">
                    등급 제한 적용
                  </span>
                )}
              </div>
              <p className="text-xs text-red-600 mt-1">
                {d.lowMismatchCount >= 4
                  ? `입력한 ESG 환경 데이터 ${d.lowMismatchCount}개 항목이 증빙 문서 수치와 심각하게 불일치합니다.`
                  : `입력한 ESG 환경 데이터가 증빙 문서 수치와 일치하지 않는 항목이 있습니다.`}
                {d.gradeCeilingApplied && (
                  <span className="ml-2 font-semibold text-amber-700">
                    수치 검증 실패로 등급 제한이 적용되었습니다.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── 입력값 vs 증빙값 비교 테이블 (E 카테고리) ──────── */}
        {numericRows.length > 0 && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setShowNumericDetail(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                <BarChart2 size={14} className="text-sky-500" />
              </span>
              <span className="text-sm font-semibold text-gray-700">수치 검증 상세</span>
              <span className="text-[10px] text-gray-400 ml-1">— E 카테고리 입력값 vs 증빙값 비교</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                  {numericRows.length}개 항목
                </span>
                {showNumericDetail ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </span>
            </button>
            {showNumericDetail && <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['지표명', '입력값', '문서 추출값', '오차율', '판정'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {numericRows.map((ev, i) => {
                    const diff = ev.numericDiffPercent ?? 0;
                    const diffColor = diff <= 5 ? '#059669' : diff <= 20 ? '#f59e0b' : '#ef4444';
                    const ms = MATCH_STYLE[ev.numericMatchLevel] ?? MATCH_STYLE.LOW;
                    return (
                      <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                        onClick={() => setSelectedEvidence(ev)}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-gray-400 shrink-0">{ev.indicatorCode}</span>
                            <span className="text-gray-700 font-medium truncate max-w-[140px]">{ev.indicatorTitle ?? '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800 tabular-nums whitespace-nowrap">
                          {ev.inputValue != null ? Number(ev.inputValue).toLocaleString() : '-'}
                          {ev.unit && <span className="text-gray-400 font-normal ml-1 text-[10px]">{ev.unit}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800 tabular-nums whitespace-nowrap">
                          {ev.extractedValue != null
                            ? <>{Number(ev.extractedValue).toLocaleString()}{ev.unit && <span className="text-gray-400 font-normal ml-1 text-[10px]">{ev.unit}</span>}</>
                            : <span className="text-gray-400 text-[10px] italic font-normal">비교 불가</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {ev.extractedValue != null ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black tabular-nums text-sm" style={{ color: diffColor }}>
                                {fmtDiff(diff)}
                              </span>
                              <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (diff / 40) * 100)}%`, background: diffColor }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {ev.extractedValue != null ? (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${ms.bg} ${ms.border} ${ms.text}`}>
                              {ms.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">
                              비교 불가
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
            {showNumericDetail && <div className="px-6 py-2.5 border-t border-gray-100">
              <p className="text-[10px] text-gray-400">클릭 시 상세 감사 정보를 확인할 수 있습니다. · HIGH ≤5% · MEDIUM ≤20% · LOW &gt;20%</p>
            </div>}
          </div>
        )}

        {/* ── 분석 제한 사항 안내 ─────────────────────────────── */}
        {limitationNotices.length > 0 && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-gray-100">
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <span className="text-sm font-semibold text-gray-700">분석 제한 사항</span>
              <span className="ml-auto text-[10px] text-gray-400 font-medium">분석 알림</span>
            </div>
            <div className="px-6 py-4 space-y-2.5">
              {limitationNotices.map((n, i) => (
                <div key={i} className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border ${
                  n.tone === 'amber'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <AlertCircle size={12} className={`shrink-0 mt-0.5 ${n.tone === 'amber' ? 'text-amber-500' : 'text-gray-400'}`} />
                  <p className={`text-xs leading-relaxed ${n.tone === 'amber' ? 'text-amber-700' : 'text-gray-500'}`}>{n.text}</p>
                </div>
              ))}
              <p className="text-[10px] text-gray-400 pt-1">
                본 분석 결과는 제출된 증빙 문서 및 입력값의 품질에 따라 정확도가 달라질 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* ── 점수 산정 해설 ────────────────────────────────── */}
        {analysisSummary && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {/* 헤더 — 클릭 시 펼침 */}
            <button
              onClick={() => setShowScoreDetail(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Info size={14} className="text-gray-500" />
              </span>
              <span className="text-sm font-semibold text-gray-700">카테고리별 점수 해설</span>
              <span className="text-[10px] text-gray-400 ml-1">— E · S · G 평가 근거 상세</span>
              <span className="ml-auto">{showScoreDetail ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}</span>
            </button>

            {showScoreDetail && <div className="px-6 py-5 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* ── E 환경 패널 ── */}
                {(() => {
                  const e = analysisSummary.e;
                  const toneColor = e.tone === 'red' ? '#ef4444' : e.tone === 'amber' ? '#f59e0b' : '#059669';
                  const toneBorder = e.tone === 'red' ? 'border-red-200' : e.tone === 'amber' ? 'border-amber-200' : 'border-emerald-200';
                  const summaryColor = e.tone === 'red' ? 'text-red-600' : e.tone === 'amber' ? 'text-amber-700' : 'text-gray-600';
                  const diffStr = fmtDiff(e.avgDiff);
                  const diffColor = e.avgDiff == null ? '#71717a'
                    : e.avgDiff <= 5 ? '#059669' : e.avgDiff <= 20 ? '#f59e0b' : '#ef4444';
                  const bullets = [
                    { label: 'HIGH 검증', value: `${e.high}건`, color: '#059669' },
                    { label: 'MEDIUM 검증', value: `${e.medium}건`, color: '#f59e0b' },
                    { label: 'LOW 불일치', value: `${e.low}건`, color: e.low > 0 ? '#ef4444' : '#52525b' },
                    ...(e.failed > 0 ? [{ label: '추출 실패', value: `${e.failed}건`, color: '#71717a' }] : []),
                    { label: '평균 오차율', value: diffStr, color: diffColor },
                  ];
                  return (
                    <div className={`rounded-xl border bg-gray-50 p-4 space-y-3 ${toneBorder}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Leaf size={13} style={{ color: ESG_COLOR.E }} />
                          <span className="text-xs font-bold" style={{ color: ESG_COLOR.E }}>환경(E)</span>
                          {isBenchmarkFallback && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">
                              업종 평균 추정
                            </span>
                          )}
                        </div>
                        <span className="text-xl font-black tabular-nums"
                          style={{ color: (d.eScore ?? 0) >= 70 ? ESG_COLOR.E : (d.eScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.eScore ?? 0}점
                        </span>
                      </div>
                      {e.failed >= e.total && e.total > 0 && (
                        <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                          <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-700 leading-relaxed">
                            실측 수치 추출 실패 — 업종 평균 기반 추정 평가 적용
                          </p>
                        </div>
                      )}
                      <ul className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-center justify-between text-sm leading-relaxed">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-semibold tabular-nums" style={{ color: b.color }}>{b.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`text-xs leading-relaxed border-t border-gray-200 pt-2.5 ${summaryColor}`}>
                        {e.summary}
                      </p>
                    </div>
                  );
                })()}

                {/* ── S 사회 패널 ── */}
                {(() => {
                  const s = analysisSummary.s;
                  const toneColor = s.tone === 'red' ? '#ef4444' : s.tone === 'amber' ? '#f59e0b' : '#059669';
                  const toneBorder = s.tone === 'red' ? 'border-red-200' : s.tone === 'amber' ? 'border-amber-200' : 'border-gray-200';
                  const summaryColor = s.tone === 'red' ? 'text-red-600' : s.tone === 'amber' ? 'text-amber-700' : 'text-gray-600';
                  const bullets = [
                    { label: '증빙 검출 지표', value: `${s.withEvidence} / ${s.total}개`, color: s.withEvidence === s.total ? '#059669' : '#f59e0b' },
                    { label: '미검출 지표', value: `${s.missing}개`, color: s.missing > 0 ? '#ef4444' : '#52525b' },
                    { label: '낮은 신뢰 근거', value: `${s.lowConf}건`, color: s.lowConf > 0 ? '#f59e0b' : '#52525b' },
                    { label: '분석 방식', value: 'AI 문맥 분석', color: '#38bdf8' },
                  ];
                  return (
                    <div className={`rounded-xl border bg-gray-50 p-4 space-y-3 ${toneBorder}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Users size={13} style={{ color: ESG_COLOR.S }} />
                          <span className="text-xs font-bold" style={{ color: ESG_COLOR.S }}>사회(S)</span>
                        </div>
                        <span className="text-xl font-black tabular-nums"
                          style={{ color: (d.sScore ?? 0) >= 70 ? ESG_COLOR.S : (d.sScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.sScore ?? 0}점
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-center justify-between text-sm leading-relaxed">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-semibold" style={{ color: b.color }}>{b.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`text-xs leading-relaxed border-t border-gray-200 pt-2.5 ${summaryColor}`}>
                        {s.summary}
                      </p>
                      {s.hasUnsupported && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          일부 지표는 현재 AI 검증 지원 범위에 포함되지 않습니다.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* ── G 지배구조 패널 ── */}
                {(() => {
                  const g = analysisSummary.g;
                  const toneBorder = g.tone === 'red' ? 'border-red-200' : g.tone === 'amber' ? 'border-amber-200' : 'border-gray-200';
                  const summaryColor = g.tone === 'red' ? 'text-red-600' : g.tone === 'amber' ? 'text-amber-700' : 'text-gray-600';
                  const bullets = [
                    { label: '증빙 검출 지표', value: `${g.withEvidence} / ${g.total}개`, color: g.withEvidence === g.total ? '#059669' : '#f59e0b' },
                    { label: '미검출 지표', value: `${g.missing}개`, color: g.missing > 0 ? '#ef4444' : '#52525b' },
                    { label: '낮은 신뢰 근거', value: `${g.lowConf}건`, color: g.lowConf > 0 ? '#f59e0b' : '#52525b' },
                    { label: '분석 방식', value: 'AI 문맥 분석', color: '#38bdf8' },
                  ];
                  return (
                    <div className={`rounded-xl border bg-gray-50 p-4 space-y-3 ${toneBorder}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={13} style={{ color: ESG_COLOR.G }} />
                          <span className="text-xs font-bold" style={{ color: ESG_COLOR.G }}>지배구조(G)</span>
                        </div>
                        <span className="text-xl font-black tabular-nums"
                          style={{ color: (d.gScore ?? 0) >= 70 ? ESG_COLOR.G : (d.gScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.gScore ?? 0}점
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-center justify-between text-sm leading-relaxed">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-semibold" style={{ color: b.color }}>{b.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`text-xs leading-relaxed border-t border-gray-200 pt-2.5 ${summaryColor}`}>
                        {g.summary}
                      </p>
                      {g.hasUnsupported && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          일부 지표는 현재 AI 검증 지원 범위에 포함되지 않습니다.
                        </p>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>}
          </div>
        )}

        {/* ── 즉시 조치 필요 (summary 탭 — 전체 목록) ─────────── */}
        {auditRecommendations.length > 0 && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setShowFullRecommendations(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-red-500" />
              </span>
              <span className="text-sm font-semibold text-gray-800">상세 조치 사항</span>
              <span className="text-[10px] text-gray-400 ml-1">— 항목별 개선 방향 상세</span>
              <span className="ml-auto flex items-center gap-2">
                {auditRecommendations.filter(r => r.sev === 'HIGH').length > 0 && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                    긴급 {auditRecommendations.filter(r => r.sev === 'HIGH').length}
                  </span>
                )}
                {auditRecommendations.filter(r => r.sev === 'MED').length > 0 && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700">
                    권장 {auditRecommendations.filter(r => r.sev === 'MED').length}
                  </span>
                )}
                {showFullRecommendations ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </span>
            </button>
            {showFullRecommendations && <div className="divide-y divide-gray-100 border-t border-gray-100">
              {auditRecommendations.map((rec, i) => {
                const SEV = {
                  HIGH: {
                    leftBar: 'bg-red-500',
                    badge: 'bg-red-50 border-red-300 text-red-700',
                    icon: <AlertTriangle size={14} className="text-red-500 shrink-0" />,
                    action: '즉시 수정 필요',
                    actionCls: 'bg-red-50 text-red-600 border-red-200',
                  },
                  MED: {
                    leftBar: 'bg-amber-400',
                    badge: 'bg-amber-50 border-amber-300 text-amber-700',
                    icon: <AlertCircle size={14} className="text-amber-500 shrink-0" />,
                    action: '개선 권장',
                    actionCls: 'bg-amber-50 text-amber-600 border-amber-200',
                  },
                  LOW: {
                    leftBar: 'bg-gray-300',
                    badge: 'bg-gray-50 border-gray-200 text-gray-500',
                    icon: <Info size={14} className="text-gray-400 shrink-0" />,
                    action: '참고 사항',
                    actionCls: 'bg-gray-50 text-gray-500 border-gray-200',
                  },
                };
                const s = SEV[rec.sev] ?? SEV.LOW;
                return (
                  <div key={i} className="flex items-stretch">
                    {/* severity left bar */}
                    <div className={`w-1 shrink-0 ${s.leftBar}`} />
                    <div className="flex items-start gap-3 px-5 py-4 flex-1 min-w-0">
                      {s.icon}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded border tracking-wider ${s.badge}`}>
                            {rec.sev === 'HIGH' ? '긴급' : rec.sev === 'MED' ? '권장' : '참고'}
                          </span>
                          <span className="text-[10px] font-mono text-gray-300">{rec.code}</span>
                          <span className="text-[13px] font-semibold text-gray-800">{rec.title}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{rec.desc}</p>
                        <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded border ${s.actionCls}`}>
                          {s.action}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-200 shrink-0 mt-0.5 hidden sm:block">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                  </div>
                );
              })}
              {auditRecommendations.length === 0 && (
                <div className="px-6 py-5 flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-500" />
                  <p className="text-sm text-emerald-700 font-medium">즉각 조치가 필요한 항목이 없습니다.</p>
                </div>
              )}
            </div>}
          </div>
        )}

        {/* ── 증빙 부족 항목 (S/G 미감지 지표) ──────────────── */}
        {blockedIndicators.length > 0 && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setShowBlockedDetail(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-amber-500" />
              </span>
              <span className="text-sm font-semibold text-gray-700">증빙 부족 S/G 지표</span>
              <span className="text-[10px] text-gray-400 ml-1">— 관련 문서 추가 시 점수 향상 가능</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                  {blockedIndicators.length}건
                </span>
                {showBlockedDetail ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </span>
            </button>
            {showBlockedDetail && <div className="px-6 py-5 space-y-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 leading-relaxed">
                체크리스트에 선택되었지만 제출 PDF 내에서 AI 검증 근거가 확인되지 않은 S/G 지표입니다.
                증빙 문서에 해당 내용을 추가하면 점수가 향상될 수 있습니다.
              </p>
              <div className="space-y-2">
                {blockedIndicators.map(([code, title]) => (
                  <div key={code}
                    className="flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                      <span className="text-[10px] font-bold font-mono text-gray-400 shrink-0 w-14">{code}</span>
                      <span className="text-xs text-gray-700 flex-1">{title}</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-red-50 border-red-200 text-red-600 whitespace-nowrap shrink-0">
                        미감지
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 pl-6 leading-relaxed">
                      PDF 내 AI 검증 근거 미검출 — 체크리스트 기반 평가 적용
                    </p>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        )}

        {/* ── [3] EcoPoint 시각화 ───────────────────────────── */}
        {hasEco && activeTab === 'summary' && (
          <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-emerald-100 bg-emerald-50/50">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Zap size={15} className="text-emerald-600" />
              </span>
              <span className="text-sm font-semibold text-emerald-700">EcoPoint 반영 결과</span>
              {ecoScoreBonus != null && ecoScoreBonus > 0 && (
                <span className="ml-auto text-xs font-black px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  S +{ecoScoreBonus}
                </span>
              )}
            </div>

            <div className="px-6 py-5">
              {/* 주요 메트릭 행 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                {d.ecoPoints > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">에코 포인트</p>
                    <p className="text-2xl font-black text-emerald-700 tabular-nums leading-none">
                      {d.ecoPoints.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">P</p>
                  </div>
                )}
                {d.carbonReductionKg > 0 && (
                  <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">탄소 절감량</p>
                    <p className="text-2xl font-black text-gray-800 tabular-nums leading-none">
                      {(d.carbonReductionKg / 1000).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">tCO₂</p>
                  </div>
                )}
                {d.equivalentTrees > 0 && (
                  <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">나무 환산</p>
                    <p className="text-2xl font-black text-gray-800 tabular-nums leading-none">
                      {Math.round(d.equivalentTrees).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">그루</p>
                  </div>
                )}
                {participantCnt != null && (
                  <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">임직원 참여</p>
                    <p className="text-2xl font-black text-gray-800 tabular-nums leading-none">
                      {participantCnt.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">명</p>
                  </div>
                )}
              </div>

              {/* S 점수 before/after */}
              {hasBeforeAfter && (
                <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">사회(S) 점수 변화</p>
                  <div className="flex items-center gap-4">
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-400 mb-0.5">반영 전</p>
                      <p className="text-xl font-black text-gray-400 tabular-nums">{sScoreBefore}</p>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gray-300 transition-all duration-700" style={{ width: `${sScoreBefore}%` }} />
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${sScoreAfter}%` }} />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <p className="text-[10px] text-gray-400 mb-0.5">반영 후</p>
                      <p className="text-xl font-black text-emerald-600 tabular-nums">{sScoreAfter}</p>
                    </div>
                    {ecoScoreBonus != null && ecoScoreBonus > 0 && (
                      <div className="shrink-0 ml-2">
                        <span className="text-base font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                          +{ecoScoreBonus}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ESG 총점 상승 (ecoScoreBonus 있고 hasBeforeAfter 없을 때) */}
              {!hasBeforeAfter && ecoScoreBonus != null && ecoScoreBonus > 0 && (
                <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-gray-500">
                    EcoPoint 참여 활동이 사회(S) 점수에{' '}
                    <span className="text-emerald-600 font-bold">+{ecoScoreBonus}점</span> 반영되었습니다.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AI 검증 신뢰도 카드 (MANUAL only, summary 탭 전용) ── */}
        {activeTab === 'summary' && !isAutoSimulation && d.overallConfidence != null && (() => {
          const confLevel = adjustedConfidence < 40 ? 'LOW' : adjustedConfidence < 65 ? 'MEDIUM' : 'HIGH';
          const confColor = confLevel === 'HIGH' ? '#059669' : confLevel === 'MEDIUM' ? '#f59e0b' : '#ef4444';
          return (
            <SectionCard title="AI 검증 신뢰도" icon={Shield} iconColor="#a855f7">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 leading-relaxed mb-4">
                    제출 증빙과 ESG 지표 간 검증 근거 충족 정도를 나타냅니다.
                    {adjustedConfidence < d.overallConfidence && (
                      <span className="ml-1 text-amber-600 font-semibold text-[10px]">
                        (업종 평균 추정 보정 적용됨)
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200 mb-4">
                    <div>
                      <span className="text-4xl font-black text-gray-900 tabular-nums leading-none">{adjustedConfidence}</span>
                      <span className="text-lg text-gray-400 ml-0.5">%</span>
                      {adjustedConfidence < d.overallConfidence && (
                        <span className="ml-2 text-[9px] text-gray-400 font-mono">raw: {d.overallConfidence}%</span>
                      )}
                      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">AI 검증 신뢰도</p>
                    </div>
                    <div className="ml-auto flex flex-col items-end gap-2 min-w-[100px]">
                      <span className={`text-sm font-bold px-3 py-1.5 rounded-xl border ${CONF_CLS[confLevel] ?? CONF_CLS.LOW}`}>
                        {confLevel ?? 'N/A'}
                      </span>
                      <div className="w-full">
                        <ScoreProgressBar score={adjustedConfidence} color={confColor} height="h-1.5" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="sm:w-64 shrink-0 space-y-0 border-l border-gray-100 pl-6">
                  {CONF_ITEMS.map(item => (
                    <div key={item.label} className="group flex items-start gap-2.5 py-2.5 border-b border-gray-100 last:border-b-0 last:pb-0 first:pt-0 cursor-default">
                      <CheckCircle2 size={13} className="text-purple-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 leading-none">{item.label}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                        <div className="overflow-hidden max-h-0 group-hover:max-h-[60px] transition-all duration-200 ease-out">
                          <p className="text-[9px] text-purple-600 mt-1.5 leading-relaxed border-t border-gray-100 pt-1.5">{item.tooltip}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* 상세 신뢰도 분석 토글 */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowConfidenceDetail(v => !v)}
                  className="w-full flex items-center gap-2 text-left"
                >
                  <span className="text-xs font-semibold text-gray-500">상세 신뢰도 분석 보기</span>
                  <span className="ml-auto text-gray-400">{showConfidenceDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                </button>
              </div>

              {/* Retrieval Quality Metrics — 검증 근거 충족률 세부 지표 */}
              {showConfidenceDetail && (() => {
                const evs = data?.evidenceMatches ?? [];
                const validEv  = evs.filter(e => e.isValidEvidence === true).length;
                const totalEv  = evs.length;
                const lowConf  = evs.filter(e => e.confidenceLevel === 'LOW').length;
                const blocked  = blockedIndicators.length;
                const totalSG  = Object.keys(SG_INDICATORS).length;
                const covPct   = totalEv > 0 ? Math.round((validEv / totalEv) * 100) : 0;
                const blkPct   = totalSG > 0 ? Math.round((blocked  / totalSG) * 100) : 0;
                const metrics  = [
                  { label: 'AI 검증 성공',   value: `${validEv}건`,             color: validEv === totalEv ? '#059669' : validEv >= Math.ceil(totalEv * 0.7) ? '#f59e0b' : '#ef4444' },
                  { label: '문서 근거 탐지', value: `${totalEv}건`,             color: covPct >= 70 ? '#059669' : covPct >= 50 ? '#f59e0b' : '#ef4444' },
                  { label: '근거 부족 항목', value: `${blocked}건`,             color: blocked === 0 ? '#059669' : blocked <= 2 ? '#f59e0b' : '#ef4444' },
                  { label: '신뢰도 낮음',    value: `${lowConf}건`,            color: lowConf === 0 ? '#059669' : lowConf <= 1 ? '#f59e0b' : '#ef4444' },
                ];
                return (
                  <div className="mt-3">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">AI 검증 결과 요약</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {metrics.map(m => (
                        <div key={m.label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 leading-none">{m.label}</p>
                          <p className="text-sm font-black font-mono tabular-nums leading-none" style={{ color: m.color }}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Confidence Score Breakdown ── */}
              {showConfidenceDetail && analysisSummary && (() => {
                const eTotal5   = analysisSummary.e?.total  ?? 5;
                const eHigh     = analysisSummary.e?.high   ?? 0;
                const eMed      = analysisSummary.e?.medium ?? 0;
                const eFailed   = analysisSummary.e?.failed ?? 0;
                const sgTotal   = Object.keys(SG_INDICATORS).length;
                const sgBlocked = blockedIndicators.length;
                const sgFound   = sgTotal - sgBlocked;
                const eMatchPts  = eTotal5 > 0 ? Math.round(((eHigh + eMed) / eTotal5) * 40) : 0;
                const sgMatchPts = sgTotal  > 0 ? Math.round((sgFound  / sgTotal)  * 60) : 0;
                const missingPts = sgTotal  > 0 && sgBlocked > 0 ? -Math.round((sgBlocked / sgTotal) * 60) : 0;
                const extractPts = eTotal5  > 0 && eFailed  > 0 ? -Math.round((eFailed  / eTotal5)  * 40) : 0;
                const benchPts   = isBenchmarkFallback ? -10 : 0;
                const rows = [
                  { label: '수치 일치 (E)',      pts: eMatchPts,  color: '#059669' },
                  { label: 'AI 문맥 분석 근거',   pts: sgMatchPts, color: '#059669' },
                  ...(missingPts < 0 ? [{ label: '검증 근거 부족',   pts: missingPts, color: '#ef4444' }] : []),
                  ...(extractPts < 0 ? [{ label: '수치 추출 실패', pts: extractPts, color: '#ef4444' }] : []),
                  ...(benchPts   < 0 ? [{ label: '업종 평균 추정 적용', pts: benchPts,   color: '#f59e0b' }] : []),
                ];

                const sevLabel = adjustedConfidence >= 80 ? 'HIGH' : adjustedConfidence >= 50 ? 'MEDIUM' : 'LOW';
                const sevColor = sevLabel === 'HIGH' ? '#059669' : sevLabel === 'MEDIUM' ? '#f59e0b' : '#ef4444';
                const sevBg    = sevLabel === 'HIGH' ? 'bg-emerald-50 border-emerald-200' : sevLabel === 'MEDIUM' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

                const reasons = [];
                if (eFailed > 0) reasons.push(`수치 추출 실패 ${eFailed}건`);
                if (sgBlocked > 0) reasons.push(`S/G 근거 부족 ${sgBlocked}건`);
                if (isBenchmarkFallback) reasons.push('업종 벤치마크 추정값 사용');
                const autoExplain = reasons.length > 0
                  ? `신뢰도 보정 사유: ${reasons.join(', ')}.`
                  : null;

                return (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2.5 mb-3">
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                        분석 신뢰도 산정 <span className="font-normal text-gray-400">· 근사치</span>
                      </p>
                      <span className={`text-[8px] font-black font-mono uppercase px-2 py-0.5 rounded border ${sevBg}`} style={{ color: sevColor }}>
                        {sevLabel}
                      </span>
                    </div>

                    {/* formula */}
                    <div className="font-mono text-[9px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                      <span className="text-gray-600 font-semibold">신뢰도</span>
                      <span className="text-gray-400"> = </span>
                      <span className="text-emerald-600">(수치 일치 × 0.40)</span>
                      <span className="text-gray-400"> + </span>
                      <span className="text-blue-600">(AI 문맥 근거 × 0.40)</span>
                      <span className="text-gray-400"> − </span>
                      <span className="text-red-500">감점</span>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {rows.map((r, i) => (
                        <div key={r.label} className={`flex items-center justify-between px-4 py-2 font-mono text-xs ${i < rows.length - 1 ? 'border-b border-gray-100' : ''}`}>
                          <span className="text-gray-500">{r.label}</span>
                          <span className="font-black tabular-nums" style={{ color: r.color }}>
                            {r.pts >= 0 ? '+' : ''}{r.pts} pts
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-200">
                        <span className="text-gray-600 font-bold font-mono text-xs">최종 신뢰도</span>
                        <span className="text-gray-900 font-black text-base tabular-nums font-mono">{d.overallConfidence}%</span>
                      </div>
                    </div>

                    {autoExplain && (
                      <p className="mt-2.5 text-[9px] text-amber-600 leading-relaxed font-medium">
                        ⚠ {autoExplain}
                      </p>
                    )}
                  </div>
                );
              })()}
            </SectionCard>
          );
        })()}

        {/* ── 레이더 차트 + 카테고리 상세 ──────────────────── */}
        {activeTab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="ESG 카테고리 점수" icon={TrendingUp} iconColor="#059669">
            {radarData.length > 0 ? (
              <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={95}>
                  <PolarGrid stroke="#F3F4F6" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 9 }} tickCount={5} />
                  <Radar name="점수" dataKey="score" stroke="#059669" fill="#059669" fillOpacity={0.12} strokeWidth={2.5} isAnimationActive={true} animationDuration={700} />
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <TrendingUp size={20} className="text-gray-400" />
                </div>
                <p className="text-[13px] text-gray-400 font-medium">차트 데이터 없음</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="카테고리 상세" icon={Info} iconColor="#3b82f6">
            <div className="space-y-5">
              {d.esgChart?.radar?.map(r => (
                <div key={r.category}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold" style={{ color: ESG_COLOR[r.category] }}>{r.category}</span>
                      <span className="text-sm font-medium text-gray-700">{r.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-bold text-base tabular-nums">{r.score}</span>
                      <GradeBadge grade={r.grade} />
                    </div>
                  </div>
                  <ScoreProgressBar score={r.score} color={ESG_COLOR[r.category]} height="h-1.5" />
                </div>
              ))}
              {d.overallOpinion && (
                <div className="pt-5 border-t border-gray-100 mt-5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">종합 의견</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{d.overallOpinion}</p>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
        )}

        {/* ── 지표별 세부 점수 — K-ESG 핵심 지표 (summary 탭 최하단) ── */}
        {breakdownData.length > 0 && activeTab === 'summary' && (
          <SectionCard
            title="지표별 세부 점수 — K-ESG 핵심 지표"
            icon={FileText}
            iconColor="#f59e0b"
          >
            {breakdownData[0]?.isFallback && (
              <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 mb-3">
                검증 결과 기반 추정 점수
              </span>
            )}
            <div className="chart-container">
            <ResponsiveContainer width="100%" height={Math.max(340, breakdownData.length * 36)}>
              <BarChart data={breakdownData} layout="vertical" margin={{ left: 8, right: 72, top: 4, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={{ stroke: '#F3F4F6' }} />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={170}
                  interval={0}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <CartesianGrid horizontal={false} stroke="#F3F4F6" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="tooltip-dark">
                        <p className="text-white font-semibold mb-1 text-xs">{p.title}</p>
                        <p className="text-white/50 font-mono text-[10px]">{p.kesgCode}</p>
                        <p className="text-white font-bold mt-1 text-xs tabular-nums">{p.score}점 · <span style={{ color: gradeBarColor(p.grade) }}>{p.grade}등급</span></p>
                        {p.confidence != null && <p className="text-white/50 mt-0.5 text-[10px]">신뢰도 {p.confidence}%</p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={true} animationDuration={600}>
                  {breakdownData.map((entry, idx) => (
                    <Cell key={idx} fill={gradeBarColor(entry.grade)} fillOpacity={0.85} />
                  ))}
                  <LabelList
                    dataKey="score"
                    position="right"
                    formatter={(v) => `${v}점`}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#374151', fontFamily: 'Inter, Pretendard, sans-serif' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100">
              {['S', 'A', 'B', 'C', 'D'].map(g => (
                <span key={g} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: gradeBarColor(g) }} />
                  {g}등급
                </span>
              ))}
              <span className="ml-auto text-[10px] text-gray-400">{breakdownData.length}개 지표</span>
            </div>
          </SectionCard>
        )}

        {/* ── [4] 업종 벤치마크 비교 (강화) ────────────────── */}
        {/* ── Benchmark Overview Card ─────────────────────── */}
        {activeTab === 'benchmark' && (() => {
          const eScore = d.eScore ?? 0;
          const sScore = d.sScore ?? 0;
          const gScore = d.gScore ?? 0;

          // 업종 평균 추정 (benchmark metric delta → E 스코어 추정)
          const refE = 65, refS = 70, refG = 68;
          const deltaE = eScore - refE;
          const deltaS = sScore - refS;
          const deltaG = gScore - refG;

          // Radar chart — company vs industry reference
          const radarBenchData = [
            { subject: '환경 (E)', company: eScore, industry: refE, fullMark: 100 },
            { subject: '사회 (S)', company: sScore, industry: refS, fullMark: 100 },
            { subject: '지배구조 (G)', company: gScore, industry: refG, fullMark: 100 },
          ];

          const deltaStyle = (delta) =>
            delta > 0
              ? { text: `+${delta.toFixed(0)}`, cls: 'text-emerald-600', sign: '▲' }
              : delta < 0
              ? { text: `${delta.toFixed(0)}`, cls: 'text-red-500', sign: '▼' }
              : { text: '±0', cls: 'text-gray-400', sign: '—' };

          return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* header */}
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <BarChart2 size={14} className="text-purple-500" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">ESG 점수 vs. 업종 평균 비교</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">업종 평균 참조치 기준 — E 65 · S 70 · G 68</p>
                </div>
                <div className="ml-auto text-[9px] text-gray-400 font-mono">
                  {d.benchmarkComparison?.industry ?? '업종 미설정'}
                </div>
              </div>

              <div className="px-6 py-5 flex flex-col sm:flex-row gap-6 items-center">
                {/* Radar Chart */}
                <div className="w-full sm:w-64 shrink-0 chart-container">
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={radarBenchData} cx="50%" cy="50%" outerRadius={80}>
                      <PolarGrid stroke="#F3F4F6" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="우리 기업" dataKey="company" stroke="#6366f1" fill="#6366f1" fillOpacity={0.18} strokeWidth={2.5} isAnimationActive={true} animationDuration={700} />
                      <Radar name="업종 평균(참조)" dataKey="industry" stroke="#d1d5db" fill="#d1d5db" fillOpacity={0.10} strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="tooltip-dark">
                            <p className="text-white/60 mb-1.5 text-[10px] uppercase tracking-wide">{payload[0]?.payload?.subject}</p>
                            {payload.map((p, i) => (
                              <p key={i} className="tabular-nums text-xs" style={{ color: p.stroke === '#d1d5db' ? '#9ca3af' : '#a5b4fc' }}>
                                {p.name}: <strong>{p.value}점</strong>
                              </p>
                            ))}
                          </div>
                        );
                      }} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-4 mt-1">
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" />우리 기업
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                      <span className="w-3 h-0.5 bg-gray-300 inline-block rounded" style={{ borderTop: '1.5px dashed #d1d5db' }} />업종 평균
                    </span>
                  </div>
                </div>

                {/* E/S/G Delta Grid */}
                <div className="flex-1 w-full space-y-3">
                  {[
                    { cat: 'E', label: '환경 (E)', score: eScore, ref: refE, delta: deltaE, color: '#059669', Icon: Leaf },
                    { cat: 'S', label: '사회 (S)', score: sScore, ref: refS, delta: deltaS, color: '#3b82f6', Icon: Users },
                    { cat: 'G', label: '지배구조 (G)', score: gScore, ref: refG, delta: deltaG, color: '#f59e0b', Icon: Building2 },
                  ].map(({ cat, label, score, ref, delta, color, Icon }) => {
                    const ds = deltaStyle(delta);
                    const diffLabel = delta > 0 ? '업종 평균 대비 우수' : delta < 0 ? '업종 평균 이하' : '업종 평균 수준';
                    return (
                      <div key={cat} className="flex items-center gap-4 p-3.5 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                          <Icon size={14} style={{ color }} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-gray-700">{label}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] font-black font-mono ${ds.cls}`}>{ds.sign} {ds.text}pts</span>
                              <span className={`text-[10px] font-semibold ${ds.cls}`}>{diffLabel}</span>
                            </div>
                          </div>
                          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                            {/* industry ref marker */}
                            <div className="absolute top-0 bottom-0 w-px bg-gray-400 z-10" style={{ left: `${ref}%` }} />
                            {/* company bar */}
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-gray-500 font-mono">우리 기업 <span className="font-black" style={{ color }}>{score}점</span></span>
                            <span className="text-[9px] text-gray-400 font-mono">업종 평균 {ref}점</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-gray-400 px-1">
                    ※ 업종 평균 참조치는 K-ESG 공개 데이터 기반 추정값입니다. 실제 업종별 수치는 아래 지표별 비교에서 확인하세요.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'benchmark' && (
        <SectionCard
          title={`업종 벤치마크 비교${d.benchmarkComparison?.industry ? ` — ${d.benchmarkComparison.industry}` : ''}${d.benchmarkComparison?.regionName ? ` · ${d.benchmarkComparison.regionName}` : ''}`}
          icon={TrendingUp}
          iconColor="#a855f7"
          action={benchMetrics.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-500 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
              비교 참조용
            </span>
          )}
        >
          {benchMetrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <TrendingUp size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">비교 데이터 없음</p>
              <p className="text-xs text-gray-400">업종 벤치마크 데이터가 없습니다.</p>
            </div>
          ) : (
            <>
              {/* 비교 참조 안내 — ESG 점수와 무관한 순수 비교 정보임을 명시 */}
              <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-500/5 border border-blue-200/50 rounded-xl mb-4">
                <TrendingUp size={13} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  아래 비교 데이터는 동종 업계 평균과의 참조용 비교입니다.
                  <span className="font-semibold"> ESG 점수 산정에는 영향을 주지 않습니다.</span>
                </p>
              </div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex gap-5 text-xs text-gray-500">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-2 rounded-sm inline-block bg-blue-500/80" />
                    우리 기업
                  </span>
                  <span className="flex items-center gap-2"><span className="w-3 h-2 rounded-sm inline-block bg-gray-300" />업종 평균</span>
                </div>
                <span className="text-[9px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md" title={benchMetrics[0]?.source ?? ''}>
                  업종 평균: 공공 통계 기반
                </span>
              </div>
              <div className="space-y-4">
                {benchMetrics.map((metric, idx) => {
                  const hasCompany  = metric.company != null;
                  const companyVal  = metric.company    ?? 0;
                  const industryVal = metric.industryAvg ?? 0;
                  const maxVal      = Math.max(companyVal, industryVal);
                  const yDomain     = [0, Math.ceil(maxVal * 1.3)];
                  const diff        = hasCompany && industryVal > 0 ? ((companyVal - industryVal) / industryVal) * 100 : null;
                  const lib         = lowerIsBetter(metric.unit);
                  const better      = diff != null && (lib ? diff < 0 : diff > 0);
                  const chartData   = [{ name: metric.name, company: hasCompany ? companyVal : null, industryAvg: industryVal, unit: metric.unit }];

                  return (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors">
                      {/* 헤더 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">{metric.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                            {metric.unit}
                          </span>
                          {diff != null && (
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                              better
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {better ? '▼' : '▲'} {Math.abs(diff).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      {diff != null && (() => {
                        const absDiff = Math.abs(diff);
                        const perfLabel = better
                          ? (absDiff <= 5 ? '업종 평균 수준' : '업종 평균 대비 우수')
                          : (absDiff <= 20 ? '업종 평균 수준' : '업종 평균 대비 개선 필요');
                        const perfCls = better ? 'text-emerald-600' : absDiff <= 20 ? 'text-amber-600' : 'text-red-600';
                        return (
                          <div className="mb-3">
                            <p className="text-[10px] text-gray-500">
                              업종 평균 대비 {better ? '▼' : '▲'} {absDiff.toFixed(1)}%{' '}
                              <span className={`font-semibold ${perfCls}`}>— {perfLabel}</span>
                            </p>
                          </div>
                        );
                      })()}
                      <div className="chart-container">
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                          <XAxis dataKey="name" hide />
                          <YAxis domain={yDomain} tickFormatter={fmtBenchNum} tick={{ fill: '#9CA3AF', fontSize: 9 }} tickLine={false} axisLine={false} width={42} />
                          <CartesianGrid vertical={false} stroke="#F3F4F6" />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="tooltip-dark">
                                  <p className="text-white/60 mb-1.5 text-[10px] uppercase tracking-wide">{metric.name}</p>
                                  {payload.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.fill }} />
                                      <span className="tabular-nums text-xs" style={{ color: p.fill === '#9ca3af' ? '#9ca3af' : '#fff' }}>
                                        {p.name}: <strong>{fmtBenchNum(p.value)} {metric.unit}</strong>
                                      </span>
                                    </div>
                                  ))}
                                  {diff != null && (
                                    <p className={`mt-1.5 text-[10px] font-semibold ${better ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {better ? '✓ 업종 평균 대비 양호' : '! 업종 평균 대비 개선 필요'}
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="company"
                            name="우리 기업"
                            fill={better ? '#059669' : '#3b82f6'}
                            fillOpacity={0.85}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={56}
                            isAnimationActive={true}
                            animationDuration={600}
                          />
                          <Bar dataKey="industryAvg" name="업종 평균" fill="#9ca3af" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between mt-2 text-[10px] tabular-nums text-gray-400">
                        <span>
                          <span className={`font-semibold ${better ? 'text-emerald-600' : 'text-blue-600'}`}>
                            우리 기업
                          </span>
                          {' '}{hasCompany ? `${fmtBenchNum(companyVal)} ${metric.unit}` : '입력값 없음'}
                        </span>
                        <span>
                          <span className="font-semibold text-gray-500">업종 평균</span>
                          {' '}{fmtBenchNum(industryVal)} {metric.unit}
                        </span>
                      </div>
                      {metric.source && (
                        <p className="text-[9px] text-gray-400 mt-1">
                          출처(업종 평균): {metric.source}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── AI 해석 Summary ────────────────────────── */}
              {benchMetrics.length > 0 && (() => {
                const lines = benchMetrics.map(m => {
                  if (m.company == null) return null;
                  const cv = m.company;
                  const iv = m.industryAvg ?? 0;
                  if (iv <= 0) return null;
                  const diff = ((cv - iv) / iv) * 100;
                  const lib  = lowerIsBetter(m.unit);
                  const better = lib ? diff < 0 : diff > 0;
                  const absDiff = Math.abs(diff).toFixed(1);
                  if (Math.abs(diff) <= 5) return { text: `${m.name}은 업종 평균 수준입니다.`, ok: true };
                  if (better) return { text: `${m.name}은 업종 평균 대비 ${absDiff}% 낮아 효율 우수 수준입니다.`, ok: true };
                  return { text: `${m.name}은 업종 평균 대비 ${absDiff}% 높아 개선이 필요합니다.`, ok: false };
                }).filter(Boolean);
                if (lines.length === 0) return null;
                return (
                  <div className="mt-5 px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">AI 해석 요약</p>
                    {lines.map((l, i) => (
                      <p key={i} className={`text-xs leading-relaxed ${l.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                        {l.ok ? '✓' : '!'} {l.text}
                      </p>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </SectionCard>
        )}

        {/* 섹션 앵커 (hash scroll 대상) */}
        <div id="section-evidence" />

        {/* ── 검증 요약 섹션 (MANUAL only) ─────────────────── */}
        {!isAutoSimulation && verificationStats.total > 0 && activeTab === 'evidence' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

            {/* 섹션 헤더 */}
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-emerald-600" />
              </span>
              <span className="text-sm font-semibold text-gray-800">수치 검증 요약</span>
              <span className="text-[10px] font-bold text-gray-400 ml-2 hidden sm:inline">
                E 카테고리 · {verificationStats.total}개 지표
              </span>
              {/* 신뢰도 레벨 badge */}
              <span className={`ml-auto text-xs font-medium px-3 py-1 rounded-full border ${verificationStats.trustCls}`}>
                {verificationStats.trustLabel}
              </span>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* 전체 검증 상태 요약 문구 */}
              <p className={`text-sm font-medium leading-snug ${verificationStats.summaryColor}`}>
                {verificationStats.summaryText}
              </p>

              {/* LOW 존재 시 경고 배너 */}
              {verificationStats.lowCount > 0 && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 leading-relaxed">
                    일부 항목에서 입력값과 증빙 데이터 간 차이가 발견되었습니다.
                    {verificationStats.lowCount >= 3 && (
                      <span className="ml-1 font-bold text-red-700">
                        ({verificationStats.lowCount}건 불일치 — 등급 제한 적용 가능)
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* 4칸 grid 통계 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* HIGH */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">HIGH</p>
                  <p className="text-3xl font-black tabular-nums leading-none text-emerald-700">
                    {verificationStats.highCount}
                  </p>
                  <p className="text-[10px] text-emerald-600">건 일치</p>
                </div>
                {/* MEDIUM */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">MEDIUM</p>
                  <p className="text-3xl font-black tabular-nums leading-none text-amber-700">
                    {verificationStats.mediumCount}
                  </p>
                  <p className="text-[10px] text-amber-600">건 근사 일치</p>
                </div>
                {/* LOW */}
                <div className={`border rounded-xl px-4 py-3.5 flex flex-col gap-1 ${
                  verificationStats.lowCount > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${
                    verificationStats.lowCount > 0 ? 'text-red-600' : 'text-gray-500'
                  }`}>LOW</p>
                  <p className={`text-3xl font-black tabular-nums leading-none ${
                    verificationStats.lowCount > 0 ? 'text-red-700' : 'text-gray-400'
                  }`}>
                    {verificationStats.lowCount}
                  </p>
                  <p className={`text-[10px] ${
                    verificationStats.lowCount > 0 ? 'text-red-600' : 'text-gray-400'
                  }`}>건 불일치</p>
                </div>
                {/* 평균 오차율 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">평균 오차율</p>
                  <p className="text-3xl font-black tabular-nums leading-none"
                    style={{
                      color: verificationStats.avgDiff == null ? '#9ca3af'
                           : verificationStats.avgDiff <= 5  ? '#16a34a'
                           : verificationStats.avgDiff <= 20 ? '#d97706'
                           : '#dc2626'
                    }}>
                    {fmtDiff(verificationStats.avgDiff)}
                  </p>
                  <p className="text-[10px] text-gray-400">avg diff</p>
                </div>
              </div>

              {/* Numeric Extraction Metrics — 추출 성공/실패 분리 */}
              {(() => {
                const parsed  = verificationStats.total;
                const failed  = analysisSummary?.e?.failed ?? 0;
                const eTotal5 = analysisSummary?.e?.total  ?? 5;
                const bmark   = isBenchmarkFallback;
                if (failed === 0 && !bmark) return null;
                return (
                  <div className="pt-3 border-t border-amber-800/20">
                    <p className="text-[9px] font-bold text-amber-600/70 uppercase tracking-widest mb-2">수치 추출 지표</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: '추출 성공',      value: `${parsed}`,   color: parsed > 0 ? '#059669' : '#71717a' },
                        { label: '추출 실패',      value: `${failed}`,   color: failed === 0 ? '#059669' : failed >= 3 ? '#ef4444' : '#f59e0b' },
                        { label: '업종 평균 적용', value: bmark ? '적용' : '미적용', color: bmark ? '#f59e0b' : '#059669' },
                        { label: '수치 충족률',    value: eTotal5 > 0 ? `${Math.round((parsed / eTotal5) * 100)}%` : '0%', color: parsed >= eTotal5 ? '#059669' : parsed > 0 ? '#f59e0b' : '#ef4444' },
                      ].map(m => (
                        <div key={m.label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 leading-none">{m.label}</p>
                          <p className="text-sm font-black font-mono tabular-nums leading-none" style={{ color: m.color }}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 방법론 설명 + 오차율 기준 */}
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  E(환경) 항목은 제출된 CSV/PDF 증빙과 입력 수치를 직접 비교 검증합니다.
                  S/G 항목은 AI 문맥 분석 기반으로 평가됩니다.
                </p>
                <p className="text-xs text-gray-400">
                  오차율 기준 — HIGH: ≤5% · MEDIUM: ≤20% · LOW: &gt;20%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 시스템 설명 배너 ──────────────────────────────── */}
        {activeTab === 'evidence' && (
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <span className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
              <Search size={11} className="text-indigo-500" />
            </span>
            <p className="text-xs text-indigo-700 leading-relaxed flex-1">
              <span className="font-semibold">AI 검증 근거 추적</span> — 핵심 ESG 지표에 대한 AI의 검색·검증 전 과정이 표시됩니다.
              행 클릭 시 검증 근거 텍스트, AI 유사도, 키워드 검증 결과, AI 판단 근거를 확인할 수 있습니다.
            </p>
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-indigo-400 bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded">
                E: 수치 검증
              </span>
              <span className="text-[9px] font-mono text-indigo-400 bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded">
                S/G: AI 문맥 분석
              </span>
            </div>
          </div>
        )}

        {/* ── [1] Evidence 상세 (고도화) ───────────────────── */}
        {activeTab === 'evidence' && <SectionCard
          title="AI 검증 근거 추적"
          icon={Search}
          iconColor="#6366f1"
          action={
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                {completeIndicatorList.length}개 지표
              </span>
              <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                {completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length} 검증 완료
              </span>
            </div>
          }
        >
          {/* ── Verification Status 요약 (항상 표시) ── */}
          {(() => {
            const counts = {
              VERIFIED:      completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length,
              WEAK:          completeIndicatorList.filter(e => getVerificationStatus(e) === 'WEAK').length,
              CONTRADICTION: completeIndicatorList.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length,
              NO_EVIDENCE:   completeIndicatorList.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length,
            };
            return (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">
                  검증 현황
                </span>
                {Object.entries(VSTATUS).map(([key, style]) => counts[key] > 0 && (
                  <span key={key} className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text} flex items-center gap-1`}>
                    <span>{style.icon}</span>
                    <span>{style.label}</span>
                    <span className="ml-0.5 font-mono">({counts[key]})</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {!d.evidenceMatches?.length ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <FileText size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">검증 근거 없음</p>
              <p className="text-xs text-gray-400">AI 분석에서 검증 근거를 찾지 못했습니다.</p>
            </div>
          ) : (
            <>
              {/* 카테고리 탭 */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {['ALL', 'E', 'S', 'G'].map((tab) => {
                  const cnt = tab === 'ALL'
                    ? d.evidenceMatches.length
                    : d.evidenceMatches.filter(e => e.indicatorCode?.startsWith(tab)).length;
                  return (
                    <button
                      key={tab}
                      onClick={() => setEvTab(tab)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        evTab === tab ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                      style={evTab === tab && tab !== 'ALL' ? { boxShadow: `inset 0 0 0 1px ${ESG_COLOR[tab]}40` } : {}}
                    >
                      {tab === 'ALL'
                        ? `전체 (${cnt})`
                        : (
                          <span className="flex items-center gap-1.5">
                            <span style={{ color: ESG_COLOR[tab] }} className="font-mono font-bold">{tab}</span>
                            {ESG_LABEL[tab]} ({cnt})
                          </span>
                        )
                      }
                    </button>
                  );
                })}
              </div>

              {/* 수치 불일치 경고 배너 */}
              {(() => {
                const lowEvs = d.evidenceMatches?.filter(ev => ev.numericMatchLevel === 'LOW') ?? [];
                if (lowEvs.length === 0) return null;
                return (
                  <div className="flex items-center gap-2 mb-3 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                    <AlertTriangle size={13} className="text-red-500 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-red-700">수치 불일치 감지</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                          수치 불일치 {lowEvs.length}건
                        </span>
                        {d.gradeCeilingApplied && (
                          <span className="text-[10px] font-semibold text-amber-700">→ 등급 제한 적용됨</span>
                        )}
                      </div>
                      <p className="text-[10px] text-red-500 mt-0.5">입력한 ESG 환경 데이터와 증빙 문서에서 추출된 수치 간 큰 차이가 있습니다. Evidence 카드를 확인하세요.</p>
                    </div>
                  </div>
                );
              })()}

              {/* ── E 카테고리 수치 검증 요약 ── */}
              {(() => {
                const eEvs = d.evidenceMatches?.filter(e =>
                  e.indicatorCode?.startsWith('E') && e.numericMatchLevel
                ) ?? [];
                if (eEvs.length === 0) return null;
                if (evTab !== 'ALL' && evTab !== 'E') return null;
                const high   = eEvs.filter(e => e.numericMatchLevel === 'HIGH').length;
                const medium = eEvs.filter(e => e.numericMatchLevel === 'MEDIUM').length;
                const low    = eEvs.filter(e => e.numericMatchLevel === 'LOW').length;
                return (
                  <div className="flex items-center gap-3 mb-3 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">수치 검증 현황</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {high > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                          HIGH {high}건
                        </span>
                      )}
                      {medium > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                          MEDIUM {medium}건
                        </span>
                      )}
                      {low > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
                          LOW {low}건
                        </span>
                      )}
                    </div>
                    <span className="ml-auto text-[10px] text-gray-400 shrink-0">{eEvs.length}개 지표 분석</span>
                  </div>
                );
              })()}

              {/* ── AI 검색 과정 토글 ── */}
              {!isAutoSimulation && (
                <div className="mb-3">
                  <button
                    onClick={() => setShowAdvancedEvidence(v => !v)}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors text-left"
                  >
                    <Search size={12} className="text-gray-400 shrink-0" />
                    <span className="text-xs font-semibold text-gray-500">AI 검색 과정 보기</span>
                    <span className="text-[10px] text-gray-400 ml-1">— 문서 검색·필터링·검증 단계</span>
                    <span className="ml-auto text-gray-400">{showAdvancedEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                  </button>

                  {showAdvancedEvidence && (() => {
                    const total   = d.evidenceMatches?.length ?? 0;
                    const validEv = d.evidenceMatches?.filter(e => e.isValidEvidence).length ?? 0;
                    const verified = completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
                    const retrieved = d.evidenceMatches?.reduce((acc, e) => acc + (e.retrievedCount ?? 3), 0) ?? total * 3;
                    const stages = [
                      { label: '검색됨',    count: retrieved,  color: '#3b82f6', desc: '벡터 검색' },
                      { label: '필터링',    count: total,      color: '#8b5cf6', desc: '유사도 기준' },
                      { label: '검증',      count: validEv,    color: '#f59e0b', desc: '키워드+유사도' },
                      { label: '최종 검증', count: verified,   color: '#059669', desc: '최종' },
                    ];
                    return (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-1 overflow-x-auto">
                          {stages.map((s, i) => (
                            <React.Fragment key={s.label}>
                              <div className="flex flex-col items-center gap-0.5 min-w-[52px] shrink-0">
                                <div className="text-sm font-black font-mono tabular-nums px-2 py-1 rounded-lg border"
                                  style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                                  {s.count}
                                </div>
                                <span className="text-[8px] font-bold uppercase tracking-wide text-gray-500">{s.label}</span>
                                <span className="text-[7px] text-gray-400">{s.desc}</span>
                              </div>
                              {i < stages.length - 1 && (
                                <span className="text-gray-300 text-xs mx-0.5 shrink-0">→</span>
                              )}
                            </React.Fragment>
                          ))}
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                              충족률 {evidenceCovPct}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Evidence 목록 */}
              {/* E 탭 — benchmark fallback 빈 상태 */}
              {evTab === 'E' && isFullBenchmark && (
                <div className="flex flex-col items-center gap-3 py-8 px-4 mb-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                    <AlertTriangle size={20} className="text-amber-600" />
                  </div>
                  <p className="text-sm font-bold text-amber-700">수치 근거 없음</p>
                  <p className="text-xs text-amber-600 text-center leading-relaxed max-w-xs">
                    환경(E) 데이터 수치 추출에 실패하여 수치 검증 근거가 없습니다.
                    업종 평균 기반 추정 평가가 적용되었습니다.
                  </p>
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-700 font-mono uppercase tracking-wider">
                    업종 평균 추정 분석
                  </span>
                </div>
              )}
              {/* ── AI Retrieval Trace Table ── */}
              {(() => {
                const tableRows = evTab === 'ALL'
                  ? completeIndicatorList
                  : completeIndicatorList.filter(e => e.indicatorCode?.startsWith(evTab));
                if (tableRows.length === 0 && !(evTab === 'E' && isFullBenchmark)) {
                  return (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      해당 카테고리의 Evidence가 없습니다.
                    </div>
                  );
                }
                return (
                  <AIRetrievalTraceTable
                    rows={tableRows}
                    onSelect={setSelectedEvidence}
                  />
                );
              })()}

              {/* ── Retrieval Transparency ── */}
              <RetrievalTransparencyPanel
                evidences={d.evidenceMatches ?? []}
                isAutoSimulation={isAutoSimulation}
              />
            </>
          )}

          {/* ── XAI: 지표별 AI 판단 근거 (항상 표시 — NO_EVIDENCE 포함) ── */}
          <AdvancedAnalysisPanel
            data={d}
            allIndicators={completeIndicatorList}
            isAutoSimulation={isAutoSimulation}
          />

          {/* ── Calibration Dashboard (dev only) ── */}
          <CalibrationDashboard data={d} />
        </SectionCard>}

        {/* 섹션 앵커 (hash scroll 대상) */}
        <div id="section-ai-report" />

        {/* ── Risk & Opportunity ──────────────────────────── */}
        {d.riskOpportunity && activeTab === 'ai-report' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="Risk & Opportunity 분석" icon={AlertTriangle} iconColor="#f59e0b">
              <div
                className="text-sm text-gray-600 leading-relaxed"
                style={{ lineHeight: '1.9' }}
                dangerouslySetInnerHTML={{ __html: renderMd(d.riskOpportunity) }}
              />
            </SectionCard>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">분석 요약</p>
              <div className="space-y-3">
                {[
                  { label: '환경(E) 점수',     value: d.eScore,    color: ESG_COLOR.E },
                  { label: '사회(S) 점수',     value: d.sScore,    color: ESG_COLOR.S },
                  { label: '지배구조(G) 점수', value: d.gScore,    color: ESG_COLOR.G },
                  { label: '종합 점수',         value: d.totalScore, color: gradeAccentColor },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-gray-500">{item.label}</span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{item.value ?? 0}</span>
                    </div>
                    <ScoreProgressBar score={item.value} color={item.color} height="h-1" />
                  </div>
                ))}
              </div>
              {d.finalGrade && (
                <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">최종 등급</span>
                  <GradeBadge grade={d.finalGrade} size="lg" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── [2] AI 분석 리포트 (섹션 분리) ─────────────── */}
        {reportSections.length > 0 && activeTab === 'ai-report' && (
          <div>
            {/* 섹션 헤더 */}
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <FileText size={14} className="text-indigo-500" />
              </span>
              <span className="text-sm font-semibold text-gray-800">AI 분석 리포트</span>
              <span className="text-xs text-gray-400 ml-1">— GPT 기반 종합 진단</span>
            </div>
            <div className="space-y-2">
              {reportSections.map((section, i) => (
                <GptReportCard key={i} section={section} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        )}

        {/* 전체 리포트 (섹션 파싱 실패 시 폴백) */}
        {d.fullReport && reportSections.length === 0 && activeTab === 'ai-report' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                <FileText size={14} className="text-gray-400" />
              </span>
              <span className="text-sm font-semibold text-gray-800">전체 분석 리포트</span>
            </div>
            <div className="px-8 pb-8 pt-4">
              <div
                className="text-sm text-gray-600"
                style={{ lineHeight: '1.9' }}
                dangerouslySetInnerHTML={{ __html: renderMd(d.fullReport) }}
              />
            </div>
          </div>
        )}

        {activeTab === 'audit-log' && (<>

        {/* ── Audit Log Tab Header ── */}
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-white border border-gray-200 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-sm font-semibold text-gray-700">
            AI 분석 실행 로그
          </span>
          <span className="text-xs text-gray-400 ml-1">
            {d.analyzedAt ? new Date(d.analyzedAt).toLocaleString('ko-KR') : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {d.processingTimeMs && (
              <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-lg">
                {(d.processingTimeMs / 1000).toFixed(2)}초 소요
              </span>
            )}
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700">
              완료
            </span>
          </div>
        </div>

        {/* ── Audit Execution Timeline ─────────────────────── */}
        {(() => {
          const totalMs = d.processingTimeMs ?? 0;
          const ocrMs   = d.ocrTimeMs        ?? 0;
          const ragMs   = d.ragTimeMs        ?? 0;
          const verMs   = d.verifyTimeMs     ?? 0;
          const fmtMs   = t => t >= 1000 ? `${(t/1000).toFixed(1)}s` : t > 0 ? `${t}ms` : '—';
          const finishedAt = d.analyzedAt ?? d.createdAt ?? null;

          const isCsvBased = ocrMs === 0 && (analysisSummary?.e?.success ?? 0) > 0;
          const stages = [
            {
              id: 'ocr',
              label: '문서 파싱',
              desc: isCsvBased ? 'CSV 수치 데이터 기반 분석' : 'OCR 텍스트 추출 · PDF 레이아웃 분석',
              icon: <FileText size={13} />,
              time: ocrMs > 0 ? fmtMs(ocrMs) : '—',
              status: ocrMs > 0 ? 'success' : isCsvBased ? 'success' : isAutoSimulation ? 'skip' : 'warn',
              tag: ocrMs > 0 ? 'completed' : isCsvBased ? 'CSV 기반 수치 검증 사용' : isAutoSimulation ? 'skipped' : 'no data',
              color: 'emerald',
            },
            {
              id: 'extract',
              label: '수치 추출',
              desc: 'CSV 수치 파싱 · 정규식 패턴 매칭',
              icon: <Activity size={13} />,
              time: '—',
              status: (analysisSummary?.e?.success ?? 0) > 0 ? 'success' : (analysisSummary?.e?.total ?? 0) > 0 ? 'warn' : 'skip',
              tag: (analysisSummary?.e?.success ?? 0) > 0
                ? `${analysisSummary.e.success}개 지표 검증 완료`
                : 'no numeric data',
              color: 'sky',
            },
            {
              id: 'embed',
              label: '문서 색인화',
              desc: 'Upstage Solar 임베딩 · 청크 인덱싱',
              icon: <Cpu size={13} />,
              time: '—',
              status: !isAutoSimulation && completeIndicatorList.some(e => e.similarity > 0) ? 'success' : isAutoSimulation ? 'skip' : 'warn',
              tag: !isAutoSimulation ? 'embedded' : 'simulation',
              color: 'violet',
            },
            {
              id: 'rag',
              label: 'AI 문맥 분석',
              desc: 'K-ESG 지표별 AI 검색 · 유사도 계산',
              icon: <Search size={13} />,
              time: fmtMs(ragMs),
              status: !isAutoSimulation && ragMs > 0 ? 'success' : isAutoSimulation ? 'skip' : 'warn',
              tag: !isAutoSimulation
                ? `${completeIndicatorList.filter(e => (e.similarity ?? 0) >= 0.60).length}개 지표 매칭`
                : '차단 (사전 진단)',
              color: 'indigo',
            },
            {
              id: 'threshold',
              label: '품질 기준 검사',
              desc: 'E≥0.58 · S≥0.60 · G≥0.62 유사도 기준',
              icon: <Shield size={13} />,
              time: '—',
              status: verificationStats.highCount > 0 ? 'success' : verificationStats.lowCount > 3 ? 'warn' : 'success',
              tag: `${verificationStats.highCount} 검증 완료 · ${verificationStats.lowCount} 불일치`,
              color: 'teal',
            },
            {
              id: 'bench',
              label: '업종 평균 비교',
              desc: '업종 평균 대비 백분위 · 차이 계산',
              icon: <BarChart2 size={13} />,
              time: '—',
              status: isBenchmarkFallback ? 'warn' : 'success',
              tag: isBenchmarkFallback ? '업종 평균 추정 적용' : '실측 데이터 비교',
              color: 'amber',
            },
            {
              id: 'confidence',
              label: '신뢰도 검증',
              desc: 'AI 유사도 · 키워드 매칭 · 일관성 확인',
              icon: <CheckCircle size={13} />,
              time: fmtMs(verMs),
              status: adjustedConfidence >= 70 ? 'success' : adjustedConfidence >= 50 ? 'warn' : 'error',
              tag: `${Math.round(adjustedConfidence)}% 신뢰도`,
              color: adjustedConfidence >= 70 ? 'emerald' : adjustedConfidence >= 50 ? 'amber' : 'rose',
            },
          ];

          const statusStyle = {
            success: { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '완료' },
            warn:    { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200',     label: '주의' },
            error:   { dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 border-rose-200',         label: '오류' },
            skip:    { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-200',          label: '미실행' },
          };

          return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* header */}
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
                  <Activity size={13} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">AI 분석 실행 파이프라인</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">AI 분석 파이프라인 실행 로그 — {stages.filter(s=>s.status==='success').length}/{stages.length} 단계 완료</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {totalMs > 0 && (
                    <span className="text-[10px] text-gray-400 font-mono">총 {fmtMs(totalMs)}</span>
                  )}
                  {finishedAt && (
                    <span className="text-[10px] text-gray-400">
                      {new Date(finishedAt).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* pipeline stages */}
              <div className="py-2">
                {stages.map((stage, idx) => {
                  const ss = statusStyle[stage.status];
                  const isLast = idx === stages.length - 1;
                  const stepCls = stage.status === 'success' ? 'pipeline-step-active'
                    : stage.status === 'warn' ? 'pipeline-step-warn'
                    : stage.status === 'error' ? 'pipeline-step-error'
                    : '';
                  return (
                    <div key={stage.id} className={`pipeline-step ${stepCls} flex gap-4 px-6 py-3.5 rounded-xl mx-2 mb-0.5`}>
                      {/* left: connector */}
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ring-2 ring-white shadow-sm ${ss.dot}`} />
                        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1.5 min-h-[20px]" />}
                      </div>
                      {/* right: content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-gray-300 tabular-nums w-5">{String(idx+1).padStart(2,'0')}</span>
                          <span className="text-xs font-semibold text-gray-800">{stage.label}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${ss.badge}`}>
                            {ss.label}
                          </span>
                          {stage.time !== '—' && (
                            <span className="text-[10px] font-mono text-gray-400 ml-auto tabular-nums">{stage.time}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 pl-7 leading-relaxed">{stage.desc}</p>
                        <div className="pl-7 mt-1.5">
                          <span className="text-[10px] font-mono text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 py-0.5 shadow-sm">{stage.tag}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── 카테고리별 분석 방식 ─────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Cpu size={14} className="text-gray-400" />
            </span>
            <span className="text-sm font-semibold text-gray-800">카테고리별 분석 방식</span>
            <span className="ml-auto text-[10px] text-gray-400 font-medium">K-ESG Verification Architecture</span>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* E · Environment */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Leaf size={14} className="text-emerald-400" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Environment</p>
                    <p className="text-xs font-semibold text-gray-700">환경 (E)</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '분석 방식',   value: '수치 검증' },
                    { label: '사용 기술',   value: 'CSV/PDF 파싱 + 정규식' },
                    { label: '검증 기준',   value: '오차율 — HIGH ≤5% / MED ≤20%' },
                    { label: '검증 근거',   value: '수치 일치 수준' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 w-20">{row.label}</span>
                      <span className="text-gray-700 text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-600 uppercase tracking-wide">
                  수치 검증 엔진
                </span>
              </div>

              {/* S · Social */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Users size={14} className="text-blue-400" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Social</p>
                    <p className="text-xs font-semibold text-gray-700">사회 (S)</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '분석 방식',   value: 'AI 문맥 분석' },
                    { label: '사용 기술',   value: 'OCR + 벡터 임베딩' },
                    { label: '검증 기준',   value: '키워드 + 코사인 유사도' },
                    { label: '검증 근거',   value: '증빙 매칭' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 w-20">{row.label}</span>
                      <span className="text-gray-700 text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 uppercase tracking-wide">
                  AI 분석 엔진
                </span>
              </div>

              {/* G · Governance */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-amber-400" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Governance</p>
                    <p className="text-xs font-semibold text-gray-700">지배구조 (G)</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '분석 방식',   value: 'AI 문맥 분석' },
                    { label: '사용 기술',   value: '정책 감지 + 자연어 처리' },
                    { label: '검증 기준',   value: 'AI 의미 유사도 점수' },
                    { label: '검증 근거',   value: '지표 적합성 검증' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 w-20">{row.label}</span>
                      <span className="text-gray-700 text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 uppercase tracking-wide">
                  AI 분석 엔진
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* ── K-ESG Verification Architecture ─────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Zap size={14} className="text-emerald-600" />
            </span>
            <span className="text-sm font-semibold text-gray-800">K-ESG 검증 구조</span>
            <span className="ml-auto text-[10px] text-gray-400 font-medium">AI 분석 엔진</span>
          </div>
          <div className="px-6 py-6 space-y-5">
            {/* 파이프라인 스텝 */}
            <div className="flex items-start gap-0 overflow-x-auto pb-2">
              {PIPELINE_STEPS.map((step, i) => {
                const isActive = i === 6; // Evidence Verification — highlight 검증 스텝
                return (
                  <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-1.5 min-w-[80px] flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-emerald-100 border-2 border-emerald-400 shadow-[0_0_10px_#05966930]'
                          : 'bg-emerald-50 border-2 border-emerald-200'
                      }`}>
                        <span className={`text-[10px] font-black ${isActive ? 'text-emerald-600' : 'text-emerald-500'}`}>{i + 1}</span>
                      </div>
                      <p className={`text-[8px] font-bold text-center leading-tight px-1 ${isActive ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {step.label.replace(' ', '\n')}
                      </p>
                      <p className="text-[7px] text-gray-400 text-center leading-tight px-1">{step.desc}</p>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="flex items-center pt-[14px] shrink-0">
                        <div className={`w-4 h-[1.5px] ${i < 6 ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                        <svg width="5" height="7" viewBox="0 0 6 8" className={i < 6 ? 'text-emerald-300' : 'text-gray-300'}>
                          <polyline points="0,0 6,4 0,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Tech stack chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider shrink-0">Stack:</span>
              {[
                { label: 'ChromaDB',    color: '#f59e0b' },
                { label: 'LangChain4j', color: '#3b82f6' },
                { label: 'GPT-4o',      color: '#a855f7' },
                { label: 'Upstage OCR', color: '#059669' },
              ].map(s => (
                <span key={s.label} className="text-[9px] font-bold px-2 py-0.5 rounded border font-mono"
                  style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                  {s.label}
                </span>
              ))}
            </div>

            {/* Metric chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider shrink-0">처리 시간:</span>
              {[
                { label: 'OCR',    value: d.ocrTimeMs    ? `${d.ocrTimeMs}ms`    : '—', color: '#059669' },
                { label: '임베딩', value: d.ragTimeMs    ? `${Math.round(d.ragTimeMs * 0.35)}ms` : '—', color: '#3b82f6' },
                { label: '검색',   value: d.ragTimeMs    ? `${Math.round(d.ragTimeMs * 0.65)}ms` : '—', color: '#a855f7' },
                { label: '검증',   value: d.verifyTimeMs ? `${d.verifyTimeMs}ms` : '—', color: '#f59e0b' },
                { label: '총처리', value: d.processingTimeMs ? `${d.processingTimeMs}ms` : '—', color: '#71717a' },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                  <span className="text-[8px] text-gray-500 font-mono uppercase">{m.label}</span>
                  <span className="text-[9px] font-black font-mono tabular-nums" style={{ color: m.color }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Audit Console ─────────────────────────────── */}
        <AuditConsole
          data={d}
          analysisSummary={analysisSummary}
          blockedIndicators={blockedIndicators}
          isBenchmarkFallback={isBenchmarkFallback}
        />

        {/* ── Audit Conclusion ──────────────────────────── */}
        {(() => {
          const eFailed  = analysisSummary?.e?.failed ?? 0;
          const eTotal5  = analysisSummary?.e?.total  ?? 5;
          const sgBlocked = blockedIndicators.length;
          const lowCount  = verificationStats.lowCount;
          const conf      = d.overallConfidence ?? 100;

          const risks = [];
          if (eFailed >= eTotal5 && eTotal5 > 0)
            risks.push({ tone: 'amber', text: `환경(E) 데이터 ${eFailed}건 수치 추출 실패 — 업종 평균 벤치마크 기반 추정 평가 적용. 실측 데이터 제출 시 정확도가 향상됩니다.` });
          else if (eFailed > 0)
            risks.push({ tone: 'amber', text: `환경(E) ${eFailed}개 항목 수치 추출 실패 — 해당 항목에 업종 평균 추정치 적용.` });
          if (lowCount > 0)
            risks.push({ tone: 'red', text: `수치 불일치 ${lowCount}건 감지 — 입력값과 증빙 문서 간 오차가 허용 범위를 초과하였습니다.` });
          if (sgBlocked > 0)
            risks.push({ tone: 'amber', text: `S/G ${sgBlocked}개 지표 AI 검증 근거 미검출 — 체크리스트 기반 평가 적용.` });
          if (d.gradeCeilingApplied)
            risks.push({ tone: 'zinc', text: '수치 불일치로 등급 제한(Grade Ceiling)이 적용되었습니다.' });

          const recs = [];
          if (eFailed > 0)
            recs.push('실측 환경 데이터(전력·가스·탄소·폐기물·용수)를 포함한 ESG 보고서를 재제출하세요.');
          if (lowCount > 0)
            recs.push('환경 데이터 입력값과 증빙 문서 수치를 재검토하여 불일치 항목을 수정하세요.');
          if (sgBlocked > 0)
            recs.push('사회(S)/지배구조(G) 관련 정책 문서 및 교육·윤리 운영 증빙을 추가 제출하세요.');
          if (recs.length === 0)
            recs.push('현재 분석 결과는 신뢰도가 높습니다. 정기적 ESG 데이터 갱신을 유지하세요.');

          const tone = lowCount >= 3 ? 'red' : (eFailed >= eTotal5 || sgBlocked >= 3) ? 'amber' : 'emerald';
          const toneColor = tone === 'red' ? '#ef4444' : tone === 'amber' ? '#f59e0b' : '#059669';

          const summaryText = isBenchmarkFallback
            ? '본 결과는 환경(E) 실측 데이터 부족으로 업종 평균 기반 추정 평가가 적용되었습니다. S/G 지표는 AI 문맥 분석 기반으로 평가되었습니다.'
            : sgBlocked > 0
            ? `본 결과는 제출된 ESG 증빙 문서와 입력 데이터를 기반으로 자동 분석되었습니다. ${sgBlocked}개 S/G 지표는 AI 문맥 분석 근거 부족으로 체크리스트 기반 평가가 적용되었습니다.`
            : '본 결과는 제출된 ESG 증빙 문서와 입력 데이터를 기반으로 자동 분석되었습니다. 환경(E) 지표는 수치 검증, S/G 지표는 AI 문맥 분석 방식으로 평가되었습니다.';

          return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${toneColor}15` }}>
                  <Shield size={14} style={{ color: toneColor }} />
                </span>
                <span className="text-sm font-semibold text-gray-800">AI 분석 결론</span>
                <span className="ml-auto text-[10px] text-gray-400">AI 종합 평가</span>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Summary */}
                <p className="text-sm text-gray-600 leading-relaxed">{summaryText}</p>

                {/* Risks */}
                {risks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">주의 사항</p>
                    {risks.map((r, i) => (
                      <div key={i} className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border ${
                        r.tone === 'red'   ? 'bg-red-50 border-red-200'
                        : r.tone === 'amber' ? 'bg-amber-50 border-amber-200'
                        : 'bg-gray-50 border-gray-200'
                      }`}>
                        <AlertTriangle size={11} className={`shrink-0 mt-0.5 ${r.tone === 'red' ? 'text-red-500' : r.tone === 'amber' ? 'text-amber-600' : 'text-gray-400'}`} />
                        <p className={`text-xs leading-relaxed ${r.tone === 'red' ? 'text-red-600' : r.tone === 'amber' ? 'text-amber-700' : 'text-gray-500'}`}>{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                <div className="space-y-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">개선 권장 사항</p>
                  <ul className="space-y-1.5">
                    {recs.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                        <span className="text-emerald-500 shrink-0 mt-0.5 font-bold">→</span>
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Metadata footer */}
                <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
                  {[
                    { label: '분석 ID',     value: String(d.analysisId ?? '-') },
                    { label: '신뢰도',      value: `${conf}%` },
                    { label: '등급',        value: d.finalGrade ?? '?' },
                    { label: '데이터 출처', value: isBenchmarkFallback ? '업종 평균 추정' : '실측' },
                    { label: '엔진',        value: 'v3' },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-1 text-[9px] font-mono">
                      <span className="text-gray-400">{m.label}:</span>
                      <span className="text-gray-700 font-bold">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        </>)}

        <div className="h-4" />
      </div>
    </div>

    {/* ── Evidence 상세 모달 ──────────────────────────────── */}
    {selectedEvidence && (
      <EvidenceDetailModal
        ev={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />
    )}
    </>
  );
}
