import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Shield, AlertTriangle, CheckCircle2, CheckCircle,
  FileText, Cpu, Clock, RefreshCw, ChevronRight, Plus, AlertCircle,
  BarChart2, Building2, Leaf, Users, Activity, Zap, ArrowUpRight,
} from 'lucide-react';
import api from '../../api/api';
import { useAnalysis } from '../../context/AnalysisContext';

// ── 상수 ────────────────────────────────────────────────────────────
const GRADE_COLOR = { S: '#a855f7', A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
const GRADE_CLS = {
  S: 'bg-purple-50 text-purple-700 border-purple-200',
  A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  B: 'bg-blue-50 text-blue-700 border-blue-200',
  C: 'bg-amber-50 text-amber-700 border-amber-200',
  D: 'bg-red-50 text-red-600 border-red-200',
};

const fmtDate = (s) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch { return '—'; }
};

const fmtScore = (v) => (v != null ? Math.round(v) : '—');

// sections에서 E/S/G 점수 추출
const extractScores = (sections = []) => ({
  E: sections.find(s => ['Environment','E'].includes(s.category))?.score ?? null,
  S: sections.find(s => ['Social','S'].includes(s.category))?.score ?? null,
  G: sections.find(s => ['Governance','G'].includes(s.category))?.score ?? null,
});

// totalScore 계산 (K-ESG 기준 E:0.4 S:0.3 G:0.3)
const computeTotal = ({ E, S, G }) => {
  if (E == null && S == null && G == null) return null;
  return Math.round((E ?? 0) * 0.40 + (S ?? 0) * 0.30 + (G ?? 0) * 0.30);
};

// evidence로부터 risk 목록 도출
const computeRisks = (report) => {
  if (!report) return [];
  const risks = [];
  const em = report.evidenceMapping ?? [];

  // LOW confidence evidence
  const low = em.filter(e => (e.confidenceScore ?? e.confidence ?? 100) < 40).length;
  const med = em.filter(e => {
    const c = e.confidenceScore ?? e.confidence ?? 100;
    return c >= 40 && c < 65;
  }).length;

  const SG_CODES = ['S-201','S-202','S-203','S-204','S-205','G-301','G-302','G-303','G-304','G-305'];
  const detected = new Set(em.map(e => e.kesgCode));
  const gBlocked = SG_CODES.filter(c => c.startsWith('G') && !detected.has(c));
  const sBlocked = SG_CODES.filter(c => c.startsWith('S') && !detected.has(c));

  if (low >= 2)
    risks.push({ sev: 'HIGH', code: 'E-CONF', title: '신뢰도 낮은 증빙 다수 감지', desc: `${low}개 지표에서 신뢰도 40% 미만의 evidence가 검출되었습니다.` });
  else if (low === 1)
    risks.push({ sev: 'MED', code: 'E-CONF', title: '신뢰도 낮은 증빙', desc: '1개 지표에서 신뢰도가 낮은 evidence가 감지되었습니다.' });

  if (gBlocked.length >= 2)
    risks.push({ sev: 'HIGH', code: 'G-EVIDENCE', title: '지배구조 근거 부족', desc: `${gBlocked.length}개 G 지표에서 evidence가 미검출되었습니다.` });
  else if (gBlocked.length === 1)
    risks.push({ sev: 'MED', code: 'G-EVIDENCE', title: '지배구조 증빙 부족', desc: '1개 G 지표에서 evidence가 미검출되었습니다.' });

  if (sBlocked.length >= 2)
    risks.push({ sev: 'MED', code: 'S-EVIDENCE', title: '사회 지표 증빙 부족', desc: `${sBlocked.length}개 S 지표에서 evidence가 미검출되었습니다.` });

  if (med >= 2)
    risks.push({ sev: 'LOW', code: 'CONFIDENCE', title: '검증 신뢰도 개선 필요', desc: `${med}개 지표에서 신뢰도 65% 미만의 evidence가 감지되었습니다.` });

  return risks.slice(0, 5);
};

