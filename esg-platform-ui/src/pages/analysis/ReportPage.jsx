import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, ChevronRight, Plus, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, BarChart2, Shield,
  FileText, Leaf, Users, Building2, ArrowUpRight,
} from 'lucide-react';
import api from '../../api/api';
import { useAnalysis } from '../../context/AnalysisContext';

// ── 상수 ─────────────────────────────────────────────────────────
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
  try { return new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

const fmtScore = (v) => (v != null ? Math.round(v) : '—');

const extractScores = (sections = []) => ({
  E: sections.find(s => ['Environment', 'E'].includes(s.category))?.score ?? null,
  S: sections.find(s => ['Social', 'S'].includes(s.category))?.score ?? null,
  G: sections.find(s => ['Governance', 'G'].includes(s.category))?.score ?? null,
});

const computeTotal = ({ E, S, G }) => {
  if (E == null && S == null && G == null) return null;
  return Math.round((E ?? 0) * 0.40 + (S ?? 0) * 0.30 + (G ?? 0) * 0.30);
};

// ── E/S/G 미니 바 ────────────────────────────────────────────────
function EsgMiniBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase shrink-0" style={{ color }}>{label}</span>
      <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono font-black tabular-nums" style={{ color: value != null ? color : '#d1d5db' }}>
        {fmtScore(value)}
      </span>
    </div>
  );
}

