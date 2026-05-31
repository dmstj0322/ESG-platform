import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, CheckCircle2, CheckCircle,
  Clock, RefreshCw, ChevronRight, Plus, AlertCircle,
  BarChart2, Building2, Leaf, Users, Activity, Zap, ArrowUpRight,
  ClipboardList, FileSearch, Download, LayoutDashboard,
} from 'lucide-react';
import api from '../../api/api';
import { useAnalysis } from '../../context/AnalysisContext';
import { useAuth } from '../../context/AuthContext';
import { normalizeScore, computeDashboardKPIs } from '../../utils/esgAnalysisUtils';
import { exportAnalysisResult } from '../../components/analysis/exportAnalysisResult';

// ── 상수 ─────────────────────────────────────────────────────────────
const GRADE_COLOR = { S: '#7c3aed', A: '#059669', B: '#2563eb', C: '#d97706', D: '#dc2626' };
const ACTIVITY_LABEL = { TUMBLER: '텀블러/다회용기', TRANSPORT: '대중교통', RECYCLE: '분리배출' };

const SEV_STYLE = {
  HIGH: { bar: 'bg-red-500',   badgeCls: 'bg-red-50 text-red-600 border-red-200' },
  MED:  { bar: 'bg-amber-400', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200' },
  LOW:  { bar: 'bg-gray-200',  badgeCls: 'bg-gray-100 text-gray-500 border-gray-200' },
};



const wrapStyle = { maxWidth: 1440, margin: '0 auto' };

const fmtDateTime = (s) => {
  if (!s) return null;
  try {
    const d = new Date(s);
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
      + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
};

// ── SVG Sparkline ────────────────────────────────────────────────────
function Sparkline({ data, color = '#059669', vbWidth = 240, height = 40, dotRadius = 3 }) {
  if (!data || data.length < 2) return null;
  const nums = data.map(v => Number(v) || 0);
  const min  = Math.min(...nums);
  const max  = Math.max(...nums);
  const rng  = max - min || 1;
  const pad  = 5;
  const pts  = nums.map((v, i) => {
    const x = ((i / (nums.length - 1)) * vbWidth).toFixed(1);
    const y = (height - pad - ((v - min) / rng) * (height - pad * 2)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const lastPt  = pts.split(' ').pop().split(',');
  const fillPts = `0,${height} ${pts} ${vbWidth},${height}`;
  const gradId  = `sg-${color.replace('#', '')}`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${vbWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#${gradId})`} />
      <polyline points={pts} stroke={color} strokeWidth="1.8" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r={dotRadius} fill={color} />
      <circle cx={lastPt[0]} cy={lastPt[1]} r={dotRadius + 2.5} fill={color} fillOpacity="0.18" />
    </svg>
  );
}

function KpiSkeleton() {
  return <div className="bg-white h-[88px] rounded-lg animate-pulse" style={{ background: '#f3f4f6' }} />;
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { latestReport, fetchLatestData, fetchBenchmarkData } = useAnalysis();

  const [rawData,          setRawData]          = useState(null);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState(null);
  const [historyData,      setHistoryData]      = useState([]);
  const [showAllHistory,   setShowAllHistory]   = useState(false);
  const [ecoPool,          setEcoPool]          = useState(null);
  const [recentPosts,      setRecentPosts]      = useState([]);
  const [totalActivityCount, setTotalActivityCount] = useState(0);

  const analysisId = latestReport?.analysisId
    ?? localStorage.getItem('esg_latest_analysis_id');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchLatestData(), fetchBenchmarkData()]);
    setLoading(false);
  }, [fetchLatestData, fetchBenchmarkData]);

  useEffect(() => {
    if (!analysisId) return;
    api.get(`/api/v1/analysis/${analysisId}/result`)
      .then(r => setRawData(normalizeScore(r.data)))
      .catch(() => setError('결과 데이터 로드 실패'));
  }, [analysisId]);

  useEffect(() => {
    api.get('/analysis/history')
      .then(r => {
        const list = Array.isArray(r.data)          ? r.data
                   : Array.isArray(r.data?.content) ? r.data.content
                   : [];
        setHistoryData([...list].reverse());
      })
      .catch(() => setHistoryData([]));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!user?.companyId) return;
    api.get(`/points/company/${user.companyId}/esg-pool`)
      .then(r => setEcoPool(r.data))
      .catch(() => setEcoPool(null));
    api.get('/community/posts', { params: { size: 5, sort: 'createdDate,desc' } })
      .then(r => {
        const raw  = r.data;
        const list = Array.isArray(raw) ? raw
                   : Array.isArray(raw?.content) ? raw.content
                   : [];
        setRecentPosts(list);
        setTotalActivityCount(raw?.totalElements ?? list.length);
        // const approvedPosts = list.filter(post => post.adminStatus === 'APPROVED');
        // setRecentPosts(approvedPosts);
      })
      .catch(() => { setRecentPosts([]); setTotalActivityCount(0); });
  }, [user?.companyId]);

  const kpis         = useMemo(() => computeDashboardKPIs(rawData), [rawData]);
  const hasData      = !!kpis;
  const gradeAccent  = GRADE_COLOR[kpis?.finalGrade] ?? '#6b7280';

  // 신뢰도 스타일 — light 배경 기준
  const confLevel = kpis?.confidence == null ? null
    : kpis.confidence >= 75 ? 'HIGH'
    : kpis.confidence >= 55 ? 'MED'
    : 'LOW';
  const confStyle = confLevel === 'HIGH'
    ? { text: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : confLevel === 'MED'
    ? { text: 'text-amber-600',   badge: 'bg-amber-50 text-amber-700 border-amber-200' }
    : confLevel === 'LOW'
    ? { text: 'text-red-600',     badge: 'bg-red-50 text-red-600 border-red-200' }
    : { text: 'text-gray-400',    badge: '' };

  const toResult      = (tab)  => analysisId
    ? navigate(`/analysis/result/${analysisId}?tab=${tab}`)
    : navigate('/analysis/report');
  const toResultFocus = (code, tab = 'action') => analysisId
    ? navigate(`/analysis/result/${analysisId}?tab=${tab}&focus=${code}`)
    : navigate('/analysis/report');

  const auditEvents = useMemo(() => {
    const deriveEvent = (h) => {
      const grade  = h.grade ?? null;
      const conf   = h.overallConfidence != null ? Number(h.overallConfidence) : null;
      const gScore = Number(h.gScore ?? 0);
      const time   = h.createdAt;
      if (grade === 'D')
        return { dotCls: 'bg-red-400', label: '고위험 이슈 감지',
          desc: 'D등급 — 즉시 조치 필요 항목 확인됨', time,
          badge: { cls: 'bg-red-50 text-red-600 border-red-200', text: 'HIGH' } };
      if (grade === 'C')
        return { dotCls: 'bg-amber-400', label: '주의 등급 판정',
          desc: 'C등급 — 개선 필요 항목이 존재합니다', time,
          badge: { cls: 'bg-amber-50 text-amber-700 border-amber-200', text: '주의' } };
      if (conf != null && conf < 70)
        return { dotCls: 'bg-amber-400', label: '신뢰도 주의',
          desc: `감사 검증 신뢰도 ${conf}% — 증빙 문서 보완이 권장됩니다`, time,
          badge: { cls: 'bg-amber-50 text-amber-700 border-amber-200', text: '주의' } };
      if (gScore > 0 && gScore < 60)
        return { dotCls: 'bg-amber-400', label: 'Governance 미흡',
          desc: `지배구조 점수 ${Math.round(gScore)}점 — 기준(60점) 미달`, time,
          badge: { cls: 'bg-amber-50 text-amber-700 border-amber-200', text: '경고' } };
      const score = h.totalScore ? `종합 ${Math.round(h.totalScore)}점` : '';
      return { dotCls: 'bg-emerald-400', label: 'AI ESG 분석 완료',
        desc: [grade && `${grade}등급`, score].filter(Boolean).join(' · ') || '분석 완료',
        time, badge: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: '완료' } };
    };

    // 전체 이력을 최신순으로 변환 — UI 레이어에서 slice(0,5) + expand 처리
    const recentHistory = [...historyData].reverse();
    if (recentHistory.length > 0) return recentHistory.map(deriveEvent);

    if (!kpis) return [];
    const events = [deriveEvent({
      grade: kpis.finalGrade, totalScore: kpis.totalScore,
      overallConfidence: kpis.confidence, gScore: kpis.gScore, createdAt: kpis.analyzedAt,
    })];
    if (kpis.highCount > 0) events.push({
      dotCls: 'bg-red-400', label: `고위험 이슈 ${kpis.highCount}건`,
      desc: kpis.recs.find(r => r.sev === 'HIGH')?.title ?? '즉시 조치가 필요한 항목이 있습니다.',
      time: kpis.analyzedAt, badge: { cls: 'bg-red-50 text-red-600 border-red-200', text: 'HIGH' },
    });
    return events;
  }, [historyData, kpis]);

  const maskNickname = (name) => {
    if (!name || name.length <= 1) return name ?? '익명';
    return name[0] + 'OO';
  };

  const fmtFeedTime = (s) => {
    if (!s) return '';
    try {
      const diff = Date.now() - new Date(s).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}분 전`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}시간 전`;
      return `${Math.floor(hrs / 24)}일 전`;
    } catch { return ''; }
  };

  const trendMetrics = useMemo(() => {
    const delta = (arr) => arr.length >= 2
      ? Number((arr[arr.length - 1] - arr[arr.length - 2]).toFixed(1))
      : null;
    const eArr = historyData.map(h => Number(h.eScore ?? 0));
    const sArr = historyData.map(h => Number(h.sScore ?? 0));
    const gArr = historyData.map(h => Number(h.gScore ?? 0));
    return [
      { key: 'E', label: 'E · 환경',     data: eArr, current: kpis?.eScore, color: '#059669', delta: delta(eArr) },
      { key: 'S', label: 'S · 사회',     data: sArr, current: kpis?.sScore, color: '#2563eb', delta: delta(sArr) },
      { key: 'G', label: 'G · 지배구조', data: gArr, current: kpis?.gScore, color: '#d97706', delta: delta(gArr) },
    ];
  }, [historyData, kpis]);

  const quickNavItems = [
    { label: '상세 분석 리포트',   desc: '등급·점수·종합 요약',      Icon: BarChart2,     color: '#6366f1', tab: 'summary' },
    { label: '근거 추적',          desc: '지표별 증빙·근거 확인',     Icon: FileSearch,    color: '#059669', tab: 'evidence' },
    { label: '개선 과제',          desc: '개선 우선순위·필요 서류',   Icon: Zap,           color: '#dc2626', tab: 'action' },
    { label: '업종 비교',          desc: '업종 통계 기반 환경 비교',  Icon: TrendingUp,    color: '#7c3aed', tab: 'industry' },
    { label: '분석 기록',          desc: '시스템 처리 이력 확인',     Icon: ClipboardList, color: '#d97706', tab: 'audit-log' },
    { label: 'PDF 다운로드',       desc: '전체 리포트 내보내기',      Icon: Download,      color: '#64748b', tab: null, action: () => rawData && exportAnalysisResult(rawData, analysisId, ecoPool?.esgPoints ?? null) },
  ];

  // ── KPI 셀 컴포넌트 (재사용) ──────────────────────────────────────
  const kpiCellBase = 'bg-white px-5 py-4 transition-colors';

  return (
    <div className="min-h-screen" style={{ background: '#F7F8FA', fontFamily: "'Pretendard', sans-serif" }}>

      {/* ── 1. Greeting Header ───────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div style={wrapStyle} className="px-8 py-5 flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[26px] font-black text-gray-900 tracking-tight leading-snug">
              안녕하세요,{' '}
              <span style={{ color: gradeAccent }}>
                {kpis?.companyName ?? user?.nickname ?? '기업'}
              </span>{' '}
              관리자님!
            </h1>
            <p className="text-[13px] text-gray-400 mt-1 leading-snug">
              ESG 분석 현황과 점수 변화를 확인해보세요.
            </p>
            <p className="text-[11px] text-gray-300 mt-1.5 flex items-center gap-2 flex-wrap">
              {kpis?.finalGrade && (
                <span className="font-semibold" style={{ color: gradeAccent }}>
                  최신 등급 {kpis.finalGrade}
                </span>
              )}
              {kpis?.finalGrade && historyData.length > 0 && (
                <span className="text-gray-200">·</span>
              )}
              {historyData.length > 0
                ? `총 ${historyData.length}회 분석 이력`
                : '아직 분석 이력이 없습니다.'}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {fmtDateTime(kpis?.analyzedAt) && (
              <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <Clock size={10} />
                마지막 분석 {fmtDateTime(kpis.analyzedAt)}
              </span>
            )}
            <button
              onClick={loadAll} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-40"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
            <button
              onClick={() => navigate('/analysis')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-[12px] font-semibold text-white transition-all"
            >
              <Plus size={12} /> 새 분석 시작
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div style={wrapStyle} className="px-8 py-5 space-y-4">

        {/* ── 2. Hero KPI — light executive summary card ───────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {(loading && !hasData) ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100 p-px">
              {[1,2,3,4,5].map(i => <KpiSkeleton key={i} />)}
            </div>
          ) : hasData ? (
            // gap-px + bg-gray-100/70 = 1px separators between cells
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100/70">

              {/* ESG 종합 등급 */}
              <div className={`${kpiCellBase} cursor-pointer hover:bg-gray-50/70`}
                onClick={() => toResult('summary')}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  ESG 종합 등급
                </p>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-4xl font-black font-mono leading-none"
                    style={{ color: gradeAccent }}>
                    {kpis.finalGrade ?? '—'}
                  </span>
                  {kpis.totalScore > 0 && (
                    <span className="text-[15px] font-semibold font-mono tabular-nums"
                      style={{ color: gradeAccent, opacity: 0.7 }}>
                      {Math.round(kpis.totalScore)}점
                    </span>
                  )}
                </div>
                {kpis.totalScore > 0 && (
                  <div className="h-[3px] bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.min(kpis.totalScore, 100)}%`, background: gradeAccent, opacity: 0.45 }} />
                  </div>
                )}
                <p className="text-[10px] text-gray-300 mt-1">K-ESG 기준</p>
              </div>

              {/* E / S / G */}
              <div className={kpiCellBase}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  E / S / G 점수
                </p>
                <div className="flex items-end gap-5">
                  {[
                    { cat: 'E', v: kpis.eScore, color: '#059669' },
                    { cat: 'S', v: kpis.sScore, color: '#2563eb' },
                    { cat: 'G', v: kpis.gScore, color: '#d97706' },
                  ].map(({ cat, v, color }) => (
                    <div key={cat}>
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5"
                        style={{ color, opacity: 0.8 }}>{cat}</p>
                      <span className="text-[23px] font-black font-mono leading-none"
                        style={{ color: v > 0 ? color : '#e2e8f0' }}>
                        {v > 0 ? Math.round(v) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 분석 신뢰도 */}
              <div className={kpiCellBase}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  분석 신뢰도
                </p>
                <span className={`text-3xl font-black font-mono leading-none ${confStyle.text}`}>
                  {kpis.confidence != null ? `${kpis.confidence}%` : '—'}
                </span>
                {confLevel && (
                  <div className="mt-1.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${confStyle.badge}`}>
                      {confLevel}
                    </span>
                  </div>
                )}
              </div>

              {/* EcoPoint 현황 */}
              <div className={`${kpiCellBase}`}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  EcoPoint 현황
                </p>
                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <span className="text-3xl font-black font-mono leading-none text-emerald-600">
                    {ecoPool != null
                      ? Number(ecoPool.esgPoints).toLocaleString()
                      : '—'}
                  </span>
                  {ecoPool != null && (
                    <span className="text-[12px] text-emerald-400 font-semibold">EP</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-300 mt-1 flex items-center gap-1">
                  <Leaf size={9} className="text-emerald-400 shrink-0" />
                  회사 누적 ESG 포인트
                </p>
              </div>

              {/* 근거 확인 현황 */}
              <div className={`${kpiCellBase} cursor-pointer hover:bg-gray-50/70`}
                onClick={() => toResult('evidence')}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  근거 확인
                </p>
                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <span className="text-3xl font-black font-mono leading-none text-gray-900">
                    {kpis.verifiedCount}
                  </span>
                  <span className="text-[12px] text-gray-400 font-mono">/ {kpis.totalIndicators}</span>
                </div>
                <div className="h-[3px] bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${kpis.totalIndicators > 0 ? Math.round(kpis.verifiedCount / kpis.totalIndicators * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400">지표 근거 확인 완료</p>
              </div>

            </div>
          ) : (
            <div className="text-center py-12 px-6">
              {error
                ? <p className="text-red-500 text-[13px] mb-4">{error}</p>
                : <p className="text-gray-400 text-[13px] mb-5">아직 분석 결과가 없습니다.</p>
              }
              <button onClick={() => navigate('/analysis')}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-[13px] font-semibold text-white transition-all">
                <Plus size={13} /> 첫 분석 시작
              </button>
            </div>
          )}
        </div>

        {/* ── Row 1: AI Action Center + ESG Snapshot ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-stretch">

          {/* EcoPoint 활동 현황 */}
          <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden flex flex-col">

            {/* 헤더 */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-emerald-100 bg-emerald-50/30">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Leaf size={13} className="text-emerald-600" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">EcoPoint 활동 현황</p>
                <p className="text-[11px] text-gray-400">활동 인증 게시글 기반 현황</p>
              </div>
              {totalActivityCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                  활동 중
                </span>
              )}
            </div>

            {/* 2열 지표 */}
            <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
              <div className="px-4 py-2 text-center">
                <p className="text-[10px] text-gray-400 mb-1">누적 활동 수</p>
                <p className="text-[20px] font-black text-gray-800 tabular-nums leading-none">
                  {totalActivityCount > 0 ? totalActivityCount : '—'}
                </p>
                <p className="text-[9px] text-gray-300 mt-0.5">건</p>
              </div>
              <div className="px-4 py-2 text-center">
                <p className="text-[10px] text-gray-400 mb-1">최근 인증 활동</p>
                {(() => {
                  const recent = recentPosts[0];
                  const typeKey = recent?.activityType ?? recent?.aiResult;
                  const label   = ACTIVITY_LABEL[typeKey] ?? recent?.title;
                  return label ? (
                    <>
                      <p className="text-[12px] font-black text-emerald-700 leading-tight truncate px-1">
                        {label}
                      </p>
                      <p className="text-[9px] text-gray-300 mt-0.5">가장 최근</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[20px] font-black text-gray-300 leading-none">—</p>
                      <p className="text-[9px] text-gray-300 mt-0.5">없음</p>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 최근 활동 피드 */}
            <div className="px-5 py-2 flex-1 flex flex-col">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">최근 활동 목록</p>
              {recentPosts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-4 gap-2 text-center">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Leaf size={16} className="text-emerald-400" />
                  </div>
                  <p className="text-[12px] text-gray-400">아직 친환경 활동 참여 내역이 없습니다.</p>
                  <button
                    onClick={() => navigate('/community')}
                    className="text-[11px] text-emerald-600 font-medium hover:underline"
                  >
                    활동 참여하기 →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentPosts.slice(0, 3).map((post, i) => {
                    const typeKey     = post.activityType ?? post.aiResult;
                    const actLabel    = ACTIVITY_LABEL[typeKey] ?? post.title ?? '친환경 활동 인증';
                    const statusColor = post.adminStatus === 'APPROVED' ? 'text-emerald-600'
                                      : post.adminStatus === 'REJECTED' ? 'text-red-400'
                                      : 'text-amber-500';
                    const statusText  = post.adminStatus === 'APPROVED' ? '인증 완료'
                                      : post.adminStatus === 'REJECTED' ? '반려'
                                      : '심사 중';
                    return (
                      <div key={post.id ?? i} className="flex items-center gap-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-[11px] font-bold text-emerald-700">
                          {(post.nickname ?? '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-gray-800 leading-snug truncate">
                            {actLabel}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {maskNickname(post.nickname)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className={`text-[9px] font-semibold ${statusColor}`}>{statusText}</span>
                          <span className="text-[9px] text-gray-300 tabular-nums">
                            {fmtFeedTime(post.createdDate)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="pt-2.5 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => navigate('/community')}
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  <ArrowUpRight size={12} /> 커뮤니티에서 전체 활동 보기
                </button>
              </div>
            </div>
          </div>

          {/* ESG Score Snapshot */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <BarChart2 size={13} className="text-indigo-500" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">ESG 점수 현황</p>
                <p className="text-[11px] text-gray-400">카테고리별 현황</p>
              </div>
            </div>

            {!hasData ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Activity size={16} className="text-gray-400" />
                </div>
                <p className="text-[13px] text-gray-400 font-medium">분석 결과 없음</p>
              </div>
            ) : (
              <div className="px-5 py-3 space-y-2.5 flex flex-col flex-1">
                {[
                  { cat: 'E', label: '환경',     v: kpis.eScore, color: '#059669', bg: '#05966910', Icon: Leaf },
                  { cat: 'S', label: '사회',     v: kpis.sScore, color: '#2563eb', bg: '#2563eb10', Icon: Users },
                  { cat: 'G', label: '지배구조', v: kpis.gScore, color: '#d97706', bg: '#d9770610', Icon: Building2 },
                ].map(({ cat, label, v, color, bg, Icon }) => {
                  // 업종 평균 대비 diff: E는 실데이터 우선, S/G는 참조값 기반
                  const diffPct = cat === 'E' && kpis.envBenchmarkDiffPct != null
                    ? kpis.envBenchmarkDiffPct
                    : null;
                  const isAbove = diffPct != null && diffPct >= 0;
                  return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-[18px] h-[18px] rounded flex items-center justify-center shrink-0"
                          style={{ background: bg }}>
                          <Icon size={10} style={{ color, opacity: 0.9 }} />
                        </span>
                        <span className="text-[11px] font-medium text-gray-500">{cat} · {label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {diffPct != null && (
                          <span className={`text-[10px] font-medium ${isAbove ? 'text-emerald-500' : 'text-red-400'} opacity-90`}>
                            {isAbove ? '▲' : '▼'}{Math.abs(diffPct).toFixed(1)}%
                          </span>
                        )}
                        <span className="text-[20px] font-black font-mono tabular-nums leading-none"
                          style={{ color: v > 0 ? color : '#e2e8f0' }}>
                          {v > 0 ? Math.round(v) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="h-[3px] bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${v > 0 ? Math.min(v, 100) : 0}%`, background: color, opacity: 0.5 }} />
                    </div>
                    {diffPct != null && (
                      <p className="text-[9px] text-gray-400 mt-0.5 tabular-nums">
                        업종 평균 대비{' '}
                        <span className={isAbove ? 'text-emerald-500' : 'text-red-400'}>
                          {isAbove ? '+' : ''}{diffPct.toFixed(1)}%
                        </span>
                      </p>
                    )}
                  </div>
                  );
                })}

                {kpis.benchmarkIndustry && (
                  <div className="pt-2.5 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <TrendingUp size={9} className="text-violet-400 shrink-0" />
                      <span className="text-gray-400 opacity-80">{kpis.benchmarkIndustry}</span>
                      {kpis.benchmarkRegion && <span className="opacity-70">· {kpis.benchmarkRegion}</span>}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => toResult('summary')}
                  className="mt-auto w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  상세 결과 보기 <ChevronRight size={10} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: ESG 변화 추이 + 최근 감사 활동 ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ESG 변화 추이 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
              <span className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center shrink-0">
                <TrendingUp size={11} className="text-violet-500" />
              </span>
              <p className="text-[12px] font-semibold text-gray-800">ESG 점수 추이</p>
              <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
                최근 {Math.max(historyData.length, 1)}회
              </span>
            </div>

            {historyData.length < 2 ? (
              <div className="flex items-center gap-2 py-5 px-5">
                <span className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center shrink-0">
                  <TrendingUp size={11} className="text-violet-400" />
                </span>
                <p className="text-[11px] text-gray-400">
                  분석 이력이 누적되면 ESG 변화 추이를 확인할 수 있습니다.
                  <span className="text-gray-300 ml-1.5">
                    {historyData.length}회 완료 · 2회부터 표시
                  </span>
                </p>
              </div>
            ) : !trendMetrics.some(m => m.data.some(v => v > 0)) ? (
              <div className="flex items-center gap-2 py-5 px-5">
                <span className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                  <TrendingUp size={11} className="text-gray-400" />
                </span>
                <p className="text-[11px] text-gray-400">분석 데이터가 충분하지 않습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {trendMetrics.map(({ label, data, current, color, delta }) => {
                  const ds = delta == null ? null
                    : delta > 0 ? { cls: 'text-emerald-600', sym: '▲' }
                    : delta < 0 ? { cls: 'text-red-500',     sym: '▼' }
                    :             { cls: 'text-gray-400',     sym: '—' };
                  const lineColor = delta == null || delta === 0 ? color
                    : delta > 0 ? color : '#ef4444';
                  const [cat, labelShort] = label.split(' · ');
                  return (
                    <div key={label} className="px-5 py-1.5 flex items-center gap-3">

                      {/* 1. Label */}
                      <span className="text-[10px] font-semibold text-gray-400 shrink-0 w-[72px]">
                        <span className="font-black" style={{ color }}>{cat}</span>
                        {' · '}{labelShort}
                      </span>

                      {/* 2. Sparkline */}
                      <div className="flex-1 min-w-0">
                        <Sparkline data={data} color={lineColor} vbWidth={240} height={36} dotRadius={2.5} />
                      </div>

                      {/* 3. Score + delta */}
                      <div className="flex items-center gap-1.5 shrink-0 w-[62px] justify-end">
                        <span className="text-[20px] font-black font-mono tabular-nums leading-none"
                          style={{ color }}>
                          {current != null ? Math.round(current) : '—'}
                        </span>
                        {ds && delta != null && (
                          <span className={`text-[10px] font-bold tabular-nums leading-none ${ds.cls}`}>
                            {delta === 0 ? '—' : `${ds.sym}${Math.abs(delta)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 최근 감사 활동 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
              <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                <Clock size={11} className="text-slate-500" />
              </span>
              <p className="text-[12px] font-semibold text-gray-800">최근 분석 이력</p>
              {hasData && (
                <button
                  onClick={() => toResult('audit-log')}
                  className="ml-auto text-[10px] text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-0.5"
                >
                  전체 이력 <ChevronRight size={9} />
                </button>
              )}
            </div>

            {auditEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-center px-6">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Clock size={16} className="text-gray-400" />
                </div>
                <p className="text-[13px] text-gray-400 font-medium">아직 분석 이력이 없습니다</p>
                <p className="text-[11px] text-gray-400">분석을 시작하면 활동 이력이 표시됩니다.</p>
                <button
                  onClick={() => navigate('/analysis')}
                  className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors mt-1"
                >
                  <Plus size={11} /> 분석 시작하기
                </button>
              </div>
            ) : (
              <>
                <div className="px-5 py-2.5 space-y-2">
                  {(showAllHistory ? auditEvents : auditEvents.slice(0, 5)).map((ev, i, arr) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex flex-col items-center shrink-0 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.dotCls}`} />
                        {i < arr.length - 1 && (
                          <div className="w-px bg-gray-100 mt-1" style={{ height: '14px' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-gray-800 leading-tight">{ev.label}</span>
                          <span className={`text-[9px] font-bold px-1 rounded border ${ev.badge.cls}`}>
                            {ev.badge.text}
                          </span>
                          {fmtDateTime(ev.time) && (
                            <span className="text-[9px] text-gray-300 ml-auto tabular-nums shrink-0">
                              {fmtDateTime(ev.time)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 leading-snug mt-0.5 truncate">{ev.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-2 border-t border-gray-100 flex items-center gap-3">
                  {[
                    { cls: 'bg-emerald-400', label: '완료' },
                    { cls: 'bg-amber-400',   label: '주의' },
                    { cls: 'bg-red-400',     label: '위험' },
                  ].map(({ cls, label }) => (
                    <span key={label} className="flex items-center gap-1 text-[9px] text-gray-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />
                      {label}
                    </span>
                  ))}
                  {auditEvents.length > 5 && (
                    <button
                      onClick={() => setShowAllHistory(v => !v)}
                      className="ml-auto text-[9px] font-semibold text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-0.5"
                    >
                      {showAllHistory
                        ? <><ChevronRight size={9} style={{ transform: 'rotate(270deg)' }} /> 접기</>
                        : <><ChevronRight size={9} style={{ transform: 'rotate(90deg)' }} /> 전체 이력 보기 ({auditEvents.length - 5}개 더)</>
                      }
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Row 3: Quick Navigation — full width utility bar ─────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <LayoutDashboard size={13} className="text-emerald-600" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-gray-900">바로가기</p>
              <p className="text-[11px] text-gray-400">결과 페이지 바로 가기</p>
            </div>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {quickNavItems.map((item, i) => (
              <button
                key={i}
                onClick={() => item.action ? item.action() : toResult(item.tab)}
                disabled={!hasData && item.tab !== null}
                className="group flex flex-col items-start gap-1.5 p-3 rounded-lg border border-gray-200
                  bg-gray-50/40 text-left cursor-pointer
                  transition-all duration-150
                  hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-gray-300 hover:bg-white
                  disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ background: `${item.color}12` }}>
                  <item.Icon size={11} style={{ color: item.color }} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors leading-tight">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
