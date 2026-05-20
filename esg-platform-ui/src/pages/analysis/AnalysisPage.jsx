import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAnalysis } from '../../context/AnalysisContext';
import { useAuth } from '../../context/AuthContext';
import {
  Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  Loader2, ArrowRight, ArrowLeft, X,
  Users, Building2, Leaf, Zap, MapPin, Briefcase,
  ChevronDown, ChevronUp, TrendingUp,
} from 'lucide-react';


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

// ── 업종별 Dynamic Weighting (EsgScoreConstants 미러) ────────────────────
const INDUSTRY_TYPE_MAP = {
  '06':'ENERGY','07':'ENERGY','08':'ENERGY',
  '10':'MFG','11':'MFG','12':'MFG','13':'MFG','14':'MFG',
  '15':'MFG','16':'MFG','17':'MFG','18':'MFG',
  '21':'MFG','22':'MFG','25':'MFG','26':'MFG','27':'MFG',
  '28':'MFG','29':'MFG','30':'MFG','31':'MFG','32':'MFG','33':'MFG',
  '19':'ENERGY','20':'ENERGY','23':'ENERGY','24':'ENERGY','35':'ENERGY','36':'ENERGY',
  '58':'IT','59':'IT','60':'IT','61':'IT','62':'IT','63':'IT',
  '70':'IT','71':'IT','72':'IT','73':'IT',
  '45':'FIN','46':'FIN','47':'FIN','49':'FIN','50':'FIN',
  '51':'FIN','52':'FIN','53':'FIN','55':'FIN','56':'FIN',
  '64':'FIN','65':'FIN','66':'FIN',
};
const INDUSTRY_WEIGHTS_MAP = {
  MFG:    { E:0.50, S:0.25, G:0.25, label:'제조·중공업' },
  ENERGY: { E:0.55, S:0.25, G:0.20, label:'에너지·화학' },
  FIN:    { E:0.25, S:0.40, G:0.35, label:'금융·서비스' },
  IT:     { E:0.30, S:0.40, G:0.30, label:'IT·플랫폼' },
  DEFAULT:{ E:0.40, S:0.30, G:0.30, label:'기본 (K-ESG)' },
};
function getIndustryWeights(ksicCode) {
  const prefix = (ksicCode ?? '').substring(0, 2);
  return INDUSTRY_WEIGHTS_MAP[INDUSTRY_TYPE_MAP[prefix] ?? 'DEFAULT'];
}

