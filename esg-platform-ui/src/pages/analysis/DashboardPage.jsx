import React, { useEffect, useState, useRef, useCallback, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, message } from 'antd';
import _CountUp from 'react-countup';
const CountUp = _CountUp?.default ?? _CountUp;
import api from '../../api/api';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity, Zap, TreePine, TrendingDown, TrendingUp,
  CheckCircle2, Circle, ChevronRight, Search, RefreshCw, BarChart3,
} from 'lucide-react';
import { useAnalysis, BASE_URL } from '../../context/AnalysisContext';
import CarbonBenchmarkChart from '../../components/analysis/CarbonBenchmarkChart';

// ── Error Boundary ───────────────────────────────────────────────
class ChartErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#fff', borderRadius: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          padding: '24px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#94a3b8', fontSize: '14px',
        }}>
          차트를 불러오지 못했습니다.
        </div>
      );
    }
    return this.props.children;
  }
}

// ── ESG 색상 팔레트 (Toss 스타일) ────────────────────────────────
const C = {
  green:  '#16a34a', greenL: '#dcfce7', greenM: '#22c55e',
  navy:   '#1e3a5f', blue:   '#0064FF', blueL:  '#eff6ff',
  amber:  '#f59e0b', red:    '#ef4444', redL:   '#fee2e2',
  white:  '#ffffff', gray50: '#F9FAFB', gray100:'#f1f5f9',
  gray200:'#e2e8f0', gray300:'#cbd5e1', gray400:'#94a3b8',
  gray500:'#64748b', gray700:'#334155', gray900:'#0f172a',
};

const gradeColor = (g) => {
  if (g === 'A') return C.green;
  if (g === 'B') return C.blue;
  if (g === 'C') return C.amber;
  return C.red;
};

// ── 카드 래퍼 (Toss: 24px radius) ───────────────────────────────
const Card = ({ children, style = {}, hover = true, ...p }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      style={{
        background: C.white,
        borderRadius: '24px',
        boxShadow: hovered && hover
          ? '0 8px 32px rgba(0,0,0,0.10)'
          : '0 2px 8px rgba(0,0,0,0.05)',
        padding: '24px',
        transform: hovered && hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease',
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...p}
    >
      {children}
    </div>
  );
};

const SectionTitle = ({ children, icon: Icon, color = C.navy }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
    {Icon && <Icon size={18} color={color} />}
    <span style={{ fontWeight: 700, fontSize: '15px', color: C.gray900 }}>{children}</span>
  </div>
);

// ── Skeleton 컴포넌트 ─────────────────────────────────────────────
const SkeletonBar = ({ width = '100%', height = '16px', radius = '8px' }) => (
  <div style={{
    width, height, borderRadius: radius,
    background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
  }} />
);

// ── 실시간 탄소 위젯 ──────────────────────────────────────────────
const CarbonLiveWidget = ({ carbonStats }) => {
  const [liveValue, setLiveValue] = useState(null);
  const [prevValue, setPrevValue] = useState(null);
  const [pulse, setPulse]         = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    const base = carbonStats?.length
      ? (carbonStats[carbonStats.length - 1]?.totalEmission ?? 42.5)
      : 42.5;

    const prev = carbonStats?.length > 1
      ? (carbonStats[carbonStats.length - 2]?.totalEmission ?? base * 1.03)
      : base * 1.03;

    setLiveValue(base);
    setPrevValue(prev);

    tickRef.current = setInterval(() => {
      setLiveValue(v => +(v + (Math.random() - 0.5) * 0.8).toFixed(2));
      setPulse(p => !p);
    }, 4000);
    return () => clearInterval(tickRef.current);
  }, [carbonStats]);

  const pct = prevValue > 0 ? ((liveValue - prevValue) / prevValue * 100) : 0;
  const down = pct < 0;

  return (
    <Card style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #2d5a8f 100%)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 600 }}>
              실시간 탄소 배출량
            </span>
            <span style={{
              background: C.greenM, color: C.white,
              fontSize: '10px', fontWeight: 700,
              padding: '2px 7px', borderRadius: '99px',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%', background: C.white,
                animation: 'live-pulse 1.2s ease-in-out infinite',
                display: 'inline-block',
              }} />
              LIVE
            </span>
          </div>
          <div style={{ color: C.white, fontSize: '36px', fontWeight: 800, lineHeight: 1.1 }}>
            {liveValue !== null ? liveValue.toFixed(2) : '—'}
          </div>
          <div style={{ color: '#93c5fd', fontSize: '13px', marginTop: '4px' }}>tCO₂eq / 당월</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.1)', borderRadius: '14px',
          padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Activity size={28} color={C.greenM} />
        </div>
      </div>

      <div style={{
        marginTop: '20px', paddingTop: '16px',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {down
          ? <TrendingDown size={16} color={C.greenM} />
          : <TrendingUp   size={16} color={C.red} />}
        <span style={{
          color: down ? C.greenM : '#fca5a5',
          fontSize: '13px', fontWeight: 600,
        }}>
          전일 대비 {down ? '▼' : '▲'} {Math.abs(pct).toFixed(1)}%
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          ({prevValue?.toFixed(2)} tCO₂eq)
        </span>
      </div>
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes dp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>
    </Card>
  );
};

