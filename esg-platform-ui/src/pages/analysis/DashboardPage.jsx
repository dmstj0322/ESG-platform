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
const GRADE_COLOR = { S: '#a855f7', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
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
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm animate-pulse">
      <div className="h-3 w-24 bg-gray-200 rounded mb-4" />
      <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
      <div className="h-2 w-full bg-gray-100 rounded" />
    </div>
  );
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
            { cat: 'E', v: scores.E, color: '#22c55e', Icon: Leaf },
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

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-gray-900">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
                <Cpu size={13} className="text-white" />
              </span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                AI ESG Audit Dashboard
              </p>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {latestReport?.companyName
                ? `안녕하세요, ${latestReport.companyName}님! 오늘의 ESG 현황을 확인해보세요.`
                : '오늘의 ESG 현황을 확인해보세요.'}
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              최신 ESG 분석 결과와 주요 리스크를 확인할 수 있습니다.
              {latestReport ? ` · 최종 업데이트 ${fmtDate(new Date().toISOString())}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300 text-xs font-semibold text-gray-600 hover:text-gray-800 shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
            <button
              onClick={() => navigate('/analysis')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-xs font-semibold text-white shadow-sm transition-all"
            >
              <Plus size={13} />
              신규 분석 시작
            </button>
          </div>
        </div>

        {/* ── Top KPI Cards ────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading && !latestReport
            ? Array.from({ length: 4 }).map((_, i) => <KPISkeleton key={i} />)
            : kpiCards.map((card) => (
                <div
                  key={card.id}
                  className={`bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 group ${card.onClick ? 'cursor-pointer' : ''}`}
                  onClick={card.onClick}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{card.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
                    </div>
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: card.iconBg }}>
                      {card.icon}
                    </span>
                  </div>

                  {card.value !== null && (
                    <div className="mb-1">
                      <span
                        className={card.valueClass ?? 'text-4xl font-black leading-none'}
                        style={card.valueColor ? { color: card.valueColor } : {}}
                      >
                        {card.value}
                      </span>
                    </div>
                  )}

                  {card.bar && (
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2 mb-1">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, card.bar.value)}%`, background: card.bar.color }}
                      />
                    </div>
                  )}

                  {card.extra}

                  {card.onClick && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1 text-[10px] text-gray-400 group-hover:text-emerald-600 transition-colors">
                      <span>상세 결과 보기</span>
                      <ChevronRight size={10} />
                    </div>
                  )}
                </div>
              ))}
        </div>

        {/* ── Middle: History + Risk ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

          {/* Left: 최근 분석 기록 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Clock size={14} className="text-gray-500" />
              </span>
              <span className="text-sm font-semibold text-gray-800">최근 ESG 분석 기록</span>
              <span className="ml-auto text-[10px] text-gray-400">Analysis History</span>
            </div>

            {!latestReport ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <FileText size={20} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 font-medium">분석 기록 없음</p>
                <p className="text-xs text-gray-400">신규 분석을 시작하면 결과가 여기 표시됩니다.</p>
                <button
                  onClick={() => navigate('/analysis')}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus size={12} /> 첫 분석 시작하기
                </button>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="grid grid-cols-[1fr_70px_60px_70px_80px_80px] px-6 py-2.5 bg-gray-50 border-b border-gray-100 gap-3">
                  {['날짜/기업', '점수', '등급', '신뢰도', 'E/S/G', ''].map(h => (
                    <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Latest report row */}
                <div
                  className="grid grid-cols-[1fr_70px_60px_70px_80px_80px] px-6 py-4 gap-3 items-center hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100"
                  onClick={() => navigate('/analysis/report')}
                >
                  {/* 날짜/기업 */}
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      {latestReport.companyName ?? '기업 분석'}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {fmtDate(new Date().toISOString())} (최신)
                    </p>
                  </div>
                  {/* 점수 */}
                  <span className="text-sm font-black font-mono tabular-nums" style={{ color: gradeAccent }}>
                    {totalScore ?? '—'}
                  </span>
                  {/* 등급 */}
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border font-mono w-fit ${gradeCls}`}>
                    {latestReport.finalGrade ?? '—'}
                  </span>
                  {/* Confidence — 상단 섹션에서 추론 */}
                  <span className="text-[11px] font-mono text-gray-500">
                    {totalScore != null ? `~${Math.min(95, totalScore + 5)}%` : '—'}
                  </span>
                  {/* E/S/G */}
                  <div className="flex items-center gap-1">
                    {[
                      { c: 'E', v: scores.E, col: '#22c55e' },
                      { c: 'S', v: scores.S, col: '#3b82f6' },
                      { c: 'G', v: scores.G, col: '#f59e0b' },
                    ].map(({ c, v, col }) => (
                      <span key={c} className="text-[10px] font-black font-mono tabular-nums" style={{ color: v != null ? col : '#d1d5db' }}>
                        {fmtScore(v)}
                      </span>
                    ))}
                  </div>
                  {/* 상세 보기 */}
                  <button className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-emerald-600 transition-colors font-semibold">
                    상세 <ChevronRight size={10} />
                  </button>
                </div>


                <div className="px-6 py-3 border-t border-gray-100">
                  <button
                    onClick={() => navigate('/analysis/report')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
                  >
                    <ArrowUpRight size={12} /> 전체 분석 결과 보기
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right: 즉시 조치 필요 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-red-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">즉시 조치 필요</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Audit Recommendations</p>
              </div>
              {risks.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5">
                  {highCount > 0 && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-red-50 border-red-300 text-red-700">
                      HIGH {highCount}
                    </span>
                  )}
                  {medCount > 0 && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-amber-50 border-amber-300 text-amber-700">
                      MED {medCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1">
              {!latestReport ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-xs">
                  분석 결과 로드 후 표시됩니다.
                </div>
              ) : risks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-700">조치 필요 항목 없음</p>
                  <p className="text-[11px] text-gray-400">현재 분석 결과에서 즉각 조치가 필요한 항목이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {risks.map((rec, i) => {
                    const SEV = {
                      HIGH: { bar: 'bg-red-500', badge: 'bg-red-50 border-red-300 text-red-700', action: '즉시 수정' },
                      MED:  { bar: 'bg-amber-400', badge: 'bg-amber-50 border-amber-300 text-amber-700', action: '개선 권장' },
                      LOW:  { bar: 'bg-gray-300', badge: 'bg-gray-50 border-gray-200 text-gray-500', action: '참고' },
                    };
                    const s = SEV[rec.sev] ?? SEV.LOW;
                    return (
                      <div key={i} className="flex items-stretch">
                        <div className={`w-1 shrink-0 ${s.bar}`} />
                        <div className="px-4 py-3.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border tracking-wider ${s.badge}`}>
                              {rec.sev}
                            </span>
                            <span className="text-[9px] font-mono text-gray-300">{rec.code}</span>
                            <span className="text-[12px] font-semibold text-gray-800">{rec.title}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 leading-relaxed mb-1.5">{rec.desc}</p>
                          <span className={`inline-flex items-center text-[8px] font-bold px-1.5 py-0.5 rounded border ${s.badge}`}>
                            {s.action}
                          </span>
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
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
              >
                <ArrowUpRight size={12} /> 전체 Evidence 확인
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom: AI 인사이트 ─────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5">

          {/* AI 추천 인사이트 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <Cpu size={14} className="text-violet-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">AI 추천 인사이트</p>
                <p className="text-[10px] text-gray-400 mt-0.5">분석 결과 기반 자동 생성</p>
              </div>
            </div>
            <div className="flex-1 px-5 py-4 space-y-3">
              {!latestReport ? (
                <p className="text-xs text-gray-400 py-6 text-center">분석 결과 로드 후 인사이트가 표시됩니다.</p>
              ) : (
                insights.map((ins, i) => {
                  const styles = {
                    strength: { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', icon: <CheckCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />, label: 'STRENGTH' },
                    risk:     { bg: 'bg-red-50 border-red-100',         text: 'text-red-700',     icon: <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />,   label: 'RISK' },
                    action:   { bg: 'bg-amber-50 border-amber-100',     text: 'text-amber-700',   icon: <Zap size={12} className="text-amber-500 shrink-0 mt-0.5" />,         label: 'ACTION' },
                    info:     { bg: 'bg-gray-50 border-gray-200',       text: 'text-gray-600',    icon: <Shield size={12} className="text-gray-400 shrink-0 mt-0.5" />,       label: 'INFO' },
                  };
                  const s = styles[ins.type] ?? styles.info;
                  return (
                    <div key={i} className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl border ${s.bg}`}>
                      {s.icon}
                      <div className="flex-1 min-w-0">
                        <span className={`text-[8px] font-black uppercase tracking-wider block mb-0.5 ${s.text}`}>{s.label}</span>
                        <p className={`text-[11px] leading-relaxed ${s.text}`}>{ins.text}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* E/S/G 점수 요약 */}
            {latestReport && (
              <div className="px-5 py-4 border-t border-gray-100 space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">점수 요약</p>
                {[
                  { label: '환경 (E)', value: scores.E, color: '#22c55e' },
                  { label: '사회 (S)', value: scores.S, color: '#3b82f6' },
                  { label: '지배구조 (G)', value: scores.G, color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-500">{label}</span>
                      <span className="text-[11px] font-black font-mono tabular-nums" style={{ color: value != null ? color : '#d1d5db' }}>
                        {fmtScore(value)}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value ?? 0}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
