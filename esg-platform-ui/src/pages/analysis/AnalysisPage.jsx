import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import api from '../../api/api';
import { useAnalysis } from '../../context/AnalysisContext';
import { useAuth } from '../../context/AuthContext';
import {
  Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  Loader2, ArrowRight, ArrowLeft, Terminal, X,
  Users, Building2, Leaf, Zap, MapPin, Briefcase,
} from 'lucide-react';

// ── WS 단계 정의 ─────────────────────────────────────────────────────────
const STAGES = [
  { key: 'OCR_PROCESSING',     pct: 8,   label: 'PDF OCR',        detail: 'Upstage 텍스트 추출 중...' },
  { key: 'PREPROCESSING',      pct: 18,  label: '전처리',         detail: '문서 정규화 및 청크 준비 중...' },
  { key: 'CHUNKING',           pct: 30,  label: '벡터 인덱싱',    detail: 'ChromaDB 임베딩 생성 중...' },
  { key: 'RETRIEVAL',          pct: 45,  label: 'Evidence 검색',  detail: 'K-ESG 18개 지표 컨텍스트 검색 중...' },
  { key: 'EVIDENCE_MAPPING',   pct: 58,  label: 'Evidence 매핑',  detail: '신뢰도 산정 중...' },
  { key: 'RULE_BASED_SCORING', pct: 68,  label: '규칙 기반 점수', detail: '정량 지표 평가 중...' },
  { key: 'GPT_SUMMARY',        pct: 80,  label: 'AI 정밀 진단',   detail: 'GPT-4o 지표별 분석 중...' },
  { key: 'MERGING_SCORE',      pct: 92,  label: '점수 통합',      detail: '종합 등급 산출 중...' },
  { key: 'COMPLETED',          pct: 100, label: '분석 완료',       detail: '종합 리포트가 생성되었습니다.' },
];

const getStagePct  = (key) => STAGES.find(s => s.key === key)?.pct ?? 0;
const getStageIdx  = (key) => STAGES.findIndex(s => s.key === key);
const fmtTime      = (d)   => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const LOG_COLOR    = { success: 'text-emerald-400', error: 'text-red-400', info: 'text-amber-400', sys: 'text-blue-400' };

// ── 체크리스트 상수 ───────────────────────────────────────────────────────
const SOCIAL_ITEMS = [
  { key: 's1', label: '산업안전 교육 실시 여부' },
  { key: 's2', label: 'ESG 교육 실시 여부' },
  { key: 's3', label: '산업재해 발생 여부' },
  { key: 's4', label: '임직원 참여 프로그램 운영 여부' },
  { key: 's5', label: '지역사회 봉사활동 여부' },
];

const GOV_ITEMS = [
  { key: 'g1', label: '윤리경영 정책 존재 여부' },
  { key: 'g2', label: '내부 신고 시스템 존재 여부' },
  { key: 'g3', label: 'ESG 담당 조직 존재 여부' },
  { key: 'g4', label: '외부 감사 수행 여부' },
  { key: 'g5', label: '이사회 독립성 정책 여부' },
];

// ── E 환경 데이터 상수 ────────────────────────────────────────────────────
const KSIC_BENCHMARK = {
  '제조업':    { industry: '제조업',    metrics: [
    { key: 'electricity', name: '전력 사용량',   unit: 'MWh',  industryAvg: 12000 },
    { key: 'gas',         name: '가스 사용량',   unit: 'Nm³',  industryAvg: 8500  },
    { key: 'carbon',      name: '탄소 배출량',   unit: 'tCO₂', industryAvg: 5200  },
    { key: 'waste',       name: '폐기물 발생량', unit: 'ton',  industryAvg: 320   },
    { key: 'water',       name: '수자원 사용량', unit: 'm³',   industryAvg: 45000 },
  ]},
  'IT서비스업': { industry: 'IT서비스업', metrics: [
    { key: 'electricity', name: '전력 사용량',   unit: 'MWh',  industryAvg: 3200  },
    { key: 'gas',         name: '가스 사용량',   unit: 'Nm³',  industryAvg: 1100  },
    { key: 'carbon',      name: '탄소 배출량',   unit: 'tCO₂', industryAvg: 980   },
    { key: 'waste',       name: '폐기물 발생량', unit: 'ton',  industryAvg: 42    },
    { key: 'water',       name: '수자원 사용량', unit: 'm³',   industryAvg: 8200  },
  ]},
  '물류업':    { industry: '물류업',    metrics: [
    { key: 'electricity', name: '전력 사용량',   unit: 'MWh',  industryAvg: 6800  },
    { key: 'gas',         name: '가스 사용량',   unit: 'Nm³',  industryAvg: 3400  },
    { key: 'carbon',      name: '탄소 배출량',   unit: 'tCO₂', industryAvg: 7300  },
    { key: 'waste',       name: '폐기물 발생량', unit: 'ton',  industryAvg: 180   },
    { key: 'water',       name: '수자원 사용량', unit: 'm³',   industryAvg: 12000 },
  ]},
  '식품업':    { industry: '식품업',    metrics: [
    { key: 'electricity', name: '전력 사용량',   unit: 'MWh',  industryAvg: 8400  },
    { key: 'gas',         name: '가스 사용량',   unit: 'Nm³',  industryAvg: 5600  },
    { key: 'carbon',      name: '탄소 배출량',   unit: 'tCO₂', industryAvg: 3100  },
    { key: 'waste',       name: '폐기물 발생량', unit: 'ton',  industryAvg: 560   },
    { key: 'water',       name: '수자원 사용량', unit: 'm³',   industryAvg: 95000 },
  ]},
};

const ENV_FIELDS = [
  { key: 'electricity', label: '전력 사용량',   unit: 'MWh',  placeholder: '예: 12000' },
  { key: 'gas',         label: '가스 사용량',   unit: 'Nm³',  placeholder: '예: 8500'  },
  { key: 'carbon',      label: '탄소 배출량',   unit: 'tCO₂', placeholder: '예: 5200'  },
  { key: 'waste',       label: '폐기물 발생량', unit: 'ton',  placeholder: '예: 320'   },
  { key: 'water',       label: '수자원 사용량', unit: 'm³',   placeholder: '예: 45000' },
];