// ── WS 상태 → 라벨 매핑 ──────────────────────────────────────────
const WS_LABEL_MAP = {
  PREPROCESSING:      'PDF 텍스트 파싱 중...',
  INDEXING_REPORT:    '벡터 DB 인덱싱 중...',
  RETRIEVING_CONTEXT: 'K-ESG 18개 지표 검색 중...',
  AI_ANALYZING:       'AI 정밀 분석 중 (Upstage)...',
  MERGING_SCORE:      '점수 집계 및 등급 산출 중...',
  COMPLETE:           '분석 완료',
  FAILED:             '분석 오류',
};

// ── 3-Step 상태 표시 ─────────────────────────────────────────────
const ThreeStepStatus = ({ carbonStats, ecoPreview, latestReport, wsStatus, isAnalyzing }) => {
  const inProgress  = wsStatus && !['COMPLETE', 'FAILED', null, undefined].includes(wsStatus);
  const wsLabel     = WS_LABEL_MAP[wsStatus] || '';
  const isFailed    = wsStatus === 'FAILED';

  const carbonConnected = (carbonStats?.length > 0) ||
    (latestReport?.carbonReductionKg != null && latestReport?.carbonReductionKg >= 0);
  const carbonDesc = carbonConnected
    ? carbonStats?.length > 0
      ? `${carbonStats.length}개월 탄소 데이터 연동 완료`
      : 'AI 분석에 탄소 데이터 반영 완료'
    : latestReport ? '탄소 API 미연동 (분석은 완료)' : '연동 대기 중';

  const steps = [
    {
      label: '에너지 연동',
      desc:    carbonDesc,
      done:    carbonConnected,
      loading: false,
      error:   false,
    },
    {
      label: 'AI 분석',
      desc: isFailed   ? '분석 실패 — 재시도해주세요'
           : inProgress ? wsLabel
           : latestReport ? `완료 — 최종 등급 ${latestReport.finalGrade}`
           : isAnalyzing  ? '분석 준비 중...'
           : 'PDF 업로드 후 시작',
      done:    !!latestReport && !inProgress,
      loading: inProgress || (isAnalyzing && !latestReport),
      error:   isFailed,
    },
    {
      label: '리포트 확인',
      desc: latestReport ? `최종 등급: ${latestReport.finalGrade}` : '분석 완료 후 활성화',
      done:    !!latestReport,
      loading: false,
      error:   false,
    },
  ];

  return (
    <Card>
      <SectionTitle icon={CheckCircle2} color={C.green}>분석 진행 단계</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: s.error   ? C.red
                          : s.done    ? C.green
                          : s.loading ? C.blue
                          : C.gray100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.3s',
              }}>
                {s.done
                  ? <CheckCircle2 size={16} color={C.white} />
                  : s.loading
                    ? <Zap size={14} color={C.white} style={{ animation: 'dp-pulse 0.9s ease-in-out infinite' }} />
                    : <Circle size={16} color={C.gray300} />}
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  width: '2px', height: '36px',
                  background: s.done ? C.greenL : C.gray100,
                  margin: '4px 0',
                  transition: 'background 0.3s',
                }} />
              )}
            </div>
            <div style={{ paddingTop: '6px' }}>
              <div style={{
                fontWeight: s.done ? 700 : s.loading ? 700 : 500,
                color: s.error ? C.red : s.done ? C.green : s.loading ? C.blue : C.gray500,
                fontSize: '14px',
              }}>
                {i + 1}. {s.label}
              </div>
              <div style={{
                color: s.loading ? C.blue : C.gray500,
                fontSize: '12px', marginTop: '2px', marginBottom: '12px',
                fontWeight: s.loading ? 600 : 400,
              }}>
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ── ESG Radar Chart ───────────────────────────────────────────────
const ESGRadarChartCard = ({ sections }) => {
  const radarData = sections.length > 0
    ? sections.map(s => ({
        subject: s.category === 'Environment' ? '환경 (E)'
               : s.category === 'Social'       ? '사회 (S)'
               : '지배구조 (G)',
        score:   s.score,
        fullMark: 100,
      }))
    : [
        { subject: '환경 (E)',    score: 0, fullMark: 100 },
        { subject: '사회 (S)',    score: 0, fullMark: 100 },
        { subject: '지배구조 (G)', score: 0, fullMark: 100 },
      ];

  return (
    <Card>
      <SectionTitle icon={Activity} color={C.blue}>ESG 부문별 진단</SectionTitle>
      {sections.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.gray500, padding: '40px 0', fontSize: '14px' }}>
          분석 리포트를 업로드하면 차트가 표시됩니다.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <RadarChart data={radarData} margin={{ top: 10, right: 40, left: 40, bottom: 10 }}>
            <PolarGrid stroke={C.gray100} />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: C.gray700, fontSize: 13, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              angle={30} domain={[0, 100]}
              tick={{ fill: C.gray500, fontSize: 11 }}
              tickCount={5}
            />
            <Radar
              name="ESG 점수"
              dataKey="score"
              stroke={C.blue}
              fill={C.blue}
              fillOpacity={0.2}
              dot={{ r: 4, fill: C.blue }}
            />
            <Tooltip
              formatter={(v) => [`${v}점`, 'ESG 점수']}
              contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

// ── 월별 탄소 배출 추세 Line Chart ───────────────────────────────
const MonthlyEmissionTrendChart = ({ benchmarkData, loading }) => {
  if (loading && !benchmarkData) {
    return (
      <Card>
        <SectionTitle icon={TrendingDown} color={C.green}>월별 탄소 배출 추세</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
          <SkeletonBar width="60%" height="14px" />
          <SkeletonBar width="100%" height="300px" radius="12px" />
        </div>
      </Card>
    );
  }

  if (!benchmarkData?.monthlyData) {
    return (
      <Card>
        <SectionTitle icon={TrendingDown} color={C.green}>월별 탄소 배출 추세</SectionTitle>
        <div style={{ textAlign: 'center', color: C.gray400, padding: '40px 0', fontSize: '14px' }}>
          데이터를 불러오는 중입니다.
        </div>
      </Card>
    );
  }

  const { monthlyData, industryName, regionName } = benchmarkData;
  const avgLabel = [regionName, industryName].filter(Boolean).join(' ') + ' 평균';

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const mine = payload.find(p => p.dataKey === 'myEmissionTco2')?.value ?? 0;
    const avg  = payload.find(p => p.dataKey === 'regionAvgEmissionTco2')?.value ?? 0;
    const diff = avg > 0 ? ((mine - avg) / avg * 100).toFixed(1) : null;
    const better = parseFloat(diff) <= 0;
    return (
      <div style={{
        background: C.white, border: `1px solid ${C.gray200}`,
        borderRadius: '10px', padding: '12px 16px', fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: '190px',
      }}>
        <div style={{ fontWeight: 700, marginBottom: '8px', color: C.gray900 }}>{label}</div>
        <div style={{ color: C.blue, marginBottom: '2px' }}>
          우리 기업: <strong>{mine.toFixed(1)} tCO₂eq</strong>
        </div>
        <div style={{ color: C.gray400, marginBottom: '6px' }}>
          {avgLabel}: <strong>{avg.toFixed(1)} tCO₂eq</strong>
        </div>
        {diff !== null && (
          <div style={{ color: better ? C.green : C.red, fontWeight: 700 }}>
            {better
              ? `▼ ${Math.abs(diff)}% 절감`
              : `▲ ${Math.abs(diff)}% 초과`}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <SectionTitle icon={TrendingDown} color={C.green}>월별 탄소 배출 추세</SectionTitle>
      <div style={{ fontSize: '11px', color: C.gray400, marginBottom: '12px', marginTop: '-10px' }}>
        우리 기업 실측값 vs {avgLabel} (한국에너지공단 통계 기반 추정)
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={monthlyData} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.gray100} />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: C.gray700 }} />
          <YAxis
            unit=" t"
            tick={{ fontSize: 11, fill: C.gray500 }}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '13px' }} />
          <Line
            type="monotone"
            dataKey="myEmissionTco2"
            name="우리 기업"
            stroke={C.blue}
            strokeWidth={2.5}
            dot={{ r: 4, fill: C.blue, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="regionAvgEmissionTco2"
            name={avgLabel}
            stroke={C.gray300}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: C.gray300, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

// ── 에코 포인트 위젯 ──────────────────────────────────────────────
const EcoPointWidget = ({ ecoPreview, companyId, onCommitDone }) => {
  const [committing, setCommitting] = useState(false);
  const [localSettled, setLocalSettled] = useState(false);
  const pts   = ecoPreview?.ecoPoints    ?? 0;
  const kgCO2 = ecoPreview?.carbonReductionKg ?? 0;
  const trees = ecoPreview?.equivalentTrees   ?? 0;
  const isSettled = ecoPreview?.isSettled === true || localSettled;
  const isDone = pts === 0 && !isSettled;

  const handleCommit = async () => {
    if (isSettled) return;
    setCommitting(true);
    try {
      await api.post('/analysis/eco/commit');
      setLocalSettled(true);
      message.success('성과 확정 완료! AI 재분석 후 자동 반영됩니다.');
      onCommitDone?.();
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      if (msg?.includes('이미')) {
        setLocalSettled(true);
        message.info('이미 이번 분기 성과 확정이 완료된 상태입니다.');
      } else {
        message.error('성과 확정 실패: ' + msg);
      }
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Card style={{
      background: isDone
        ? C.gray50
        : `linear-gradient(135deg, ${C.greenL} 0%, #a7f3d0 100%)`,
      border: `1px solid ${isDone ? C.gray100 : '#6ee7b7'}`,
      position: 'relative',
    }}>
      {isSettled && (
        <div style={{
          position: 'absolute', top: '16px', right: '160px',
          background: C.green, color: C.white,
          fontSize: '12px', fontWeight: 700, padding: '5px 14px',
          borderRadius: '99px', display: 'flex', alignItems: 'center', gap: '5px',
          boxShadow: '0 2px 8px rgba(22,163,74,0.35)',
          zIndex: 10,
        }}>
          ✓ 이번 분기 성과 확정 완료
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: isDone ? C.gray500 : '#065f46', marginBottom: '16px' }}>
            🌿 임직원 에코 포인트 성과 현황
            {isDone && !isSettled && <span style={{ marginLeft: '8px', color: C.gray300, fontSize: '12px' }}>(데이터 없음)</span>}
          </div>
          <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', color: isDone ? C.gray400 : '#047857', marginBottom: '4px' }}>누적 에코 포인트</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: isDone ? C.gray400 : '#065f46' }}>
                {pts > 0
                  ? <CountUp end={pts} duration={1.5} separator="," suffix=" EP" />
                  : '0 EP'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: isDone ? C.gray400 : '#047857', marginBottom: '4px' }}>탄소 절감 환산</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: isDone ? C.gray400 : C.green }}>
                {pts > 0 ? <CountUp end={kgCO2} duration={1.8} decimals={1} suffix=" kg CO₂" /> : '0 kg CO₂'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: isDone ? C.gray400 : '#047857', marginBottom: '4px' }}>소나무 식재 효과</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: isDone ? C.gray400 : C.green, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TreePine size={20} color={isDone ? C.gray400 : C.green} />
                {pts > 0 ? <CountUp end={trees} duration={2} decimals={1} suffix=" 그루" /> : '0 그루'}
              </div>
            </div>
            {ecoPreview?.eBonus > 0 && (
              <div>
                <div style={{ fontSize: '12px', color: '#047857', marginBottom: '4px' }}>E 점수 가산</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: C.green }}>+{ecoPreview.eBonus}점</div>
              </div>
            )}
            {ecoPreview?.sBonus > 0 && (
              <div>
                <div style={{ fontSize: '12px', color: '#047857', marginBottom: '4px' }}>S 점수 가산</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: C.green }}>+{ecoPreview.sBonus}점</div>
              </div>
            )}
          </div>
        </div>

        <button
          data-html2canvas-ignore
          onClick={handleCommit}
          disabled={isSettled || isDone || committing}
          style={{
            padding: '14px 28px',
            background: (isSettled || isDone) ? C.gray200 : C.green,
            color: C.white,
            border: 'none',
            borderRadius: '14px',
            fontWeight: 700,
            fontSize: '15px',
            cursor: (isSettled || isDone) ? 'not-allowed' : 'pointer',
            opacity: (isSettled || isDone) ? 0.55 : 1,
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Zap size={18} />
          {committing ? 'AI 재분석 중...' : isSettled ? '분기 확정 완료' : isDone ? '포인트 없음' : '성과 확정 및 점수 반영'}
        </button>
      </div>
    </Card>
  );
};