function computeLocalSScore(socialAnswers) {
  const checked = Object.values(socialAnswers).filter(Boolean).length;
  const score   = Math.round((checked / SOCIAL_ITEMS.length) * 100);
  return { score, grade: score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D', confidence: 78, evidenceCount: checked };
}
function computeLocalGScore(governanceAnswers) {
  const checked = Object.values(governanceAnswers).filter(Boolean).length;
  const score   = Math.round((checked / GOV_ITEMS.length) * 100);
  return { score, grade: score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D', confidence: 82, evidenceCount: checked };
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
                isDone   ? 'border-emerald-500 bg-emerald-50'
                : isActive ? 'border-emerald-500 bg-white shadow-md'
                : 'border-gray-200 bg-white'
              }`}>
                {isDone
                  ? <CheckCircle2 size={15} className="text-emerald-500" />
                  : <StepIcon size={14} className={isActive ? 'text-emerald-600' : 'text-gray-300'} />
                }
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors duration-200 ${
                isActive ? 'text-emerald-600' : isDone ? 'text-gray-400' : 'text-gray-300'
              }`}>{step.shortLabel}</span>
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mb-5 transition-colors duration-500 ${
                idx < currentStep ? 'bg-emerald-300' : 'bg-gray-200'
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
              idx < items.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <span className={`text-sm select-none transition-colors duration-150 ${checked ? 'text-gray-900' : 'text-gray-500'}`}>
              {item.label}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAnswers(p => ({ ...p, [item.key]: !p[item.key] }))}
              className="relative ml-4 w-11 h-6 rounded-full shrink-0 transition-all duration-200 focus:outline-none"
              style={{ background: checked ? accentColor : '#d1d5db' }}
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

// ── Evidence Verification 컴포넌트 ───────────────────────────────────────
const SIM_TIER_STYLE = {
  HIGH:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', border: 'border-emerald-200', bg: 'bg-emerald-50/40' },
  MEDIUM: { badge: 'bg-blue-50 text-blue-700 border-blue-200',         border: 'border-blue-200',    bg: 'bg-blue-50/40' },
  LOW:    { badge: 'bg-orange-50 text-orange-700 border-orange-200',    border: 'border-orange-200',  bg: 'bg-orange-50/40' },
};

const MISMATCH_BADGE = {
  'CHECKLIST_NO_EVIDENCE':    { label: 'NO EVIDENCE',   cls: 'bg-red-50 text-red-600 border-red-200' },
  'EVIDENCE_CONTRADICTION':   { label: 'CONTRADICTION', cls: 'bg-red-50 text-red-600 border-red-200' },
  'NEGATIVE_SIGNAL_DETECTED': { label: 'NEG. SIGNAL',   cls: 'bg-red-50 text-red-600 border-red-200' },
  'NUMERIC_LOW':              { label: 'MISMATCH',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function IndicatorVerificationCard({ bd }) {
  const tier     = SIM_TIER_STYLE[bd.similarityTier];
  const mismatch = bd.mismatchType ? MISMATCH_BADGE[bd.mismatchType] : null;
  const scoreColor = bd.rawScore >= 80 ? '#16a34a'
                   : bd.rawScore >= 60 ? '#2563eb'
                   : bd.rawScore >= 40 ? '#d97706'
                   : '#dc2626';

  const borderCls = bd.mismatchDetected ? 'border-red-200'
                  : tier?.border ?? 'border-gray-200';
  const bgCls = tier?.bg || 'bg-gray-50';

  const rawSnippet = bd.evidenceSnippet ?? '';
  const snippet = rawSnippet.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const truncated = rawSnippet.length > 120;

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bgCls} ${borderCls}`}>
      {/* 지표 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-mono text-gray-400 shrink-0">{bd.indicatorCode}</span>
          <span className="text-[10px] font-semibold text-gray-700 truncate">{bd.indicatorTitle}</span>
        </div>
        <span className="text-sm font-black shrink-0 font-mono" style={{ color: scoreColor }}>{bd.rawScore}</span>
      </div>

      {/* 품질 배지 행 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {tier && (
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${tier.badge}`}>
            {bd.similarityTier}
          </span>
        )}
        {bd.avgSimilarity != null && (
          <span className="text-[9px] font-mono text-gray-500">
            {Math.round(bd.avgSimilarity * 100)}%
          </span>
        )}
        {bd.evidenceCount > 0 && (
          <span className="text-[9px] text-gray-400">ev {bd.evidenceCount}건</span>
        )}
        {bd.uniquePageCount > 0 && (
          <span className="text-[9px] text-gray-400">· {bd.uniquePageCount}p</span>
        )}
        {bd.similarityTier === 'LOW' && (
          <span className="text-[8px] italic text-orange-500">Weak evidence</span>
        )}
        {!bd.hasEvidence && !bd.mismatchType && (
          <span className="text-[8px] text-gray-400 italic">근거 없음</span>
        )}
        {mismatch && (
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${mismatch.cls}`}>
            ⚠ {mismatch.label}
          </span>
        )}
      </div>

      {/* evidence snippet preview */}
      {snippet && (
        <p className="mt-1.5 text-[10px] text-gray-500 italic leading-relaxed bg-white rounded px-2 py-1.5 border border-gray-100">
          &ldquo;{snippet}{truncated ? '…' : ''}&rdquo;
        </p>
      )}
    </div>
  );
}

function IndicatorEvidenceSection({ breakdowns }) {
  const [open, setOpen] = useState(false);
  if (!breakdowns?.length) return null;

  const evidenced   = breakdowns.filter(bd => bd.hasEvidence);
  const noEvidence  = breakdowns.filter(bd => !bd.hasEvidence);
  const withWarning = breakdowns.filter(bd => bd.mismatchDetected);

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors">
            Evidence Verification
          </span>
          <span className="text-[9px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
            {evidenced.length}/{breakdowns.length} 검증
          </span>
          {withWarning.length > 0 && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200">
              ⚠ {withWarning.length}건
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={11} className="text-gray-400 shrink-0" />
          : <ChevronDown size={11} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="mt-2.5 space-y-2">
          {evidenced.map(bd => (
            <IndicatorVerificationCard key={bd.indicatorCode} bd={bd} />
          ))}
          {noEvidence.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[9px] text-gray-400">
                근거 없음 ({noEvidence.length}건): {noEvidence.map(bd => bd.indicatorCode).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── IntegratedEsgSummary ──────────────────────────────────────────────────
function IntegratedEsgSummary({ finalSummary, eResult, sResult, gResult }) {
  const { totalScore, finalGrade, confidence, adjSScore, ecoBonus } = finalSummary;
  const GRADE_COLOR = { S: '#10b981', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
  const gc = GRADE_COLOR[finalGrade] ?? '#6366f1';

  const iw = getIndustryWeights(localStorage.getItem('esg_ksicCode') ?? '');
  const categories = [
    { label: 'Environment', code: 'E', result: eResult,                         weight: Math.round(iw.E * 100), color: '#22c55e' },
    { label: 'Social',      code: 'S', result: { ...sResult, score: adjSScore }, weight: Math.round(iw.S * 100), color: '#3b82f6' },
    { label: 'Governance',  code: 'G', result: gResult,                          weight: Math.round(iw.G * 100), color: '#a855f7' },
  ];

  const totalEvidence = (eResult?.evidenceCount ?? 0) + (sResult?.evidenceCount ?? 0) + (gResult?.evidenceCount ?? 0);
  const contradictions = [eResult, sResult, gResult].reduce((acc, r) => {
    if (!r?.indicatorBreakdowns) return acc;
    return acc + r.indicatorBreakdowns.filter(bd =>
      bd.mismatchType === 'EVIDENCE_CONTRADICTION' || bd.mismatchType === 'NEGATIVE_SIGNAL_DETECTED'
    ).length;
  }, 0);
  const noEvidence = [eResult, sResult, gResult].reduce((acc, r) => {
    if (!r?.indicatorBreakdowns) return acc;
    return acc + r.indicatorBreakdowns.filter(bd => bd.mismatchType === 'CHECKLIST_NO_EVIDENCE').length;
  }, 0);

  const scores = categories.map(c => c.result?.score ?? 0);
  const maxIdx = scores.indexOf(Math.max(...scores));
  const minIdx = scores.indexOf(Math.min(...scores));
  const strongest = categories[maxIdx];
  const weakest   = categories[minIdx];

  const aiComment = (() => {
    const gradeDesc = { S: '최고 수준', A: '우수', B: '양호', C: '보통', D: '미흡' }[finalGrade] ?? '';
    const conNote = contradictions > 0 ? ` 다만 ${contradictions}건의 증거 불일치가 감지되어 일부 항목에 대한 추가 검토가 권장됩니다.` : '';
    const noEvNote = noEvidence > 0 ? ` ${noEvidence}개 지표는 RAG 검증 근거가 부족하여 신뢰도가 제한됩니다.` : '';
    return `종합 ESG 등급 ${finalGrade}(${gradeDesc}) — 해당 기업은 ${strongest.label} 영역에서 강점을 보이며, ${weakest.label} 영역의 개선이 필요합니다.${conNote}${noEvNote} AI 검증 신뢰도: ${confidence}%.`;
  })();

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3"
        style={{ background: `${gc}07` }}>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${gc}12` }}>
          <TrendingUp size={14} style={{ color: gc }} />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: gc }}>종합 결과</p>
          <p className="text-sm font-semibold text-gray-800">Final ESG Score</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 메인 점수 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Total Score</p>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black tabular-nums leading-none" style={{ color: gc }}>{totalScore}</span>
              <span className="text-2xl font-black pb-1" style={{ color: gc }}>{finalGrade}</span>
            </div>
          </div>
          {/* Confidence */}
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">AI Confidence</p>
            <div className="flex items-center gap-2 justify-end">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${confidence}%`, background: confidence >= 70 ? '#22c55e' : confidence >= 50 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <span className="text-sm font-bold text-gray-700 tabular-nums">{confidence}%</span>
            </div>
          </div>
        </div>

        {/* 카테고리 breakdown */}
        <div className="space-y-2">
          {categories.map(cat => {
            const sc  = cat.result?.score ?? 0;
            const gr  = cat.result?.grade ?? '-';
            const cg  = GRADE_COLOR[gr] ?? cat.color;
            const conf= cat.result?.confidence ?? 0;
            return (
              <div key={cat.code}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                style={{ background: `${cat.color}06`, borderColor: `${cat.color}25` }}>
                <span className="text-[10px] font-black w-5 text-center shrink-0" style={{ color: cat.color }}>{cat.code}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{cat.label} <span className="text-gray-400">×{cat.weight}%</span></span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 tabular-nums">{conf}%</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: cg }}>{sc}점</span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: cg, background: `${cg}15` }}>{gr}</span>
                    </div>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${sc}%`, background: cat.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 통계 그리드 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total Evidence', value: totalEvidence, color: '#16a34a' },
            { label: 'Contradictions', value: contradictions, color: contradictions > 0 ? '#dc2626' : '#9ca3af' },
            { label: 'No Evidence',    value: noEvidence,    color: noEvidence > 0 ? '#d97706' : '#9ca3af' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl bg-gray-50 border border-gray-100 p-2.5 text-center">
              <p className="text-xs font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Strongest / Weakest */}
        <div className="grid grid-cols-2 gap-2">
          <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Strongest</p>
            <p className="text-xs font-semibold text-emerald-700">{strongest.label}</p>
            <p className="text-[10px] text-emerald-500 tabular-nums">{strongest.result?.score}점 · {strongest.result?.grade}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">Needs Work</p>
            <p className="text-xs font-semibold text-amber-700">{weakest.label}</p>
            <p className="text-[10px] text-amber-500 tabular-nums">{weakest.result?.score}점 · {weakest.result?.grade}</p>
          </div>
        </div>

        {/* AI 종합 의견 */}
        <div className="px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">AI Analysis</p>
          <p className="text-xs text-gray-500 leading-relaxed">{aiComment}</p>
        </div>

        {ecoBonus > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
            <Zap size={12} className="text-emerald-500 shrink-0" />
            <p className="text-[10px] text-emerald-600">EcoPoint 연동 — Social(S) +{ecoBonus}점 반영됨</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MiniScoreCard ─────────────────────────────────────────────────────────
function MiniScoreCard({ result, label, color }) {
  const [showEvidence, setShowEvidence] = useState(false);

  const gc           = { S: '#10b981', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' }[result.grade] ?? color;
  const hasWarning   = !!result.warning || result.lowMismatchCount > 0;
  const isSimulation = result.isSimulation === true;

  // confidence 색상: 90+ 강조, 70~89 정상, 50~69 주의, ~49 경고
  const confColor = result.confidence >= 90 ? '#22c55e'
                  : result.confidence >= 70 ? '#3b82f6'
                  : result.confidence >= 50 ? '#f59e0b'
                  : '#ef4444';

  const realEvidences = result.evidences?.filter(ev => ev.similarity != null) ?? [];
  const hasBreakdown  = result.indicatorBreakdowns?.length > 0;

  return (
    <div className="rounded-xl border p-4 mt-4 bg-white" style={{ borderColor: `${color}30` }}>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} style={{ color }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
            {isSimulation ? `${label} 사전 진단 완료` : `${label} 분석 완료`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.gradeCeilingApplied && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
              등급제한
            </span>
          )}
          {result.lowMismatchCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
              LOW {result.lowMismatchCount}건
            </span>
          )}
          {isSimulation ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
              SIMULATION
            </span>
          ) : result.ragBased && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
              RAG
            </span>
          )}
        </div>
      </div>

      {/* 수치 불일치 경고 */}
      {hasWarning && (
        <div className="flex items-start gap-1.5 mb-3 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
          <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-600 leading-relaxed">
            {result.warning ?? '[경고] 입력 수치와 증빙자료 간 수치 불일치가 감지되었습니다.'}
            {result.gradeCeilingApplied && (
              <span className="ml-1 font-semibold text-amber-600">등급 제한 적용됨.</span>
            )}
          </p>
        </div>
      )}

      {/* 핵심 지표 그리드 */}
      <div className={`grid gap-2 ${isSimulation ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {[
          { label: '점수',     value: `${result.score}점`,           color: gc        },
          { label: '등급',     value: result.grade,                  color: gc        },
          ...(!isSimulation ? [
            { label: '신뢰도',   value: `${result.confidence}%`,      color: confColor },
            { label: 'Evidence', value: `${result.evidenceCount}건`,  color: '#6366f1' },
          ] : []),
        ].map(c => (
          <div key={c.label} className="text-center">
            <p className="text-[9px] text-gray-400 mb-1">{c.label}</p>
            <p className="text-lg font-black leading-none" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Evidence Snippets ──────────────────────────────────────────────── */}
      {realEvidences.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setShowEvidence(v => !v)}
            className="flex items-center justify-between w-full text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span>Evidence Snippets ({realEvidences.length}건)</span>
            {showEvidence ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showEvidence && (
            <div className="mt-2 space-y-2">
              {realEvidences.slice(0, 3).map((ev, i) => (
                <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-mono font-bold text-gray-400">{ev.indicatorCode}</span>
                    {ev.indicatorTitle && (
                      <span className="text-[9px] text-gray-400 truncate max-w-[100px]">{ev.indicatorTitle}</span>
                    )}
                    {ev.pageNumber > 0 && (
                      <span className="ml-auto text-[9px] font-mono text-blue-500 shrink-0">p.{ev.pageNumber}</span>
                    )}
                    {ev.similarity != null && (
                      <span className="text-[9px] font-mono text-emerald-600 shrink-0">
                        sim {(ev.similarity * 100).toFixed(0)}%
                      </span>
                    )}
                    {ev.confidenceLevel && (
                      <span className={`text-[8px] font-bold px-1 rounded shrink-0 ${
                        ev.confidenceLevel === 'HIGH'   ? 'bg-emerald-50 text-emerald-600' :
                        ev.confidenceLevel === 'MEDIUM' ? 'bg-amber-50 text-amber-600' :
                                                          'bg-red-50 text-red-500'
                      }`}>{ev.confidenceLevel}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 italic leading-relaxed line-clamp-2">
                    &ldquo;{ev.evidenceText?.substring(0, 120)}{ev.evidenceText?.length > 120 ? '…' : ''}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Evidence Verification ──────────────────────────────────────────── */}
      {hasBreakdown && <IndicatorEvidenceSection breakdowns={result.indicatorBreakdowns} />}

    </div>
  );
}

// ── MiniUpload ─────────────────────────────────────────────────────────────
function MiniUpload({ file, onFile, label, allowCsv = false }) {
  const uid = useId();
  const [csvError, setCsvError] = useState(null);

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!allowCsv && f.name.toLowerCase().endsWith('.csv')) {
      setCsvError('S/G 분석은 PDF 증빙 파일만 업로드 가능합니다.');
      e.target.value = '';
      return;
    }
    setCsvError(null);
    onFile(f);
    e.target.value = '';
  };

  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
          <FileText size={13} className="text-blue-500 shrink-0" />
          <span className="text-xs text-gray-700 flex-1 truncate">{file.name}</span>
          <button type="button" onClick={() => { onFile(null); setCsvError(null); }} className="text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={uid}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-dashed
            border-gray-200 hover:border-gray-400 hover:bg-gray-100 cursor-pointer transition-colors duration-150"
        >
          <Upload size={13} className="text-gray-400" />
          <span className="text-xs text-gray-400">{allowCsv ? 'PDF 또는 CSV 선택' : 'PDF 파일 선택'}</span>
          <input
            id={uid}
            type="file"
            accept={allowCsv ? '.pdf,.csv' : '.pdf'}
            className="hidden"
            onChange={handleChange}
          />
        </label>
      )}
      {csvError && (
        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle size={11} className="text-red-500 shrink-0" />
          <p className="text-[10px] text-red-600">{csvError}</p>
        </div>
      )}
    </div>
  );
}

// ── AnalysisPage ──────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const navigate = useNavigate();
  const { companyId } = useAnalysis();
  const { user } = useAuth();

  // ── 기업 정보 state — auth-service에서 최신값 조회, localStorage 캐시 우선
  const [companyProfile, setCompanyProfile] = useState({
    name:          localStorage.getItem('esg_companyName')   || '',
    regionName:    localStorage.getItem('esg_regionName')    || localStorage.getItem('esg_regionCode') || '',
    employeeCount: localStorage.getItem('esg_employeeCount') || '',
    ksicCode:      localStorage.getItem('esg_ksicCode')      || '',
    industryName:  localStorage.getItem('esg_industryName')  || '',
  });

  // 페이지 마운트 시 auth-service에서 최신 기업 프로파일 조회
  useEffect(() => {
    const cid = localStorage.getItem('companyId');
    if (!cid) return;
    api.get(`/auth/companies/${cid}`)
      .then(res => {
        const co = res.data;
        if (!co) return;
        const profile = {
          name:          co.name          || '',
          regionName:    co.regionName    || co.regionCode || '',
          employeeCount: co.employeeCount != null ? String(co.employeeCount) : '',
          ksicCode:      co.ksicCode      || '',
          industryName:  co.industryName  || '',
        };
        setCompanyProfile(profile);
        if (profile.name)          localStorage.setItem('esg_companyName',   profile.name);
        if (profile.regionName)    localStorage.setItem('esg_regionName',    profile.regionName);
        if (profile.employeeCount) localStorage.setItem('esg_employeeCount', profile.employeeCount);
        if (profile.ksicCode)      localStorage.setItem('esg_ksicCode',      profile.ksicCode);
        if (profile.industryName)  localStorage.setItem('esg_industryName',  profile.industryName);
        console.log('[CompanyProfile] auth-service 동기화 완료:', profile);
      })
      .catch(e => console.warn('[CompanyProfile] 조회 실패 (localStorage fallback 사용):', e.message));
  }, []);

  // KSIC 5자리 코드 → KSIC_BENCHMARK 키 매핑 (로컬 점수 계산용)
  const KSIC_PREFIX_BENCH = { '62': 'IT서비스업', '63': 'IT서비스업', '10': '식품업', '45': '물류업', '46': '물류업', '47': '물류업' };
  const ksicPrefix = companyProfile.ksicCode?.substring(0, 2) || '';
  const autoKsic   = KSIC_PREFIX_BENCH[ksicPrefix] || '제조업';

  const companyName   = companyProfile.name          || user?.nickname || '미등록';
  const regionLabel   = companyProfile.regionName    || '미등록';
  const employeeLabel = companyProfile.employeeCount || '미등록';
  const industryLabel = companyProfile.industryName  || autoKsic;

  // ── 분석 state
  const [err, setErr]           = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ── 입력 state
  const ksic = autoKsic; // KSIC_BENCHMARK 조회용 — companyProfile 변경 시 자동 갱신
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

  // ── E 파일 업로드 상태 추적 (진단용) ──────────────────────────────────────
  useEffect(() => {
    console.log('[E-DEBUG] eFile state changed →',
      eFile ? `"${eFile.name}" (${eFile.size} bytes, ${eFile.type})` : 'null (no file)');
  }, [eFile]);

  const addLog = useCallback((tag, msg, type = 'info') => {
    console.log(`[${tag}] (${type}) ${msg}`);
  }, []);

  // ── 단계별 독립 분석 핸들러 ────────────────────────────────────────────────
  const [eLoading, setELoading] = useState(false);
  const [eValidationError, setEValidationError] = useState(null);

  const handleEnvironmentAnalysis = useCallback(async () => {
    // ── 사전 validation ────────────────────────────────────────────────────
    const hasFile    = !!eFile;
    const hasMetrics = ENV_FIELDS.some(f => Number(manualEnv[f.key]) > 0);
    if (!hasFile && !hasMetrics) {
      setEValidationError('환경 데이터를 최소 1개 이상 입력해주세요. (CSV/PDF 업로드 또는 수치 직접 입력)');
      addLog('E-STEP', '[VALIDATION] 데이터 없음 — API 호출 중단', 'error');
      return;
    }
    setEValidationError(null);

    addLog('E-STEP', 'Environment 분석 시작...', 'sys');

    console.log('[E-DEBUG] handleEnvironmentAnalysis() triggered', {
      eFile: eFile ? `"${eFile.name}" (${eFile.size} bytes)` : null,
      willCallAPI: true,
    });

    setELoading(true);

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
    fd.append('envMode', new Blob(['MANUAL'], { type: 'text/plain' }));
    if (eFile) {
      fd.append('file', eFile);
      addLog('E-STEP', `증빙 파일 "${eFile.name}" 감지 — RAG 수치 검증 분석 시작...`, 'info');
      addLog('E-STEP', 'OCR 처리 중 (Upstage Document Parse)...', 'info');
    } else {
      addLog('E-STEP', '수치 입력 기반 분석 시작...', 'info');
    }
    if (Object.keys(eMetrics).length > 0) {
      fd.append('eMetrics', new Blob([JSON.stringify(eMetrics)], { type: 'text/plain' }));
    }
    if (ksic) {
      fd.append('ksicCode', new Blob([ksic], { type: 'text/plain' }));
    }

    console.log('[E-DEBUG] FormData prepared. Keys:', [...fd.keys()],
      '| eMetrics:', eMetrics, '| ksic:', ksic, '| Calling POST /api/v1/analysis/category');

    const progressMsgs = eFile
      ? ['벡터 인덱싱 중 (ChromaDB)...', 'K-ESG E 지표별 Evidence 검색 중...', '수치 검증 중 (입력값 vs 문서 추출값)...', 'Rule-based Score + Numeric Penalty 적용 중...']
      : ['K-ESG E 지표별 수치 분석 중...', 'Rule-based Score 산출 중...'];
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
        `환경(E) 분석 완료 — ${result.score}점 / ${result.grade}등급 / 신뢰도 ${result.confidence}%` +
        (result.lowMismatchCount ? ` / LOW ${result.lowMismatchCount}건` : ''),
        result.lowMismatchCount ? 'error' : 'success');
      setTimeout(() => setWizardStep(2), 600);
    } catch (e) {
      const status = e.response?.status;
      const msg    = e.response?.data?.message ?? e.message;
      if (status === 400) {
        setEValidationError(msg);
        addLog('E-STEP', `[VALIDATION] 서버 거부 (400): ${msg}`, 'error');
      } else {
        setEValidationError(msg ?? 'E 분석 중 오류가 발생했습니다. 다시 시도해주세요.');
        addLog('E-STEP', `API 실패 (${msg})`, 'error');
      }
    } finally {
      clearInterval(interval);
      setELoading(false);
    }
  }, [addLog, industryLabel, manualEnv, eFile, companyId]);

  const handleSocialAnalysis = useCallback(async () => {
    if (!sFile) return;
    addLog('S-STEP', 'Social 분석 시작...', 'sys');

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
      addLog('S-STEP', `RAG 분석 실패 (${msg}). 증빙 문서를 확인하고 다시 시도해주세요.`, 'error');
    } finally {
      clearInterval(interval);
      setSLoading(false);
    }
  }, [addLog, socialAnswers, sFile, companyId]);

  const handleGovernanceAnalysis = useCallback(async () => {
    if (!gFile) return;
    addLog('G-STEP', 'Governance 분석 시작...', 'sys');

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
      addLog('G-STEP', `RAG 분석 실패 (${msg}). 증빙 문서를 확인하고 다시 시도해주세요.`, 'error');
    } finally {
      clearInterval(interval);
      setGLoading(false);
    }
  }, [addLog, governanceAnswers, gFile, companyId]);

  const handleFinalReport = useCallback(async () => {
    if (!eResult || !sResult || !gResult) return;
    setErr(null);
    setSubmitting(true);

    const ecoBonus   = ecoLinked ? 4 : 0;
    const adjSScore  = Math.min(100, sResult.score + ecoBonus);
    const iw         = getIndustryWeights(companyProfile.ksicCode);
    const totalScore = Math.round(eResult.score * iw.E + adjSScore * iw.S + gResult.score * iw.G);
    const finalGrade = totalScore >= 90 ? 'S' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D';
    const confidence = Math.round(
      ((eResult.confidence ?? 70) + (sResult.confidence ?? 70) + (gResult.confidence ?? 70)) / 3
    );

    const userId = localStorage.getItem('memberId');
    const allEvidences = [
      ...(eResult?.evidences ?? []),
      ...(sResult?.evidences ?? []),
      ...(gResult?.evidences ?? []),
    ];

    const body = {
      environmentResult: {
        score: eResult.score, grade: eResult.grade,
        confidence: eResult.confidence,
        evidenceCount: eResult.evidenceCount,
        ragBased: eResult.ragBased ?? false,
      },
      socialResult:      { score: adjSScore,     grade: sResult.grade, confidence: sResult.confidence, evidenceCount: sResult.evidenceCount, ragBased: sResult.ragBased ?? false },
      governanceResult:  { score: gResult.score, grade: gResult.grade, confidence: gResult.confidence, evidenceCount: gResult.evidenceCount, ragBased: gResult.ragBased ?? false },
      ecoPointApplied: ecoLinked,
      totalScore,
      finalGrade,
      confidence,
      isAutoSimulation: false,
      evidences: allEvidences.length > 0 ? allEvidences : undefined,
      ksicCode: companyProfile.ksicCode || undefined,
    };

    try {
      // Step 1: 세션만 생성 (분석 실행 안 함)
      // Step 2: PipelinePage mount → WS ready → startAnalysis(sessionId) 순서로 실행됨
      const res = await api.post('/api/v1/analysis/session', body, {
        headers: {
          'Content-Type': 'application/json',
          'X-UserId':    String(userId ?? ''),
          'X-CompanyId': String(companyId ?? ''),
        },
      });
      const sessionId = res.data?.sessionId ?? res.data;
      console.debug('[PIPELINE] session created sessionId=%s companyId=%s', sessionId, companyId);
      navigate(`/analysis/pipeline/${sessionId}`, { state: { companyId } });
    } catch (e) {
      setSubmitting(false);
      const status    = e.response?.status;
      const serverMsg = e.response?.data?.message ?? e.response?.data ?? e.message;
      console.error('[SESSION CREATE ERROR]', { status, url: e.config?.url, responseData: e.response?.data });
      setErr(`세션 생성 실패 (${status ?? 'ERR'}): ${serverMsg}`);
    }
  }, [eResult, sResult, gResult, ecoLinked, companyId, companyProfile.ksicCode, navigate]);

  const busy       = eLoading || sLoading || gLoading || submitting;
  const isLastStep = wizardStep === WIZARD_STEPS.length - 1;
  const stepDef    = WIZARD_STEPS[wizardStep];
  const StepIcon   = stepDef.Icon;
  const allDone    = eCompleted && sCompleted && gCompleted;


  return (
    <div className="min-h-screen bg-[#f5f7fb] text-gray-900">
      <div className="max-w-6xl mx-auto px-8 py-10">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">ESG AI 분석</h1>
          <p className="text-gray-500 text-sm mt-1">
            환경(E) · 사회(S) · 지배구조(G) 핵심 ESG 지표를 기반으로 AI 분석을 수행합니다
          </p>
        </div>

        <WizardStepper currentStep={wizardStep} />

        <div className="max-w-xl">
          <div className="flex flex-col gap-4">

            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">

              {/* 카드 헤더 */}
              <div
                className="px-6 py-4 border-b border-gray-100 flex items-center gap-3"
                style={{ background: `${stepDef.color}07` }}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${stepDef.color}15` }}
                >
                  <StepIcon size={14} style={{ color: stepDef.color }} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stepDef.color }}>
                    Step {wizardStep + 1} / {WIZARD_STEPS.length}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 leading-tight mt-0.5">{stepDef.label}</p>
                </div>
              </div>

              {/* 카드 콘텐츠 */}
              <div className="p-6">

                {/* ── Step 0: 기업 정보 ─────────────────────────── */}
                {wizardStep === 0 && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      회원가입 시 등록된 기업 정보입니다. 수정이 필요하면 마이페이지를 이용해주세요.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { Icon: Building2, label: '회사명',  value: companyName,   color: '#6366f1' },
                        { Icon: Briefcase, label: '업종',    value: industryLabel || '미등록', color: '#22c55e' },
                        { Icon: MapPin,    label: '지역',    value: regionLabel,   color: '#3b82f6' },
                        { Icon: Users,     label: '임직원 수', value: employeeLabel !== '미등록' ? `${employeeLabel}명` : '미등록', color: '#f59e0b' },
                      ].map(card => (
                        <div
                          key={card.label}
                          className="rounded-xl border p-3.5 bg-white"
                          style={{ borderColor: `${card.color}25` }}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <card.Icon size={12} style={{ color: card.color }} />
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: card.color }}>
                              {card.label}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-gray-800 truncate">{card.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
                      <CheckCircle2 size={13} className="text-indigo-500 shrink-0" />
                      <p className="text-xs text-indigo-600">
                        기업 정보가 확인되었습니다. 아래 <span className="font-semibold">다음</span> 버튼으로 분석을 시작하세요.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Step 1: Environment(E) 분석 ───────────────── */}
                {wizardStep === 1 && (
                  <div>
                    <div className="space-y-3">
                      {ENV_FIELDS.map(f => (
                        <div key={f.key}>
                          <label className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{f.label}</span>
                            <span className="text-[10px] font-mono text-gray-400">{f.unit}</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={manualEnv[f.key]}
                            onChange={e => setManualEnv(p => ({ ...p, [f.key]: e.target.value }))}
                            disabled={eCompleted}
                            placeholder={f.placeholder}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800
                              placeholder:text-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors
                              disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50
                              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      ))}
                      <MiniUpload file={eFile} onFile={setEFile} label="환경 데이터 증빙 (CSV / PDF, 선택)" allowCsv />
                    </div>

                    {/* E 분석 시작 / 결과 */}
                    <div className="mt-5">
                      {!eCompleted ? (
                        <>
                          <button
                            type="button"
                            onClick={handleEnvironmentAnalysis}
                            disabled={eLoading}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white
                              font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                              disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                          >
                            {eLoading
                              ? <><Loader2 size={14} className="animate-spin" /> 수치 검증 분석 중...</>
                              : <><Leaf size={14} /> 환경(E) 분석 시작</>}
                          </button>
                          {eValidationError && (
                            <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                              <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                              <p className="text-[10px] text-red-600 leading-relaxed">{eValidationError}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <MiniScoreCard result={eResult} label="Environment" color="#22c55e" />
                          <button
                            type="button"
                            onClick={() => { setECompleted(false); setEResult(null); setEValidationError(null); }}
                            className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-center py-1"
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
                    <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                      사회 분야 ESG 활동 여부를 체크해주세요.
                    </p>
                    <ChecklistStep
                      items={SOCIAL_ITEMS}
                      answers={socialAnswers}
                      setAnswers={setSocialAnswers}
                      accentColor="#3b82f6"
                      disabled={sCompleted}
                    />
                    <MiniUpload file={sFile} onFile={setSFile} label="Social 관련 증빙 서류 (PDF, 필수)" />
                    {!sFile && (
                      <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                        <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-600 leading-relaxed">
                          S/G 카테고리는 증빙 문서(PDF) 업로드 후에만 분석이 가능합니다. 파일 없이는 점수·등급·신뢰도를 생성하지 않습니다.
                        </p>
                      </div>
                    )}
                    <div className="mt-5">
                      {!sCompleted ? (
                        <button
                          type="button"
                          onClick={handleSocialAnalysis}
                          disabled={sLoading || !sFile}
                          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                            font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                            disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                        >
                          {sLoading
                            ? <><Loader2 size={14} className="animate-spin" /> OCR + RAG 분석 중...</>
                            : <><Users size={14} /> Social(S) RAG 분석 시작</>
                          }
                        </button>
                      ) : (
                        <>
                          <MiniScoreCard result={sResult} label="Social" color="#3b82f6" />
                          <button
                            type="button"
                            onClick={() => { setSCompleted(false); setSResult(null); }}
                            className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-center py-1"
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
                    <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                      지배구조 분야 ESG 정책 존재 여부를 체크해주세요.
                    </p>
                    <ChecklistStep
                      items={GOV_ITEMS}
                      answers={governanceAnswers}
                      setAnswers={setGovernanceAnswers}
                      accentColor="#f59e0b"
                      disabled={gCompleted}
                    />
                    <MiniUpload file={gFile} onFile={setGFile} label="Governance 관련 증빙 서류 (PDF, 필수)" />
                    {!gFile && (
                      <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                        <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-600 leading-relaxed">
                          S/G 카테고리는 증빙 문서(PDF) 업로드 후에만 분석이 가능합니다. 파일 없이는 점수·등급·신뢰도를 생성하지 않습니다.
                        </p>
                      </div>
                    )}
                    <div className="mt-5">
                      {!gCompleted ? (
                        <button
                          type="button"
                          onClick={handleGovernanceAnalysis}
                          disabled={gLoading || !gFile}
                          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white
                            font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                            disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                        >
                          {gLoading
                            ? <><Loader2 size={14} className="animate-spin" /> OCR + RAG 분석 중...</>
                            : <><Building2 size={14} /> Governance(G) RAG 분석 시작</>
                          }
                        </button>
                      ) : (
                        <>
                          <MiniScoreCard result={gResult} label="Governance" color="#f59e0b" />
                          <button
                            type="button"
                            onClick={() => { setGCompleted(false); setGResult(null); }}
                            className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-center py-1"
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
                    <p className="text-xs text-gray-500 leading-relaxed">
                      과거 탄소 절감 활동을 ESG 점수에 반영합니다.
                      연동 시 <span className="text-emerald-600 font-semibold">Social(S) 점수 가산</span>이 예정됩니다.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: '에코 포인트', value: MOCK_ECO.ecoPoints.toLocaleString(),            unit: 'P',    color: '#22c55e' },
                        { label: '탄소 절감',   value: (MOCK_ECO.carbonReductionKg / 1000).toFixed(1), unit: 'tCO₂', color: '#3b82f6' },
                        { label: '나무 환산',   value: MOCK_ECO.equivalentTrees.toLocaleString(),      unit: '그루', color: '#f59e0b' },
                      ].map(card => (
                        <div
                          key={card.label}
                          className="rounded-xl border p-3 text-center bg-white"
                          style={{ borderColor: `${card.color}25` }}
                        >
                          <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: card.color }}>
                            {card.label}
                          </p>
                          <p className="text-xl font-black leading-none" style={{ color: card.color }}>{card.value}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{card.unit}</p>
                        </div>
                      ))}
                    </div>
                    {!ecoLinked ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setEcoLinked(true)}
                          className="w-full py-2.5 rounded-xl border border-emerald-200 bg-emerald-50
                            text-emerald-700 text-sm font-semibold hover:bg-emerald-100 hover:border-emerald-300
                            transition-all duration-150 flex items-center justify-center gap-2"
                        >
                          <Zap size={14} /> EcoPoint 연동하기
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardStep(v => v + 1)}
                          className="w-full py-2 rounded-xl text-gray-400 hover:text-gray-600 text-xs font-medium
                            transition-colors duration-150"
                        >
                          연동 건너뛰기 →
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-700">EcoPoint 연동 완료</p>
                          <p className="text-[10px] text-emerald-500 mt-0.5">S 점수 +4 반영 예정</p>
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
                            bg-gray-50 border border-gray-100"
                        >
                          <div className="flex items-center gap-2">
                            {row.done
                              ? <CheckCircle2 size={13} className="text-emerald-500" />
                              : <AlertCircle  size={13} className="text-gray-300" />
                            }
                            <span className="text-xs text-gray-600">{row.label}</span>
                          </div>
                          <span className={`text-xs font-semibold font-mono ${row.done ? 'text-emerald-600' : 'text-gray-300'}`}>
                            {row.done ? (row.score ?? '완료') : '미완료'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* E/S/G 미완료 경고 */}
                    {!allDone && (
                      <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50
                        border border-amber-100 rounded-xl px-3 py-2.5">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        E / S / G 분석을 모두 완료한 후 최종 분석을 실행할 수 있습니다.
                      </div>
                    )}

                    {/* 에러 */}
                    {err && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertCircle size={15} className="shrink-0" /> {err}
                      </div>
                    )}

                    {/* 최종 분석 실행 버튼 */}
                    <button
                      onClick={handleFinalReport}
                      disabled={!allDone || submitting}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                        text-white font-semibold text-sm transition-colors duration-150
                        flex items-center justify-center gap-2 shadow-sm
                        disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting
                        ? <><Loader2 size={15} className="animate-spin" /> 분석 요청 중...</>
                        : <><ArrowRight size={17} />{!allDone ? 'E / S / G 분석을 모두 완료해주세요' : '최종 ESG 분석 실행'}</>
                      }
                    </button>
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
                    text-gray-500 hover:text-gray-800 hover:bg-white border border-transparent
                    hover:border-gray-200 hover:shadow-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900
                    border border-gray-200 hover:border-gray-300 shadow-sm
                    transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  다음 <ArrowRight size={14} />
                </button>
              ) : <div />}
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}
