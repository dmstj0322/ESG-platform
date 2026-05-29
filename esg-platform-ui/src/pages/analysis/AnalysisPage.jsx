import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import api from '../../api/api';
import { useAnalysis, BASE_URL } from '../../context/AnalysisContext';
import { useAuth } from '../../context/AuthContext';
import {
  Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  Loader2, ArrowRight, ArrowLeft, X,
  Users, Building2, Leaf, Zap, MapPin, Briefcase,
  ChevronDown, ChevronUp, TrendingUp, Activity,
} from 'lucide-react';
import RealtimeAuditPanel from '../../components/analysis/RealtimeAuditPanel';


// ── 체크리스트 상수 ───────────────────────────────────────────────────────
const SOCIAL_ITEMS = [
  { key: 's1', label: '산업안전 교육 정기 실시' },
  { key: 's2', label: 'ESG 교육 프로그램 운영' },
  { key: 's3', label: '중대 사고 이력 없음' },
  { key: 's4', label: '임직원 참여 프로그램 운영' },
  { key: 's5', label: '지역사회 봉사 활동 참여' },
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
  { key: 'env',     label: 'Environment', shortLabel: 'E',    Icon: Leaf,       color: '#059669' },
  { key: 'social',  label: 'Social',      shortLabel: 'S',    Icon: Users,      color: '#3b82f6' },
  { key: 'gov',     label: 'Governance',  shortLabel: 'G',    Icon: Building2,  color: '#f59e0b' },
  { key: 'eco',     label: 'EcoPoint',    shortLabel: 'Eco',  Icon: Zap,        color: '#059669' },
  { key: 'run',     label: '최종 결과',   shortLabel: '결과', Icon: ArrowRight, color: '#059669' },
];

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
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all duration-300 ${
                isDone
                  ? 'border-emerald-500 bg-emerald-500 shadow-sm shadow-emerald-200'
                  : isActive
                  ? 'border-emerald-500 bg-white shadow-md shadow-emerald-100'
                  : 'border-gray-200 bg-white'
              }`}>
                {isDone
                  ? <CheckCircle2 size={14} className="text-white" />
                  : <StepIcon size={13} className={isActive ? 'text-emerald-600' : 'text-gray-300'} />
                }
              </div>
              <span className={`text-[10px] font-semibold transition-colors duration-200 ${
                isActive ? 'text-emerald-600' : isDone ? 'text-emerald-400' : 'text-gray-300'
              }`}>{step.shortLabel}</span>
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-6 transition-all duration-500 rounded-full ${
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
        const checked    = !!answers[item.key];
        const showDanger = item.dangerText && !checked;
        return (
          <div
            key={item.key}
            className={`flex items-start justify-between py-3.5 transition-colors duration-150 ${
              idx < items.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <div className="flex-1 min-w-0 pr-3">
              <span className={`text-[13px] select-none transition-colors duration-150 ${checked ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                {item.label}
              </span>
              {showDanger && (
                <p className="flex items-center gap-1 mt-0.5 text-[10px] text-red-500">
                  <AlertTriangle size={9} className="shrink-0" />
                  {item.dangerText}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAnswers(p => ({ ...p, [item.key]: !p[item.key] }))}
              className="relative mt-0.5 w-11 h-6 rounded-full shrink-0 transition-colors duration-200 focus:outline-none"
              style={{ background: checked ? accentColor : '#d1d5db' }}
              role="switch"
              aria-checked={checked}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                checked ? 'translate-x-5' : 'translate-x-0'
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
  'CHECKLIST_NO_EVIDENCE':    { label: '증빙 없음',   cls: 'bg-red-50 text-red-600 border-red-200' },
  'EVIDENCE_CONTRADICTION':   { label: '불일치 감지', cls: 'bg-red-50 text-red-600 border-red-200' },
  'NEGATIVE_SIGNAL_DETECTED': { label: '부정 신호',   cls: 'bg-red-50 text-red-600 border-red-200' },
  'NUMERIC_LOW':              { label: '수치 오차',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
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
          <span className="text-[9px] text-gray-400">{bd.evidenceCount}건 근거</span>
        )}
        {bd.uniquePageCount > 0 && (
          <span className="text-[9px] text-gray-400">· {bd.uniquePageCount}p</span>
        )}
        {bd.similarityTier === 'LOW' && (
          <span className="text-[8px] italic text-orange-500">근거 부족</span>
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
            근거 검증
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
  const GRADE_COLOR = { S: '#10b981', A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
  const gc = GRADE_COLOR[finalGrade] ?? '#6366f1';

  const iw = getIndustryWeights(localStorage.getItem('esg_ksicCode') ?? '');
  const categories = [
    { label: 'Environment', code: 'E', result: eResult,                         weight: Math.round(iw.E * 100), color: '#059669' },
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
    const noEvNote = noEvidence > 0 ? ` ${noEvidence}개 지표는 감사 근거가 부족하여 신뢰도가 제한됩니다.` : '';
    return `종합 ESG 등급 ${finalGrade}(${gradeDesc}) — 해당 기업은 ${strongest.label} 영역에서 강점을 보이며, ${weakest.label} 영역의 개선이 필요합니다.${conNote}${noEvNote} 분석 신뢰도: ${confidence}%.`;
  })();

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3"
        style={{ background: `${gc}07` }}>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${gc}12` }}>
          <TrendingUp size={14} style={{ color: gc }} />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: gc }}>종합 결과</p>
          <p className="text-sm font-semibold text-gray-800">종합 ESG 결과</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 메인 점수 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">종합 점수</p>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black tabular-nums leading-none" style={{ color: gc }}>{totalScore}</span>
              <span className="text-2xl font-black pb-1" style={{ color: gc }}>{finalGrade}</span>
            </div>
          </div>
          {/* Confidence */}
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">검증 신뢰도</p>
            <div className="flex items-center gap-2 justify-end">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${confidence}%`, background: confidence >= 70 ? '#059669' : confidence >= 50 ? '#f59e0b' : '#ef4444' }} />
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
            { label: '확인 근거', value: totalEvidence, color: '#16a34a' },
            { label: '불일치 감지', value: contradictions, color: contradictions > 0 ? '#dc2626' : '#9ca3af' },
            { label: '미확인 지표',    value: noEvidence,    color: noEvidence > 0 ? '#d97706' : '#9ca3af' },
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
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">강점 영역</p>
            <p className="text-xs font-semibold text-emerald-700">{strongest.label}</p>
            <p className="text-[10px] text-emerald-500 tabular-nums">{strongest.result?.score}점 · {strongest.result?.grade}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">개선 필요</p>
            <p className="text-xs font-semibold text-amber-700">{weakest.label}</p>
            <p className="text-[10px] text-amber-500 tabular-nums">{weakest.result?.score}점 · {weakest.result?.grade}</p>
          </div>
        </div>

        {/* 종합 의견 */}
        <div className="px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 mb-2">종합 의견</p>
          <p className="text-[12px] text-gray-600 leading-relaxed">{aiComment}</p>
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

// generateInsights 제거 — 주요 현황 bullet 섹션 단순화로 미사용

// ── MiniScoreCard ─────────────────────────────────────────────────────────
function MiniScoreCard({ result, label, color }) {
  const [showEvidence, setShowEvidence] = useState(false);

  const gc           = { S: '#059669', A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' }[result.grade] ?? color;
  const hasWarning   = !!result.warning || result.lowMismatchCount > 0;
  const isSimulation = result.isSimulation === true;

  // confidence 색상/라벨: 90+ 안정, 70~89 양호, 50~69 보완권장, ~49 주의
  const confColor = result.confidence >= 90 ? '#059669'
                  : result.confidence >= 70 ? '#3b82f6'
                  : result.confidence >= 50 ? '#f59e0b'
                  : '#ef4444';
  const confLabel = result.confidence >= 80 ? 'HIGH'
                  : result.confidence >= 60 ? 'MEDIUM'
                  : result.confidence != null ? 'LOW' : '—';

  const realEvidences = result.evidences?.filter(ev => ev.similarity != null) ?? [];
  const hasBreakdown  = result.indicatorBreakdowns?.length > 0;

  return (
    <div className="rounded-xl border border-gray-200 p-4 mt-4 bg-white">

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={13} style={{ color }} />
          <span className="text-[12px] font-semibold" style={{ color }}>
            {label} 분석 완료
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.gradeCeilingApplied && (
            <span className="badge badge-medium" style={{ fontSize: '10px' }}>등급제한</span>
          )}
          {result.lowMismatchCount > 0 && (
            <span className="badge badge-high" style={{ fontSize: '10px' }}>LOW {result.lowMismatchCount}건</span>
          )}
        </div>
      </div>

      {/* 수치 불일치 경고 */}
      {hasWarning && (
        <div className="flex items-start gap-2 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-600 leading-relaxed">
            {result.warning ?? '입력 수치와 증빙자료 간 불일치가 감지되었습니다.'}
            {result.gradeCeilingApplied && (
              <span className="ml-1 font-semibold text-amber-600">등급 제한 적용.</span>
            )}
          </p>
        </div>
      )}

      {/* 핵심 지표 그리드 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '점수', value: `${result.score}점`, color: gc },
          { label: '등급', value: result.grade,        color: gc },
        ].map(c => (
          <div key={c.label} className="text-center bg-gray-50 rounded-lg py-2.5">
            <p className="text-[10px] text-gray-400 mb-1">{c.label}</p>
            <p className="text-[16px] font-bold leading-none" style={{ color: c.color, fontFamily: "'Inter', sans-serif" }}>{c.value}</p>
          </div>
        ))}
        {/* 분석 신뢰도 — % + HIGH/MEDIUM/LOW badge */}
        <div className="text-center bg-gray-50 rounded-lg py-2.5">
          <p className="text-[10px] text-gray-400 mb-1">분석 신뢰도</p>
          <p className="text-[16px] font-bold leading-none" style={{ color: confColor, fontFamily: "'Inter', sans-serif" }}>
            {result.confidence != null ? `${result.confidence}%` : '—'}
          </p>
          {confLabel && (
            <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded border mt-1.5 ${
              result.confidence >= 80 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
              result.confidence >= 60 ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                        'bg-amber-50 text-amber-600 border-amber-200'
            }`}>{confLabel}</span>
          )}
        </div>
      </div>

      {/* 주요 현황 bullet 제거 — 핵심 KPI(점수·등급·분석상태) 중심 구조 */}

      {/* Evidence/Verification 상세 패널 — summary형 카드로 대체됨 */}

    </div>
  );
}