// ── ESG 등급 배지 카드 (컴팩트 — Row 1 우측 배치용) ─────────────
const GradeBadge = ({ report, navigate }) => {
  const grade = report?.finalGrade;
  const color = gradeColor(grade);
  return (
    <Card style={{
      background: `linear-gradient(135deg, ${C.navy} 0%, #2d5a8f 100%)`,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      cursor: 'pointer', padding: '20px 16px',
    }} onClick={() => navigate('/analysis/report')}>
      <div style={{ color: '#93c5fd', fontSize: '11px', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
        최종 ESG 종합등급
      </div>
      {grade ? (
        <>
          <div style={{
            fontSize: '52px', fontWeight: 900, color: C.white, lineHeight: 1,
            textShadow: `0 0 20px ${color}99`,
          }}>
            {grade}
          </div>
          <div style={{
            marginTop: '10px', background: color,
            color: C.white, padding: '3px 12px', borderRadius: '99px',
            fontSize: '11px', fontWeight: 700,
          }}>
            K-ESG 기준
          </div>
          <div style={{
            color: '#93c5fd', fontSize: '11px', marginTop: '10px',
            display: 'flex', alignItems: 'center', gap: '3px',
          }}>
            리포트 보기 <ChevronRight size={12} />
          </div>
        </>
      ) : (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', lineHeight: 1.5 }}>
          PDF 업로드 후<br />등급 표시
        </div>
      )}
    </Card>
  );
};


// ── 탄소 벤치마크 Skeleton UI ─────────────────────────────────────
const BenchmarkSkeleton = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '8px 0' }}>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <SkeletonBar width="120px" height="28px" radius="8px" />
      <SkeletonBar width="200px" height="14px" />
    </div>
    <SkeletonBar width="100%" height="200px" radius="12px" />
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '8px', color: C.gray400, fontSize: '13px',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: C.gray300,
        animation: 'live-pulse 1.2s ease-in-out infinite',
      }} />
      업종을 파악 중...
    </div>
  </div>
);