// ── 위저드 스텝 정의 ──────────────────────────────────────────────────────
const WIZARD_STEPS = [
  { key: 'company', label: '기업 정보',   shortLabel: '기업', Icon: Building2,  color: '#6366f1' },
  { key: 'env',     label: 'Environment', shortLabel: 'E',    Icon: Leaf,       color: '#22c55e' },
  { key: 'social',  label: 'Social',      shortLabel: 'S',    Icon: Users,      color: '#3b82f6' },
  { key: 'gov',     label: 'Governance',  shortLabel: 'G',    Icon: Building2,  color: '#f59e0b' },
  { key: 'eco',     label: 'EcoPoint',    shortLabel: 'Eco',  Icon: Zap,        color: '#10b981' },
  { key: 'run',     label: '최종 결과',   shortLabel: '결과', Icon: ArrowRight, color: '#22c55e' },
];

const MOCK_ECO = { ecoPoints: 3240, carbonReductionKg: 12500, equivalentTrees: 47 };

// ── 로컬 점수 계산 ────────────────────────────────────────────────────────
function computeLocalEScore(envMode, ksic, manualEnv) {
  if (envMode === 'AUTO') {
    return { score: KSIC_BENCHMARK[ksic] ? 74 : 68, grade: 'B', confidence: 71, evidenceCount: 9 };
  }
  const filled = ENV_FIELDS.filter(f => Number(manualEnv[f.key]) > 0).length;
  const score  = Math.round(45 + (filled / ENV_FIELDS.length) * 40);
  return {
    score,
    grade:         score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
    confidence:    Math.round(55 + filled * 6),
    evidenceCount: filled * 2,
  };
}
function computeLocalSScore(socialAnswers) {
  const checked = Object.values(socialAnswers).filter(Boolean).length;
  const score   = Math.round((checked / SOCIAL_ITEMS.length) * 100);
  return { score, grade: score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D', confidence: 78, evidenceCount: checked };
}
function computeLocalGScore(governanceAnswers) {
  const checked = Object.values(governanceAnswers).filter(Boolean).length;
  const score   = Math.round((checked / GOV_ITEMS.length) * 100);
  return { score, grade: score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D', confidence: 82, evidenceCount: checked };
}

// ── WizardStepper ─────────────────────────────────────────────────────────
function WizardStepper({ currentStep }) {
  return (
    <div className="flex items-center mb-8">
      {WIZARD_STEPS.map((step, idx) => {
        const isDone   = idx < currentStep;
        const isActive = idx === currentStep;
        const StepIcon = step.Icon;
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isDone   ? 'border-emerald-500/60 bg-emerald-500/15'
                : isActive ? 'border-emerald-400 bg-zinc-900 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                : 'border-zinc-700 bg-zinc-900'
              }`}>
                {isDone
                  ? <CheckCircle2 size={15} className="text-emerald-400" />
                  : <StepIcon size={14} className={isActive ? 'text-emerald-400' : 'text-zinc-600'} />
                }
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors duration-200 ${
                isActive ? 'text-emerald-400' : isDone ? 'text-zinc-500' : 'text-zinc-700'
              }`}>{step.shortLabel}</span>
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mb-5 transition-colors duration-500 ${
                idx < currentStep ? 'bg-emerald-500/40' : 'bg-zinc-800'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── ChecklistStep ─────────────────────────────────────────────────────────
function ChecklistStep({ items, answers, setAnswers, accentColor, disabled }) {
  return (
    <div>
      {items.map((item, idx) => {
        const checked = !!answers[item.key];
        return (
          <div
            key={item.key}
            className={`flex items-center justify-between py-4 transition-colors duration-150 ${
              idx < items.length - 1 ? 'border-b border-zinc-800' : ''
            }`}
          >
            <span className={`text-sm select-none transition-colors duration-150 ${checked ? 'text-zinc-100' : 'text-zinc-400'}`}>
              {item.label}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAnswers(p => ({ ...p, [item.key]: !p[item.key] }))}
              className="relative ml-4 w-11 h-6 rounded-full shrink-0 transition-all duration-200 focus:outline-none"
              style={{ background: checked ? accentColor : '#3f3f46' }}
              role="switch"
              aria-checked={checked}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                checked ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── MiniScoreCard ─────────────────────────────────────────────────────────
function MiniScoreCard({ result, label, color }) {
  const gc = { S: '#10b981', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' }[result.grade] ?? color;
  const hasWarning = !!result.warning || result.lowMismatchCount > 0;
  return (
    <div className="rounded-xl border p-4 mt-4" style={{ background: `${color}08`, borderColor: `${color}25` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} style={{ color }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{label} 분석 완료</span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.gradeCeilingApplied && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
              등급제한
            </span>
          )}
          {result.lowMismatchCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25">
              LOW {result.lowMismatchCount}건
            </span>
          )}
          {result.ragBased && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              RAG
            </span>
          )}
        </div>
      </div>

      {/* 수치 불일치 경고 */}
      {hasWarning && (
        <div className="flex items-start gap-1.5 mb-3 bg-red-900/20 border border-red-700/40 rounded-lg px-2.5 py-2">
          <AlertTriangle size={11} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-300 leading-relaxed">
            {result.warning ?? '[경고] 입력 수치와 증빙자료 간 수치 불일치가 감지되었습니다.'}
            {result.gradeCeilingApplied && (
              <span className="ml-1 font-semibold text-amber-300">등급 제한 적용됨.</span>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '점수',     value: `${result.score}점`,        color: gc           },
          { label: '등급',     value: result.grade,               color: gc           },
          { label: '신뢰도',   value: `${result.confidence}%`,   color               },
          { label: 'Evidence', value: `${result.evidenceCount}건`, color: '#6366f1'  },
        ].map(c => (
          <div key={c.label} className="text-center">
            <p className="text-[9px] text-zinc-600 mb-1">{c.label}</p>
            <p className="text-lg font-black leading-none" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MiniUpload ─────────────────────────────────────────────────────────────
function MiniUpload({ file, onFile, label }) {
  const uid = useId();
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40">
          <FileText size={13} className="text-blue-400 shrink-0" />
          <span className="text-xs text-zinc-300 flex-1 truncate">{file.name}</span>
          <button type="button" onClick={() => onFile(null)} className="text-zinc-600 hover:text-zinc-300">
            <X size={13} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={uid}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-800/20 border border-dashed
            border-zinc-700 hover:border-zinc-500 cursor-pointer transition-colors duration-150"
        >
          <Upload size={13} className="text-zinc-600" />
          <span className="text-xs text-zinc-600">파일 선택 또는 드래그</span>
          <input
            id={uid}
            type="file"
            accept=".pdf,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = ''; }}
          />
        </label>
      )}
    </div>
  );
}

// ── AnalysisPage ──────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const navigate = useNavigate();
  const { companyId, setWsStatus, setIsAnalyzing } = useAnalysis();
  const { user } = useAuth();

  // ── 기업 정보 (localStorage)
  const storedKsicRaw = localStorage.getItem('esg_ksicCode') || '';
  const autoKsic      = KSIC_BENCHMARK[storedKsicRaw] ? storedKsicRaw : '제조업';
  const companyName   = localStorage.getItem('esg_companyName') || user?.nickname || '미등록';
  const regionLabel   = localStorage.getItem('esg_regionCode')    || '미등록';
  const employeeLabel = localStorage.getItem('esg_employeeCount') || '미등록';

  // ── 분석 state
  const [analysisId, setAnalysisId] = useState(null);
  const [logs, setLogs]             = useState([]);
  const [stage, setStage]           = useState(null);
  const [err, setErr]               = useState(null);

  // ── 입력 state
  const [envMode, setEnvMode]     = useState('AUTO');
  const [ksic]                     = useState(autoKsic);
  const [manualEnv, setManualEnv] = useState(() => Object.fromEntries(ENV_FIELDS.map(f => [f.key, ''])));
  const [socialAnswers, setSocialAnswers]         = useState(() => Object.fromEntries(SOCIAL_ITEMS.map(i => [i.key, false])));
  const [governanceAnswers, setGovernanceAnswers] = useState(() => Object.fromEntries(GOV_ITEMS.map(i => [i.key, false])));

  // ── 위저드 state
  const [wizardStep, setWizardStep] = useState(0);
  const [ecoLinked, setEcoLinked]   = useState(false);

  // ── 단계별 분석 완료 state
  const [eCompleted, setECompleted] = useState(false);
  const [sCompleted, setSCompleted] = useState(false);
  const [gCompleted, setGCompleted] = useState(false);
  const [eResult, setEResult] = useState(null);
  const [sResult, setSResult] = useState(null);
  const [gResult, setGResult] = useState(null);

  // ── 카테고리 분석 로딩 state
  const [sLoading, setSLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);

  // ── 단계별 증빙 파일
  const [eFile, setEFile] = useState(null);
  const [sFile, setSFile] = useState(null);
  const [gFile, setGFile] = useState(null);

  const stompRef     = useRef(null);
  const logBottomRef = useRef(null);

  useEffect(() => { logBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => () => stompRef.current?.deactivate(), []);

  const addLog = useCallback((tag, msg, type = 'info') => {
    setLogs(prev => [...prev, { t: fmtTime(new Date()), tag, msg, type }]);
  }, []);

  // ── WebSocket (변경 없음)
  const connectWs = useCallback((cId, aId) => {
    stompRef.current?.deactivate();
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws-esg'),
      reconnectDelay: 3000,
      onConnect: () => {
        addLog('WS', 'WebSocket 연결됨. 분석 이벤트 대기 중...', 'sys');
        client.subscribe(`/topic/analysis/${cId}`, (msg) => {
          const s = msg.body;
          setStage(s);
          setWsStatus(s);
          const def  = STAGES.find(x => x.key === s);
          const type = s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'error' : 'info';
          addLog(s, def?.detail ?? s, type);
          if (s === 'COMPLETED') {
            setIsAnalyzing(false);
            addLog('SYS', `리포트 페이지로 이동합니다 (분석 ID: ${aId})`, 'sys');
            setTimeout(() => navigate(`/analysis/result/${aId}`), 1600);
          }
          if (s === 'FAILED') {
            setIsAnalyzing(false);
            setErr('분석 중 오류가 발생했습니다. 다시 시도해주세요.');
          }
        });
      },
      onStompError: (f) => { console.error('WS error:', f); addLog('WS', 'WebSocket 연결 오류', 'error'); },
    });
    client.activate();
    stompRef.current = client;
  }, [navigate, addLog, setWsStatus, setIsAnalyzing]);

  // ── 단계별 독립 분석 핸들러 ────────────────────────────────────────────────
  const [eLoading, setELoading] = useState(false);

  const handleEnvironmentAnalysis = useCallback(async () => {
    addLog('E-STEP', 'Environment 분석 시작...', 'sys');

    if (eFile && envMode === 'MANUAL') {
      // ── RAG + Numeric Verification (증빙 파일 있을 때) ───────────────────
      setELoading(true);
      addLog('E-STEP', `증빙 파일 "${eFile.name}" 감지 — RAG 수치 검증 분석 시작...`, 'info');
      addLog('E-STEP', 'OCR 처리 중 (Upstage Document Parse)...', 'info');

      const userId = localStorage.getItem('memberId');
      const eMetrics = Object.fromEntries(
        ENV_FIELDS
          .filter(f => Number(manualEnv[f.key]) > 0)
          .map(f => [f.key, Number(manualEnv[f.key])])
      );
      const fd = new FormData();
      fd.append('category', 'E');
      fd.append('checklistAnswers', new Blob([JSON.stringify({})], { type: 'text/plain' }));
      fd.append('checkedCount', '0');
      fd.append('totalItems', '0');
      fd.append('file', eFile);
      if (Object.keys(eMetrics).length > 0) {
        fd.append('eMetrics', new Blob([JSON.stringify(eMetrics)], { type: 'text/plain' }));
      }

      const progressMsgs = [
        '벡터 인덱싱 중 (ChromaDB)...',
        'K-ESG E 지표별 Evidence 검색 중...',
        '수치 검증 중 (입력값 vs 문서 추출값)...',
        'Rule-based Score + Numeric Penalty 적용 중...',
      ];
      let msgIdx = 0;
      const interval = setInterval(() => {
        addLog('E-STEP', progressMsgs[msgIdx % progressMsgs.length], 'info');
        msgIdx++;
      }, 4000);

      try {
        const res = await api.post('/api/v1/analysis/category', fd, {
          headers: { 'X-UserId': String(userId ?? ''), 'X-CompanyId': String(companyId ?? '') },
          timeout: 180000,
        });
        const result = res.data;
        setEResult(result);
        setECompleted(true);
        if (result.warning) {
          addLog('E-STEP', result.warning, 'error');
        }
        addLog('E-STEP',
          `환경(E) RAG+검증 완료 — ${result.score}점 / ${result.grade}등급 / 신뢰도 ${result.confidence}%` +
          (result.lowMismatchCount ? ` / LOW ${result.lowMismatchCount}건` : ''),
          result.lowMismatchCount ? 'error' : 'success');
        setTimeout(() => setWizardStep(2), 600);
      } catch (e) {
        const msg = e.response?.data?.message ?? e.message;
        addLog('E-STEP', `RAG 실패 (${msg}) — 로컬 계산으로 대체`, 'error');
        const fallback = computeLocalEScore(envMode, ksic, manualEnv);
        setEResult(fallback);
        setECompleted(true);
        setTimeout(() => setWizardStep(2), 600);
      } finally {
        clearInterval(interval);
        setELoading(false);
      }
    } else {
      // ── 로컬 계산 (파일 없거나 AUTO 모드) ──────────────────────────────
      const result = computeLocalEScore(envMode, ksic, manualEnv);
      setEResult(result);
      setECompleted(true);
      addLog('E-STEP', `환경(E) 완료 — ${result.score}점 / ${result.grade}등급 / 신뢰도 ${result.confidence}%`, 'success');
      setTimeout(() => setWizardStep(2), 600);
    }
  }, [addLog, envMode, ksic, manualEnv, eFile, companyId]);

  const handleSocialAnalysis = useCallback(async () => {
    addLog('S-STEP', 'Social 분석 시작...', 'sys');

    if (sFile) {
      // ── RAG 분석 (PDF 업로드됨) ─────────────────────────────────────────
      setSLoading(true);
      addLog('S-STEP', `증빙 PDF "${sFile.name}" 감지 — RAG 분석 시작...`, 'info');
      addLog('S-STEP', 'OCR 처리 중 (Upstage Document Parse)...', 'info');

      const userId = localStorage.getItem('memberId');
      const checkedCount = Object.values(socialAnswers).filter(Boolean).length;
      const fd = new FormData();
      fd.append('category', 'S');
      fd.append('checklistAnswers', new Blob([JSON.stringify(socialAnswers)], { type: 'text/plain' }));
      fd.append('checkedCount', String(checkedCount));
      fd.append('totalItems', String(SOCIAL_ITEMS.length));
      fd.append('file', sFile);

      // 진행 중 로그 순환
      const progressMsgs = [
        '벡터 인덱싱 중 (ChromaDB)...',
        'K-ESG S 지표별 Evidence 검색 중...',
        'Confidence 계산 중 (similarity + keyword + source)...',
        'Rule-based Score 산출 중...',
      ];
      let msgIdx = 0;
      const interval = setInterval(() => {
        addLog('S-STEP', progressMsgs[msgIdx % progressMsgs.length], 'info');
        msgIdx++;
      }, 4000);

      try {
        const res = await api.post('/api/v1/analysis/category', fd, {
          headers: { 'X-UserId': String(userId ?? ''), 'X-CompanyId': String(companyId ?? '') },
          timeout: 120000,
        });
        const result = res.data;
        setSResult(result);
        setSCompleted(true);
        addLog('S-STEP', `사회(S) RAG 완료 — ${result.score}점 / ${result.grade}등급 / Evidence ${result.evidenceCount}건 / 신뢰도 ${result.confidence}%`, 'success');
        setTimeout(() => setWizardStep(3), 600);
      } catch (e) {
        const msg = e.response?.data?.message ?? e.message;
        addLog('S-STEP', `RAG 실패 (${msg}) — 체크리스트 전용으로 대체`, 'error');
        const fallback = computeLocalSScore(socialAnswers);
        setSResult(fallback);
        setSCompleted(true);
        setTimeout(() => setWizardStep(3), 600);
      } finally {
        clearInterval(interval);
        setSLoading(false);
      }
    } else {
      // ── 체크리스트 전용 ─────────────────────────────────────────────────
      addLog('S-STEP', 'PDF 미업로드 — 체크리스트 기반 분석', 'info');
      const result = computeLocalSScore(socialAnswers);
      setSResult(result);
      setSCompleted(true);
      addLog('S-STEP', `사회(S) 완료 — ${result.score}점 / ${result.grade}등급 / Evidence ${result.evidenceCount}건`, 'success');
      setTimeout(() => setWizardStep(3), 600);
    }
  }, [addLog, socialAnswers, sFile, companyId]);

  const handleGovernanceAnalysis = useCallback(async () => {
    addLog('G-STEP', 'Governance 분석 시작...', 'sys');

    if (gFile) {
      // ── RAG 분석 (PDF 업로드됨) ─────────────────────────────────────────
      setGLoading(true);
      addLog('G-STEP', `증빙 PDF "${gFile.name}" 감지 — RAG 분석 시작...`, 'info');
      addLog('G-STEP', 'OCR 처리 중 (Upstage Document Parse)...', 'info');

      const userId = localStorage.getItem('memberId');
      const checkedCount = Object.values(governanceAnswers).filter(Boolean).length;
      const fd = new FormData();
      fd.append('category', 'G');
      fd.append('checklistAnswers', new Blob([JSON.stringify(governanceAnswers)], { type: 'text/plain' }));
      fd.append('checkedCount', String(checkedCount));
      fd.append('totalItems', String(GOV_ITEMS.length));
      fd.append('file', gFile);

      const progressMsgs = [
        '벡터 인덱싱 중 (ChromaDB)...',
        'K-ESG G 지표별 Evidence 검색 중...',
        'Confidence 계산 중 (similarity + keyword + source)...',
        'Rule-based Score 산출 중...',
      ];
      let msgIdx = 0;
      const interval = setInterval(() => {
        addLog('G-STEP', progressMsgs[msgIdx % progressMsgs.length], 'info');
        msgIdx++;
      }, 4000);

      try {
        const res = await api.post('/api/v1/analysis/category', fd, {
          headers: { 'X-UserId': String(userId ?? ''), 'X-CompanyId': String(companyId ?? '') },
          timeout: 120000,
        });
        const result = res.data;
        setGResult(result);
        setGCompleted(true);
        addLog('G-STEP', `지배구조(G) RAG 완료 — ${result.score}점 / ${result.grade}등급 / Evidence ${result.evidenceCount}건 / 신뢰도 ${result.confidence}%`, 'success');
        setTimeout(() => setWizardStep(4), 600);
      } catch (e) {
        const msg = e.response?.data?.message ?? e.message;
        addLog('G-STEP', `RAG 실패 (${msg}) — 체크리스트 전용으로 대체`, 'error');
        const fallback = computeLocalGScore(governanceAnswers);
        setGResult(fallback);
        setGCompleted(true);
        setTimeout(() => setWizardStep(4), 600);
      } finally {
        clearInterval(interval);
        setGLoading(false);
      }
    } else {
      // ── 체크리스트 전용 ─────────────────────────────────────────────────
      addLog('G-STEP', 'PDF 미업로드 — 체크리스트 기반 분석', 'info');
      const result = computeLocalGScore(governanceAnswers);
      setGResult(result);
      setGCompleted(true);
      addLog('G-STEP', `지배구조(G) 완료 — ${result.score}점 / ${result.grade}등급 / Evidence ${result.evidenceCount}건`, 'success');
      setTimeout(() => setWizardStep(4), 600);
    }
  }, [addLog, governanceAnswers, gFile, companyId]);

  const handleFinalReport = useCallback(async () => {
    if (!eResult || !sResult || !gResult) return;
    setErr(null); setStage(null);
    setIsAnalyzing(true);

    const ecoBonus   = ecoLinked ? 4 : 0;
    const adjSScore  = Math.min(100, sResult.score + ecoBonus);
    const totalScore = Math.round(eResult.score * 0.33 + adjSScore * 0.33 + gResult.score * 0.34);
    const finalGrade = totalScore >= 80 ? 'A' : totalScore >= 65 ? 'B' : totalScore >= 45 ? 'C' : 'D';
    const confidence = Math.round(
      ((eResult.confidence ?? 70) + (sResult.confidence ?? 70) + (gResult.confidence ?? 70)) / 3
    );

    addLog('FINAL', '최종 ESG 집계 시작 (OCR/RAG 없음)...', 'sys');
    addLog('FINAL', `E:${eResult.score} / S:${adjSScore}${ecoLinked ? '(+4)' : ''} / G:${gResult.score} → 종합 ${totalScore}점 / ${finalGrade}등급`, 'info');

    const userId = localStorage.getItem('memberId');
    // RAG Evidence 수집 (E/S/G에서 실제 Retrieval된 경우)
    const allEvidences = [
      ...(eResult?.evidences ?? []),
      ...(sResult?.evidences ?? []),
      ...(gResult?.evidences ?? []),
    ];

    const body = {
      environmentResult: { score: eResult.score, grade: eResult.grade, confidence: eResult.confidence, evidenceCount: eResult.evidenceCount, ragBased: eResult.ragBased ?? false },
      socialResult:      { score: adjSScore,       grade: sResult.grade, confidence: sResult.confidence, evidenceCount: sResult.evidenceCount, ragBased: sResult.ragBased ?? false },
      governanceResult:  { score: gResult.score, grade: gResult.grade, confidence: gResult.confidence, evidenceCount: gResult.evidenceCount, ragBased: gResult.ragBased ?? false },
      ecoPointApplied: ecoLinked,
      totalScore,
      finalGrade,
      confidence,
      evidences: allEvidences.length > 0 ? allEvidences : undefined,
    };

    try {
      const res = await api.post('/api/v1/analysis/final-report', body, {
        headers: {
          'Content-Type': 'application/json',
          'X-UserId':    String(userId ?? ''),
          'X-CompanyId': String(companyId ?? ''),
        },
      });
      const aId = res.data?.analysisId ?? res.data;
      setAnalysisId(aId);
      addLog('FINAL', `분석 ID: ${aId} — WebSocket 대기 중...`, 'success');
      connectWs(companyId, aId);
    } catch (e) {
      setIsAnalyzing(false);
      const status    = e.response?.status;
      const serverMsg = e.response?.data?.message ?? e.response?.data ?? e.message;
      console.error('[FINAL REPORT ERROR]', { status, url: e.config?.url, responseData: e.response?.data });
      setErr(`분석 실패 (${status ?? 'ERR'}): ${serverMsg}`);
      addLog('ERROR', `분석 실패 (${status ?? 'ERR'}): ${serverMsg}`, 'error');
    }
  }, [eResult, sResult, gResult, ecoLinked, companyId, connectWs, addLog, setIsAnalyzing]);

  const running    = !!stage && stage !== 'COMPLETED' && stage !== 'FAILED';
  const done       = stage === 'COMPLETED';
  const failed     = stage === 'FAILED';
  const busy       = running;
  const pct        = done ? 100 : getStagePct(stage);
  const isLastStep = wizardStep === WIZARD_STEPS.length - 1;
  const stepDef    = WIZARD_STEPS[wizardStep];
  const StepIcon   = stepDef.Icon;
  const allDone    = eCompleted && sCompleted && gCompleted;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-8 py-10">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">ESG AI 분석</h1>
          <p className="text-zinc-500 text-sm mt-1">
            E / S / G 단계별 입력 후 AI 정밀 분석으로 K-ESG 18개 지표를 평가합니다
          </p>
        </div>

        <WizardStepper currentStep={wizardStep} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── 왼쪽: 스텝 카드 + 네비게이션 */}
          <div className="flex flex-col gap-4">

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">

              {/* 카드 헤더 */}
              <div
                className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3"
                style={{ background: `${stepDef.color}07` }}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${stepDef.color}18` }}
                >
                  <StepIcon size={14} style={{ color: stepDef.color }} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stepDef.color }}>
                    Step {wizardStep + 1} / {WIZARD_STEPS.length}
                  </p>
                  <p className="text-sm font-semibold text-zinc-200 leading-tight mt-0.5">{stepDef.label}</p>
                </div>
              </div>

              {/* 카드 콘텐츠 */}
              <div className="p-6">

                {/* ── Step 0: 기업 정보 ─────────────────────────── */}
                {wizardStep === 0 && (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      회원가입 시 등록된 기업 정보입니다. 수정이 필요하면 마이페이지를 이용해주세요.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { Icon: Building2, label: '회사명',      value: companyName,   color: '#6366f1' },
                        { Icon: Briefcase, label: '업종 (KSIC)', value: autoKsic || '미등록', color: '#22c55e' },
                        { Icon: MapPin,    label: '지역',         value: regionLabel,   color: '#3b82f6' },
                        { Icon: Users,     label: '임직원 수',    value: employeeLabel !== '미등록' ? `${employeeLabel}명` : '미등록', color: '#f59e0b' },
                      ].map(card => (
                        <div
                          key={card.label}
                          className="rounded-xl border p-3.5"
                          style={{ background: `${card.color}08`, borderColor: `${card.color}20` }}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <card.Icon size={12} style={{ color: card.color }} />
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: card.color }}>
                              {card.label}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-200 truncate">{card.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-indigo-500/8 border border-indigo-500/20">
                      <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />
                      <p className="text-xs text-indigo-400">
                        기업 정보가 확인되었습니다. 아래 <span className="font-semibold">다음</span> 버튼으로 분석을 시작하세요.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Step 1: Environment(E) 분석 ───────────────── */}
                {wizardStep === 1 && (
                  <div>
                    {/* Segmented control */}
                    <div className={`flex bg-zinc-800 rounded-lg p-0.5 gap-0.5 mb-5 ${eCompleted ? 'opacity-50 pointer-events-none' : ''}`}>
                      {[{ value: 'AUTO', label: '자동 연동' }, { value: 'MANUAL', label: '직접 입력' }].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEnvMode(opt.value)}
                          className={`flex-1 py-2 rounded-md text-xs font-semibold transition-all duration-150 ${
                            envMode === opt.value ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {envMode === 'AUTO' ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-emerald-300">업종 자동 연동됨</p>
                            <p className="text-[10px] text-emerald-600 mt-0.5">
                              {ksic} · 공공 데이터 기반 업종 평균 벤치마크 연동
                            </p>
                          </div>
                        </div>
                        {KSIC_BENCHMARK[ksic] && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2">
                              업종 평균 벤치마크 — {ksic}
                            </p>
                            {KSIC_BENCHMARK[ksic].metrics.map(m => (
                              <div
                                key={m.key}
                                className="flex items-center justify-between px-3 py-2.5 rounded-lg
                                  bg-zinc-800/50 border border-zinc-700/40"
                              >
                                <span className="text-xs text-zinc-400">{m.name}</span>
                                <span className="text-xs font-mono tabular-nums">
                                  <span className="font-semibold text-emerald-400">{m.industryAvg.toLocaleString()}</span>
                                  <span className="text-zinc-600 font-normal ml-1">{m.unit}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {ENV_FIELDS.map(f => (
                          <div key={f.key}>
                            <label className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{f.label}</span>
                              <span className="text-[10px] font-mono text-zinc-600">{f.unit}</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={manualEnv[f.key]}
                              onChange={e => setManualEnv(p => ({ ...p, [f.key]: e.target.value }))}
                              disabled={eCompleted}
                              placeholder={f.placeholder}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-300
                                placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/60 transition-colors
                                disabled:opacity-50 disabled:cursor-not-allowed
                                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        ))}
                        <MiniUpload file={eFile} onFile={setEFile} label="환경 데이터 증빙 (CSV / PDF, 선택)" />
                      </div>
                    )}

                    {/* E 분석 시작 / 결과 */}
                    <div className="mt-5">
                      {!eCompleted ? (
                        <button
                          type="button"
                          onClick={handleEnvironmentAnalysis}
                          disabled={eLoading}
                          className="w-full py-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white
                            font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                            disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {eLoading
                            ? <><Loader2 size={14} className="animate-spin" /> 수치 검증 분석 중...</>
                            : <><Leaf size={14} /> 환경(E) 분석 시작</>}
                        </button>
                      ) : (
                        <>
                          <MiniScoreCard result={eResult} label="Environment" color="#22c55e" />
                          <button
                            type="button"
                            onClick={() => { setECompleted(false); setEResult(null); }}
                            className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 w-full text-center py-1"
                          >
                            다시 입력
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Step 2: Social(S) 분석 ─────────────────────── */}
                {wizardStep === 2 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
                      사회 분야 ESG 활동 여부를 체크해주세요.
                    </p>
                    <ChecklistStep
                      items={SOCIAL_ITEMS}
                      answers={socialAnswers}
                      setAnswers={setSocialAnswers}
                      accentColor="#3b82f6"
                      disabled={sCompleted}
                    />
                    <MiniUpload file={sFile} onFile={setSFile} label="Social 관련 증빙 서류 (PDF, 선택)" />
                    <div className="mt-5">
                      {!sCompleted ? (
                        <button
                          type="button"
                          onClick={handleSocialAnalysis}
                          disabled={sLoading}
                          className="w-full py-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white
                            font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                            disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {sLoading
                            ? <><Loader2 size={14} className="animate-spin" /> OCR + RAG 분석 중...</>
                            : <><Users size={14} /> {sFile ? 'Social(S) RAG 분석 시작' : 'Social(S) 분석 시작'}</>
                          }
                        </button>
                      ) : (
                        <>
                          <MiniScoreCard result={sResult} label="Social" color="#3b82f6" />
                          <button
                            type="button"
                            onClick={() => { setSCompleted(false); setSResult(null); }}
                            className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 w-full text-center py-1"
                          >
                            다시 입력
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Step 3: Governance(G) 분석 ─────────────────── */}
                {wizardStep === 3 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
                      지배구조 분야 ESG 정책 존재 여부를 체크해주세요.
                    </p>
                    <ChecklistStep
                      items={GOV_ITEMS}
                      answers={governanceAnswers}
                      setAnswers={setGovernanceAnswers}
                      accentColor="#f59e0b"
                      disabled={gCompleted}
                    />
                    <MiniUpload file={gFile} onFile={setGFile} label="Governance 관련 증빙 서류 (PDF, 선택)" />
                    <div className="mt-5">
                      {!gCompleted ? (
                        <button
                          type="button"
                          onClick={handleGovernanceAnalysis}
                          disabled={gLoading}
                          className="w-full py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white
                            font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                            disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {gLoading
                            ? <><Loader2 size={14} className="animate-spin" /> OCR + RAG 분석 중...</>
                            : <><Building2 size={14} /> {gFile ? 'Governance(G) RAG 분석 시작' : 'Governance(G) 분석 시작'}</>
                          }
                        </button>
                      ) : (
                        <>
                          <MiniScoreCard result={gResult} label="Governance" color="#f59e0b" />
                          <button
                            type="button"
                            onClick={() => { setGCompleted(false); setGResult(null); }}
                            className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 w-full text-center py-1"
                          >
                            다시 입력
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Step 4: EcoPoint ─────────────────────────────── */}
                {wizardStep === 4 && (
                  <div className="space-y-5">
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      과거 탄소 절감 활동을 ESG 점수에 반영합니다.
                      연동 시 <span className="text-emerald-400 font-semibold">Social(S) 점수 가산</span>이 예정됩니다.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: '에코 포인트', value: MOCK_ECO.ecoPoints.toLocaleString(),            unit: 'P',    color: '#22c55e' },
                        { label: '탄소 절감',   value: (MOCK_ECO.carbonReductionKg / 1000).toFixed(1), unit: 'tCO₂', color: '#3b82f6' },
                        { label: '나무 환산',   value: MOCK_ECO.equivalentTrees.toLocaleString(),      unit: '그루', color: '#f59e0b' },
                      ].map(card => (
                        <div
                          key={card.label}
                          className="rounded-xl border p-3 text-center"
                          style={{ background: `${card.color}08`, borderColor: `${card.color}25` }}
                        >
                          <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: card.color }}>
                            {card.label}
                          </p>
                          <p className="text-xl font-black leading-none" style={{ color: card.color }}>{card.value}</p>
                          <p className="text-[10px] text-zinc-600 mt-1">{card.unit}</p>
                        </div>
                      ))}
                    </div>
                    {!ecoLinked ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setEcoLinked(true)}
                          className="w-full py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8
                            text-emerald-400 text-sm font-semibold hover:bg-emerald-500/15 hover:border-emerald-500/50
                            transition-all duration-150 flex items-center justify-center gap-2"
                        >
                          <Zap size={14} /> EcoPoint 연동하기
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardStep(v => v + 1)}
                          className="w-full py-2 rounded-xl text-zinc-600 hover:text-zinc-400 text-xs font-medium
                            transition-colors duration-150"
                        >
                          연동 건너뛰기 →
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-300">EcoPoint 연동 완료</p>
                          <p className="text-[10px] text-emerald-600 mt-0.5">S 점수 +4 반영 예정</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 5: 최종 ESG 결과 생성 ───────────────────── */}
                {wizardStep === 5 && (
                  <div className="space-y-4">

                    {/* E/S/G/Eco 완료 현황 */}
                    <div className="space-y-1.5">
                      {[
                        { label: 'Environment (E)', done: eCompleted, score: eResult ? `${eResult.score}점 · ${eResult.grade}등급` : null },
                        { label: 'Social (S)',       done: sCompleted, score: sResult ? `${sResult.score}점 · ${sResult.grade}등급` : null },
                        { label: 'Governance (G)',   done: gCompleted, score: gResult ? `${gResult.score}점 · ${gResult.grade}등급` : null },
                        { label: 'EcoPoint',         done: ecoLinked,  score: ecoLinked ? 'S +4 반영됨' : '미연동' },
                      ].map(row => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg
                            bg-zinc-800/50 border border-zinc-700/40"
                        >
                          <div className="flex items-center gap-2">
                            {row.done
                              ? <CheckCircle2 size={13} className="text-emerald-400" />
                              : <AlertCircle  size={13} className="text-zinc-700" />
                            }
                            <span className="text-xs text-zinc-400">{row.label}</span>
                          </div>
                          <span className={`text-xs font-semibold font-mono ${row.done ? 'text-emerald-400' : 'text-zinc-700'}`}>
                            {row.done ? (row.score ?? '완료') : '미완료'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* E/S/G 미완료 경고 */}
                    {!allDone && (
                      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10
                        border border-amber-500/20 rounded-xl px-3 py-2.5">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        E / S / G 분석을 모두 완료한 후 최종 분석을 실행할 수 있습니다.
                      </div>
                    )}

                    {/* 에러 */}
                    {err && (
                      <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                        <AlertCircle size={15} className="shrink-0" /> {err}
                      </div>
                    )}

                    {/* 최종 분석 실행 버튼 */}
                    {!busy && !done && (
                      <button
                        onClick={handleFinalReport}
                        disabled={!allDone}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700
                          text-white font-semibold text-sm transition-colors duration-150
                          flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30
                          disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowRight size={17} />
                        {!allDone ? 'E / S / G 분석을 모두 완료해주세요' : '최종 ESG 분석 실행'}
                      </button>
                    )}

                    {/* 완료 후 리포트 이동 */}
                    {done && (
                      <button
                        onClick={() => navigate(`/analysis/result/${analysisId}`)}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500
                          text-white font-semibold text-sm transition-colors duration-150
                          flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
                      >
                        <CheckCircle2 size={17} /> 종합 리포트 확인하기
                      </button>
                    )}

                    {/* WS 분석 진행 스테퍼 (변경 없음) */}
                    {(busy || done || failed) && (
                      <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-4 mt-2">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">분석 진행률</span>
                          <span className="text-xs font-mono text-zinc-400 tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-4">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${failed ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div>
                          {STAGES.map((s, idx) => {
                            const curIdx   = getStageIdx(stage);
                            const sIdx     = getStageIdx(s.key);
                            const isPast   = curIdx > sIdx && curIdx !== -1 && !failed;
                            const isActive = s.key === stage && !done && !failed;
                            const isLast   = idx === STAGES.length - 1;
                            const dotCls   = isActive
                              ? 'bg-zinc-800 border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                              : isPast || done ? 'bg-emerald-500/15 border-emerald-500/50'
                              : 'bg-transparent border-zinc-700';
                            const lineColor = isPast || done ? 'bg-emerald-500/25' : 'bg-zinc-800';
                            const opacity   = isActive ? 'opacity-100' : isPast || done ? 'opacity-65' : 'opacity-20';
                            return (
                              <div key={s.key} className={`flex gap-3 transition-opacity duration-300 ${opacity}`}>
                                <div className="flex flex-col items-center w-5 shrink-0">
                                  <div className={`relative w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300 ${dotCls}`}>
                                    {isActive && <span className="absolute inset-[-3px] rounded-full border border-emerald-400/40 animate-ping" />}
                                    {failed && isActive
                                      ? <X size={10} className="text-red-400" />
                                      : isPast || done
                                      ? <CheckCircle2 size={10} className="text-emerald-400" />
                                      : isActive
                                      ? <Loader2 size={10} className="text-emerald-400 animate-spin" />
                                      : <span className="text-[8px] text-zinc-600 font-mono leading-none">{idx + 1}</span>
                                    }
                                  </div>
                                  {!isLast && <div className={`w-px my-0.5 flex-1 min-h-[18px] transition-colors duration-500 ${lineColor}`} />}
                                </div>
                                <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-1'}`}>
                                  <div className="flex items-center justify-between gap-2 mt-0.5">
                                    <span className={`text-xs leading-none ${isActive ? 'text-white font-semibold' : 'text-zinc-400'}`}>{s.label}</span>
                                    <span className={`text-[9px] font-mono shrink-0 tabular-nums ${isActive ? 'text-emerald-500' : 'text-zinc-700'}`}>{s.pct}%</span>
                                  </div>
                                  {isActive && <p className="text-[10px] text-zinc-600 mt-1 animate-fade-in line-clamp-1">{s.detail}</p>}
                                  {!isLast && <div className="h-3" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* ── Prev / Next 네비게이션 */}
            <div className="flex items-center justify-between">
              {wizardStep > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWizardStep(v => v - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                    text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent
                    hover:border-zinc-700 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArrowLeft size={14} /> 이전
                </button>
              ) : <div />}

              {!isLastStep ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWizardStep(v => v + 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                    bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white
                    border border-zinc-700 hover:border-zinc-600
                    transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  다음 <ArrowRight size={14} />
                </button>
              ) : <div />}
            </div>

          </div>

          {/* ── 오른쪽: 터미널 로그 (변경 없음) */}
          <div
            className="bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col overflow-hidden sticky top-4"
            style={{ minHeight: '520px', maxHeight: '82vh' }}
          >
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
              </div>
              <span className="text-xs text-zinc-500 font-mono ml-1">esg-analysis.log</span>
              <div className="ml-auto flex items-center gap-2">
                {running && <Loader2 size={12} className="text-emerald-400 animate-spin" />}
                {done    && <CheckCircle2 size={12} className="text-emerald-400" />}
                {failed  && <AlertCircle  size={12} className="text-red-400" />}
                <Terminal size={12} className="text-zinc-700" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1" style={{ lineHeight: '1.7' }}>
              {logs.length === 0 ? (
                <p className="text-zinc-700 select-none">
                  {allDone
                    ? '▶  Step 6에서 [최종 ESG 분석 실행] 버튼을 눌러주세요'
                    : '▶  E / S / G 각 단계에서 분석을 완료하면 최종 분석을 실행할 수 있습니다'}
                </p>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 animate-fade-in">
                    <span className="text-zinc-700 shrink-0 select-none tabular-nums">{l.t}</span>
                    <span className={`shrink-0 ${LOG_COLOR[l.type] ?? LOG_COLOR.info}`}>[{l.tag}]</span>
                    <span className="text-zinc-300 break-all">{l.msg}</span>
                  </div>
                ))
              )}
              <div ref={logBottomRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