// ── AI 추천 인사이트 생성 ──────────────────────────────────────────
const buildInsights = (report, scores, risks) => {
  const insights = [];
  const grade = report?.finalGrade;
  const total = computeTotal(scores);

  if (grade === 'A' || grade === 'S') {
    insights.push({ type: 'strength', text: `${grade}등급은 K-ESG 상위 수준입니다. 증빙 품질을 유지하면 등급 유지가 가능합니다.` });
  } else if (grade === 'C' || grade === 'D') {
    insights.push({ type: 'risk', text: '현재 등급은 개선이 필요한 수준입니다. 증빙 보완을 통해 점수 향상이 가능합니다.' });
  }

  if (scores.E != null && scores.E < 50)
    insights.push({ type: 'action', text: `환경(E) 점수(${Math.round(scores.E)}점)가 낮습니다. CSV 수치 파일과 PDF 증빙을 보완해주세요.` });
  if (scores.G != null && scores.G < 60)
    insights.push({ type: 'action', text: `지배구조(G) 점수(${Math.round(scores.G)}점) 개선을 위해 이사회/내부통제 관련 정책 문서를 보완하세요.` });

  const highRisks = risks.filter(r => r.sev === 'HIGH');
  if (highRisks.length > 0)
    insights.push({ type: 'risk', text: `${highRisks.length}건의 HIGH 수준 조치 항목이 있습니다. 즉시 확인이 필요합니다.` });

  if (insights.length === 0)
    insights.push({ type: 'info', text: '현재 분석 결과를 기반으로 지속적인 모니터링을 권장합니다.' });

  return insights.slice(0, 3);
};

// ── 로딩 Skeleton ────────────────────────────────────────────────────
function KPISkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 animate-pulse">
      <div className="h-2 w-16 bg-gray-100 rounded mb-4" />
      <div className="h-10 w-14 bg-gray-100 rounded mb-3" />
      <div className="h-1.5 w-full bg-gray-100 rounded" />
    </div>
  );
}