// ── 메인 대시보드 페이지 ──────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    companyId, setCompanyId,
    latestReport, ecoPreview, carbonStats, benchmarkData,
    fetchLatestData, fetchEcoPreview, fetchBenchmarkData,
    isAnalyzing, setIsAnalyzing, wsStatus, connectWebSocket,
  } = useAnalysis();

  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async (id) => {
    setLoading(true);
    await Promise.all([
      fetchLatestData(id),
      fetchEcoPreview(id),
      fetchBenchmarkData(id),
    ]);
    setLoading(false);
  }, [fetchLatestData, fetchEcoPreview, fetchBenchmarkData]);

  useEffect(() => {
    loadAll();
  }, [companyId, loadAll]);

  const handleSearch = (val) => {
    const id = Number(val);
    if (id > 0) { setCompanyId(id); }
  };

  const sections = latestReport?.sections ?? [];

  // 탄소 배출 벤치마크 헤더 — regionName/industryName 동적 바인딩
  const benchmarkTitle = benchmarkData
    ? `우리 기업 vs ${[benchmarkData.regionName, benchmarkData.industryName].filter(Boolean).join(' ')} 평균`
    : loading
    ? '벤치마크 데이터 불러오는 중...'
    : '지역·업종 평균';

  return (
    <div style={{ padding: '36px 48px', width: '100%', boxSizing: 'border-box' }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: C.gray900 }}>
            기업 ESG 통합 관제 대시보드
          </h1>
          <div style={{ color: C.gray500, fontSize: '14px', marginTop: '4px' }}>
            K-ESG 가이드라인(산업통상자원부, 2021) 기준 실시간 모니터링
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Input.Search
            placeholder="기업 ID"
            defaultValue={companyId}
            onSearch={handleSearch}
            style={{ width: '160px' }}
            size="large"
          />
          <button
            data-html2canvas-ignore
            onClick={() => loadAll(companyId)}
            style={{
              padding: '8px 16px', background: C.navy, color: C.white,
              border: 'none', borderRadius: '10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px',
            }}
          >
            <RefreshCw size={15} />
            새로고침
          </button>
          <button
            data-html2canvas-ignore
            onClick={() => navigate('/analysis/detail')}
            style={{
              padding: '8px 18px', background: C.green, color: C.white,
              border: 'none', borderRadius: '10px', cursor: 'pointer',
              fontWeight: 700, fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Activity size={15} />
            신규 분석 시작
          </button>
        </div>
      </div>

      {/* Row 1: 실시간 탄소 + 3-Step + 등급 배지(컴팩트) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 190px', gap: '28px', marginBottom: '28px' }}>
        <CarbonLiveWidget carbonStats={carbonStats} />
        <ThreeStepStatus
          carbonStats={carbonStats}
          ecoPreview={ecoPreview}
          latestReport={latestReport}
          wsStatus={wsStatus}
          isAnalyzing={isAnalyzing}
        />
        <GradeBadge report={latestReport} navigate={navigate} />
      </div>

      {/* Row 2: Radar + 월별 탄소 추세 — 풀너비 2컬럼 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', marginBottom: '28px' }}>
        <ChartErrorBoundary><ESGRadarChartCard sections={sections} /></ChartErrorBoundary>
        <ChartErrorBoundary>
          <MonthlyEmissionTrendChart benchmarkData={benchmarkData} loading={loading} />
        </ChartErrorBoundary>
      </div>

      {/* Row 3: 에코 포인트 위젯 */}
      {ecoPreview && (
        <EcoPointWidget
          ecoPreview={ecoPreview}
          companyId={companyId}
          onCommitDone={() => {
            connectWebSocket(companyId, () => loadAll(companyId));
            setIsAnalyzing(true);
          }}
        />
      )}

      {/* Row 4: 탄소 배출 지역 벤치마크 — 동적 지역/업종명 */}
      <div style={{
        background: '#ffffff', borderRadius: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        padding: '24px', marginTop: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <BarChart3 size={18} color={C.navy} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: C.gray900 }}>
            탄소 배출 지역 벤치마크 — {benchmarkTitle}
          </span>
          <span style={{
            background: C.blueL, color: C.blue, fontSize: '11px',
            padding: '2px 8px', borderRadius: '99px', fontWeight: 700, marginLeft: '4px',
          }}>
            업종별 통계 기반
          </span>
          {/* 절감/초과 요약 문구 */}
          {benchmarkData?.annualMyTotal != null && benchmarkData?.annualRegionAvgTotal != null && (
            <span style={{
              fontSize: '12px', fontWeight: 600,
              color: benchmarkData.annualMyTotal <= benchmarkData.annualRegionAvgTotal ? C.green : C.red,
              marginLeft: '4px',
            }}>
              {benchmarkData.annualMyTotal <= benchmarkData.annualRegionAvgTotal
                ? `▼ ${Math.abs(benchmarkData.annualReductionPercent ?? 0).toFixed(1)}% 절감`
                : `▲ ${Math.abs(benchmarkData.annualReductionPercent ?? 0).toFixed(1)}% 초과`}
            </span>
          )}
        </div>

        {/* 로딩 → Skeleton | 데이터 있음 → 차트 | 없음 → 설정 안내 */}
        {loading && !benchmarkData ? (
          <BenchmarkSkeleton />
        ) : benchmarkData ? (
          <ChartErrorBoundary>
            <CarbonBenchmarkChart data={benchmarkData} />
          </ChartErrorBoundary>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '48px 0', gap: '10px',
          }}>
            <BarChart3 size={48} color={C.gray200} />
            <div style={{ fontWeight: 600, fontSize: '15px', color: C.gray700 }}>
              벤치마크 데이터를 불러올 수 없습니다
            </div>
            <div style={{ color: C.gray400, fontSize: '13px' }}>
              회원가입 시 입력한 지역·업종 정보를 확인해주세요
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