// ── MiniUpload ─────────────────────────────────────────────────────────────
function MiniUpload({ file, onFile, label, allowCsv = false, csvOnly = false }) {
  const uid = useId();
  const [fileError, setFileError] = useState(null);

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    if (csvOnly && !name.endsWith('.csv')) {
      setFileError('CSV 파일(.csv)만 업로드 가능합니다.');
      e.target.value = '';
      return;
    }
    if (!allowCsv && !csvOnly && name.endsWith('.csv')) {
      setFileError('S/G 분석은 PDF 증빙 파일만 업로드 가능합니다.');
      e.target.value = '';
      return;
    }
    setFileError(null);
    onFile(f);
    e.target.value = '';
  };

  const acceptAttr = csvOnly ? '.csv' : allowCsv ? '.pdf,.csv' : '.pdf';
  const placeholder = csvOnly ? 'CSV 파일 선택 (.csv)' : allowCsv ? 'PDF 또는 CSV 선택' : 'PDF 파일 선택';

  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">{label}</p>
      {file ? (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
          <FileText size={13} className="text-emerald-500 shrink-0" />
          <span className="text-[12px] text-gray-700 font-medium flex-1 truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => { onFile(null); setFileError(null); }}
            className="text-gray-300 hover:text-gray-500 transition-colors duration-150 p-0.5 rounded-md hover:bg-gray-100"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={uid}
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-gray-50 border border-dashed
            border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all duration-150 group"
        >
          <Upload size={13} className="text-gray-300 group-hover:text-emerald-400 transition-colors duration-150" />
          <span className="text-[12px] text-gray-400 group-hover:text-gray-600 transition-colors duration-150">
            {placeholder}
          </span>
          <input
            id={uid}
            type="file"
            accept={acceptAttr}
            className="hidden"
            onChange={handleChange}
          />
        </label>
      )}
      {fileError && (
        <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle size={11} className="text-red-500 shrink-0" />
          <p className="text-[11px] text-red-600">{fileError}</p>
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
  const [ecoLinked, setEcoLinked]     = useState(false);
  const [userPoints, setUserPoints]   = useState(0);  // 회사 전체 포인트 합산

  // 회사 ESG Pool 조회 → 포인트 있으면 자동 연동 (SUM(balance) 방식 제거)
  useEffect(() => {
    const cId = localStorage.getItem('companyId');
    if (!cId) return;
    const poolUrl = `/points/company/${cId}/esg-pool`;
    console.log('[POOL-REQUEST-URL]', poolUrl, '→ proxy: localhost:9000 → POINT-SERVICE');
    api.get(poolUrl)
      .then(res => {
        console.log('[POOL-RESPONSE]', res.data);
        const pts = Number(res.data?.esgPoints) || 0;
        setUserPoints(pts);
        if (pts > 0) setEcoLinked(true);
      })
      .catch(err => {
        console.error('[POOL-REQUEST-FAIL]', err?.response?.status, err?.message);
      });
  }, []);

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

  // ── 최종 파이프라인 (WS 기반)
  const [finalPipelineActive, setFinalPipelineActive] = useState(false);
  const stompRef        = useRef(null);
  const pipelineDoneRef = useRef(false);

  // WS 연결 해제 (언마운트 시)
  useEffect(() => () => { stompRef.current?.deactivate(); }, []);

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
    // ── 사전 validation: CSV 파일 필수 ──────────────────────────────────────
    if (!eFile) {
      setEValidationError('환경 데이터 증빙 서류(CSV)를 업로드해야 분석을 시작할 수 있습니다.');
      addLog('E-STEP', '[VALIDATION] CSV 파일 없음 — API 호출 중단', 'error');
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

    // 1,000 EP = Social +1점, 최대 +5점 (백엔드 EcoPointConverter.EP_PER_S_POINT 동일)
    const ecoBonus = ecoLinked ? Math.min(5, Math.floor(userPoints / 1000)) : 0;
    const adjSScore  = Math.min(100, sResult.score + ecoBonus);
    const iw         = getIndustryWeights(companyProfile.ksicCode);
    const totalScore = Math.round(eResult.score * iw.E + adjSScore * iw.S + gResult.score * iw.G);
    const finalGrade = totalScore >= 90 ? 'S' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D';
    const confidence = Math.round(
      ((eResult.confidence ?? 70) + (sResult.confidence ?? 70) + (gResult.confidence ?? 70)) / 3
    );

    const userId = localStorage.getItem('memberId');
    console.log('[SUBMIT-CHECK] ecoLinked=', ecoLinked, 'userPoints=', userPoints, 'ecoBonus=', ecoBonus, 'companyId=', companyId);
    console.log('[ECO-POOL-SOURCE] companyId=', companyId,
      '| displayedPool=', userPoints, 'EP',
      '| bonusCalculatedFrom=', userPoints, 'EP',
      '| calculatedBonus=', ecoBonus, '점',
      '| usedPoints=', ecoBonus * 1000, 'EP',
      '| consumeTargetPool=company_esg_pool(backend)');
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
      socialResult:      { score: sResult.score, grade: sResult.grade, confidence: sResult.confidence, evidenceCount: sResult.evidenceCount, ragBased: sResult.ragBased ?? false },
      governanceResult:  { score: gResult.score, grade: gResult.grade, confidence: gResult.confidence, evidenceCount: gResult.evidenceCount, ragBased: gResult.ragBased ?? false },
      ecoPointApplied: ecoLinked,
      // ecoSBonus: 백엔드가 회사 전체 포인트 기반으로 직접 계산하므로 프론트 전송 제거
      totalScore,
      finalGrade,
      confidence,
      isAutoSimulation: false,
      evidences: allEvidences.length > 0 ? allEvidences : undefined,
      ksicCode: companyProfile.ksicCode || undefined,
    };

    console.log('[SUBMIT-PAYLOAD] ecoPointApplied=', body.ecoPointApplied, 'ksicCode=', body.ksicCode);
    let sessionId;
    try {
      const res = await api.post('/api/v1/analysis/session', body, {
        headers: {
          'Content-Type': 'application/json',
          'X-UserId':    String(userId ?? ''),
          'X-CompanyId': String(companyId ?? ''),
        },
      });
      sessionId = res.data?.sessionId ?? res.data;
    } catch (e) {
      setSubmitting(false);
      const status    = e.response?.status;
      const serverMsg = e.response?.data?.message ?? e.response?.data ?? e.message;
      setErr(`세션 생성 실패 (${status ?? 'ERR'}): ${serverMsg}`);
      return;
    }

    // 세션 생성 완료 → Audit Stream에서 파이프라인 로그 스트리밍 시작
    setFinalPipelineActive(true);

    const onCompleted = (analysisId) => {
      if (pipelineDoneRef.current) return;
      pipelineDoneRef.current = true;
      const targetId = (analysisId && String(analysisId) !== 'undefined') ? analysisId : sessionId;
      localStorage.setItem('esg_latest_analysis_id', String(targetId));
      setFinalPipelineActive(false);
      setTimeout(() => navigate(`/analysis/result/${targetId}`), 1800);
    };

    const onFailed = () => {
      setFinalPipelineActive(false);
      setSubmitting(false);
      setErr('분석 파이프라인 실패 — 입력 데이터를 확인하고 다시 시도해주세요');
    };

    // WebSocket 연결
    stompRef.current?.deactivate();
    const client = new Client({
      webSocketFactory: () => new SockJS(`${BASE_URL}ws-esg`),
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/analysis/${companyId}`, (frame) => {
          const status = frame.body?.trim();
          if (!status) return;
          if (status.startsWith('COMPLETED') || status === 'COMPLETE') {
            const parts = status.split(':');
            onCompleted(parts[1]?.trim() || sessionId);
          } else if (status === 'FAILED') {
            onFailed();
          }
        });
        // 구독 완료 후 분석 실행 요청
        api.post(`/api/v1/analysis/session/${sessionId}/start`, null, {
          headers: { 'X-CompanyId': String(companyId) },
        }).catch(() => onFailed());
      },
      onStompError: () => onFailed(),
    });
    client.activate();
    stompRef.current = client;

    // 폴링 fallback (WS 이벤트 누락 안전망)
    const pollDelays = [35000, 65000, 110000, 180000];
    pollDelays.forEach(delay => {
      setTimeout(async () => {
        if (pipelineDoneRef.current) return;
        try {
          const r = await api.get(`/api/v1/analysis/${sessionId}/result`);
          if (r.status === 200 && r.data) onCompleted(sessionId);
        } catch {}
      }, delay);
    });
  }, [eResult, sResult, gResult, ecoLinked, userPoints, manualEnv, companyId, companyProfile.ksicCode, navigate]);

  const busy       = eLoading || sLoading || gLoading || submitting || finalPipelineActive;
  const isLastStep = wizardStep === WIZARD_STEPS.length - 1;
  const stepDef    = WIZARD_STEPS[wizardStep];
  const StepIcon   = stepDef.Icon;
  const allDone    = eCompleted && sCompleted && gCompleted;

  const computedEcoBonus = (() => {
    if (!ecoLinked) return 0;
    // 포인트 잔액 기반 산출 (백엔드 공식과 동일: 1000 EP = +1점, cap 5점)
    if (userPoints > 0) return Math.min(5, Math.floor(userPoints / 1000));
    const carbonInput = Number(manualEnv.carbon) || 0;
    let pts = 0;
    if (carbonInput > 0) {
      const rate = eResult ? Math.max(0.05, Math.min(0.22, eResult.score / 450)) : 0.10;
      pts = Math.round(Math.round(carbonInput * rate * 1000) / 3.5);
    } else if (eResult) {
      pts = Math.round(Math.round(eResult.score * 115) / 3.5);
    }
    return Math.min(5, Math.floor(pts / 1000));
  })();



  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="max-w-6xl mx-auto px-8 py-10">

        <div className="mb-8">
          <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-[0.1em] mb-1.5">GreenTrace ESG 감사</p>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight leading-none">ESG 감사 진단</h1>
          <p className="text-[13px] text-gray-500 mt-2">
            환경(E) · 사회(S) · 지배구조(G) 핵심 ESG 지표를 기반으로 증빙 문서 감사를 수행합니다
          </p>
        </div>

        <WizardStepper currentStep={wizardStep} />

        {/* ── Two-column: left = wizard, right = audit panel ── */}
        <div className="lg:grid lg:grid-cols-[1fr_300px] gap-8 items-start">

          {/* ── Left column ── */}
          <div className="flex flex-col gap-5">

            <div className="saas-card overflow-hidden">

              {/* 카드 헤더 */}
              <div
                className="px-6 py-4 border-b border-gray-100 flex items-center gap-3"
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${stepDef.color}12` }}
                >
                  <StepIcon size={13} style={{ color: stepDef.color }} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stepDef.color }}>
                    Step {wizardStep + 1} / {WIZARD_STEPS.length}
                  </p>
                  <p className="text-[13px] font-semibold text-gray-800 leading-tight mt-0.5">{stepDef.label}</p>
                </div>
              </div>

              {/* 카드 콘텐츠 */}
              <div className="p-6">

                {/* ── Step 0: 기업 정보 ─────────────────────────── */}
                {wizardStep === 0 && (
                  <div className="space-y-4">
                    <p className="text-[12px] text-gray-500 leading-relaxed">
                      회원가입 시 등록된 기업 정보입니다. 수정이 필요하면 마이페이지를 이용해주세요.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { Icon: Building2, label: '회사명',   value: companyName,   color: '#059669' },
                        { Icon: Briefcase, label: '업종',     value: industryLabel || '미등록', color: '#059669' },
                        { Icon: MapPin,    label: '지역',     value: regionLabel,   color: '#059669' },
                        { Icon: Users,     label: '임직원 수', value: employeeLabel !== '미등록' ? `${employeeLabel}명` : '미등록', color: '#059669' },
                      ].map(card => (
                        <div
                          key={card.label}
                          className="rounded-xl border border-gray-200 p-4 bg-white"
                        >
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <card.Icon size={11} className="text-gray-400" />
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              {card.label}
                            </p>
                          </div>
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{card.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      <p className="text-[12px] text-emerald-700">
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
                      <MiniUpload file={eFile} onFile={setEFile} label="환경 데이터 증빙 서류 (CSV, 필수)" csvOnly />
                    </div>

                    {/* E 분석 시작 / 결과 */}
                    <div className="mt-5">
                      {!eCompleted ? (
                        <>
                          <button
                            type="button"
                            onClick={handleEnvironmentAnalysis}
                            disabled={eLoading || eCompleted}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white
                              font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2
                              disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                          >
                            {eLoading
                              ? <><Loader2 size={14} className="animate-spin" /> 환경 분석 중...</>
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
                          <MiniScoreCard result={eResult} label="Environment" color="#059669" />
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
                            ? <><Loader2 size={14} className="animate-spin" /> 문서 분석 중...</>
                            : <><Users size={14} /> Social(S) 분석 시작</>
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
                            ? <><Loader2 size={14} className="animate-spin" /> 문서 분석 중...</>
                            : <><Building2 size={14} /> Governance(G) 분석 시작</>
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
                      친환경 활동으로 적립한 에코 포인트를 ESG 점수에 반영합니다.
                      연동 시 <span className="text-emerald-600 font-semibold">Social(S) 점수 가산</span>이 적용되고, 반영된 포인트는 차감됩니다.
                    </p>
                    {userPoints > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px]">
                        <span className="text-emerald-700 font-semibold">회사 전체 보유 에코 포인트</span>
                        <span className="text-emerald-600 tabular-nums font-bold">{userPoints.toLocaleString()} EP</span>
                      </div>
                    )}
                    {userPoints > 0 && computedEcoBonus > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[11px]">
                        <span className="text-gray-500">분석 반영 시 차감 (관리자 계정)</span>
                        <span className="text-gray-700 tabular-nums">
                          {(computedEcoBonus * 1000).toLocaleString()} EP 차감 예정
                        </span>
                      </div>
                    )}
                    {!eResult && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                        <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                        <p className="text-[11px] text-amber-600">Environment(E) 분석을 완료하면 실제 데이터 기반으로 산출됩니다.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      {(() => {
                        const poolBonus = Math.min(5, Math.floor(userPoints / 1000));
                        const poolUsed  = poolBonus * 1000;
                        return [
                          { label: '회사 ESG Pool', value: userPoints.toLocaleString(),  unit: 'EP',   color: '#059669' },
                          { label: 'S 가산점',       value: `+${poolBonus}`,              unit: '점',   color: '#3b82f6' },
                          { label: '차감 예정 EP',   value: poolUsed.toLocaleString(),    unit: 'EP',   color: '#f59e0b' },
                        ];
                      })().map(card => (
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
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
                          <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-emerald-700">EcoPoint 연동 완료</p>
                            <p className="text-[10px] text-emerald-500 mt-0.5">
                              {computedEcoBonus > 0 && sResult
                                ? `사회(S) ${sResult.score}점 → ${Math.min(100, sResult.score + computedEcoBonus)}점 보정 (+${computedEcoBonus})`
                                : computedEcoBonus > 0
                                ? `Social(S) +${computedEcoBonus}점 반영 예정`
                                : '탄소 배출량 입력 시 S 점수 가산 적용'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardStep(v => v + 1)}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white
                            font-semibold text-sm transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm"
                        >
                          다음 단계로 <ArrowRight size={14} />
                        </button>
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
                        { label: 'EcoPoint',         done: ecoLinked,  score: ecoLinked && computedEcoBonus > 0 && sResult ? `사회(S) ${sResult.score}→${Math.min(100, sResult.score + computedEcoBonus)}점` : ecoLinked ? '연동됨 (가산 없음)' : '미연동' },
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

          </div>{/* end left column */}

          {/* ── Right column: sticky audit panel (desktop only) ── */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <RealtimeAuditPanel
                eLoading={eLoading}
                sLoading={sLoading}
                gLoading={gLoading}
                finalPipelineActive={finalPipelineActive}
                eFile={eFile}
                sFile={sFile}
                gFile={gFile}
                socialAnswers={socialAnswers}
                governanceAnswers={governanceAnswers}
              />
            </div>
          </div>

        </div>{/* end two-column grid */}
      </div>
    </div>
  );
}
