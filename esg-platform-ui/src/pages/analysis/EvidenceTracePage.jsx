import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GitBranch, Search, Filter, ChevronDown, ChevronUp,
  FileText, ArrowLeft, ExternalLink, CheckCircle2,
  AlertCircle, Info, XCircle, SlidersHorizontal,
} from 'lucide-react';
import api from '../../api/api';
import { useAnalysis } from '../../context/AnalysisContext';

// ── helpers ─────────────────────────────────────────────────────────
const CAT_META = {
  E: { label: 'Environment', color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  S: { label: 'Social',      color: 'blue',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  G: { label: 'Governance',  color: 'amber',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
};

const SIM_BAND = (v) => {
  if (v == null) return { label: 'N/A',    cls: 'bg-gray-100 text-gray-500'            };
  if (v >= 0.88)  return { label: 'HIGH',   cls: 'bg-emerald-100 text-emerald-700'      };
  if (v >= 0.75)  return { label: 'MEDIUM', cls: 'bg-blue-100 text-blue-700'            };
  return              { label: 'LOW',    cls: 'bg-amber-100 text-amber-700'            };
};

const NUMERIC_BADGE = (lvl) => {
  if (lvl === 'HIGH')   return { label: '수치 HIGH', cls: 'bg-emerald-100 text-emerald-700' };
  if (lvl === 'MEDIUM') return { label: '수치 MED',  cls: 'bg-blue-100 text-blue-700'       };
  if (lvl === 'LOW')    return { label: '수치 LOW',  cls: 'bg-amber-100 text-amber-700'     };
  return null;
};

function flattenEvidences(result) {
  const rows = [];
  const categories = [
    { key: 'E', data: result?.eResult },
    { key: 'S', data: result?.sResult },
    { key: 'G', data: result?.gResult },
  ];
  for (const { key, data } of categories) {
    if (!data?.indicators) continue;
    for (const ind of data.indicators) {
      if (!ind.evidences?.length) continue;
      for (const ev of ind.evidences) {
        rows.push({
          category:        key,
          indicatorCode:   ind.indicatorCode ?? ev.indicatorCode ?? '',
          indicatorName:   ind.indicatorName ?? '',
          text:            ev.text ?? ev.snippet ?? '',
          similarity:      ev.similarity ?? null,
          numericMatchLevel: ev.numericMatchLevel ?? null,
          source:          ev.source ?? ev.fileName ?? '—',
          page:            ev.page ?? null,
          vstatus:         ev.vstatus ?? null,
        });
      }
    }
    // flat evidences at top level (some categories store them directly)
    if (data?.evidences?.length) {
      for (const ev of data.evidences) {
        rows.push({
          category:        key,
          indicatorCode:   ev.indicatorCode ?? '',
          indicatorName:   '',
          text:            ev.text ?? ev.snippet ?? '',
          similarity:      ev.similarity ?? null,
          numericMatchLevel: ev.numericMatchLevel ?? null,
          source:          ev.source ?? ev.fileName ?? '—',
          page:            ev.page ?? null,
          vstatus:         ev.vstatus ?? null,
        });
      }
    }
  }
  return rows;
}

// ── main component ───────────────────────────────────────────────────
export default function EvidenceTracePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { latestReport } = useAnalysis();

  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);   // clicked row
  const [query,     setQuery]     = useState('');
  const [catFilter, setCatFilter] = useState('ALL');  // ALL / E / S / G
  const [simFilter, setSimFilter] = useState('ALL');  // ALL / HIGH / MEDIUM / LOW
  const [sortKey,   setSortKey]   = useState('similarity');
  const [sortDir,   setSortDir]   = useState('desc');
  const [analysisId, setAnalysisId] = useState(null);

  // resolve analysisId
  useEffect(() => {
    const paramId = searchParams.get('analysisId');
    if (paramId) { setAnalysisId(paramId); return; }
    const storedId = localStorage.getItem('lastAnalysisId');
    if (storedId) { setAnalysisId(storedId); return; }
    if (latestReport?.analysisId) setAnalysisId(latestReport.analysisId);
  }, [searchParams, latestReport]);

  useEffect(() => {
    if (!analysisId) return;
    setLoading(true);
    setError(null);
    api.get(`/analysis/result/${analysisId}`)
      .then(res => setResult(res.data))
      .catch(err => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [analysisId]);

  const allRows = useMemo(() => flattenEvidences(result), [result]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (catFilter !== 'ALL') rows = rows.filter(r => r.category === catFilter);
    if (simFilter !== 'ALL') rows = rows.filter(r => SIM_BAND(r.similarity).label === simFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        r.indicatorCode.toLowerCase().includes(q) ||
        r.indicatorName.toLowerCase().includes(q) ||
        r.text.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [allRows, catFilter, simFilter, query, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronDown size={12} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-emerald-600" />
      : <ChevronDown size={12} className="text-emerald-600" />;
  };

  const ThCol = ({ label, col, className = '' }) => (
    <th
      className={`px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-800 transition-colors ${className}`}
      onClick={() => col && toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {col && <SortIcon col={col} />}
      </span>
    </th>
  );

  const stats = useMemo(() => ({
    total:  allRows.length,
    high:   allRows.filter(r => SIM_BAND(r.similarity).label === 'HIGH').length,
    medium: allRows.filter(r => SIM_BAND(r.similarity).label === 'MEDIUM').length,
    low:    allRows.filter(r => SIM_BAND(r.similarity).label === 'LOW').length,
  }), [allRows]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] p-6">
      <div className="max-w-screen-xl mx-auto">

        {/* ── Page header ────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
            >
              <ArrowLeft size={16} className="text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <GitBranch size={18} className="text-emerald-600" />
                <h1 className="text-xl font-bold text-gray-900">Evidence Trace</h1>
              </div>
              <p className="text-[13px] text-gray-500 mt-0.5">
                K-ESG 18개 지표별 감사 근거 및 적합도 추적
                {analysisId && (
                  <span className="ml-2 text-gray-400 font-mono text-[11px]">#{analysisId}</span>
                )}
              </p>
            </div>
          </div>

          {analysisId && (
            <button
              onClick={() => navigate(`/analysis/result/${analysisId}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <ExternalLink size={13} />
              전체 리포트 보기
            </button>
          )}
        </div>

        {/* ── No analysis ID state ───────────────────────────── */}
        {!analysisId && !loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
            <GitBranch size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium mb-1">분석 결과가 없습니다</p>
            <p className="text-[13px] text-gray-400 mb-6">ESG Audit을 실행하면 Evidence Trace가 활성화됩니다.</p>
            <button
              onClick={() => navigate('/analysis/detail')}
              className="px-5 py-2 bg-emerald-600 text-white text-[13px] font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              AI ESG Audit 시작
            </button>
          </div>
        )}

        {/* ── Loading ────────────────────────────────────────── */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-[13px]">Evidence 데이터 불러오는 중...</p>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────── */}
        {error && !loading && (
          <div className="bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
            <XCircle size={40} className="text-red-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium mb-1">데이터를 불러오지 못했습니다</p>
            <p className="text-[13px] text-gray-400">{error}</p>
          </div>
        )}

        {/* ── Main content ───────────────────────────────────── */}
        {result && !loading && (
          <>
            {/* KPI summary bar */}
            <div className="grid grid-cols-4 gap-4 mb-5">
              {[
                { label: '전체 Evidence',  value: stats.total,  icon: FileText,     cls: 'text-gray-700',    bg: 'bg-gray-50'     },
                { label: '고신뢰 (≥0.88)',  value: stats.high,   icon: CheckCircle2, cls: 'text-emerald-700', bg: 'bg-emerald-50'  },
                { label: '중간 (0.75~)',    value: stats.medium, icon: Info,         cls: 'text-blue-700',    bg: 'bg-blue-50'     },
                { label: '저신뢰 (<0.75)',  value: stats.low,    icon: AlertCircle,  cls: 'text-amber-700',   bg: 'bg-amber-50'    },
              ].map(({ label, value, icon: Icon, cls, bg }) => (
                <div key={label} className={`${bg} rounded-xl border border-gray-200 p-4 shadow-sm`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={cls} />
                    <span className="text-[12px] text-gray-500">{label}</span>
                  </div>
                  <span className={`text-2xl font-bold ${cls}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* toolbar */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-3 shadow-sm">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="지표코드, 텍스트, 파일명 검색..."
                  className="flex-1 text-[13px] outline-none text-gray-700 placeholder-gray-400"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                    <XCircle size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <SlidersHorizontal size={13} className="text-gray-400" />
                {/* Category filter */}
                <div className="flex items-center gap-1">
                  {['ALL', 'E', 'S', 'G'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCatFilter(c)}
                      className={[
                        'px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors',
                        catFilter === c
                          ? (c === 'E' ? 'bg-emerald-100 text-emerald-700'
                            : c === 'S' ? 'bg-blue-100 text-blue-700'
                            : c === 'G' ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-900 text-white')
                          : 'text-gray-500 hover:bg-gray-100',
                      ].join(' ')}
                    >
                      {c === 'ALL' ? '전체' : c}
                    </button>
                  ))}
                </div>

                <div className="w-px h-4 bg-gray-200" />

                {/* Similarity filter */}
                <div className="flex items-center gap-1">
                  {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
                    <button
                      key={s}
                      onClick={() => setSimFilter(s)}
                      className={[
                        'px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors',
                        simFilter === s
                          ? (s === 'HIGH' ? 'bg-emerald-100 text-emerald-700'
                            : s === 'MEDIUM' ? 'bg-blue-100 text-blue-700'
                            : s === 'LOW' ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-900 text-white')
                          : 'text-gray-500 hover:bg-gray-100',
                      ].join(' ')}
                    >
                      {s === 'ALL' ? '전체' : s}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[12px] text-gray-400 ml-auto flex-shrink-0">
                {filtered.length} / {allRows.length} 건
              </span>
            </div>

            {/* main layout: table + detail panel */}
            <div className="flex gap-4">
              {/* table */}
              <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all ${selected ? 'flex-1 min-w-0' : 'w-full'}`}>
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-[13px]">
                    조건에 맞는 Evidence가 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <ThCol label="카테고리"   col={null}         className="w-20"  />
                          <ThCol label="지표 코드"  col="indicatorCode" className="w-24"  />
                          <ThCol label="Evidence 텍스트" col={null}    className="min-w-[240px]" />
                          <ThCol label="근거 적합도"     col="similarity"   className="w-24"  />
                          <ThCol label="신뢰도"     col={null}         className="w-24"  />
                          <ThCol label="출처 파일"  col="source"       className="w-36"  />
                          <ThCol label="페이지"     col="page"         className="w-16"  />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filtered.map((row, i) => {
                          const cat = CAT_META[row.category] ?? CAT_META.E;
                          const sim = SIM_BAND(row.similarity);
                          const numBadge = NUMERIC_BADGE(row.numericMatchLevel);
                          const isSelected = selected === i;
                          return (
                            <tr
                              key={i}
                              onClick={() => setSelected(isSelected ? null : i)}
                              className={[
                                'cursor-pointer transition-colors',
                                isSelected
                                  ? 'bg-emerald-50'
                                  : 'hover:bg-gray-50',
                              ].join(' ')}
                            >
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-md ${cat.bg} ${cat.text}`}>
                                  {row.category}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[12px] font-mono font-semibold text-gray-700">
                                  {row.indicatorCode}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className={`text-[12px] text-gray-600 leading-relaxed ${selected ? 'line-clamp-2' : 'line-clamp-3'}`}>
                                  {row.text || '—'}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-500 rounded-full"
                                        style={{ width: `${Math.round((row.similarity ?? 0) * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-[11px] font-mono text-gray-600 w-9 text-right">
                                      {row.similarity != null ? (row.similarity * 100).toFixed(0) + '%' : '—'}
                                    </span>
                                  </div>
                                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${sim.cls}`}>
                                    {sim.label}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {numBadge ? (
                                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${numBadge.cls}`}>
                                    {numBadge.label}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-gray-400">Semantic</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[12px] text-gray-500 truncate max-w-[120px] block" title={row.source}>
                                  {row.source}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[12px] text-gray-500">
                                  {row.page != null ? `p.${row.page}` : '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* detail panel */}
              {selected !== null && filtered[selected] && (
                <div className="w-80 flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 self-start sticky top-20 animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[13px] font-bold text-gray-800">Evidence 상세</span>
                    <button
                      onClick={() => setSelected(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>

                  {(() => {
                    const row = filtered[selected];
                    const cat = CAT_META[row.category] ?? CAT_META.E;
                    const sim = SIM_BAND(row.similarity);
                    const numBadge = NUMERIC_BADGE(row.numericMatchLevel);
                    return (
                      <div className="space-y-4">
                        {/* category + indicator */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md ${cat.bg} ${cat.text}`}>
                            {row.category} · {cat.label}
                          </span>
                          <span className="text-[12px] font-mono font-bold text-gray-700">
                            {row.indicatorCode}
                          </span>
                          {row.indicatorName && (
                            <span className="text-[12px] text-gray-500">{row.indicatorName}</span>
                          )}
                        </div>

                        {/* full text */}
                        <div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                            Evidence 텍스트
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] text-gray-700 leading-relaxed max-h-48 overflow-y-auto">
                            {row.text || '—'}
                          </div>
                        </div>

                        {/* metrics */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-[11px] text-gray-400 mb-1">근거 적합도</div>
                            <div className="text-lg font-bold text-gray-800">
                              {row.similarity != null ? (row.similarity * 100).toFixed(1) + '%' : '—'}
                            </div>
                            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded mt-1 ${sim.cls}`}>
                              {sim.label}
                            </span>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-[11px] text-gray-400 mb-1">수치 검증</div>
                            {numBadge ? (
                              <>
                                <div className="text-lg font-bold text-gray-800">{row.numericMatchLevel}</div>
                                <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded mt-1 ${numBadge.cls}`}>
                                  {numBadge.label}
                                </span>
                              </>
                            ) : (
                              <div className="text-[12px] text-gray-400 mt-1">N/A (Semantic)</div>
                            )}
                          </div>
                        </div>

                        {/* source */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">출처</div>
                          <div className="flex items-center gap-2">
                            <FileText size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="text-[12px] text-gray-700 break-all">{row.source}</span>
                          </div>
                          {row.page != null && (
                            <div className="text-[12px] text-gray-500 mt-1 ml-5">
                              p.{row.page}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