// ── 분석 행 ──────────────────────────────────────────────────────
function AuditRow({ report, analysisId, isLatest, onClick }) {
  const scores = extractScores(report.sections ?? []);
  const total  = report.totalScore ?? computeTotal(scores);
  const grade  = report.finalGrade ?? '—';
  const gc     = GRADE_COLOR[grade] ?? '#6b7280';
  const gcls   = GRADE_CLS[grade]   ?? 'bg-gray-100 text-gray-500 border-gray-200';
  const conf   = report.overallConfidence ?? null;

  return (
    <div
      className="group grid grid-cols-[1fr_52px_64px_64px_110px_40px] items-center gap-4
        px-6 py-4 hover:bg-gray-50/80 transition-all duration-150 cursor-pointer border-b border-gray-100 last:border-b-0"
      onClick={onClick}
    >
      {/* 날짜/기업 */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {report.companyName ?? '기업 ESG 분석'}
          </p>
          {isLatest && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 shrink-0">
              최신
            </span>
          )}
          {report.isAutoSimulation && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 shrink-0">
              SIM
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
          <Clock size={9} className="shrink-0" />
          {fmtDate(report.analyzedAt ?? new Date().toISOString())}
          {analysisId && <span className="ml-1 text-gray-300">· #{analysisId}</span>}
        </p>
      </div>

      {/* 종합 점수 */}
      <div className="text-center">
        <span className="kpi-number text-lg leading-none" style={{ color: gc }}>
          {total ?? '—'}
        </span>
        <p className="text-[9px] text-gray-400 mt-0.5">/ 100</p>
      </div>

      {/* 등급 */}
      <div className="flex justify-center">
        <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg border font-mono ${gcls}`}>
          {grade}
        </span>
      </div>

      {/* 신뢰도 */}
      {(() => {
        const displayConf = conf ?? (total != null ? Math.min(95, total + 5) : null);
        const isEst = conf == null && displayConf != null;
        return (
          <div className="text-center">
            <span className="kpi-number text-sm leading-none" style={{
              color: displayConf == null ? '#d1d5db' : displayConf >= 65 ? '#059669' : displayConf >= 50 ? '#f59e0b' : '#ef4444',
            }}>
              {displayConf != null ? `${isEst ? '~' : ''}${displayConf}%` : '—'}
            </span>
            <p className="text-[9px] text-gray-400 mt-0.5">신뢰도</p>
          </div>
        );
      })()}

      {/* E/S/G 미니 바 */}
      <div className="flex flex-col gap-1">
        <EsgMiniBar label="E" value={scores.E} color="#059669" />
        <EsgMiniBar label="S" value={scores.S} color="#3b82f6" />
        <EsgMiniBar label="G" value={scores.G} color="#f59e0b" />
      </div>

      {/* 상세 화살표 */}
      <div className="flex justify-center">
        <ChevronRight size={15} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
      </div>
    </div>
  );
}


// ── history API 항목 → AuditRow prop 변환 ────────────────────────
const mapHistoryItem = (item) => ({
  finalGrade: item.grade,
  analyzedAt: item.createdAt,
  overallConfidence: item.confidence != null ? Math.round(item.confidence) : null,
  totalScore: item.totalScore ?? null,
  sections: [
    { category: 'Environment', score: item.eScore ?? null },
    { category: 'Social',      score: item.sScore ?? null },
    { category: 'Governance',  score: item.gScore ?? null },
  ],
  companyName: null,
});

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function ReportPage() {
  const navigate = useNavigate();
  const { latestReport, companyId, fetchLatestData } = useAnalysis();

  const [loading, setLoading]       = useState(false);
  const [gradeStats, setGradeStats] = useState([]);
  const [analysisList, setAnalysisList] = useState([]);

  const storedId = localStorage.getItem('esg_latest_analysis_id');

  const loadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      await fetchLatestData();
      const [statsRes, historyRes] = await Promise.allSettled([
        api.get('/analysis/stats',   { headers: { 'X-Company-Id': String(companyId) } }),
        api.get('/analysis/history', { headers: { 'X-Company-Id': String(companyId) } }),
      ]);
      if (statsRes.status === 'fulfilled' && Array.isArray(statsRes.value.data))
        setGradeStats(statsRes.value.data);
      if (historyRes.status === 'fulfilled' && Array.isArray(historyRes.value.data))
        setAnalysisList(historyRes.value.data);
    } catch { /* 개별 실패는 allSettled가 처리 */ }
    setLoading(false);
  }, [companyId, fetchLatestData]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRowClick = (id) => {
    const targetId = id ?? storedId;
    if (targetId) navigate(`/analysis/result/${targetId}`);
    else navigate('/analysis');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">

        {/* ── 헤더 ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
                <ClipboardList size={13} className="text-white" />
              </span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                Audit History
              </p>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight" style={{ letterSpacing: '-0.02em' }}>Audit 기록</h1>
            <p className="text-xs text-gray-400 mt-1">
              완료된 ESG 분석 목록 — 행 클릭 시 상세 결과 페이지로 이동
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* ── 분석 기록 테이블 ──────────────────────────────── */}
        <div className="saas-card overflow-hidden">

          {/* 테이블 헤더 */}
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <BarChart2 size={14} className="text-gray-500" />
            </span>
            <span className="text-sm font-semibold text-gray-800">ESG 분석 이력</span>
            <span className="ml-auto text-[10px] text-gray-400">Analysis History</span>
          </div>

          {/* 컬럼 헤더 */}
          <div className="grid grid-cols-[1fr_52px_64px_64px_110px_40px] px-6 py-3 bg-gray-50 border-b border-gray-200 gap-4">
            {['기업/날짜', '점수', '등급', '신뢰도', 'E / S / G', ''].map(h => (
              <span key={h} className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {/* 내용 */}
          {loading && analysisList.length === 0 ? (
            <div className="flex flex-col gap-3 p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : analysisList.length === 0 && !latestReport ? (
            <div className="empty-state">
              <div className="empty-icon">
                <FileText size={22} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700">분석 기록 없음</p>
              <p className="text-xs text-gray-400">AI ESG Audit을 실행하면 결과가 여기에 표시됩니다.</p>
              <button
                onClick={() => navigate('/analysis')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors shadow-sm"
              >
                <Plus size={13} /> 첫 분석 시작하기
              </button>
            </div>
          ) : analysisList.length > 0 ? (
            <>
              {analysisList.map((item, idx) => (
                <AuditRow
                  key={item.analysisId}
                  report={mapHistoryItem(item)}
                  analysisId={item.analysisId}
                  isLatest={idx === 0}
                  onClick={() => handleRowClick(item.analysisId)}
                />
              ))}
            </>
          ) : (
            /* history API 아직 응답 전 — latestReport만 있을 때 fallback */
            <>
              <AuditRow
                report={latestReport}
                analysisId={storedId}
                isLatest
                onClick={() => handleRowClick(storedId)}
              />
            </>
          )}
        </div>

        {/* ── 이동 단축 카드 ──────────────────────────────── */}
        {latestReport && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: <BarChart2 size={15} className="text-indigo-500" />,
                bg: 'bg-indigo-50',
                label: '상세 분석 결과',
                sub: 'Evidence · Benchmark · Audit Log',
                action: () => storedId && navigate(`/analysis/result/${storedId}#summary`),
              },
              {
                icon: <Shield size={15} className="text-emerald-500" />,
                bg: 'bg-emerald-50',
                label: 'Evidence Trace',
                sub: 'AI 검증 근거 확인',
                action: () => storedId && navigate(`/analysis/result/${storedId}#evidence`),
              },
              {
                icon: <FileText size={15} className="text-purple-500" />,
                bg: 'bg-purple-50',
                label: 'AI 리포트',
                sub: 'GPT 기반 섹션별 진단 보고서',
                action: () => storedId && navigate(`/analysis/result/${storedId}#ai-report`),
              },
            ].map((card, i) => (
              <button
                key={i}
                onClick={card.action}
                className="saas-card flex items-center gap-3 px-5 py-4 text-left group"
              >
                <span className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                  {card.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{card.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
                </div>
                <ArrowUpRight size={13} className="text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── 빠른 요약 (latestReport 있을 때만) ─────────── */}
        {latestReport && (() => {
          const scores = extractScores(latestReport.sections ?? []);
          const grade  = latestReport.finalGrade ?? '—';
          const gc     = GRADE_COLOR[grade] ?? '#6b7280';
          const total  = latestReport.totalScore ?? computeTotal(scores);
          return (
            <div className="saas-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                </span>
                <span className="text-sm font-semibold text-gray-800">최근 분석 요약</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                {[
                  { label: 'ESG 등급',    value: grade,                      color: gc,       sub: 'K-ESG 기준' },
                  { label: '종합 점수',   value: total != null ? `${total}점` : '—', color: gc, sub: '/ 100점' },
                  { label: '환경 (E)',    value: scores.E != null ? `${Math.round(scores.E)}점` : '—', color: '#059669', sub: 'Environment' },
                  { label: '사회 (S)',    value: scores.S != null ? `${Math.round(scores.S)}점` : '—', color: '#3b82f6', sub: 'Social' },
                ].map(item => (
                  <div key={item.label} className="px-6 py-5">
                    <p className="kpi-label mb-2">{item.label}</p>
                    <p className="kpi-number text-2xl" style={{ color: item.color }}>
                      {item.value}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
