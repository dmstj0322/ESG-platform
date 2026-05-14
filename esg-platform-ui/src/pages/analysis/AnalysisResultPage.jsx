import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';
import api from '../../api/api';
import {
  ArrowLeft, AlertCircle, Loader2, ChevronDown, ChevronUp,
  Leaf, Users, Building2, TrendingUp, Shield,
  FileText, Zap, Info, Download, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { exportAnalysisResult } from '../../components/analysis/exportAnalysisResult';

let _marked = null;
try { _marked = (await import('marked')).marked; } catch { /* fallback */ }

// ── 상수 ─────────────────────────────────────────────────────────────────

const GRADE_COLOR = {
  S: '#a855f7', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444',
};

const GRADE_CLS = {
  S:    'bg-purple-500/15 text-purple-300 border-purple-500/30',
  A:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  B:    'bg-blue-500/15 text-blue-300 border-blue-500/30',
  C:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  D:    'bg-red-500/15 text-red-300 border-red-500/30',
  'N/A': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const ESG_COLOR = { E: '#22c55e', S: '#3b82f6', G: '#f59e0b' };
const ESG_LABEL = { E: '환경', S: '사회', G: '지배구조' };
const ESG_ICON  = { E: Leaf, S: Users, G: Building2 };

const CONF_CLS = {
  HIGH:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LOW:    'bg-red-500/15 text-red-400 border-red-500/30',
};

const CONF_ITEMS = [
  { label: 'Retrieval Similarity',   desc: 'K-ESG 지표와 문서 청크 간 코사인 유사도' },
  { label: 'Evidence Consistency',   desc: '근거 텍스트 내 논리 일관성 지수' },
  { label: 'Numeric Matching',       desc: '수치 데이터 추출 및 검증 일치율' },
  { label: 'Source Reliability',     desc: '문서 출처 및 공시 자료 신뢰도 가중치' },
];

// GPT 리포트 섹션 정의
const REPORT_SECTION_DEFS = [
  { key: 'summary',      icon: FileText,      color: '#818cf8', keywords: ['종합 총평', '개요', '총평', 'ESG 종합', '분석 결과', '종합 평가'] },
  { key: 'strengths',    icon: CheckCircle2,  color: '#22c55e', keywords: ['주요 강점', '강점', '우수', 'Strength'] },
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

// ── 마크다운 렌더러 ───────────────────────────────────────────────────
const renderMd = (text) => {
  if (!text) return '';
  try {
    if (_marked) return typeof _marked.parse === 'function' ? _marked.parse(text) : _marked(text);
  } catch { /* fallthrough */ }
  return text
    .replace(/^#### (.+)$/gm, '<h4 style="color:#a1a1aa;margin:1.2em 0 .3em;font-size:.875em;font-weight:700">$1</h4>')
    .replace(/^### (.+)$/gm,  '<h3 style="color:#d4d4d8;margin:1.4em 0 .4em;font-size:.95em;font-weight:800">$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2 style="color:#e4e4e7;margin:1.6em 0 .5em;font-size:1.05em;font-weight:900;letter-spacing:-.01em">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4f4f5;font-weight:700">$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em style="color:#a1a1aa">$1</em>')
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
    ? 'text-4xl font-black px-5 py-2 rounded-2xl tracking-wide'
    : size === 'lg'
    ? 'text-2xl font-black px-4 py-1.5 rounded-xl'
    : 'text-xs font-bold px-2.5 py-0.5 rounded-lg';
  return (
    <span className={`inline-flex items-center border font-mono ${cls} ${sz}`}>
      {grade ?? 'N/A'}
    </span>
  );
}

function SectionCard({ title, icon: Icon, iconColor, children, className = '', action }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${iconColor ?? '#6366f1'}18` }}
              >
                <Icon size={14} style={{ color: iconColor ?? '#818cf8' }} />
              </span>
            )}
            <span className="text-sm font-semibold text-zinc-300">{title}</span>
          </div>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function ScoreProgressBar({ score, color, height = 'h-1.5' }) {
  return (
    <div className={`${height} bg-zinc-800 rounded-full overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%`, background: color }}
      />
    </div>
  );
}

// ── Evidence Card (고도화) ─────────────────────────────────────────────
function EvidenceCard({ ev }) {
  const [expanded, setExpanded] = useState(false);

  const catChar   = ev.indicatorCode?.[0];
  const catColor  = ESG_COLOR[catChar] ?? '#a1a1aa';
  const catLabel  = ESG_LABEL[catChar] ?? null;

  const similarityPct  = toPct(ev.similarity);
  const finalScorePct  = toPct(ev.finalScore);
  const scoreColor     = finalScorePct  >= 70 ? '#22c55e' : finalScorePct  >= 50 ? '#f59e0b' : '#ef4444';
  const simColor       = similarityPct  >= 70 ? '#22c55e' : similarityPct  >= 50 ? '#f59e0b' : '#ef4444';

  const sourceFile = ev.sourceFile ?? ev.sourceFileName;
  const shortFile  = sourceFile ? sourceFile.split(/[/\\]/).pop() : null;
  const isLong     = (ev.evidenceText?.length ?? 0) > 200;

  return (
    <div className="group bg-zinc-800/30 border border-zinc-700/30 hover:bg-zinc-800/60 hover:border-zinc-600/60 hover:shadow-lg hover:shadow-zinc-950/40 rounded-xl p-4 transition-all duration-150 cursor-default">

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* ESG 카테고리 배지 */}
          {catLabel && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0"
              style={{ color: catColor, borderColor: `${catColor}40`, background: `${catColor}10` }}
            >
              {catChar} · {catLabel}
            </span>
          )}
          {/* 지표 코드 */}
          <span
            className="text-[10px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/50"
            style={{ color: catColor }}
          >
            {ev.indicatorCode ?? '-'}
          </span>
          {/* 지표명 */}
          <span className="text-sm font-semibold text-zinc-200 leading-tight">
            {ev.indicatorTitle ?? '-'}
          </span>
        </div>

        {/* 우측 배지들 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {ev.confidenceLevel && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CONF_CLS[ev.confidenceLevel] ?? CONF_CLS.LOW}`}>
              {ev.confidenceLevel}
            </span>
          )}
          {ev.retrievalRank != null && (
            <span className="text-[10px] font-mono bg-zinc-800 border border-zinc-700/30 px-1.5 py-0.5 rounded-md text-zinc-500">
              #{ev.retrievalRank}
            </span>
          )}
          {ev.pageNumber != null && (
            <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded-md text-zinc-600">
              p.{ev.pageNumber}
            </span>
          )}
        </div>
      </div>

      {/* 매칭 가이드라인 */}
      {ev.matchedGuideline && (
        <div className="mb-2 flex items-start gap-1.5 bg-zinc-800/40 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="text-zinc-600 shrink-0 mt-0.5" />
          <span className="text-[10px] text-zinc-500 leading-relaxed italic">{ev.matchedGuideline}</span>
        </div>
      )}

      {/* 원문 근거 — 3줄 clamp */}
      <p
        className={`text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors whitespace-pre-line${
          !expanded && isLong ? ' line-clamp-3' : ''
        }`}
      >
        {ev.evidenceText ?? '-'}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1.5 text-[10px] font-semibold text-zinc-600 hover:text-emerald-400 transition-colors"
        >
          {expanded ? '접기 ▲' : '더 보기 ▼'}
        </button>
      )}

      {/* 점수 프로그레스 바 */}
      {(similarityPct != null || finalScorePct != null) && (
        <div className="mt-3 pt-3 border-t border-zinc-700/30 space-y-2">
          {similarityPct != null && (
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] text-zinc-600 w-16 shrink-0 font-medium">유사도</span>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${similarityPct}%`, background: simColor }} />
              </div>
              <span className="text-[10px] font-bold tabular-nums font-mono w-8 text-right shrink-0" style={{ color: simColor }}>
                {similarityPct}%
              </span>
            </div>
          )}
          {finalScorePct != null && (
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] text-zinc-600 w-16 shrink-0 font-medium">종합 점수</span>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${finalScorePct}%`, background: scoreColor }} />
              </div>
              <span className="text-[10px] font-bold tabular-nums font-mono w-8 text-right shrink-0" style={{ color: scoreColor }}>
                {finalScorePct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* 수치 검증 (E 카테고리 Numeric Matching) */}
      {ev.numericMatchLevel && (
        <div className={`mt-3 pt-3 border-t ${ev.numericMatchLevel === 'LOW' ? 'border-red-700/40' : ev.numericMatchLevel === 'MEDIUM' ? 'border-amber-700/40' : 'border-emerald-700/30'}`}>
          {/* 불일치 경고 배너 */}
          {ev.numericMatchLevel === 'LOW' && (
            <div className="flex items-center gap-1.5 mb-2 bg-red-900/20 border border-red-700/40 rounded-lg px-2.5 py-1.5">
              <AlertTriangle size={10} className="text-red-400 shrink-0" />
              <span className="text-[10px] font-semibold text-red-300">수치 불일치 감지 — 입력값과 증빙 문서의 수치가 크게 다릅니다</span>
            </div>
          )}
          {/* 입력값 vs 추출값 비교 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-zinc-500 font-medium">수치 검증</span>
              {ev.numericMetric && (
                <span className="text-[10px] font-mono bg-zinc-800 border border-zinc-700/30 px-1.5 py-0.5 rounded-md text-zinc-500">
                  {ev.numericMetric} ({ev.unit ?? '-'})
                </span>
              )}
              {ev.inputValue != null && (
                <span className="text-[10px] text-zinc-400">
                  입력: <span className="font-mono font-semibold text-zinc-200">{ev.inputValue.toLocaleString()}</span>
                </span>
              )}
              {ev.extractedValue != null && (
                <span className="text-[10px] text-zinc-400">
                  추출: <span className="font-mono font-semibold text-zinc-200">{ev.extractedValue.toLocaleString()}</span>
                </span>
              )}
              {ev.numericDiffPercent != null && (
                <span className="text-[10px] text-zinc-500">
                  (오차 <span className="font-mono">{ev.numericDiffPercent.toFixed(1)}%</span>)
                </span>
              )}
            </div>
            {/* MATCH / MISMATCH 배지 */}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
              ev.numericMatchLevel === 'HIGH'   ? 'text-emerald-300 border-emerald-600/50 bg-emerald-900/20' :
              ev.numericMatchLevel === 'MEDIUM' ? 'text-amber-300 border-amber-600/50 bg-amber-900/20' :
                                                  'text-red-300 border-red-600/50 bg-red-900/20'
            }`}>
              {ev.numericMatchLevel === 'HIGH' ? 'MATCH' : 'MISMATCH'}
            </span>
          </div>
        </div>
      )}

      {/* 소스 파일 */}
      {shortFile && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <FileText size={10} className="text-zinc-700 shrink-0" />
          <span className="text-[10px] text-zinc-700 truncate flex-1">{shortFile}</span>
          {ev.isValidEvidence === true && (
            <CheckCircle2 size={10} className="text-emerald-600/70 shrink-0" />
          )}
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors group"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            style={{ background: `${section.color}18` }}
          >
            <Icon size={15} style={{ color: section.color }} />
          </span>
          <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
            {section.title}
          </span>
        </div>
        {open
          ? <ChevronUp size={15} className="text-zinc-600" />
          : <ChevronDown size={15} className="text-zinc-600" />
        }
      </button>
      {open && (
        <div className="px-6 pb-6 pt-2 border-t border-zinc-800/60">
          <div
            className="text-sm text-zinc-400 leading-relaxed"
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
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs shadow-2xl">
      {label && <p className="text-zinc-400 mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill ?? '#e4e4e7' }} className="tabular-nums">
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
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs shadow-2xl">
      <p className="text-zinc-300">
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

// ── 메인 ─────────────────────────────────────────────────────────────

export default function AnalysisResultPage() {
  const { analysisId } = useParams();
  const navigate = useNavigate();

  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [evTab, setEvTab]               = useState('ALL');
  const [isPdfLoading, setIsPdfLoading] = useState(false);

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

  useEffect(() => {
    setLoading(true);
    api.get(`/api/v1/analysis/${analysisId}/result`)
      .then(r => {
        const normalized = normalizeScore(r.data);
        console.log('[ESG Result] raw:', r.data, '→ normalized:', normalized);
        setData(normalized);
        setLoading(false);
      })
      .catch(e => { setError(e.response?.data?.message ?? e.message); setLoading(false); });
  }, [analysisId]);

  const radarData     = useMemo(() => data?.esgChart?.radar?.map(r => ({ subject: r.label, score: r.score, fullMark: 100 })) ?? [], [data]);
  const breakdownData = useMemo(() => data?.esgChart?.breakdown ?? [], [data]);
  const evidenceList  = useMemo(() => {
    const list = data?.evidenceMatches ?? [];
    if (evTab === 'ALL') return list;
    return list.filter(e => e.indicatorCode?.startsWith(evTab));
  }, [data, evTab]);
  const benchMetrics  = useMemo(() => data?.benchmarkComparison?.metrics ?? [], [data]);
  const reportSections = useMemo(() => parseReportSections(data?.fullReport), [data]);

  // ── 로딩 ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full border-2 border-zinc-800 flex items-center justify-center">
          <Loader2 size={24} className="text-emerald-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-zinc-300 font-medium text-sm">분석 결과 로딩 중</p>
          <p className="text-zinc-600 text-xs mt-0.5">잠시만 기다려 주세요...</p>
        </div>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertCircle size={24} className="text-red-400" />
        </div>
        <div>
          <p className="text-zinc-300 font-medium text-sm">{error ?? '결과를 불러올 수 없습니다.'}</p>
          <p className="text-zinc-600 text-xs mt-0.5">분석 ID: {analysisId}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <ArrowLeft size={12} /> 돌아가기
        </button>
      </div>
    </div>
  );

  const d               = data;
  const gradeAccentColor = GRADE_COLOR[d.finalGrade] ?? '#52525b';

  // EcoPoint 관련 파생 값
  const hasEco         = d.ecoPoints > 0 || d.carbonReductionKg > 0;
  const sScoreBefore   = d.sScoreBefore   ?? null;
  const sScoreAfter    = d.sScoreAfter    ?? (hasEco ? d.sScore : null);
  const ecoScoreBonus  = d.ecoScoreBonus  ?? (sScoreBefore != null && sScoreAfter != null ? sScoreAfter - sScoreBefore : null);
  const participantCnt = d.participantCount ?? null;
  const hasBeforeAfter = sScoreBefore != null && sScoreAfter != null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-5">

        {/* ── 뒤로가기 + PDF ─────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={13} /> 이전으로
          </button>
          <button
            onClick={handlePdfExport}
            disabled={isPdfLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-xs font-semibold text-zinc-300 hover:text-white transition-all duration-150 disabled:opacity-50"
          >
            {isPdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            PDF 다운로드
          </button>
        </div>

        {/* ── Hero 헤더 ─────────────────────────────────────── */}
        <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${gradeAccentColor} 0%, transparent 60%)` }} />
          <div className="absolute top-0 left-0 w-64 h-32 pointer-events-none" style={{ background: `radial-gradient(ellipse at 0% 0%, ${gradeAccentColor}10 0%, transparent 70%)` }} />
          <div className="relative px-8 py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono" style={{ color: gradeAccentColor, borderColor: `${gradeAccentColor}40`, background: `${gradeAccentColor}10` }}>
                  K-ESG
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight truncate">
                {d.companyName ?? '기업 ESG 분석 결과'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-zinc-500">
                {d.industry && (
                  <span className="flex items-center gap-1"><Building2 size={11} className="shrink-0" />{d.industry}</span>
                )}
                {d.analyzedAt && <span>{d.analyzedAt.replace('T', ' ').slice(0, 19)}</span>}
                {d.overallConfidence != null && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${CONF_CLS[getConfLevel(d.overallConfidence)] ?? ''}`}>
                    <Shield size={10} className="shrink-0" />
                    신뢰도 {d.overallConfidence}%{' '}
                    <span className="font-bold">{getConfLevel(d.overallConfidence) ?? 'N/A'}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-end gap-5 shrink-0">
              {d.totalScore != null && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-0.5">종합 점수</p>
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-black tabular-nums leading-none" style={{ color: gradeAccentColor }}>{d.totalScore}</span>
                    <span className="text-base text-zinc-500 mb-1">/ 100</span>
                  </div>
                </div>
              )}
              <div className="text-center">
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">등급</p>
                <GradeBadge grade={d.finalGrade} size="xl" />
                {d.gradeCeilingApplied && (
                  <p className="text-[9px] font-bold text-red-400 mt-1 whitespace-nowrap">검증 실패 등급 제한</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── E / S / G 스코어 카드 ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['E', 'S', 'G']).map((cat) => {
            const score   = cat === 'E' ? d.eScore : cat === 'S' ? d.sScore : d.gScore;
            const radarPt = d.esgChart?.radar?.find(r => r.category === cat);
            const color   = ESG_COLOR[cat];
            const Icon    = ESG_ICON[cat];
            const safe    = score ?? 0;
            return (
              <div key={cat} className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 overflow-hidden hover:border-zinc-700 transition-all duration-200 group">
                <div className="absolute top-0 left-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: color }} />
                <div className="absolute bottom-0 left-0 right-0 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ background: `linear-gradient(0deg, ${color}08 0%, transparent 100%)` }} />
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                      <Icon size={17} style={{ color }} />
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color }}>
                        {cat === 'E' ? 'Environmental' : cat === 'S' ? 'Social' : 'Governance'}
                      </p>
                      <p className="text-xs font-semibold text-zinc-300 leading-none mt-0.5">
                        {cat === 'E' ? '환경' : cat === 'S' ? '사회' : '지배구조'}
                      </p>
                    </div>
                  </div>
                  <GradeBadge grade={radarPt?.grade} />
                </div>
                <div className="mb-3">
                  <span className="text-4xl font-black tabular-nums leading-none" style={{ color: safe >= 70 ? color : safe >= 50 ? '#f59e0b' : '#ef4444' }}>{safe}</span>
                  <span className="text-sm text-zinc-500 ml-1">점</span>
                </div>
                <ScoreProgressBar score={safe} color={color} height="h-2" />
                <p className="text-[10px] text-zinc-600 mt-2 tabular-nums">{safe} / 100</p>
              </div>
            );
          })}
        </div>

        {/* ── 수치 검증 실패 경고 배너 ─────────────────────── */}
        {(d.lowMismatchCount > 0) && (
          <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${
            d.lowMismatchCount >= 4
              ? 'bg-red-900/25 border-red-700/50'
              : 'bg-red-900/15 border-red-700/35'
          }`}>
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-red-300">
                  {d.lowMismatchCount >= 4 ? '심각한 수치 불일치 감지' : '수치 불일치 감지'}
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-800/50 border border-red-600/50 text-red-200">
                  검증 실패 {d.lowMismatchCount}건
                </span>
                {d.gradeCeilingApplied && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-800/40 border border-amber-600/50 text-amber-200">
                    등급 제한 적용
                  </span>
                )}
              </div>
              <p className="text-xs text-red-400/80 mt-1">
                {d.lowMismatchCount >= 4
                  ? `입력한 ESG 환경 데이터 ${d.lowMismatchCount}개 항목이 증빙 문서 수치와 심각하게 불일치합니다.`
                  : `입력한 ESG 환경 데이터가 증빙 문서 수치와 일치하지 않는 항목이 있습니다.`}
                {d.gradeCeilingApplied && (
                  <span className="ml-2 font-semibold text-amber-300">
                    수치 검증 실패로 등급 제한이 적용되었습니다.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── [3] EcoPoint 시각화 ───────────────────────────── */}
        {hasEco && (
          <div
            className="border rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(16,185,129,0.03) 100%)', borderColor: 'rgba(34,197,94,0.2)' }}
          >
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'rgba(34,197,94,0.15)' }}>
              <span className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Zap size={15} className="text-emerald-400" />
              </span>
              <span className="text-sm font-semibold text-emerald-300">EcoPoint 반영 결과</span>
              {ecoScoreBonus != null && ecoScoreBonus > 0 && (
                <span className="ml-auto text-xs font-black px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  S +{ecoScoreBonus}
                </span>
              )}
            </div>

            <div className="px-6 py-5">
              {/* 주요 메트릭 행 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                {d.ecoPoints > 0 && (
                  <div className="bg-zinc-900/60 rounded-xl p-4 border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">에코 포인트</p>
                    <p className="text-2xl font-black text-emerald-300 tabular-nums leading-none">
                      {d.ecoPoints.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">P</p>
                  </div>
                )}
                {d.carbonReductionKg > 0 && (
                  <div className="bg-zinc-900/60 rounded-xl p-4 border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">탄소 절감량</p>
                    <p className="text-2xl font-black text-white tabular-nums leading-none">
                      {(d.carbonReductionKg / 1000).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">tCO₂</p>
                  </div>
                )}
                {d.equivalentTrees > 0 && (
                  <div className="bg-zinc-900/60 rounded-xl p-4 border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">나무 환산</p>
                    <p className="text-2xl font-black text-white tabular-nums leading-none">
                      {Math.round(d.equivalentTrees).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">그루</p>
                  </div>
                )}
                {participantCnt != null && (
                  <div className="bg-zinc-900/60 rounded-xl p-4 border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">임직원 참여</p>
                    <p className="text-2xl font-black text-white tabular-nums leading-none">
                      {participantCnt.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">명</p>
                  </div>
                )}
              </div>

              {/* S 점수 before/after */}
              {hasBeforeAfter && (
                <div className="bg-zinc-900/60 rounded-xl p-4 border border-emerald-500/10">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">사회(S) 점수 변화</p>
                  <div className="flex items-center gap-4">
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-zinc-600 mb-0.5">반영 전</p>
                      <p className="text-xl font-black text-zinc-400 tabular-nums">{sScoreBefore}</p>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-zinc-600 transition-all duration-700" style={{ width: `${sScoreBefore}%` }} />
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${sScoreAfter}%` }} />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <p className="text-[10px] text-zinc-600 mb-0.5">반영 후</p>
                      <p className="text-xl font-black text-emerald-300 tabular-nums">{sScoreAfter}</p>
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
                <div className="flex items-center gap-3 bg-zinc-900/60 rounded-xl p-3 border border-emerald-500/10">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-zinc-400">
                    EcoPoint 참여 활동이 사회(S) 점수에{' '}
                    <span className="text-emerald-300 font-bold">+{ecoScoreBonus}점</span> 반영되었습니다.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 신뢰도 분석 카드 ─────────────────────────────── */}
        {d.overallConfidence != null && (() => {
          const confLevel = getConfLevel(d.overallConfidence);
          return (
            <SectionCard title="신뢰도 분석" icon={Shield} iconColor="#a855f7">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                    입력 데이터와 증빙 자료 간 근거 일치도를 기반으로 신뢰도를 계산합니다.
                  </p>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/40 mb-4">
                    <div>
                      <span className="text-4xl font-black text-white tabular-nums leading-none">{d.overallConfidence}</span>
                      <span className="text-lg text-zinc-500 ml-0.5">%</span>
                      <p className="text-[10px] text-zinc-600 mt-1 uppercase tracking-wider font-semibold">종합 신뢰도</p>
                    </div>
                    <div className="ml-auto flex flex-col items-end gap-2 min-w-[100px]">
                      <span className={`text-sm font-bold px-3 py-1.5 rounded-xl border ${CONF_CLS[confLevel] ?? CONF_CLS.LOW}`}>
                        {confLevel ?? 'N/A'}
                      </span>
                      <div className="w-full">
                        <ScoreProgressBar score={d.overallConfidence} color={confLevel === 'HIGH' ? '#22c55e' : confLevel === 'MEDIUM' ? '#f59e0b' : '#ef4444'} height="h-1.5" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="sm:w-64 shrink-0 space-y-0 border-l border-zinc-800/60 pl-6">
                  {CONF_ITEMS.map(item => (
                    <div key={item.label} className="flex items-start gap-2.5 py-2.5 border-b border-zinc-800/50 last:border-b-0 last:pb-0 first:pt-0">
                      <CheckCircle2 size={13} className="text-purple-500/60 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-zinc-300 leading-none">{item.label}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          );
        })()}

        {/* ── 레이더 차트 + 카테고리 상세 ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="ESG 카테고리 점수" icon={TrendingUp} iconColor="#22c55e">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={95}>
                  <PolarGrid stroke="#3f3f46" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 12, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#52525b', fontSize: 9 }} tickCount={5} />
                  <Radar name="점수" dataKey="score" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2.5} />
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-zinc-600 text-sm">차트 데이터가 없습니다</p>
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
                      <span className="text-sm font-medium text-zinc-300">{r.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-base tabular-nums">{r.score}</span>
                      <GradeBadge grade={r.grade} />
                    </div>
                  </div>
                  <ScoreProgressBar score={r.score} color={ESG_COLOR[r.category]} height="h-1.5" />
                </div>
              ))}
              {d.overallOpinion && (
                <div className="pt-5 border-t border-zinc-800 mt-5">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">종합 의견</p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{d.overallOpinion}</p>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── 지표별 세부 점수 ──────────────────────────────── */}
        {breakdownData.length > 0 && (
          <SectionCard title={`지표별 세부 점수 — K-ESG ${breakdownData.length}개 지표`} icon={FileText} iconColor="#f59e0b">
            <ResponsiveContainer width="100%" height={Math.max(400, breakdownData.length * 28)}>
              <BarChart data={breakdownData} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#52525b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} />
                <YAxis type="category" dataKey="title" width={136} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs shadow-2xl">
                        <p className="text-zinc-200 font-semibold mb-1.5">{p.title}</p>
                        <p className="text-zinc-400">코드: <span className="font-mono text-zinc-300">{p.kesgCode}</span></p>
                        <p className="text-zinc-400">점수: <span className="text-white font-bold">{p.score}점</span> · 등급: <span style={{ color: gradeBarColor(p.grade), fontWeight: 700 }}>{p.grade}</span></p>
                        <p className="text-zinc-400">신뢰도: <span className="text-zinc-200">{p.confidence}%</span></p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {breakdownData.map((entry, idx) => (
                    <Cell key={idx} fill={gradeBarColor(entry.grade)} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-zinc-800">
              {['S', 'A', 'B', 'C', 'D'].map(g => (
                <span key={g} className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: gradeBarColor(g) }} />
                  {g}등급
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── [4] 업종 벤치마크 비교 (강화) ────────────────── */}
        <SectionCard
          title={`업종 벤치마크 비교${d.benchmarkComparison?.industry ? ` — ${d.benchmarkComparison.industry}` : ''}${d.benchmarkComparison?.regionName ? ` · ${d.benchmarkComparison.regionName}` : ''}`}
          icon={TrendingUp}
          iconColor="#a855f7"
        >
          {benchMetrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <TrendingUp size={20} className="text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500 font-medium">비교 데이터 없음</p>
              <p className="text-xs text-zinc-700">업종 벤치마크 데이터가 없습니다.</p>
            </div>
          ) : (
            <>
              {d.benchmarkComparison?.companyDataSource === 'BENCHMARK' && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
                  <AlertCircle size={13} className="shrink-0" />
                  기업 실측 데이터 미등록 — 업종 평균값으로 대체 표시됩니다.
                </div>
              )}
              <div className="flex gap-5 mb-5 text-xs text-zinc-500">
                <span className="flex items-center gap-2"><span className="w-3 h-2 rounded-sm inline-block bg-blue-500/80" />우리 기업</span>
                <span className="flex items-center gap-2"><span className="w-3 h-2 rounded-sm inline-block bg-zinc-600" />업종 평균</span>
              </div>
              <div className="space-y-4">
                {benchMetrics.map((metric, idx) => {
                  const companyVal  = metric.company    ?? 0;
                  const industryVal = metric.industryAvg ?? 0;
                  const maxVal      = Math.max(companyVal, industryVal);
                  const yDomain     = [0, Math.ceil(maxVal * 1.3)];
                  const diff        = industryVal > 0 ? ((companyVal - industryVal) / industryVal) * 100 : null;
                  const lib         = lowerIsBetter(metric.unit);
                  const better      = diff != null && (lib ? diff < 0 : diff > 0);
                  const chartData   = [{ name: metric.name, company: companyVal, industryAvg: industryVal, unit: metric.unit }];

                  return (
                    <div key={idx} className="p-4 rounded-xl bg-zinc-800/20 border border-zinc-700/30 hover:border-zinc-600/40 transition-colors">
                      {/* 헤더 */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-zinc-200">{metric.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700/50">
                            {metric.unit}
                          </span>
                          {diff != null && (
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                              better
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {better ? '▼' : '▲'} {Math.abs(diff).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      {diff != null && (
                        <p className="text-[10px] text-zinc-600 mb-3">
                          업종 평균 대비 {Math.abs(diff).toFixed(1)}%{' '}
                          <span className={better ? 'text-emerald-500' : 'text-red-400'}>
                            {better ? (lib ? '낮음 — 양호' : '높음 — 양호') : (lib ? '높음 — 개선 필요' : '낮음 — 개선 필요')}
                          </span>
                        </p>
                      )}
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                          <XAxis dataKey="name" hide />
                          <YAxis domain={yDomain} tickFormatter={fmtBenchNum} tick={{ fill: '#52525b', fontSize: 9 }} tickLine={false} axisLine={false} width={42} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs shadow-2xl">
                                  <p className="text-zinc-400 mb-1 font-medium">{metric.name}</p>
                                  {payload.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.fill }} />
                                      <span style={{ color: p.fill }} className="tabular-nums">
                                        {p.name}: <strong>{fmtBenchNum(p.value)} {metric.unit}</strong>
                                      </span>
                                    </div>
                                  ))}
                                  {diff != null && (
                                    <p className={`mt-1.5 font-semibold ${better ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {better ? '✓ 업종 평균 대비 양호' : '! 업종 평균 대비 개선 필요'}
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="company" name="우리 기업" fill={better ? '#22c55e' : '#3b82f6'} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={56} />
                          <Bar dataKey="industryAvg" name="업종 평균" fill="#52525b" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={56} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex justify-between mt-2 text-[10px] tabular-nums text-zinc-500">
                        <span>
                          <span className={`font-semibold ${better ? 'text-emerald-400' : 'text-blue-400'}`}>우리 기업</span>
                          {' '}{fmtBenchNum(companyVal)} {metric.unit}
                        </span>
                        <span>
                          <span className="font-semibold text-zinc-400">업종 평균</span>
                          {' '}{fmtBenchNum(industryVal)} {metric.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SectionCard>

        {/* ── [1] Evidence 상세 (고도화) ───────────────────── */}
        <SectionCard
          title="Evidence 상세"
          icon={FileText}
          iconColor="#22c55e"
          action={
            d.evidenceMatches?.length > 0
              ? <span className="text-xs text-zinc-500 tabular-nums">{d.evidenceMatches.length}건</span>
              : null
          }
        >
          {!d.evidenceMatches?.length ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <FileText size={20} className="text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500 font-medium">Evidence 데이터 없음</p>
              <p className="text-xs text-zinc-700">RAG 파이프라인에서 추출된 근거가 없습니다.</p>
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
                        evTab === tab ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
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
                  <div className="flex items-center gap-2 mb-3 bg-red-900/20 border border-red-700/40 rounded-xl px-3.5 py-2.5">
                    <AlertTriangle size={13} className="text-red-400 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-red-300">수치 불일치 감지</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-800/50 border border-red-600/40 text-red-200">
                          LOW {lowEvs.length}건
                        </span>
                        {d.gradeCeilingApplied && (
                          <span className="text-[10px] font-semibold text-amber-300">→ 등급 제한 적용됨</span>
                        )}
                      </div>
                      <p className="text-[10px] text-red-400/70 mt-0.5">입력한 ESG 환경 데이터와 증빙 문서에서 추출된 수치 간 큰 차이가 있습니다. Evidence 카드를 확인하세요.</p>
                    </div>
                  </div>
                );
              })()}

              {/* Evidence 목록 */}
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1 -mr-1">
                {evidenceList.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600 text-sm">
                    해당 카테고리의 Evidence가 없습니다.
                  </div>
                ) : (
                  evidenceList.map((ev, i) => <EvidenceCard key={i} ev={ev} />)
                )}
              </div>
            </>
          )}
        </SectionCard>

        {/* ── Risk & Opportunity ──────────────────────────── */}
        {d.riskOpportunity && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="Risk & Opportunity 분석" icon={AlertTriangle} iconColor="#f59e0b">
              <div
                className="text-sm text-zinc-400 leading-relaxed"
                style={{ lineHeight: '1.9' }}
                dangerouslySetInnerHTML={{ __html: renderMd(d.riskOpportunity) }}
              />
            </SectionCard>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">분석 요약</p>
              <div className="space-y-3">
                {[
                  { label: '환경(E) 점수',     value: d.eScore,    color: ESG_COLOR.E },
                  { label: '사회(S) 점수',     value: d.sScore,    color: ESG_COLOR.S },
                  { label: '지배구조(G) 점수', value: d.gScore,    color: ESG_COLOR.G },
                  { label: '종합 점수',         value: d.totalScore, color: gradeAccentColor },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-zinc-500">{item.label}</span>
                      <span className="text-sm font-bold text-white tabular-nums">{item.value ?? 0}</span>
                    </div>
                    <ScoreProgressBar score={item.value} color={item.color} height="h-1" />
                  </div>
                ))}
              </div>
              {d.finalGrade && (
                <div className="mt-auto pt-4 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">최종 등급</span>
                  <GradeBadge grade={d.finalGrade} size="lg" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── [2] AI 분석 리포트 (섹션 분리) ─────────────── */}
        {reportSections.length > 0 && (
          <div>
            {/* 섹션 헤더 */}
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <span className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                <FileText size={14} className="text-indigo-400" />
              </span>
              <span className="text-sm font-semibold text-zinc-300">AI 분석 리포트</span>
              <span className="text-xs text-zinc-600 ml-1">— GPT 기반 종합 진단</span>
            </div>
            <div className="space-y-2">
              {reportSections.map((section, i) => (
                <GptReportCard key={i} section={section} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        )}

        {/* 전체 리포트 (섹션 파싱 실패 시 폴백) */}
        {d.fullReport && reportSections.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-zinc-800/60">
              <span className="w-7 h-7 rounded-lg bg-zinc-700/60 flex items-center justify-center">
                <FileText size={14} className="text-zinc-400" />
              </span>
              <span className="text-sm font-semibold text-zinc-300">전체 분석 리포트</span>
            </div>
            <div className="px-8 pb-8 pt-4">
              <div
                className="text-sm text-zinc-400"
                style={{ lineHeight: '1.9' }}
                dangerouslySetInnerHTML={{ __html: renderMd(d.fullReport) }}
              />
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