function HeroStatSkeleton() {
  return <div className="flex-1 h-24 rounded-2xl bg-white/5 animate-pulse" />;
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    companyId,
    latestReport,
    benchmarkData,
    carbonStats,
    fetchLatestData,
    fetchBenchmarkData,
  } = useAnalysis();

  const [loading, setLoading]   = useState(false);
  const [history, setHistory]   = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchLatestData(),
      fetchBenchmarkData(),
    ]);
    // 분석 기록 (stats endpoint 활용)
    try {
      const res = await api.get('/analysis/stats', {
        headers: { 'X-Company-Id': companyId },
      });
      if (Array.isArray(res.data)) setHistory(res.data);
    } catch { /* stats 없으면 빈 배열 유지 */ }
    setLoading(false);
  }, [companyId, fetchLatestData, fetchBenchmarkData]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 파생 데이터 ──────────────────────────────────────────────────
  const scores    = extractScores(latestReport?.sections ?? []);
  const totalScore = latestReport?.totalScore ?? computeTotal(scores);
  const risks     = computeRisks(latestReport);
  const insights  = buildInsights(latestReport, scores, risks);

  const gradeAccent = GRADE_COLOR[latestReport?.finalGrade] ?? '#6b7280';
  const gradeCls    = GRADE_CLS[latestReport?.finalGrade] ?? 'bg-gray-100 text-gray-500 border-gray-200';

  // Benchmark 위치 (annualReductionPercent 활용 — 탄소 배출 비교)
  const benchReduct = benchmarkData?.annualReductionPercent;
  const benchBetter = benchReduct != null && benchReduct < 0;

  // 탄소 추이 데이터 (월별)
  const emissionTrend = (benchmarkData?.monthlyData ?? carbonStats?.map((c, i) => ({
    monthLabel: `${i + 1}월`,
    myEmissionTco2: c.totalEmission,
  })) ?? []).slice(-6);

  // HIGH/MED 리스크 건수
  const highCount = risks.filter(r => r.sev === 'HIGH').length;
  const medCount  = risks.filter(r => r.sev === 'MED').length;

  // ── KPI 카드 데이터 ────────────────────────────────────────────
  const kpiCards = [
    {
      id: 'grade',
      label: 'ESG 종합 등급',
      sub: 'K-ESG 기준',
      value: latestReport?.finalGrade ?? '—',
      valueClass: 'font-black font-mono text-4xl leading-none',
      valueColor: gradeAccent,
      extra: totalScore != null
        ? <span className="text-sm text-gray-400 font-mono tabular-nums">{totalScore}점 / 100</span>
        : null,
      bar: totalScore != null ? { value: totalScore, color: gradeAccent } : null,
      badge: null,
      icon: <BarChart2 size={16} style={{ color: gradeAccent }} />,
      iconBg: `${gradeAccent}18`,
      onClick: () => navigate('/analysis/report'),
    },
    {
      id: 'score',
      label: 'E / S / G 점수',
      sub: '카테고리별 점수',
      value: null,
      extra: (
        <div className="flex items-end gap-3 mt-1">
          {[
            { cat: 'E', v: scores.E, color: '#059669', Icon: Leaf },
            { cat: 'S', v: scores.S, color: '#3b82f6', Icon: Users },
            { cat: 'G', v: scores.G, color: '#f59e0b', Icon: Building2 },
          ].map(({ cat, v, color, Icon }) => (
            <div key={cat} className="flex-1">
              <div className="flex items-center gap-1 mb-1">
                <Icon size={10} style={{ color }} />
                <span className="text-[9px] font-bold uppercase" style={{ color }}>{cat}</span>
              </div>
              <span className="text-xl font-black font-mono tabular-nums leading-none" style={{ color: v != null ? color : '#d1d5db' }}>
                {fmtScore(v)}
              </span>
              {v != null && (
                <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, background: color }} />
                </div>
              )}
            </div>
          ))}
        </div>
      ),
      bar: null,
      icon: <Activity size={16} className="text-indigo-500" />,
      iconBg: '#6366f118',
    },
    {
      id: 'risk',
      label: '즉시 조치 필요',
      sub: 'Audit Recommendations',
      value: latestReport ? (risks.length === 0 ? '없음' : `${risks.length}건`) : '—',
      valueClass: `font-black text-4xl leading-none font-mono ${
        highCount > 0 ? 'text-red-600' : medCount > 0 ? 'text-amber-600' : 'text-emerald-600'
      }`,
      extra: latestReport && risks.length > 0 ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          {highCount > 0 && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-red-50 border-red-200 text-red-700">
              HIGH {highCount}
            </span>
          )}
          {medCount > 0 && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
              MED {medCount}
            </span>
          )}
        </div>
      ) : latestReport && risks.length === 0 ? (
        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
          <CheckCircle size={11} /> 조치 항목 없음
        </span>
      ) : null,
      bar: null,
      icon: <AlertTriangle size={16} className={highCount > 0 ? 'text-red-500' : 'text-amber-500'} />,
      iconBg: highCount > 0 ? '#ef444418' : '#f59e0b18',
    },
    {
      id: 'benchmark',
      label: '업종 Benchmark',
      sub: benchmarkData?.industryName ?? '업종 미설정',
      value: benchmarkData != null
        ? (benchmarkData.isBetterThanAverage ? '업종 평균 대비 우수' : '업종 평균 대비 개선 필요')
        : '—',
      valueClass: `font-black text-lg leading-none ${benchmarkData?.isBetterThanAverage ? 'text-emerald-600' : 'text-amber-600'}`,
      extra: benchReduct != null ? (
        <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-semibold ${benchBetter ? 'text-emerald-600' : 'text-amber-600'}`}>
          {benchBetter ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
          탄소 배출량 업종 평균 대비 {Math.abs(benchReduct).toFixed(1)}% {benchBetter ? '낮음 ↓' : '높음 ↑'}
        </div>
      ) : <span className="text-[10px] text-gray-400 mt-1">benchmark 데이터 없음</span>,
      bar: null,
      icon: <TrendingUp size={16} className="text-purple-500" />,
      iconBg: '#a855f718',
    },
  ];

  // ── derived for hero
  const verifiedCount = (() => {
    const em = latestReport?.evidenceMapping ?? [];
    return em.filter(e => (e.confidenceScore ?? e.confidence ?? 0) >= 65).length;
  })();
  const totalIndicators = (latestReport?.evidenceMapping ?? []).length;
  const auditStatus = !latestReport ? null
    : highCount > 0 ? { label: '즉시 조치 필요', cls: 'text-red-400', dot: 'bg-red-400' }
    : medCount  > 0 ? { label: '개선 권장',     cls: 'text-amber-400', dot: 'bg-amber-400' }
    : { label: '양호',              cls: 'text-emerald-400', dot: 'bg-emerald-400' };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Pretendard', sans-serif" }}>

      {/* ══════════════════════════════════════════════════════════════
           HERO — Dark surface, Vercel/Linear/Palantir style
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ background: '#0F172A' }} className="w-full">
        <div className="max-w-7xl mx-auto px-8 pt-7 pb-8">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-600/90 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/40">
                <Cpu size={14} className="text-white" />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.14em]">AI ESG Audit Command Center</p>
                <p className="text-[14px] font-semibold text-white leading-snug tracking-tight">
                  {latestReport?.companyName ?? '기업 ESG 현황'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadAll}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-[12px] font-medium text-slate-400 hover:text-white transition-all duration-150 disabled:opacity-40"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                새로고침
              </button>
              <button
                onClick={() => navigate('/analysis')}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[12px] font-semibold text-white transition-all duration-150 shadow-sm shadow-emerald-900/30"
              >
                <Plus size={12} />
                신규 분석
              </button>
            </div>
          </div>

          {/* Hero KPI strip */}
          {loading && !latestReport ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <HeroStatSkeleton key={i} />)}
            </div>
          ) : latestReport ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

              {/* ESG Grade */}
              <div className="hero-card px-6 py-5 cursor-pointer" onClick={() => navigate('/analysis/report')}>
                <p className="kpi-label text-slate-500 mb-3">ESG 종합 등급</p>
                <div className="flex items-end gap-3 mb-3">
                  <span className="kpi-number text-5xl" style={{ color: gradeAccent }}>
                    {latestReport.finalGrade ?? '—'}
                  </span>
                  {totalScore != null && (
                    <span className="text-slate-400 text-sm font-mono mb-0.5 tabular-nums">
                      {totalScore}점
                    </span>
                  )}
                </div>
                {totalScore != null && (
                  <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full progress-bar-fill" style={{ width: `${totalScore}%`, background: gradeAccent }} />
                  </div>
                )}
                <p className="text-[10px] text-slate-600 mt-2">K-ESG 기준 · 클릭해서 상세 보기</p>
              </div>

              {/* E/S/G scores */}
              <div className="hero-card px-6 py-5">
                <p className="kpi-label text-slate-500 mb-3">카테고리 점수</p>
                <div className="flex items-end gap-5">
                  {[
                    { cat: 'E', v: scores.E, color: '#34d399' },
                    { cat: 'S', v: scores.S, color: '#60a5fa' },
                    { cat: 'G', v: scores.G, color: '#fbbf24' },
                  ].map(({ cat, v, color }) => (
                    <div key={cat}>
                      <p className="text-[9px] font-bold uppercase mb-1.5 tracking-widest" style={{ color }}>{cat}</p>
                      <span className="kpi-number text-3xl" style={{ color: v != null ? color : '#334155' }}>
                        {v != null ? Math.round(v) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verified indicators */}
              <div className="hero-card px-6 py-5">
                <p className="kpi-label text-slate-500 mb-3">검증 완료 지표</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="kpi-number text-4xl text-white">
                    {verifiedCount}
                  </span>
                  {totalIndicators > 0 && (
                    <span className="text-slate-500 text-base mb-0.5 tabular-nums font-mono">
                      / {totalIndicators}
                    </span>
                  )}
                </div>
                {totalIndicators > 0 && (
                  <div className="h-0.5 bg-white/10 rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-emerald-400 progress-bar-fill"
                      style={{ width: `${Math.round((verifiedCount / totalIndicators) * 100)}%` }} />
                  </div>
                )}
                <p className="text-[10px] text-slate-600">신뢰도 65%+ 근거 확인</p>
              </div>

              {/* Audit status */}
              <div className="hero-card px-6 py-5">
                <p className="kpi-label text-slate-500 mb-3">Audit 상태</p>
                {auditStatus ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${auditStatus.dot}`}
                        style={{ boxShadow: `0 0 6px currentColor` }} />
                      <span className={`text-[15px] font-semibold ${auditStatus.cls}`}>{auditStatus.label}</span>
                    </div>
                    {risks.length > 0 ? (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {highCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                            HIGH {highCount}
                          </span>
                        )}
                        {medCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                            MED {medCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-emerald-400/80 mt-1 flex items-center gap-1">
                        <CheckCircle size={10} /> 조치 항목 없음
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-slate-600 text-sm">분석 결과 없음</p>
                )}
              </div>

            </div>
          ) : (
            /* No report state */
            <div className="hero-card px-8 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-4">
                <BarChart2 size={22} className="text-slate-500" />
              </div>
              <p className="text-slate-300 font-semibold mb-1.5">아직 분석 결과가 없습니다</p>
              <p className="text-slate-500 text-[13px] mb-6">첫 번째 AI ESG Audit를 시작해보세요.</p>
              <button
                onClick={() => navigate('/analysis')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition-all duration-150 shadow-sm shadow-emerald-900/30"
              >
                <Plus size={14} /> 분석 시작
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
           CONTENT AREA
      ══════════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">

        {/* ── Secondary KPI Cards ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading && !latestReport
            ? Array.from({ length: 4 }).map((_, i) => <KPISkeleton key={i} />)
            : kpiCards.map((card) => (
                <div
                  key={card.id}
                  className={`saas-card p-6 group ${card.onClick ? 'cursor-pointer' : ''}`}
                  onClick={card.onClick}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="kpi-label">{card.label}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{card.sub}</p>
                    </div>
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: card.iconBg }}>
                      {card.icon}
                    </span>
                  </div>

                  {card.value !== null && (
                    <div className="mb-2">
                      <span
                        className={card.valueClass ?? 'kpi-number text-3xl'}
                        style={{ ...(card.valueColor ? { color: card.valueColor } : {}), fontFamily: "'Inter', sans-serif", letterSpacing: '-0.03em' }}
                      >
                        {card.value}
                      </span>
                    </div>
                  )}

                  {card.bar && (
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2 mb-2">
                      <div
                        className="h-full rounded-full progress-bar-fill"
                        style={{ width: `${Math.min(100, card.bar.value)}%`, background: card.bar.color }}
                      />
                    </div>
                  )}

                  {card.extra}

                  {card.onClick && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1 text-[11px] text-gray-400 group-hover:text-emerald-600 transition-colors duration-150">
                      <span>상세 결과 보기</span>
                      <ChevronRight size={10} />
                    </div>
                  )}
                </div>
              ))}
        </div>

        {/* ── Middle: History + Risk ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

          {/* Left: 최근 분석 기록 */}
          <div className="saas-card overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Clock size={13} className="text-gray-500" />
              </span>
              <span className="section-title">최근 ESG 분석 기록</span>
              <span className="ml-auto text-[11px] text-gray-400 font-medium">Analysis History</span>
            </div>

            {!latestReport ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FileText size={18} className="text-gray-400" />
                </div>
                <p className="text-[13px] font-medium text-gray-600">분석 기록이 없습니다</p>
                <p className="text-[12px] text-gray-400">신규 분석을 시작하면 결과가 여기 표시됩니다.</p>
                <button
                  onClick={() => navigate('/analysis')}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors duration-150"
                >
                  <Plus size={12} /> 첫 분석 시작하기
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_64px_60px_68px_80px_76px] px-6 py-2.5 bg-gray-50/80 border-b border-gray-100 gap-3">
                  {['날짜 / 기업', '점수', '등급', '신뢰도', 'E / S / G', ''].map(h => (
                    <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.08em]">{h}</span>
                  ))}
                </div>

                <div
                  className="grid grid-cols-[1fr_64px_60px_68px_80px_76px] px-6 py-4 gap-3 items-center hover:bg-gray-50/60 transition-colors duration-150 cursor-pointer border-b border-gray-100 group/row"
                  onClick={() => navigate('/analysis/report')}
                >
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">
                      {latestReport.companyName ?? '기업 분석'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>
                      {fmtDate(new Date().toISOString())} · 최신
                    </p>
                  </div>
                  <span className="text-[15px] font-bold tabular-nums" style={{ color: gradeAccent, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' }}>
                    {totalScore ?? '—'}
                  </span>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border w-fit ${gradeCls}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                    {latestReport.finalGrade ?? '—'}
                  </span>
                  <span className="text-[12px] text-gray-500 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {totalScore != null ? `~${Math.min(95, totalScore + 5)}%` : '—'}
                  </span>
                  <div className="flex items-center gap-2">
                    {[
                      { c: 'E', v: scores.E, col: '#059669' },
                      { c: 'S', v: scores.S, col: '#3b82f6' },
                      { c: 'G', v: scores.G, col: '#f59e0b' },
                    ].map(({ c, v, col }) => (
                      <span key={c} className="text-[12px] font-bold tabular-nums" style={{ color: v != null ? col : '#d1d5db', fontFamily: "'Inter', sans-serif" }}>
                        {fmtScore(v)}
                      </span>
                    ))}
                  </div>
                  <button className="flex items-center gap-1 text-[11px] text-gray-400 group-hover/row:text-emerald-600 transition-colors duration-150 font-medium">
                    상세 <ChevronRight size={10} />
                  </button>
                </div>

                <div className="px-6 py-3">
                  <button
                    onClick={() => navigate('/analysis/report')}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-emerald-600 transition-colors duration-150"
                  >
                    <ArrowUpRight size={13} /> 전체 분석 결과 보기
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right: 즉시 조치 필요 */}
          <div className="saas-card overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={13} className="text-red-500" />
              </span>
              <div>
                <p className="section-title">즉시 조치 필요</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Audit Recommendations</p>
              </div>
              {risks.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5">
                  {highCount > 0 && <span className="badge badge-high">HIGH {highCount}</span>}
                  {medCount  > 0 && <span className="badge badge-medium">MED {medCount}</span>}
                </div>
              )}
            </div>

            <div className="flex-1">
              {!latestReport ? (
                <div className="empty-state py-10 gap-2">
                  <div className="empty-icon w-9 h-9 rounded-xl">
                    <AlertCircle size={16} className="text-gray-400" />
                  </div>
                  <p className="text-[12px] text-gray-400">분석 결과 로드 후 표시됩니다.</p>
                </div>
              ) : risks.length === 0 ? (
                <div className="empty-state py-10 gap-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  </div>
                  <p className="text-[13px] font-semibold text-emerald-700">조치 필요 항목 없음</p>
                  <p className="text-[11px] text-gray-400">현재 분석에서 즉각 조치가<br/>필요한 항목이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {risks.map((rec, i) => {
                    const SEV = {
                      HIGH: { bar: 'bg-red-400',    badge: 'badge badge-high',   action: '즉시 수정' },
                      MED:  { bar: 'bg-amber-400',  badge: 'badge badge-medium', action: '개선 권장' },
                      LOW:  { bar: 'bg-gray-200',   badge: 'badge badge-gray',   action: '참고' },
                    };
                    const s = SEV[rec.sev] ?? SEV.LOW;
                    return (
                      <div key={i} className="flex items-stretch hover:bg-gray-50/50 transition-colors duration-150">
                        <div className={`w-1 shrink-0 ${s.bar} rounded-r-full`} />
                        <div className="px-5 py-4 flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={s.badge}>{rec.sev}</span>
                            <span className="text-[10px] font-mono text-gray-300 tracking-wider">{rec.code}</span>
                            <span className="text-[12px] font-semibold text-gray-800">{rec.title}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed mb-2.5">{rec.desc}</p>
                          <span className={s.badge}>{s.action}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => navigate('/analysis/report')}
                className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-emerald-600 transition-colors duration-150"
              >
                <ArrowUpRight size={12} /> 전체 Evidence 확인
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom: AI 인사이트 ─────────────────────────────── */}
        <div className="saas-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Cpu size={13} className="text-emerald-600" />
            </span>
            <div>
              <p className="section-title">AI 추천 인사이트</p>
              <p className="text-[11px] text-gray-400 mt-0.5">분석 결과 기반 자동 생성</p>
            </div>
          </div>
          <div className="px-6 py-5">
            {!latestReport ? (
              <div className="empty-state py-8">
                <div className="empty-icon">
                  <Cpu size={18} className="text-gray-400" />
                </div>
                <p className="text-[12px] text-gray-500 font-medium">분석 결과 없음</p>
                <p className="text-[12px] text-gray-400">분석 결과 로드 후 인사이트가 표시됩니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {insights.map((ins, i) => {
                  const styles = {
                    strength: { bg: 'bg-emerald-50/80 border-emerald-100', text: 'text-emerald-700', iconCls: 'text-emerald-500', label: 'STRENGTH', Icon: CheckCircle },
                    risk:     { bg: 'bg-red-50/80 border-red-100',         text: 'text-red-700',     iconCls: 'text-red-500',     label: 'RISK',     Icon: AlertCircle },
                    action:   { bg: 'bg-amber-50/80 border-amber-100',     text: 'text-amber-700',   iconCls: 'text-amber-500',   label: 'ACTION',   Icon: Zap },
                    info:     { bg: 'bg-gray-50 border-gray-200',          text: 'text-gray-600',    iconCls: 'text-gray-400',    label: 'INFO',     Icon: Shield },
                  };
                  const s = styles[ins.type] ?? styles.info;
                  return (
                    <div key={i} className={`flex items-start gap-3 px-4 py-4 rounded-xl border ${s.bg} transition-all duration-150 hover:shadow-sm`}>
                      <s.Icon size={14} className={`${s.iconCls} shrink-0 mt-0.5`} />
                      <div>
                        <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] block mb-1.5 ${s.text}`}>{s.label}</span>
                        <p className={`text-[12px] leading-relaxed ${s.text}`}>{ins.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {latestReport && (
            <div className="px-6 py-5 border-t border-gray-100">
              <p className="kpi-label mb-4">카테고리 점수 요약</p>
              <div className="grid grid-cols-3 gap-8">
                {[
                  { label: '환경 (E)', value: scores.E, color: '#059669' },
                  { label: '사회 (S)', value: scores.S, color: '#3b82f6' },
                  { label: '지배구조 (G)', value: scores.G, color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] text-gray-600">{label}</span>
                      <span className="text-[14px] font-bold tabular-nums" style={{ color: value != null ? color : '#d1d5db', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' }}>
                        {fmtScore(value)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full progress-bar-fill" style={{ width: `${value ?? 0}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
