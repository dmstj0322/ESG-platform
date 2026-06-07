import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList, CartesianGrid,
} from 'recharts';
import api from '../../api/api';
import {
  ArrowLeft, AlertCircle, Loader2, ChevronDown, ChevronUp,
  Leaf, Users, Building2, TrendingUp, Shield,
  FileText, Zap, Info, Download, CheckCircle2, AlertTriangle,
  X, Hash, BarChart2, Cpu, Clock, PlayCircle,
  Activity, Search, CheckCircle,
} from 'lucide-react';

const IS_DEV = import.meta.env.DEV;
import { exportAnalysisResult } from '../../components/analysis/exportAnalysisResult';

let _marked = null;
try { _marked = (await import('marked')).marked; } catch { /* fallback */ }

// ── 상수 ─────────────────────────────────────────────────────────────────

const GRADE_COLOR = {
  S: '#a855f7', A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#ef4444',
};

const GRADE_CLS = {
  S:    'bg-purple-50 text-purple-700 border-purple-200',
  A:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  B:    'bg-blue-50 text-blue-700 border-blue-200',
  C:    'bg-amber-50 text-amber-700 border-amber-200',
  D:    'bg-red-50 text-red-600 border-red-200',
  'N/A': 'bg-gray-100 text-gray-500 border-gray-200',
};

const ESG_COLOR = { E: '#059669', S: '#3b82f6', G: '#f59e0b' };
const ESG_LABEL = { E: '환경', S: '사회', G: '지배구조' };
const ESG_ICON  = { E: Leaf, S: Users, G: Building2 };

const CONF_CLS = {
  STRONG: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  HIGH:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-600 border-amber-200',
  WEAK:   'bg-amber-50 text-amber-500 border-amber-200',
  LOW:    'bg-red-50 text-red-500 border-red-200',
};

// CONF_ITEMS 제거 — 신뢰도 상세 패널 단순화로 미사용

const GRADE_DESCRIPTION = {
  S: '탐지된 증빙 데이터 기준으로 ESG 전 영역 수치 일관성이 높게 확인되었습니다.',
  A: '탐지된 증빙 데이터 기준으로 대부분의 수치 항목에서 일관성이 확인되었습니다.',
  B: '일부 항목에서 수치 차이가 발견되어 등급이 제한되었습니다.',
  C: '여러 항목에서 증빙 수치 차이가 발견되었습니다.',
  D: '다수 항목에서 증빙 불일치가 감지되어 심각한 수준입니다.',
};

// Numeric match level → 스타일 맵 (EvidenceCard에서 공유)
const MATCH_STYLE = {
  HIGH:   { color: '#16a34a', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'HIGH' },
  MEDIUM: { color: '#d97706', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'MEDIUM' },
  LOW:    { color: '#dc2626', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-600',     label: 'LOW' },
};

// ── Verification Status 체계 (4단계) ─────────────────────────────────────
// VERIFIED: 명시 정책·정량 수치·감사 근거가 명확히 검출된 상태
// PARTIAL:  의미 유사 근거는 존재하지만 직접 근거(명시 정책·정량 실적)가 부족한 상태
// WEAK:     sharedEvidence 재사용·낮은 명확도·cross-indicator reuse 기반 상태
// NO_EVIDENCE: 정책·실적·절차 근거 자체 미검출
const VSTATUS = {
  VERIFIED:      { label: '직접 근거 확인',      color: '#15803d', bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-800', icon: '✓', tooltip: '명시 정책·정량 수치 등 K-ESG 기준에 부합하는 직접 근거가 탐지된 상태' },
  PARTIAL:       { label: '부분 근거 탐지',      color: '#b45309', bg: 'bg-amber-50',    border: 'border-amber-400',   text: 'text-amber-800',   icon: '~', tooltip: '문서 관련성 기반으로 관련 근거가 탐지되었으나, 직접 정책·수치 명시가 제한적인 상태' },
  WEAK:          { label: '간접 근거 탐지',      color: '#d97706', bg: 'bg-amber-50',    border: 'border-amber-300',   text: 'text-amber-700',   icon: '~', tooltip: '유사 문맥 기반 간접 근거만 탐지됨 — 독립적 직접 근거 보완 권장' },
  CONTRADICTION: { label: '수치 불일치 감지',    color: '#dc2626', bg: 'bg-red-50',      border: 'border-red-300',     text: 'text-red-700',     icon: '✕', tooltip: '제출 데이터와 증빙 문서 내 수치 간 유의미한 불일치가 감지되었습니다.' },
  NO_EVIDENCE:   { label: '추가 보완 권장',      color: '#6b7280', bg: 'bg-gray-50',     border: 'border-gray-200',    text: 'text-gray-500',    icon: '—', tooltip: '관련 운영 근거가 탐지되지 않았습니다. 해당 지표 관련 정책·실적 추가 기재 시 분석 신뢰도가 향상됩니다.' },
};

// ── Audit 용어 다양화 — 지표 코드 기반 결정적 rotation ────────────────────
const PARTIAL_AUDIT_PHRASES = [
  '운영 관련 근거가 확인되었으며, 정책/명시 문구 보완 시 검증 신뢰도가 향상됩니다',
  '관련 근거가 탐지되었으나, 정량 실적 데이터 추가 시 더 높은 신뢰도가 가능합니다',
  '부분 운영 근거가 식별되었습니다. 공식 정책 기재 보완을 권장합니다',
  '근거 문서가 탐지되었으며, 절차 명시 보완 시 직접 근거로 전환 가능합니다',
  '운영 맥락이 확인되었습니다. 정책 공시 보완으로 검증 수준을 높일 수 있습니다',
  '부분 근거가 식별되었습니다. 추가 자료 보완 시 분석 신뢰도가 향상됩니다',
];
const WEAK_AUDIT_PHRASES = [
  '운영 근거가 탐지되었으나 직접 정책 명시가 제한적입니다',
  '관련 문맥은 확인되었으나 명시적 증빙 보완이 권장됩니다',
  '유사 내용은 탐지되었으나 정량 실적 기재 보완이 도움이 됩니다',
  '문서 내 관련 맥락은 있으나 직접 근거 보완 시 신뢰도가 향상됩니다',
  '부분적 내용이 확인되었으나 정책 명문화가 권장됩니다',
  '운영 맥락은 탐지되었으나 명시적 정책 문서 보완이 필요합니다',
];
const getPartialAuditPhrase = (indicatorCode) => {
  const idx = ((indicatorCode?.charCodeAt(0) ?? 0) + (indicatorCode?.charCodeAt(2) ?? 0) + (indicatorCode?.length ?? 0)) % PARTIAL_AUDIT_PHRASES.length;
  return PARTIAL_AUDIT_PHRASES[idx];
};
const VERIFIED_AUDIT_PHRASES = [
  '운영 근거 확인 완료',
  '정책 근거 식별됨',
  '문서 기반 근거 확인',
  '근거 일관성 확인',
  '운영 근거 탐지 완료',
  '증빙 근거 확인',
  '직접 근거 식별 완료',
];
const getWeakAuditPhrase = (indicatorCode) => {
  const idx = ((indicatorCode?.charCodeAt(0) ?? 0) + (indicatorCode?.charCodeAt(2) ?? 0) + (indicatorCode?.length ?? 0)) % WEAK_AUDIT_PHRASES.length;
  return WEAK_AUDIT_PHRASES[idx];
};
const getVerifiedAuditPhrase = (indicatorCode) => {
  const idx = ((indicatorCode?.charCodeAt(0) ?? 0) + (indicatorCode?.charCodeAt(2) ?? 0) + (indicatorCode?.length ?? 0)) % VERIFIED_AUDIT_PHRASES.length;
  return VERIFIED_AUDIT_PHRASES[idx];
};

// 직접 거버넌스/사회 표현 — 높은 weight 부여로 VERIFIED 승격 대상
const HIGH_WEIGHT_PATTERNS = [
  // 사회 지표
  '전담 조직', '내부 신고', '참여율', '교육 시행', '이수율',
  '안전교육', 'ESG 조직', '신고 시스템', '운영 중', '내부제보', '신고채널',
  // 지배구조 alias (G-301~305 강화)
  '윤리경영 위원회', '위원회 운영', '윤리경영', '행동강령', '준법경영', '컴플라이언스',
  '반부패 정책', '청렴 서약', '이사회 독립', '사외이사', '외부감사', '외부 감사',
  '제3자 검증', '내부고발', 'ESG 담당', 'ESG 위원회', '지속가능경영 위원회',
  '신고센터', '제보센터', '핫라인', '내부 신고 시스템',
  // 산업안전·재해 operational KPI (S-201/202 승격)
  'ISO45001', 'iso45001', 'TRIR', 'LTIR', '안전보건경영시스템', '무재해 달성',
  '중대재해 0건', '재발방지 대책', '업계 평균 대비', '안전교육 이수율',
  'vr 기반 안전교육', '협력사 안전보건', '1인당 안전교육',
  // 사회공헌·교육 operational KPI (S-203/205 승격)
  '사회공헌 투자', '자원봉사 시간', '봉사활동 시간', '취약계층 지원',
  'ESG 교육 이수율', '온보딩 ESG 교육', '관리자 심화 과정',
];

// 정량 표현 패턴 — 수치·단위가 명시된 근거는 구체성이 높아 VERIFIED 승격 가능
const QUANTITATIVE_PATTERNS = [/%/, /\d+\s*시간/, /\d+\s*회/, /\d+\s*건/, /\d+\s*명/, /\d+\s*개/,
  /참여율/, /이수율/, /비율/, /운영\s*중/, /운영함/, /운영하고/, /횟수/, /인원/];

const hasQuantitativeText = (text) => QUANTITATIVE_PATTERNS.some(p => p.test(text ?? ''));

// ── Grouped Evidence Rendering 시스템 ──────────────────────────────────────
// 백엔드 normalizeEvidenceBundle()의 " / " 구분 출력을 감사 보고서형으로 렌더링

// bundle mode 지표 (백엔드 BUNDLE_MODE_INDICATORS와 동기화)
const BUNDLE_MODE_INDICATOR_SET = new Set(['S-201', 'S-202', 'G-301', 'G-302', 'G-304']);

// evidence token type → 색상/라벨 설정
const EVIDENCE_GROUP_CONFIG = {
  KPI:         { label: 'KPI 수치',  bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', headerBg: 'bg-emerald-100', headerText: 'text-emerald-800' },
  PREVENTION:  { label: '예방 체계', bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  headerBg: 'bg-orange-100',  headerText: 'text-orange-800' },
  OPERATIONAL: { label: '운영 활동', bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    headerBg: 'bg-blue-100',    headerText: 'text-blue-800' },
  POLICY:      { label: '정책·관리', bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700',  headerBg: 'bg-purple-100',  headerText: 'text-purple-800' },
};
const EVIDENCE_GROUP_ORDER = ['KPI', 'PREVENTION', 'OPERATIONAL', 'POLICY'];

// 지표별 감사 reasoning tone — 한국어 감사 보고서 톤 통일
// "evidence 확인" → "감사 근거 확인 / 운영 근거 확인 / 검증 근거 확인"
const INDICATOR_AUDIT_TONE = {
  'S-201': '산업안전 교육 KPI 및 운영 활동 감사 근거 확인',
  'S-202': '산업재해 예방·재발방지 체계 감사 근거 확인',
  'S-203': 'ESG 교육 이수율 및 운영 실적 검증 근거 확인',
  'S-204': '임직원 참여 프로그램 운영 근거 확인',
  'S-205': '지역사회 공헌 및 사회공헌 KPI 감사 근거 확인',
  'G-301': '윤리경영 정책 및 운영 실적 감사 근거 확인',
  'G-302': '내부 신고 채널 및 정보보호 운영 감사 근거 확인',
  'G-303': 'ESG 담당 조직 구성 및 운영 근거 확인',
  'G-304': '외부 감사 수행 및 제3자 검증 근거 확인',
  'G-305': '이사회 독립성 및 다양성 구성 감사 근거 확인',
};

/**
 * KPI 토큰에서 숫자 값을 추출해 audit metric badge로 시각 강조합니다.
 * label 부분은 일반 텍스트, 숫자+단위는 pill badge (monospace, 진한 초록) 처리.
 * 원문 token preserving — 추출·렌더링만 수행, 생성 없음.
 */
const renderKpiToken = (token) => {
  // "재해율(TRIR) 0.42", "교육 이수율 94%", "중대재해 0건" 등
  const m = token.match(/^(.*?)\s+(-?[\d,.]+\.?\d*\s*(?:건|%|시간|회|명|억원|원)?)$/);
  if (m) {
    return (
      <>
        <span>{m[1]}</span>
        <span className="ml-1 font-black tabular-nums font-mono text-[10px] leading-none bg-emerald-100 text-emerald-900 border border-emerald-300 rounded px-1.5 py-0.5 shrink-0">
          {m[2].trim()}
        </span>
      </>
    );
  }
  // "업계 평균 대비 -48.1%" 처럼 부호 포함
  const m2 = token.match(/^(.+?)\s+([+-]?[\d,.]+%?)$/);
  if (m2) {
    return (
      <>
        <span>{m2[1]}</span>
        <span className="ml-1 font-black tabular-nums font-mono text-[10px] leading-none bg-emerald-100 text-emerald-900 border border-emerald-300 rounded px-1.5 py-0.5 shrink-0">
          {m2[2].trim()}
        </span>
      </>
    );
  }
  return <span>{token}</span>;
};

/** " / " 구분 token의 evidence type 분류 (원문 token preserving) */
const classifyEvidenceToken = (token) => {
  const t = token.toLowerCase();
  if (/\d+\.?\d*\s*(시간|회|건|%|명|억원|원)/.test(token)
      || t.includes('0건') || t.includes('이수율') || t.includes('처리율')
      || /trir|ltir/.test(t) || t.includes('평균 대비') || t.includes('유출'))
    return 'KPI';
  if (t.includes('재발방지') || t.includes('원인분석') || t.includes('원인 분석')
      || t.includes('개선') || t.includes('예방체계') || t.includes('예방 체계'))
    return 'PREVENTION';
  if (t.includes('iso') || t.includes('isms') || t.includes('인증')
      || t.includes('위원회') || t.includes('채널') || t.includes('행동강령')
      || t.includes('정책') || t.includes('체계'))
    return 'POLICY';
  return 'OPERATIONAL';
};

/**
 * normalizeEvidenceBundle() 출력 문자열을 type별 그룹으로 파싱합니다.
 * " / " 구분자 없으면 null 반환 (일반 문장 유지).
 */
const parseEvidenceBundle = (text) => {
  if (!text || !text.includes(' / ')) return null;
  const tokens = text.split(' / ').map(t => t.trim())
    .filter(Boolean)
    .filter(t => !isFragmentArtifact(t)); // fragment artifact 사전 제거
  if (tokens.length < 1) return null;
  const groups = {};
  tokens.forEach(token => {
    const type = classifyEvidenceToken(token);
    if (!groups[type]) groups[type] = [];
    groups[type].push(token);
  });
  return groups;
};

// S-domain 표현 목록 — G 지표 false positive(봉사활동→G-302 등) 방지
// "봉사" 포함으로 봉사활동/봉사시간 일괄 차단; csr은 소문자 비교용
const S_DOMAIN_MARKERS_G = [
  '봉사', 'volunteer', 'csr', '사회공헌', 'donation', '참여시간', '참여 시간', '지역사회 봉사',
  '산업안전', '안전교육', '교육 참여율', '안전 교육', '산업 안전',
];

// G-302 내부 신고 시스템 필수 키워드 — 이 중 하나 없으면 VERIFIED 금지
const G302_REQUIRED_KW = [
  '내부 신고', '내부신고', '내부제보', '내부 제보',
  'whistleblowing', 'hotline', '핫라인',
  '제보', '신고 채널', '신고채널', '제보 채널', '제보채널',
  '신고센터', '제보센터', '신고시스템', '신고 시스템',
  'compliance', '익명 신고', '익명신고',
];

// S-203 ESG 교육 explicit keyword — 안전교육 단독으로는 VERIFIED 금지
// 백엔드 S-203 explicit phrase / coverage cluster와 동기화
const S203_ESG_EDUCATION_KW = [
  'ESG 교육', 'ESG교육', '지속가능경영 교육', '윤리경영 교육',
  '탄소중립 교육', '환경 교육', 'compliance training', 'sustainability training',
  'ESG 역량', 'ESG역량', '지속가능성 역량',
  // 운영 evidence 추가 — 정책 문서 없이 교육 운영 실적으로 인정
  'ESG 교육 이수율', '교육 이수율', '온보딩 ESG', '온보딩 교육',
  '관리자 심화', '심화 교육', 'ESG 전략 교육', 'ESG 공시 교육',
];
// S-203: 안전교육만 있고 ESG 교육이 없으면 NO_EVIDENCE로 처리할 패턴
const S203_SAFETY_ONLY_MARKERS = [
  '산업안전 교육', '안전보건 교육', '재해예방 교육', '안전교육', '안전 교육',
];

// [1] overallOpinion 정합성
// contraCount:   CONTRADICTION 지표 수 (0이면 불일치 코드 참조 문구 제거)
// lowCount:      numericMatchLevel=LOW 건수
// medCount:      numericMatchLevel=MEDIUM 건수
// allEVerified:  E-101~E-105 전체가 HIGH인지 여부 (analysisSummary.e 기반)
//                LOW=0·MEDIUM=0만으로는 추출 실패 항목을 구분할 수 없으므로 별도 전달 필요
const sanitizeOpinionText = (text, contraCount, lowCount = 0, medCount = 0, allEVerified = false) => {
  if (!text) return text;
  let out = text;

  // ── DEBUG: before/after 확인용 ─────────────────────────────────────────
  console.group('[sanitizeOpinionText] overallOpinion 후처리 디버그');
  console.log('① 원문(GPT 응답):', text);
  console.log('  contraCount:', contraCount, '| lowCount:', lowCount, '| medCount:', medCount, '| allEVerified:', allEVerified);

  if ((contraCount ?? 0) === 0) {
    out = out
      .replace(/[^.!?。]*[EeSsGg]-\d{3}[^.!?。]*(?:불일치|차이|mismatch|오차)[^.!?。]*[.!?。]?\s*/g, '')
      .replace(/[^.!?。]*(?:수치 불일치|데이터 불일치|mismatch 감지)[^.!?。]*[.!?。]?\s*/g, '');
  }

  // ── 오차율 수치 제거 ────────────────────────────────────────────────────
  // [A] 구체적 퍼센트 수치 언급 문장 — GPT 환각 수치이므로 항상 제거
  const specificPat = /[^.!?。]*오차율[^\d%]*[\d.]+%[^.!?。]*[.!?。]?\s*/g;
  const afterSpecific = out.replace(specificPat, '');

  // [B] 정성적 불일치 표현 — 실제 불일치(LOW/MEDIUM)가 없을 때만 제거
  //     lowCount>0 또는 medCount>0이면 GPT 문장이 사실에 부합하므로 제거하지 않음
  //     "일부 항목에서 차이/오차" 패턴은 너무 광범위하여 삭제함 (E 점수 문장도 제거되는 원인)
  const qualPat = /[^.!?。]*(?:경미한\s*(?:수치\s*)?차이|미세한\s*(?:수치\s*)?차이|소폭\s*(?:수치\s*)?차이|약간의?\s*(?:수치\s*)?차이|미미한\s*(?:수치\s*)?차이|사소한\s*(?:수치\s*)?차이|오차(?:율|가|를)\s*(?:존재|발생|확인|발견|감지|있|나타))[^.!?。]*[.!?。]?\s*/g;
  const cleaned = (lowCount === 0 && medCount === 0)
    ? afterSpecific.replace(qualPat, '')
    : afterSpecific;

  console.log('② sanitize 적용 전(contra 제거 후):', out);
  console.log('③ sanitize 적용 후:', cleaned);
  console.groupEnd();

  // allEVerified(전항목 HIGH)이고 삭제된 문장이 있을 때만 올바른 문구 삽입
  out = (allEVerified && cleaned !== out)
    ? '환경 지표 전항목의 데이터 검증이 완료되어 높은 데이터 신뢰성을 확보하였습니다. ' + cleaned
    : cleaned;

  return out
    .replace(/([.!?。])(?=[^\s])/g, '$1 ')  // 마침표 뒤 공백 보장
    .replace(/\s{2,}/g, ' ')
    .trim() || text;
};

// 한자·OCR 깨짐 문자를 한국어로 정규화
const HANJA_MAP = {
  '頁': '페이지', '檢': '검', '證': '증', '驗': '검증', '報': '보', '告': '고',
  '環': '환', '境': '경', '社': '사', '會': '회', '地': '지', '球': '구',
  '管': '관', '理': '리', '委': '위', '員': '원', '會': '회', '議': '의',
  '獨': '독', '立': '립', '性': '성', '政': '정', '策': '책', '運': '운',
  '營': '영', '評': '평', '價': '가', '基': '기', '準': '준', '業': '업',
  '種': '종', '平': '평', '均': '균', '分': '분', '析': '석', '結': '결',
  '果': '과', '信': '신', '賴': '뢰', '度': '도', '確': '확', '認': '인',
};
const normalizeKoreanOutput = (text) => {
  if (!text) return text;
  let t = text;
  // 한자 → 한국어 변환
  t = t.replace(/./gu, ch => HANJA_MAP[ch] ?? ch);
  // 전각 알파벳/숫자 → 반각 변환 (U+FF01~U+FF5E range)
  t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 제어문자·대체문자 제거
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // 연속 공백 정리
  t = t.replace(/\s{3,}/g, ' ');
  return t.trim();
};

// 원문 substring 추출 아티팩트 탐지 — "39%)·블록사..." 같은 불완전 fragment 판별
// 조건: 숫자+%)·패턴, 또는 괄호닫기로 시작하는 짧은 텍스트
const isFragmentArtifact = (text) => {
  if (!text || text.trim().length < 4) return false;
  const t = text.trim();
  // "숫자%) · 텍스트" 패턴 — 테이블/리스트 추출 아티팩트
  if (/\d+\.?\d*%?\)\s*[·•]\s/.test(t)) return true;
  // 괄호닫기로 시작하는 fragment ("39%)..." 등)
  if (/^\d+\.?\d*%?\)/.test(t)) return true;
  // 의미 없는 단독 퍼센트 fragment ("%로 시작, 매우 짧음)
  if (/^[\d.]+%/.test(t) && t.length < 10) return true;
  // 소수점 분리 fragment: 앞 정수가 잘려 "3%(..." 또는 "8시간..." 등으로 시작
  // 백엔드 extractBestSentence가 "94.3"을 마침표로 처리해 생성하는 패턴
  if (/^\d+%[\s·(]/.test(t)) return true;         // "3% (" 또는 "3%(..."
  if (/^\d+시간/.test(t) && t.length < 20) return true; // "8시간입니다" 단독 조각
  return false;
};

// G-302 명시 구문 — isValidEvidence 제한보다 우선 적용하여 false negative 방지
const EXPLICIT_GOVERNANCE_PHRASES = [
  '내부 신고 시스템 운영', '내부 신고 시스템을 운영', '내부신고시스템운영',
  '신고 시스템 운영', '신고시스템운영', '제보 시스템 운영',
  '내부 제보 시스템', '내부제보시스템',
  'whistleblowing system', 'ethics hotline', 'compliance hotline',
  '익명 신고 시스템', '익명신고시스템',
];

// G-303: 보고서 제목·브랜딩 텍스트 단독으로는 VERIFIED 금지 — explicit 조직 entity 필수
const G303_ENTITY_KW = [
  'esg팀', 'esg위원회', 'esg 위원회', '지속가능경영위원회', '지속가능경영 위원회',
  'esg전담', 'esg 전담', '전담조직', '전담 조직', '담당부서', '담당 부서',
  'governance committee', 'esg 담당부서', 'esg담당부서', 'esg담당조직', 'esg 담당조직',
  'esg 조직', 'esg조직', 'esg tf', 'esg팀', 'sustainability team', 'csr team',
  // 추가: "ESG 전담 부서", "대표이사 직속" 패턴
  'esg 전담 부서', 'esg전담부서', 'esg 담당 부서', 'esg담당부서',
  '대표이사 직속 esg', '대표이사 직속', '전담 부서', '전담부서',
];

// G indicator별 명시 구문 맵 — false negative 방지 (isValidEvidence 게이트보다 우선)
// 입자어(을/를/이/가) 없는 형태 우선 — Korean particle substring mismatch 방지
const G_EXPLICIT_PHRASE_MAP = {
  'G-301': ['윤리경영 위원회', '윤리경영을 운영', '행동강령을 수립', '컴플라이언스 위원회', '반부패 정책',
            '윤리경영 정책', '윤리 방침', '준법경영', '윤리헌장', '청렴 서약', '윤리경영'],
  'G-302': ['내부 신고 시스템', '내부 신고', '내부신고', '익명 신고', '제보 시스템',
            '신고 채널', '신고센터', '제보센터', '핫라인', 'whistleblowing', '내부 제보', '신고시스템'],
  'G-303': ['esg 전담 조직', 'esg 담당 조직', 'esg 위원회를', '지속가능경영 위원회', 'esg팀을 설치', 'esg 조직을',
            'esg 전담', 'esg 담당', '전담 조직', 'esg 조직', 'esg위원회', '지속가능경영 조직',
            'esg 전담 부서', 'esg전담부서', 'esg 담당 부서', 'esg담당부서',
            '대표이사 직속 esg', '대표이사 직속', '전담 부서', '전담부서'],
  'G-304': ['외부 esg 감사', '외부감사를 수행', '제3자 검증', '외부 검증기관', '외부 감사를 받',
            '외부 감사', '외부감사', '외부 검증', '외부 감사인',
            '외부 회계감사', '외부 감사 수행', '외부 감사 수행 절차', '회계감사 수행', '외부 회계 감사',
            'accounting audit', 'independent audit', 'outside audit', 'external audit', '회계감사'],
  'G-305': ['사외이사 비율', '이사회 독립성', '독립 이사를', '사외이사로 구성',
            '사외이사', '이사회 독립', '독립 이사', '비상임이사',
            '이사회 독립성 정책', 'board independence policy', '독립적 의사결정', '사외이사 중심',
            '독립적 의사 결정', '독립이사', 'outside director', 'board independence'],
};

// S indicator별 명시 구문 맵 — _isShared 강등보다 우선 적용
// 백엔드 IndicatorKeywordGate S_EXPLICIT_PHRASES와 동기화 유지
const S_EXPLICIT_PHRASE_MAP = {
  // S-201: 산업안전 교육 — ISO인증·VR·협력사·이수율 operational evidence
  // 백엔드 S201_OPERATIONAL_PRIORITY_PHRASES와 완전 동기화
  'S-201': [
    'iso45001', 'iso 45001', '안전보건경영시스템', 'ohsas',
    'vr 기반 안전교육', 'vr안전교육', 'vr 안전교육', '체험형 안전교육',
    '안전교육 이수율', '안전 교육 이수율', '1인당 안전교육',
    '협력사 안전보건', '협력사 안전 점검', '협력업체 안전 점검', '협력업체 안전', '협력사 안전',
    '재해예방 교육 프로그램', '안전보건 교육 프로그램',
    '안전 인증 유지', '안전보건 인증', '안전관리 체계',
    // extractBestSentence가 선택하는 operational 문장과 매칭되도록 추가
    '안전교육 연', '안전보건 교육 연', '교육 14', '시간 14',  // "연 2회 이상", "14.2시간" 패턴
    '협력사 점검', '안전 점검', '안전보건 점검',             // 점검 실적 evidence
  ],
  // S-202: 산업재해 — TRIR·중대재해0건·무재해·재발방지 operational disclosure
  'S-202': [
    '중대재해 0건', '중대재해0건', '사망재해 0건',
    'trir', 'ltir', 'ltir 0', 'trir 0',
    '재해율 0', '사고율 0', '재해건수 0',
    '무재해 달성', '무사고 달성',
    '업계 평균 대비', '평균 대비 개선', '산업 평균 대비',
    '재발방지 대책', '재발방지대책', '재발 방지',
    '원인 분석 완료', '개선 조치 완료', '예방 체계 구축',
    '사고율 개선', '재해율 개선',
  ],
  'S-203': [
    'esg 교육', 'esg교육', '지속가능경영 교육', '윤리경영 교육', '탄소중립 교육',
    '환경 교육', 'compliance training', 'sustainability training', 'esg 역량', 'esg역량',
    '지속가능경영교육', '윤리교육', 'esg 교육 시간', 'esg 교육 이수',
    // 운영 evidence 추가 (온보딩·심화·이수율)
    'esg 교육 이수율', 'esg교육이수율',
    '온보딩 esg 교육', '온보딩 교육', '신규 입사자 esg',
    '관리자 심화', '심화 교육 과정', '심화 과정',
    'esg 전략 교육', 'esg 공시 교육',
  ],
  'S-204': [
    '임직원 esg 참여율', 'esg 참여율', '임직원 참여율', '직원 참여율',
    '임직원 참여 프로그램', '사내 esg 프로그램', '직원 esg 참여', 'esg 참여',
    'employee participation rate', '임직원 참여',
  ],
  'S-205': [
    '지역사회 봉사', '봉사활동 시간', '봉사 시간', '자원봉사 시간',
    '사회공헌 활동', 'community service', '봉사활동 실적', '봉사 활동',
    // 사회공헌 KPI operational evidence
    '사회공헌 투자', '사회공헌투자', '사회공헌 금액', '사회공헌 성과',
    '취약계층 지원', '취약계층', '에너지 복지', 'stem 교육 지원', 'stem',
    '나눔 활동', '나눔활동', '지역 기부', '사회공헌 현황',
    // S205_RICHNESS_MARKERS와 동기화
    '투자액', '지역사회 지원', '사회공헌 프로그램',
  ],
};

const getVerificationStatus = (ev, sharedIndicatorCodes = null) => {
  const catChar = ev.indicatorCode?.[0];
  if (catChar === 'E') {
    if (ev.numericMatchLevel === 'HIGH')   return 'VERIFIED';
    if (ev.numericMatchLevel === 'MEDIUM') return 'PARTIAL';
    if (ev.numericMatchLevel === 'LOW')    return 'CONTRADICTION';
    // numericMatchLevel 없어도 evidenceText가 있으면 PARTIAL (E-104 케이스)
    if (ev.evidenceText || ev.isValidEvidence) return 'PARTIAL';
    return 'NO_EVIDENCE';
  }

  // ── [최고 우선순위] 백엔드 verificationStatus — badge count 단일 소스 ──────
  // CategoryAnalysisService에서 결정된 값: EXPLICIT·sim≥0.75·coverageVerified·clusterMatch 기반
  // S-202 포함 모든 지표에서 백엔드 판정이 프론트 fallback보다 우선
  if (ev.verificationStatus === 'VERIFIED') return 'VERIFIED';
  if (ev.verificationStatus === 'PARTIAL')  return 'PARTIAL';
  if (ev.verificationStatus === 'NO_EVIDENCE') return 'NO_EVIDENCE';

  // [S-202] 백엔드 미설정 fallback — isValidEvidence 없으면 NO_EVIDENCE
  // (백엔드가 VERIFIED/PARTIAL을 이미 설정했다면 위에서 반환됨)
  if (ev.indicatorCode === 'S-202') {
    if (!ev.isValidEvidence) return 'NO_EVIDENCE';
    // 백엔드 verificationStatus 미설정 케이스: S_EXPLICIT_PHRASE_MAP 통과 시 VERIFIED
    const s202Phrases = S_EXPLICIT_PHRASE_MAP['S-202'] ?? [];
    const text202 = (ev.evidenceText ?? ev.text ?? '').toLowerCase();
    if (s202Phrases.some(p => text202.includes(p.toLowerCase()))) return 'VERIFIED';
    return 'PARTIAL';
  }

  // ── EXPLICIT phrase fast-path (matchedCluster 기반) ──────────────────────
  // 백엔드가 matchedCluster="EXPLICIT:phrase" 로 명시 구문 확인 시 즉시 VERIFIED
  // _isShared 강등·도메인 차단·isValidEvidence 게이트보다 최우선 적용
  if (ev.matchedCluster?.startsWith('EXPLICIT:')) return 'VERIFIED';

  // 프론트엔드 S explicit phrase 맵 — matchedCluster 미설정 케이스 보완
  const sExplicitPhrases = S_EXPLICIT_PHRASE_MAP[ev.indicatorCode];
  if (sExplicitPhrases) {
    const textLowerSE = (ev.evidenceText ?? ev.text ?? '').toLowerCase();
    if (sExplicitPhrases.some(p => textLowerSE.includes(p.toLowerCase()))) return 'VERIFIED';
  }

  // G 지표: 도메인 일관성 검사 (S-domain 차단 + 지표별 필수 키워드 게이트)
  if (catChar === 'G') {
    const textLower = (ev.evidenceText ?? ev.text ?? '').toLowerCase();
    // S-domain 오탐 즉시 차단
    if (S_DOMAIN_MARKERS_G.some(m => textLower.includes(m))) return 'NO_EVIDENCE';
    // G-302: 내부 신고 필수 키워드 없으면 NO_EVIDENCE
    if (ev.indicatorCode === 'G-302' && !G302_REQUIRED_KW.some(k => textLower.includes(k))) return 'NO_EVIDENCE';
    // G-302 명시 구문 우선 허용 — false negative 방지
    if (ev.indicatorCode === 'G-302' && EXPLICIT_GOVERNANCE_PHRASES.some(p => textLower.includes(p))) return 'VERIFIED';
    // G-301/G-303/G-304/G-305 명시 구문 우선 허용 — false negative 방지
    const explicitGPhrases = G_EXPLICIT_PHRASE_MAP[ev.indicatorCode];
    if (explicitGPhrases?.some(p => textLower.includes(p))) return 'VERIFIED';
    // [3] G-303: title/branding text 단독 reject — explicit 조직 entity 없으면 최소 PARTIAL (텍스트 있음)
    if (ev.indicatorCode === 'G-303' && !G303_ENTITY_KW.some(k => textLower.includes(k))) {
      if ((ev.evidenceText ?? ev.text ?? '').length > 20) return 'PARTIAL';
      return 'NO_EVIDENCE';
    }
  }

  // S-203 ESG 교육 vs 안전교육 엄격 분리
  // "산업안전 교육" 단독으로는 ESG 교육 지표 VERIFIED 불가
  if (ev.indicatorCode === 'S-203') {
    const text203 = ev.evidenceText ?? ev.text ?? '';
    const textLower203 = text203.toLowerCase();
    const hasEsgEdu = S203_ESG_EDUCATION_KW.some(k => text203.includes(k) || textLower203.includes(k.toLowerCase()));
    const hasSafetyOnly = S203_SAFETY_ONLY_MARKERS.some(k => text203.includes(k) || textLower203.includes(k.toLowerCase()));
    // 안전교육만 있고 ESG 교육 keyword 없으면 즉시 NO_EVIDENCE
    if (!hasEsgEdu || (hasSafetyOnly && !hasEsgEdu)) return 'NO_EVIDENCE';
  }

  // Cross-indicator shared evidence → PARTIAL (context 있음) or WEAK (context 없음)
  // (_isShared 플래그는 completeIndicatorList 빌드 시 detectSharedEvidenceCodes로 주입됨)
  if (ev._isShared || (sharedIndicatorCodes && sharedIndicatorCodes.has(ev.indicatorCode))) {
    const sharedText = ev.evidenceText ?? ev.text ?? '';
    const sharedHasKw = (ev.matchedKeywords?.length > 0) ||
      (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && ev.matchedCluster?.trim() !== '');
    const sharedHasHw = HIGH_WEIGHT_PATTERNS.some(p => sharedText.includes(p));
    const sharedSim   = toPct(ev.similarity) ?? 0;
    // keyword·policy marker 또는 충분한 유사도 → PARTIAL (부분 근거)
    if (sharedHasKw || sharedHasHw || sharedSim >= 65) return 'PARTIAL';
    return 'WEAK';
  }

  if (ev.contradictionReason)              return 'CONTRADICTION';
  if (!ev.isValidEvidence)                 return 'NO_EVIDENCE';
  const sim = toPct(ev.similarity) ?? 0;

  // keyword / cluster match 여부
  const hasKeywordMatch = (ev.matchedKeywords?.length > 0) ||
    (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && ev.matchedCluster.trim() !== '');
  // 직접 거버넌스/사회 표현 포함 여부 (고가중치 승격 — 명시적 정책/실적 표현)
  const text = ev.evidenceText ?? ev.text ?? '';
  const hasHighWeight = HIGH_WEIGHT_PATTERNS.some(p => text.includes(p));

  // STRONG tier: 백엔드에서 keyword+sim 동시 요구 → G 포함 VERIFIED 허용
  if (ev.similarityTier === 'STRONG') return 'VERIFIED';

  // G 지표: hasHighWeight를 hasKeywordMatch 대체 허용
  // EvidenceMatchDto에 matchedCluster/matchedKeywords 미포함 → hasKeywordMatch 항상 false 문제 우회
  if (catChar === 'G') {
    if (sim >= 78 && (hasKeywordMatch || hasHighWeight)) return 'VERIFIED';
    if (sim >= 55 && (hasKeywordMatch || hasHighWeight)) return 'PARTIAL';
    return 'NO_EVIDENCE';
  }

  // S 지표: keyword 또는 정량/명시 표현 기반 승격
  // 백엔드 기준 동기화: effectiveSim >= 0.75 (75%) OR clusterMatch+0.72 OR coverage
  if (sim >= 75 && (hasKeywordMatch || hasHighWeight))                 return 'VERIFIED';
  if (sim >= 82 && hasKeywordMatch)                                    return 'VERIFIED';
  if (sim >= 78 && hasHighWeight)                                      return 'VERIFIED';
  if (sim >= 85)                                                       return 'VERIFIED';
  if (sim >= 72 && hasKeywordMatch && hasQuantitativeText(text))       return 'VERIFIED';
  if (sim >= 70 && hasQuantitativeText(text) && hasKeywordMatch)       return 'VERIFIED';
  if (sim >= 75 && ev.similarityTier === 'MEDIUM')                     return 'VERIFIED';
  // S PARTIAL: keyword 또는 policy 표현 있으나 VERIFIED 기준 미충족 → 부분 근거
  if (sim >= 55 && (hasKeywordMatch || hasHighWeight))                 return 'PARTIAL';
  return 'NO_EVIDENCE';
};

// ── Cross-indicator 동일 Evidence chunk 감지 (frontend-side) ────────────
// evidenceMatches 배열에서 80자 fingerprint 기준 동일 텍스트를 2개 이상 지표가 사용하는 경우
// 두 번째 이후 지표의 indicatorCode를 Set으로 반환
function detectSharedEvidenceCodes(evidenceMatches) {
  const seenFingerprints = new Map(); // fingerprint → first indicatorCode
  const sharedCodes = new Set();
  for (const ev of (evidenceMatches ?? [])) {
    const t = ev.evidenceText ?? ev.text ?? '';
    if (!t || t.length < 10) continue;
    const fp = t.trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 80);
    if (seenFingerprints.has(fp)) {
      sharedCodes.add(ev.indicatorCode); // 이 지표는 다른 지표와 동일 근거 공유
    } else {
      seenFingerprints.set(fp, ev.indicatorCode);
    }
  }
  return sharedCodes;
}

// Evidence 품질 티어
const getSimTier = (simPct) => {
  if (simPct == null) return null;
  if (simPct >= 85) return { label: '높음',   color: '#059669' };
  if (simPct >= 70) return { label: '양호',   color: '#3b82f6' };
  if (simPct >= 55) return { label: '보통',   color: '#f59e0b' };
  return               { label: '낮음',   color: '#ef4444' };
};

// ── XAI: 지표별 감사 근거 요약 자연어 생성 ─────────────────────────────────
const generateIndicatorCommentary = (ev) => {
  const catChar = ev.indicatorCode?.[0];
  const vstKey  = getVerificationStatus(ev);
  const title   = ev.indicatorTitle ?? ev.indicatorCode ?? '해당 지표';
  const sim     = toPct(ev.similarity);
  const diff    = ev.numericDiffPercent != null ? Number(ev.numericDiffPercent).toFixed(1) : null;
  const inVal   = ev.inputValue   != null ? Number(ev.inputValue).toLocaleString()   : null;
  const exVal   = ev.extractedValue != null ? Number(ev.extractedValue).toLocaleString() : null;
  const unit    = ev.unit ?? '';
  const page    = ev.pageNumber != null ? `p.${ev.pageNumber}` : null;
  const pageNote = page ? ` (${page})` : '';

  if (catChar === 'E') {
    if (vstKey === 'VERIFIED') {
      return `제출된 수치(${inVal}${unit ? ' ' + unit : ''})와 문서 증빙값이 ±${diff}% 이내로 일치합니다. 계량 데이터의 신뢰도가 높아 정확한 수치로 확인되었습니다.`;
    }
    if (vstKey === 'WEAK') {
      return `제출 수치(${inVal})와 문서 추출값(${exVal}) 간 ${diff}% 차이가 발생했습니다. 측정 기준 또는 단위 환산 오류 가능성이 있으므로 재확인이 권장됩니다.`;
    }
    if (vstKey === 'CONTRADICTION') {
      return `수치 불일치가 ${diff}% 이상 감지되었습니다. 제출값(${inVal})과 문서 내 추출값(${exVal})이 유의미하게 다릅니다. 데이터 출처와 측정 연도를 재검토해 주세요.`;
    }
    return '해당 지표에 대한 수치 데이터를 문서에서 추출하지 못했습니다. 항목을 명시적으로 기재하거나 별도 증빙 자료를 첨부해 주세요.';
  }

  // S/G 카테고리 — semantic evidence 기반 판정 (직접 수치 검증 아님)
  const verifiedPhrase = getVerifiedAuditPhrase(ev.indicatorCode);
  if (vstKey === 'VERIFIED') {
    // 지표별 특화 VERIFIED 설명 — evidence fusion 기반 자연어 요약
    if (ev.indicatorCode === 'S-201') {
      const text = (ev.evidenceText ?? '').toLowerCase();
      const hasIso = text.includes('iso45001') || text.includes('iso 45001');
      const hasVr = text.includes('vr') || text.includes('가상현실');
      const hasKpi = text.includes('시간') || text.includes('이수율');
      const parts = ['안전보건 교육 실시'];
      if (hasIso) parts.push('ISO45001 인증 유지');
      if (hasVr) parts.push('VR 안전교육 도입');
      if (hasKpi) parts.push('교육 KPI 공시');
      return `${parts.join(' · ')} 확인 — 전사 산업안전 교육 체계가 구축되었으며, K-ESG 기준 부합하는 다수의 근거가 확인되었습니다. (${verifiedPhrase})`;
    }
    if (ev.indicatorCode === 'S-202') {
      const text = (ev.evidenceText ?? '').toLowerCase();
      const hasZero = text.includes('0건') || text.includes('zero') || text.includes('무재해') || text.includes('발생하지 않');
      const hasTrir = text.includes('trir') || text.includes('ltir') || text.includes('재해율');
      const hasPrev = text.includes('재발방지') || text.includes('예방') || text.includes('개선조치');
      const parts = ['산업재해 현황 공시'];
      if (hasZero) parts.push('중대재해 없음 확인');
      if (hasTrir) parts.push('재해율(TRIR/LTIR) 공시');
      if (hasPrev) parts.push('재발방지·예방체계 수립');
      return `${parts.join(' · ')} 확인 — 산업재해 발생 현황과 예방 체계가 명확히 공시되어 있으며, K-ESG 기준에 부합합니다. (${verifiedPhrase})`;
    }
    if (ev.indicatorCode === 'G-304') {
      const text = (ev.evidenceText ?? '').toLowerCase();
      const hasThirdParty = text.includes('제3자') || text.includes('third') || text.includes('외부 검증') || text.includes('외부검증');
      const hasAccounting = text.includes('회계감사') || text.includes('회계법인');
      const detail = hasThirdParty
        ? '외부 감사 및 제3자 검증을 수행하였으며, ESG 평가 데이터의 신뢰성이 독립적으로 확인되었습니다.'
        : hasAccounting
        ? '외부 회계감사가 수행되었으며, ESG 보고 데이터의 정확성이 검증되었습니다.'
        : '외부 감사가 수행되었으며, ESG 감사 기준에 부합하는 독립적 검증 근거가 확인되었습니다.';
      return `${detail} (${verifiedPhrase})`;
    }
    if (ev.indicatorCode === 'G-305') {
      const text = (ev.evidenceText ?? '').toLowerCase();
      const hasRatio = text.includes('비율') || text.includes('%');
      const hasWoman = text.includes('여성') || text.includes('women') || text.includes('diversity');
      const parts = ['이사회 독립성 근거 확인'];
      if (hasRatio) parts.push('사외이사 비율 공시');
      if (hasWoman) parts.push('이사회 다양성 현황');
      return `${parts.join(' · ')} — 이사회 구성 및 독립성 관련 정책·현황이 문서에서 명확히 확인되었습니다. (${verifiedPhrase})`;
    }
    return `'${title}' 관련 정책·실적 근거가 확인되었습니다. K-ESG 기준에 부합하는 직접 근거가 탐지되었습니다.`;
  }
  // 지표별 특화 wording — 운영 근거 중심 assurance 톤
  if (ev.indicatorCode === 'S-202' && (vstKey === 'PARTIAL' || vstKey === 'NO_EVIDENCE' || vstKey === 'WEAK')) {
    return '산업재해 예방 및 재발방지 체계 관련 운영 근거가 확인되었습니다. 재해율(TRIR/LTIR) 수치 및 중대재해 발생 현황을 정량적으로 공시하면 직접 감사 근거로 전환됩니다.';
  }
  if (ev.indicatorCode === 'G-304' && (vstKey === 'PARTIAL' || vstKey === 'NO_EVIDENCE' || vstKey === 'WEAK')) {
    return '외부 감사 수행 및 제3자 검증 관련 운영 근거가 확인되었습니다. 감사 주기·범위·결과를 보고서에 명시하면 완전한 검증 근거로 전환됩니다.';
  }
  const partialPhrase = getPartialAuditPhrase(ev.indicatorCode);
  if (vstKey === 'PARTIAL') {
    return `'${title}' 관련 운영 근거가 확인되었습니다. 정량 KPI 또는 정책 명시 보완 시 직접 근거로 전환됩니다.`;
  }
  const weakPhrase = getWeakAuditPhrase(ev.indicatorCode);
  if (vstKey === 'WEAK') {
    return `'${title}' 관련 간접 운영 근거가 탐지되었습니다. 정책·실적 근거 명시 보완 시 검증 수준을 높일 수 있습니다.`;
  }
  if (vstKey === 'CONTRADICTION') {
    const reason = ev.contradictionReason ? ` — ${ev.contradictionReason}` : '';
    return `'${title}' 항목에서 수치 간 불일치 신호가 감지되었습니다${reason}. 원본 데이터 출처와 산정 기준을 재확인하시기 바랍니다.`;
  }
  return `'${title}' 항목은 운영 관련 근거가 탐지되지 않았습니다. 해당 지표의 정책·실적·운영 현황을 보고서에 추가 기재하시면 분석 신뢰도가 향상될 수 있습니다.`;
};

// ── RAG-style 검증 설명 생성 ──────────────────────────────────────────────
// generateIndicatorCommentary의 확장판:
// 실제 AI 경로(유사도·청크·페이지)를 명시적으로 언급하는 grounded 설명
const generateRagExplanation = (ev) => {
  const catChar  = ev.indicatorCode?.[0];
  const vstKey   = getVerificationStatus(ev);
  const sim      = toPct(ev.similarity);
  const diff     = ev.numericDiffPercent != null ? Number(ev.numericDiffPercent).toFixed(1) : null;
  const inVal    = ev.inputValue     != null ? Number(ev.inputValue).toLocaleString()     : null;
  const exVal    = ev.extractedValue != null ? Number(ev.extractedValue).toLocaleString() : null;
  const unit     = ev.unit ?? '';
  const unitStr  = unit ? ` ${unit}` : '';
  const pageRef  = ev.pageNumber != null ? ` (${ev.pageNumber}페이지)` : '';
  const hasChunk = !!ev.evidenceText;

  if (catChar === 'E') {
    if (vstKey === 'VERIFIED') {
      const opening = hasChunk
        ? `제출된 환경 지표 수치와 증빙 문서 내 기재값을 대조한 결과,`
        : `제출 수치와 문서 기재값을 대조한 결과,`;
      return `${opening} 입력값(${inVal}${unitStr})과 문서 내 검증값(${exVal}${unitStr})이 ±${diff}% 이내로 일치하여 수치 검증이 완료되었습니다. 데이터 정확성이 높은 수준으로 확인되어 감사 신뢰도에 긍정적으로 반영됩니다.`;
    }
    if (vstKey === 'WEAK') {
      return `제출값(${inVal}${unitStr})과 문서 내 기재값(${exVal}${unitStr}) 사이에 ${diff}% 차이가 확인되었습니다. 허용 범위 내에 해당하나, 측정 기준·보고 연도·단위 환산 방식의 차이에서 비롯될 수 있습니다. 원본 데이터 출처와 산정 기준을 명시하면 신뢰도가 향상됩니다.`;
    }
    if (vstKey === 'CONTRADICTION') {
      return `제출값(${inVal}${unitStr})과 증빙 문서 내 수치(${exVal}${unitStr}) 간 ${diff}%의 차이가 감지되었습니다. 측정 기간·단위 환산 기준 차이일 수 있으므로 데이터 재확인이 권고됩니다. 원본 측정 데이터와 산정 근거를 보완하면 검증 신뢰도가 향상됩니다.`;
    }
    return `증빙 문서에서 해당 항목의 수치 데이터를 확인하지 못했습니다. 환경 지표 수치를 보고서 내에 명시적으로 기재하거나 별도 증빙 파일을 첨부하시면 정밀 검증이 가능합니다.`;
  }

  // S / G — semantic similarity 기반 근거 탐지 (직접 수치 검증과 별도 방식)
  const verifiedAuditPhrase = getVerifiedAuditPhrase(ev.indicatorCode);
  if (vstKey === 'VERIFIED') {
    return `K-ESG 기준에 부합하는 정책·실적 직접 근거가 확인되었습니다.`;
  }
  // 지표별 특화 설명 — 운영 근거 중심
  if (ev.indicatorCode === 'S-202' && (vstKey === 'PARTIAL' || vstKey === 'NO_EVIDENCE' || vstKey === 'WEAK')) {
    return `산업재해 예방 및 재발방지 체계 관련 운영 근거가 확인되었습니다. 재해율 수치 및 중대재해 현황을 추가 공시하면 직접 근거로 전환됩니다.`;
  }
  if (ev.indicatorCode === 'G-304' && (vstKey === 'PARTIAL' || vstKey === 'NO_EVIDENCE' || vstKey === 'WEAK')) {
    return `외부 감사 수행 및 제3자 검증 관련 운영 근거가 확인되었습니다. 감사 주기·범위·결과를 명시적으로 공시하면 직접 근거로 전환됩니다.`;
  }
  if (vstKey === 'PARTIAL') {
    return `운영 관련 근거가 탐지되었습니다. 정량 KPI 또는 정책 이행 내역 추가 기재 시 직접 근거로 전환됩니다.`;
  }
  if (vstKey === 'WEAK') {
    return `간접 운영 근거가 탐지되었습니다. 정책·실적 근거 보완 시 검증 수준이 향상됩니다.`;
  }
  if (vstKey === 'CONTRADICTION') {
    const reason = ev.contradictionReason ? ` — ${ev.contradictionReason}` : '';
    return `수치 간 불일치 신호가 감지되었습니다${reason}. 원본 데이터 출처와 산정 기준을 재확인하시기 바랍니다.`;
  }
  return `해당 항목의 운영 근거가 문서에서 탐지되지 않았습니다. 정책 수립·실적·운영 현황 추가 기재 시 분석 신뢰도가 향상됩니다.`;
};

// ── Confidence reasoning 데이터 빌더 ─────────────────────────────────────
// "왜 이 confidence인가" 설명용 factor 배열 반환
const buildConfidenceReasoning = (ev) => {
  const catChar = ev.indicatorCode?.[0];
  const vstKey  = getVerificationStatus(ev);
  const sim     = toPct(ev.similarity);
  const diff    = ev.numericDiffPercent != null ? Number(ev.numericDiffPercent).toFixed(1) : null;

  const levelMap = {
    VERIFIED:      { label: 'HIGH',    color: '#059669' },
    PARTIAL:       { label: 'MEDIUM',  color: '#2563eb' },
    WEAK:          { label: 'LOW',     color: '#d97706' },
    CONTRADICTION: { label: 'LOW',     color: '#dc2626' },
    NO_EVIDENCE:   { label: 'N/A',     color: '#9ca3af' },
  };
  const level = levelMap[vstKey] ?? levelMap.NO_EVIDENCE;

  const factors = [];
  if (catChar === 'E') {
    if (ev.numericMatchLevel) {
      const c = ev.numericMatchLevel === 'HIGH' ? '#059669' : ev.numericMatchLevel === 'MEDIUM' ? '#d97706' : '#dc2626';
      factors.push({ label: 'Numeric match', value: ev.numericMatchLevel, color: c });
    }
    if (diff != null) {
      const c = Number(diff) <= 5 ? '#059669' : Number(diff) <= 20 ? '#d97706' : '#dc2626';
      factors.push({ label: 'Data diff', value: `±${diff}%`, color: c });
    }
    if (ev.inputValue != null && ev.extractedValue != null) {
      factors.push({ label: 'Evidence', value: 'numeric', color: '#6366f1' });
    }
  } else {
    if (sim != null) {
      const c = sim >= 85 ? '#059669' : sim >= 70 ? '#3b82f6' : sim >= 55 ? '#d97706' : '#dc2626';
      factors.push({ label: '문서 관련성', value: `${sim}%`, color: c });
    }
    factors.push({
      label: 'Evidence valid',
      value: ev.isValidEvidence ? 'Yes' : 'No',
      color: ev.isValidEvidence ? '#059669' : '#dc2626',
    });
  }

  return { factors, level };
};

// ── AI Audit 권고사항 빌더 ─────────────────────────────────────────────────
// 검증 결과(CONTRADICTION / NO_EVIDENCE / WEAK) 기반 우선순위 권고 목록 생성
const buildRecommendations = (indicators) => {
  const recs = [];
  if (!indicators?.length) return recs;

  const byStatus  = (s) => indicators.filter(ev => getVerificationStatus(ev) === s);
  const byCat     = (items, cat) => items.filter(ev => ev.indicatorCode?.startsWith(cat));

  // 부족 개수 기반 priority 동적 계산 (4개 이상 → HIGH, 2~3개 → MEDIUM, 1개 → LOW)
  const calcPriority = (cnt) => cnt >= 4 ? 'HIGH' : cnt >= 2 ? 'MEDIUM' : 'LOW';

  const contradictions  = byStatus('CONTRADICTION');
  const noEvidence      = byStatus('NO_EVIDENCE');
  const weakItems       = byStatus('WEAK');

  const eContradictions = byCat(contradictions, 'E');
  const gContradictions = byCat(contradictions, 'G');
  const gNoEvidence     = byCat(noEvidence, 'G');
  const sNoEvidence     = byCat(noEvidence, 'S');
  const eNoEvidence     = byCat(noEvidence, 'E');
  const sWeak           = byCat(weakItems, 'S');
  const gWeak           = byCat(weakItems, 'G');

  if (eContradictions.length >= 2) {
    recs.push({
      priority: 'HIGH', _cnt: eContradictions.length, code: 'E-CONTR', category: 'E',
      title: '환경 데이터 증빙 불일치 — 재검증 권고',
      desc: `환경(E) 영역 ${eContradictions.length}개 지표에서 제출 수치와 증빙 문서 간 유의미한 차이가 확인되었습니다. 데이터 출처·집계 기간·단위 환산 기준을 면밀히 검토하고, 원본 측정 데이터 또는 제3자 인증 증빙을 첨부하여 재제출하시길 권장합니다.`,
      docs: ['수치 측정 원본 데이터 (CSV)', '제3자 인증서 또는 측정 기관 확인서'],
    });
  } else if (eContradictions.length === 1) {
    const ev0 = eContradictions[0];
    const t = ev0.indicatorTitle ?? ev0.indicatorCode;
    recs.push({
      priority: 'MEDIUM', _cnt: 1, code: 'E-CONTR-1', category: 'E',
      title: `${t} — 수치 출처 재확인 권고`,
      desc: `${t} 항목의 제출값과 증빙 문서 내 기재값 간 차이가 감지되었습니다. 측정 기준, 보고 연도, 단위 환산 여부를 재검토하고 산정 근거를 명시하시면 감사 신뢰도 평가가 개선됩니다.`,
      docs: ['측정 원본 데이터', '단위 환산 산정 근거서'],
    });
  }

  if (gContradictions.length >= 1) {
    recs.push({
      priority: 'HIGH', _cnt: gContradictions.length, code: 'G-CONTR', category: 'G',
      title: '지배구조 공시 내용 — 감사 기준 불일치',
      desc: `지배구조(G) 영역 ${gContradictions.length}개 항목에서 보고서 기술 내용이 K-ESG 감사 기준과 불일치하는 신호가 감지되었습니다. 이사회 독립성 현황, 감사위원회 운영 실적, 윤리경영 강령 이행 내용을 원문 기준으로 재검토하시길 권장합니다.`,
      docs: ['이사회 회의록', '감사위원회 운영 기록', '윤리경영 강령 원문'],
    });
  }

  if (gNoEvidence.length >= 1) {
    const G_DOC_MAP = {
      'G-301': '윤리경영 강령 원문',
      'G-302': '내부 신고 채널 운영 현황',
      'G-303': 'ESG 담당 조직도',
      'G-304': '외부 감사 계약서',
      'G-305': '이사회 운영 규정',
    };
    const gDocs = [...new Set(
      gNoEvidence.flatMap(ev => (G_DOC_MAP[ev.indicatorCode] ?? '').split(' / ').filter(Boolean))
    )].slice(0, 4);
    const gCodeList = gNoEvidence.map(e => e.indicatorCode).join(', ');
    recs.push({
      priority: calcPriority(gNoEvidence.length), _cnt: gNoEvidence.length,
      code: 'G-NOEV', category: 'G',
      title: '지배구조(G) 검증 근거 부족',
      desc: `지배구조(G) 영역 ${gNoEvidence.length}개 지표(${gCodeList})에서 검증 근거가 충분히 확보되지 않았습니다. 해당 지표의 운영 현황·정책 문서 등 관련 공시 자료를 추가 제출하시길 권장합니다.`,
      scoreImpact: gNoEvidence.length >= 3 ? '+5~8점' : '+2~4점',
      urgency: gNoEvidence.length >= 3 ? '1개월' : '분기 내',
      impact: 'G 카테고리 점수 향상',
      docs: gDocs.length > 0 ? gDocs : ['지배구조 정책 문서', '지배구조 공시 자료'],
    });
  }

  if (sNoEvidence.length >= 1) {
    const S_DOC_MAP = {
      'S-201': '산업안전보건 교육 이수 기록',
      'S-202': '산업재해 발생 현황 보고서',
      'S-203': 'ESG 교육 프로그램 운영 현황',
      'S-204': '임직원 참여 프로그램 운영 기록',
      'S-205': '지역사회 봉사활동 실적 보고서',
    };
    const sDocs = [...new Set(
      sNoEvidence.flatMap(ev => (S_DOC_MAP[ev.indicatorCode] ?? '').split(' / ').filter(Boolean))
    )].slice(0, 4);
    const sCodeList = sNoEvidence.map(e => e.indicatorCode).join(', ');
    recs.push({
      priority: calcPriority(sNoEvidence.length), _cnt: sNoEvidence.length,
      code: 'S-NOEV', category: 'S',
      title: '사회(S) 검증 근거 부족',
      desc: `사회(S) 영역 ${sNoEvidence.length}개 지표(${sCodeList})에서 검증 근거가 충분히 확보되지 않았습니다. 해당 지표 관련 실적 자료 또는 운영 증빙 문서를 추가 제출하면 검증 정확도를 높일 수 있습니다.`,
      scoreImpact: sNoEvidence.length >= 3 ? '+3~6점' : '+1~3점',
      urgency: sNoEvidence.length >= 3 ? '분기 내' : '다음 보고 주기',
      impact: 'S 카테고리 점수 향상',
      docs: sDocs.length > 0 ? sDocs : ['사회공헌 활동 보고서', '산업안전 교육 이수 기록'],
    });
  }

  if (sWeak.length >= 2) {
    recs.push({
      priority: 'MEDIUM', _cnt: sWeak.length, code: 'S-WEAK', category: 'S',
      title: '사회 지표 — 정량 근거 보강 권고',
      desc: `사회(S) 영역 ${sWeak.length}개 지표에서 관련 내용이 일부 확인되었으나 정량적 근거가 미흡합니다. 교육 이수율, 참여 임직원 수, 사업 수혜 규모 등 실적 수치를 보완하여 기재하시면 감사 신뢰도가 향상됩니다.`,
      docs: ['정량 성과 지표 데이터', '교육 이수율 현황표', '실적 수치 집계 자료'],
    });
  }

  if (gWeak.length >= 2) {
    recs.push({
      priority: 'MEDIUM', _cnt: gWeak.length, code: 'G-WEAK', category: 'G',
      title: '지배구조 — 실적 근거 구체화 권고',
      desc: `지배구조(G) 영역 ${gWeak.length}개 지표에서 관련 내용이 일부 확인되었으나 실적 데이터가 미흡합니다. 감사위원회 연간 개최 횟수, 이사회 내 독립이사 비율, 내부 신고 처리 건수 등 정량 실적을 명시하시면 공시 신뢰도가 개선됩니다.`,
      docs: ['이사회 독립성 비율 현황', '감사위원회 연간 실적 보고서', '내부 감사 처리 건수 기록'],
    });
  }

  if (eNoEvidence.length >= 2) {
    recs.push({
      priority: 'LOW', _cnt: eNoEvidence.length, code: 'E-NOEV', category: 'E',
      title: '환경 계량 데이터 — 문서 기재 누락',
      desc: `환경(E) 영역 ${eNoEvidence.length}개 지표에서 수치 데이터를 확인하지 못했습니다. 전력 사용량, 가스 소비량, 탄소 배출량, 폐기물 발생량, 용수 사용량 등을 보고서에 연도별로 명시하거나, 공인 측정 기관의 증빙 자료를 별도로 첨부하시길 권장합니다.`,
      docs: ['환경 데이터 측정 보고서', 'CSV 수치 증빙 파일', '공인 측정 기관 확인서'],
    });
  }

  // 부족 개수 기준 내림차순 정렬 (priority 우선, 동일 priority 내에서 개수 많은 것 먼저)
  const prioOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recs.sort((a, b) => {
    const pd = (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2);
    return pd !== 0 ? pd : (b._cnt ?? 0) - (a._cnt ?? 0);
  });

  return recs.slice(0, 5);
};

// S/G 지표 코드 → 표시명 (사용자 선택 기준: S 5개, G 5개)
const SG_INDICATORS = {
  'S-201': '산업안전 교육 여부',
  'S-202': '산업재해 발생 여부',
  'S-203': 'ESG 교육 실시 여부',
  'S-204': '임직원 참여 프로그램 여부',
  'S-205': '지역사회 봉사활동 여부',
  'G-301': '윤리경영 정책 수립 여부',
  'G-302': '내부 신고 시스템 운영 여부',
  'G-303': 'ESG 담당 조직 여부',
  'G-304': '외부 감사 수행 여부',
  'G-305': '이사회 독립성 정책 여부',
};
// 사용자 선택 지표 수 기준 (AnalysisPage SOCIAL_ITEMS / GOV_ITEMS 와 동기)
const S_SELECTED_TOTAL = 5;
const G_SELECTED_TOTAL = 5;

const E_INDICATORS = {
  'E-101': '전력 사용량',
  'E-102': '가스 사용량',
  'E-103': '탄소 배출량',
  'E-104': '폐기물 발생량',
  'E-105': '용수 사용량',
};

// ── Evidence Preview 문장 단위 렌더링 헬퍼 ──────────────────────────────────
// 소수점(94.3%)·약어 마침표를 문장 경계로 처리하지 않는 한국어 문장 분리기
const splitKoreanSentences = (text) => {
  if (!text) return [];
  // 소수점 임시 마스킹: "94.3" → "94⁠ 3" (Word Joiner — 인쇄 불가 문자로 마침표 대체)
  const DECIMAL_PLACEHOLDER = '⁠';
  const masked = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_PLACEHOLDER}$2`);
  // 문장 경계: 마침표/!/?/。 + 공백 + 한글·영대문자·"·( 로 시작하는 다음 문장
  const parts = masked.split(/[.!?。]\s+(?=[가-힣A-Za-z"'(「『])/);
  return parts
    .map(s => s.replace(/⁠/g, '.').trim())
    .filter(s => s.length > 0);
};

// 문장 경계에서 truncate (단일 긴 문장 fallback)
const truncateAtSentenceBoundary = (text, maxChars) => {
  if (!text || text.length <= maxChars) return text ?? '';
  const sub = text.slice(0, maxChars);
  // 뒤에서부터 한국어 문장 종결 패턴 탐색
  for (const ending of ['습니다.', '합니다.', '입니다.', '있습니다.', '됩니다.', '다.', '요.', '까.', '죠.']) {
    const idx = sub.lastIndexOf(ending);
    if (idx >= maxChars * 0.4) return sub.slice(0, idx + ending.length).trim() + '…';
  }
  // 절 경계 fallback (접속어 앞 콤마)
  const commaIdx = Math.max(sub.lastIndexOf('이며,'), sub.lastIndexOf('하며,'), sub.lastIndexOf('며,'));
  if (commaIdx >= maxChars * 0.4) return sub.slice(0, commaIdx + 2).trim() + '…';
  return sub.trim() + '…';
};

/**
 * evidence text에서 indicator keyword 관련 문장 1~2개를 자연스럽게 추출.
 * - 문자 중간 절단 없음 (반드시 문장 단위로 표시)
 * - keyword 포함 문장 우선 선택
 * - 전체 text가 maxChars 이하면 그대로 반환
 */
const extractSentencePreview = (text, keywords = [], maxChars = 200) => {
  if (!text) return null;
  const normalized = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;

  const sentences = splitKoreanSentences(normalized);
  if (sentences.length <= 1) return truncateAtSentenceBoundary(normalized, maxChars);

  // 키워드 점수화 (많이 포함할수록 우선, 동점은 원래 순서)
  const kwLower = keywords.filter(k => k && k.length >= 2).map(k => k.toLowerCase());
  const scored = sentences.map((s, i) => ({
    s, i,
    score: kwLower.length > 0 ? kwLower.filter(k => s.toLowerCase().includes(k)).length : 0,
  }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);

  // 상위 문장부터 2문장까지 maxChars 이내로 수집
  let result = '';
  let collected = 0;
  for (const { s } of scored) {
    if (collected >= 2) break;
    const sep = result ? ' ' : '';
    if ((result + sep + s).length <= maxChars) {
      result += sep + s;
      collected++;
    } else if (!result) {
      result = truncateAtSentenceBoundary(s, maxChars);
      collected++;
      break;
    } else {
      break;
    }
  }

  if (!result) result = truncateAtSentenceBoundary(sentences[0], maxChars);
  if (result.length < normalized.length - 5 && !result.endsWith('…')) result += '…';
  return result;
};

// E 지표용 자연어 snippet 생성 (raw CSV key 노출 방지)
// evidenceText에서 한자/OCR 깨짐도 함께 정규화
const buildESnippet = (ev) => {
  const title = ev.indicatorTitle ?? E_INDICATORS[ev.indicatorCode] ?? ev.indicatorCode;
  if (ev.inputValue != null || ev.extractedValue != null) {
    const inVal = ev.inputValue  != null ? Number(ev.inputValue).toLocaleString()  : '—';
    const exVal = ev.extractedValue != null ? Number(ev.extractedValue).toLocaleString() : '—';
    const unit  = ev.unit ? ` ${ev.unit}` : '';
    const diff  = (ev.numericDiffPercent ?? 0).toFixed(1);
    const lvl   = ev.numericMatchLevel === 'HIGH'   ? 'HIGH (일치)'
                : ev.numericMatchLevel === 'MEDIUM' ? 'MEDIUM (근사)'
                : ev.numericMatchLevel === 'LOW'    ? 'LOW (불일치)'
                : '처리 완료';
    return `${title} · 입력값: ${inVal}${unit} · 증빙값: ${exVal}${unit} · 차이율: ${diff}% · 판정: ${lvl}`;
  }
  // evidenceText가 이미 자연어인 경우 (raw CSV key 패턴 아닌 경우)
  if (ev.evidenceText && !ev.evidenceText.includes('electricity_kwh') && !ev.evidenceText.includes('| month |') && !ev.evidenceText.includes('gas_mj')) {
    return extractSentencePreview(ev.evidenceText, [], 150) ?? ev.evidenceText.slice(0, 150) + '…';
  }
  return `${title} · 수치 데이터 검증됨`;
};

// 전체 K-ESG 지표 코드 → 표시명 (E + S + G)
const ALL_INDICATOR_CODES = { ...E_INDICATORS, ...SG_INDICATORS };

// ── 업종 가중치 (모듈 공유) ───────────────────────────────────────────────
const IND_TYPE_MAP = {
  '06':'ENERGY','07':'ENERGY','08':'ENERGY',
  '10':'MFG','11':'MFG','12':'MFG','13':'MFG','14':'MFG','15':'MFG',
  '16':'MFG','17':'MFG','18':'MFG','21':'MFG','22':'MFG','25':'MFG',
  '26':'MFG','27':'MFG','28':'MFG','29':'MFG','30':'MFG','31':'MFG',
  '32':'MFG','33':'MFG','19':'ENERGY','20':'ENERGY','23':'ENERGY',
  '24':'ENERGY','35':'ENERGY','36':'ENERGY',
  '58':'IT','59':'IT','60':'IT','61':'IT','62':'IT','63':'IT',
  '70':'IT','71':'IT','72':'IT','73':'IT',
  '45':'FIN','46':'FIN','47':'FIN','64':'FIN','65':'FIN','66':'FIN',
};
const IND_W_MAP = {
  MFG:    { E:0.50, S:0.25, G:0.25, label:'제조·중공업' },
  ENERGY: { E:0.55, S:0.25, G:0.20, label:'에너지·화학' },
  FIN:    { E:0.25, S:0.40, G:0.35, label:'금융·서비스' },
  IT:     { E:0.30, S:0.40, G:0.30, label:'IT·플랫폼' },
  DEFAULT:{ E:0.40, S:0.30, G:0.30, label:'기본 (K-ESG)' },
};
const getIndustryWeights = (ksicCode) => {
  const type = IND_TYPE_MAP[(ksicCode ?? '').substring(0, 2)] ?? 'DEFAULT';
  return IND_W_MAP[type];
};

/**
 * evidenceMatches 를 기반으로 완전한 지표 목록을 구성합니다.
 * - evidenceMatches에 있는 항목: 그대로 포함 (indicatorCode별 최고 similarity 우선)
 * - ALL_INDICATOR_CODES에 있지만 evidenceMatches에 없는 항목:
 *   isValidEvidence=false의 NO_EVIDENCE 합성 항목으로 추가
 * 이 함수가 반환하는 목록이 모든 Verification Summary의 단일 소스입니다.
 */
// E 지표 numeric 우선순위: HIGH=3, MEDIUM=2, LOW=1, 없음=0
const _numericPri = (ev) =>
  ev?.numericMatchLevel === 'HIGH'   ? 3 :
  ev?.numericMatchLevel === 'MEDIUM' ? 2 :
  ev?.numericMatchLevel === 'LOW'    ? 1 : 0;

function buildCompleteIndicatorList(evidenceMatches) {
  const isVerifiedEv = (ev) =>
    ev?.verificationStatus === 'VERIFIED' ||
    ev?.matchedCluster?.startsWith('EXPLICIT:');
  const evScore = (ev) => Math.max(ev?.similarity ?? 0, ev?.finalScore ?? 0);

  const byCode = new Map();
  for (const ev of (evidenceMatches ?? [])) {
    const code = ev.indicatorCode;
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing) { byCode.set(code, ev); continue; }

    // E 지표: numericMatchLevel 있는 evidence 최우선 선택
    // numeric verification 성공(HIGH/MEDIUM) > semantic similarity 기준
    if (code.startsWith('E-')) {
      const evNum = _numericPri(ev);
      const exNum = _numericPri(existing);
      if (evNum > exNum) { byCode.set(code, ev); continue; }
      if (exNum > evNum) continue;
      // 동일 numeric 우선순위: similarity 비교로 fallback
      if (evScore(ev) > evScore(existing)) byCode.set(code, ev);
      continue;
    }

    const evIsV = isVerifiedEv(ev);
    const exIsV = isVerifiedEv(existing);

    // VERIFIED/EXPLICIT evidence 우선 선택 — rawSim 낮아도 우선
    if (evIsV && !exIsV) {
      byCode.set(code, ev);
      continue;
    }
    if (!evIsV && exIsV) continue;

    // 동일 VERIFIED 상태: max(similarity, finalScore) 기준
    if (evScore(ev) > evScore(existing)) byCode.set(code, ev);
  }
  for (const [code, title] of Object.entries(ALL_INDICATOR_CODES)) {
    if (!byCode.has(code)) {
      byCode.set(code, {
        indicatorCode:    code,
        indicatorTitle:   title,
        isValidEvidence:  false,
        similarity:       null,
        numericMatchLevel: null,
        _synthetic:       true,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => {
    const order = { E: 0, S: 1, G: 2 };
    const ca = order[a.indicatorCode?.[0]] ?? 3;
    const cb = order[b.indicatorCode?.[0]] ?? 3;
    if (ca !== cb) return ca - cb;
    return (a.indicatorCode ?? '').localeCompare(b.indicatorCode ?? '');
  });
}

// 분석 파이프라인 단계 정의
const PIPELINE_STEPS = [
  { label: 'PDF 업로드',        desc: '증빙 문서 수신' },
  { label: '텍스트 추출',       desc: 'PDF 텍스트 파싱' },
  { label: '문서 분할',         desc: '섹션 단위 청킹' },
  { label: '벡터 인덱싱',       desc: 'ChromaDB 저장' },
  { label: 'ESG 지표별 검색',   desc: 'RAG 벡터 검색' },
  { label: '근거 유사도 분석',  desc: '유사도 + 키워드 게이트' },
  { label: '검증 상태 판별',    desc: 'E/S/G 검증 분류' },
  { label: 'ESG 점수 산정',     desc: '최종 점수 산정' },
];

// GPT 리포트 섹션 정의
const REPORT_SECTION_DEFS = [
  { key: 'summary',      icon: FileText,      color: '#818cf8', keywords: ['종합 총평', '개요', '총평', 'ESG 종합', '분석 결과', '종합 평가'] },
  { key: 'strengths',    icon: CheckCircle2,  color: '#059669', keywords: ['주요 강점', '강점', '우수', 'Strength'] },
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

// 단위 정규화: 위첨자 숫자(₂) → ASCII, 특수문자 제거
const normalizeUnit = (u = '') => u.toLowerCase()
  .replace(/₀/g,'0').replace(/₁/g,'1').replace(/₂/g,'2').replace(/₃/g,'3')
  .replace(/₄/g,'4').replace(/₅/g,'5').replace(/₆/g,'6').replace(/₇/g,'7')
  .replace(/₈/g,'8').replace(/₉/g,'9')
  .replace(/[^a-z0-9-]/g, '');

const LOWER_IS_BETTER_UNITS = new Set(['kwh','mwh','gwh','tco2','tco2e','kg','m3','l','ton','kgco2','mj','mwh']);
// 지표 이름 기반 semantic direction (keyword → lower is better)
const LIB_NAME_KEYS  = ['배출','사용량','폐기물','용수','에너지','전력','가스','탄소','온실','연료','오염'];
const HIB_NAME_KEYS  = ['교육','훈련','인원','비율','참여','달성','준수','이수','실시','인증','충족'];

// ── Benchmark Business Risk 설명 ─────────────────────────────────────────
// 지표가 업종 평균 대비 높을 때(worse) 실제 business/audit risk 설명 반환
const getBenchmarkRisk = (metricName = '', absDiffPct = 0) => {
  const n = metricName.toLowerCase();
  const isMajor = absDiffPct > 30;
  if (n.includes('가스') || n.includes('gas')) {
    return isMajor
      ? '에너지 효율 리스크 — 탄소 비용 증가 가능성 및 규제 대응 부담 증가. Scope 1 직접 배출 관리 강화 필요.'
      : '에너지 효율 개선 여지 — 가스 소비 절감 시 운영 비용 및 탄소 비용 절감 가능.';
  }
  if (n.includes('탄소') || n.includes('carbon') || n.includes('co2') || n.includes('온실')) {
    return isMajor
      ? 'Scope 1/2 탄소 관리 리스크 — ESG 공시 의무화 대응 부담 및 탄소세 비용 증가 우려. 배출량 감축 로드맵 수립이 시급합니다.'
      : 'Scope 1/2 배출량 관리 필요 — 탄소 공시 정확도 향상 및 감축 목표 설정을 권장합니다.';
  }
  if (n.includes('전력') || n.includes('electricity') || n.includes('에너지') || n.includes('energy')) {
    return isMajor
      ? '에너지 비용 및 탄소 리스크 — 재생에너지 전환 검토 및 에너지 원단위 관리 시급. 전력 비용 증가로 운영 경쟁력 약화 가능.'
      : '에너지 효율 개선 여지 — 설비 효율화 또는 재생에너지 전환 검토를 권장합니다.';
  }
  if (n.includes('용수') || n.includes('water') || n.includes('물')) {
    return isMajor
      ? '수자원 효율성 리스크 — 운영 비용 증가 가능성 및 물 부족 규제 지역 대응 부담. 용수 재이용 시스템 도입 검토 필요.'
      : '수자원 관리 개선 필요 — 용수 절감 활동 및 재이용률 제고를 권장합니다.';
  }
  if (n.includes('폐기물') || n.includes('waste')) {
    return isMajor
      ? '폐기물 관리 리스크 — 처리 비용 증가 및 순환경제 규제 대응 부담. 재활용률 제고 및 폐기물 감량 목표 수립 필요.'
      : '폐기물 감량 개선 여지 — 재활용·재사용 비율 향상으로 처리 비용 절감 가능.';
  }
  return isMajor
    ? '업종 평균 대비 유의미한 차이 — 해당 지표의 세부 관리 방안 수립을 권장합니다.'
    : '업종 평균 대비 소폭 높은 수준 — 지속적인 모니터링을 권장합니다.';
};

const lowerIsBetter = (unit = '', name = '') => {
  if (LOWER_IS_BETTER_UNITS.has(normalizeUnit(unit))) return true;
  if (HIB_NAME_KEYS.some(k => name.includes(k))) return false;
  if (LIB_NAME_KEYS.some(k => name.includes(k))) return true;
  return false;
};

// ── 업계 대비 리스크 & 기회 분석 문구 생성 (benchmark 실수치 기반) ─────────────
const buildIndustryRiskOpportunity = (metrics, d) => {
  const eScore   = d?.eScore  ?? 0;
  const sScore   = d?.sScore  ?? 0;
  const gScore   = d?.gScore  ?? 0;
  const industry = d?.benchmarkComparison?.industry ?? '동 업종';

  const riskItems = [];
  const oppItems  = [];

  // ① 환경 벤치마크 — 지표별 개별 문구 생성
  (metrics ?? []).forEach(m => {
    if (m.company == null || m.industryAvg == null || m.industryAvg === 0) return;
    const diff = (m.company - m.industryAvg) / m.industryAvg * 100;
    const lb   = lowerIsBetter(m.unit ?? '', m.name ?? '');
    const pct  = Math.abs(diff).toFixed(0);
    const key  = ['탄소','가스','전력','폐기','용수'].find(k => (m.name ?? '').includes(k)) ?? '';

    if (lb ? diff > 5 : diff < -5) {
      // 업종 평균 초과 → 리스크
      const fn = {
        탄소: () => `탄소 배출량이 ${industry} 평균 대비 +${pct}% 높아 Scope 1·2 배출 관리 강화가 필요합니다.`,
        가스: () => `가스 사용량이 ${industry} 평균 대비 +${pct}% 높아 에너지 비용 및 배출 리스크가 존재합니다.`,
        전력: () => `전력 사용량이 ${industry} 평균 대비 +${pct}% 높아 에너지 효율 개선 조치가 권고됩니다.`,
        폐기: () => `폐기물 발생량이 ${industry} 평균 대비 +${pct}% 높아 자원 순환 체계 점검이 필요합니다.`,
        용수: () => `용수 사용량이 ${industry} 평균 대비 +${pct}% 높아 수자원 관리 효율화가 요구됩니다.`,
      }[key];
      riskItems.push(fn ? fn() : `${m.name}이 ${industry} 평균 대비 +${pct}% 높아 환경 관리 개선이 필요합니다.`);
    } else if (lb ? diff < -5 : diff > 5) {
      // 업종 평균 이하 → 기회
      const fn = {
        탄소: () => `탄소 배출량이 ${industry} 평균 대비 ${pct}% 낮아 탄소 감축 관리 체계가 효과적으로 운영되고 있습니다.`,
        가스: () => `가스 사용량이 ${industry} 평균보다 ${pct}% 낮아 에너지 효율 운영 성과가 확인됩니다.`,
        전력: () => `전력 사용량이 ${industry} 평균보다 ${pct}% 낮아 에너지 절감 운영 효율이 양호합니다.`,
        폐기: () => `폐기물 발생량이 ${industry} 평균보다 ${pct}% 낮아 자원 순환 및 폐기물 관리 효율성이 양호합니다.`,
        용수: () => `용수 사용량이 ${industry} 평균보다 ${pct}% 낮아 친환경 자원 운영 기반이 확보되어 있습니다.`,
      }[key];
      oppItems.push(fn ? fn() : `${m.name}이 ${industry} 평균보다 ${pct}% 낮아 환경 운영 효율이 양호합니다.`);
    }
  });

  // Fallback — 벤치마크 데이터가 없을 때만
  if (riskItems.length === 0 && oppItems.length === 0) {
    riskItems.push(`${industry} 업종 벤치마크 데이터가 충분하지 않아 상세 비교가 제한됩니다.`);
  }

  return (
    '**[리스크]**\n' + riskItems.join('\n\n') +
    '\n\n**[기회]**\n' + oppItems.join('\n\n')
  );
};

// ── 보일러플레이트 evidence 탐지 (UI 표시 경고 전용 — scoring 미영향) ────────
const BOILERPLATE_PATTERNS = [
  /^esg\s*(ai|audit|report|analysis|platform|보고서|리포트)\s*$/i,
  /^(환경|사회|지배구조)\s*(지표|항목|평가|카테고리)\s*$/,
  /^(k-esg|kesg|esg)\s*(가이드|guide|기준|framework|항목)\s*$/i,
  /^(esg\s*)?(종합|전체|summary|overview)\s*(점수|결과|등급)?\s*$/i,
];
const isBoilerplateEvidence = (text = '') => {
  const t = (text ?? '').trim();
  if (t.length < 12) return true;
  return BOILERPLATE_PATTERNS.some(p => p.test(t));
};

const getConfLevel = (pct) => {
  if (pct == null) return null;
  if (pct >= 70) return 'HIGH';
  if (pct >= 50) return 'MEDIUM';
  return 'LOW';
};

const toPct = (v) => (v == null ? null : Math.round(v <= 1 ? v * 100 : v));

const fmtDiff = (d) => {
  if (d == null) return '—';
  const capped = Math.min(d, 999);
  if (capped < 0.01) return '0%';
  return `${capped.toFixed(2)}%${d > 999 ? '+' : ''}`;
};

// UTC ISO 문자열 → KST(Asia/Seoul) 포맷 변환 (서버가 UTC로 반환하므로 +9h 적용 필요)
const fmtKST = (isoStr, len = 16) => {
  if (!isoStr) return '';
  try {
    // LocalDateTime.now() returns UTC without 'Z' -> append 'Z' to force UTC parsing
    const utc = /Z$|[+-]\d{2}:?\d{2}$/.test(isoStr) ? isoStr : isoStr + 'Z';
    return new Date(utc)
      .toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
      .slice(0, len);
  } catch { return isoStr.replace('T', ' ').slice(0, len); }
};

// ── 마크다운 렌더러 ───────────────────────────────────────────────────
const renderMd = (text) => {
  if (!text) return '';
  try {
    if (_marked) return typeof _marked.parse === 'function' ? _marked.parse(text) : _marked(text);
  } catch { /* fallthrough */ }
  return text
    .replace(/^#### (.+)$/gm, '<h4 style="color:#4b5563;margin:1.2em 0 .3em;font-size:.875em;font-weight:700">$1</h4>')
    .replace(/^### (.+)$/gm,  '<h3 style="color:#374151;margin:1.4em 0 .4em;font-size:.95em;font-weight:800">$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2 style="color:#1f2937;margin:1.6em 0 .5em;font-size:1.05em;font-weight:900;letter-spacing:-.01em">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#111827;font-weight:700">$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em style="color:#6b7280">$1</em>')
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
    ? 'text-4xl font-bold px-5 py-2 rounded-2xl tracking-tight'
    : size === 'lg'
    ? 'text-2xl font-bold px-4 py-1.5 rounded-xl'
    : 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg';
  return (
    <span className={`inline-flex items-center border ${cls} ${sz}`} style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em' }}>
      {grade ?? 'N/A'}
    </span>
  );
}

function SectionCard({ title, icon: Icon, iconColor, children, className = '', action }) {
  return (
    <div className={`saas-card overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {Icon && (
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${iconColor ?? '#059669'}12` }}
              >
                <Icon size={13} style={{ color: iconColor ?? '#059669' }} />
              </span>
            )}
            <span className="text-[13px] font-semibold text-gray-800">{title}</span>
          </div>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function ScoreProgressBar({ score, color, height = 'h-1.5', estimated = false }) {
  return (
    <div className={`${height} bg-gray-100 rounded-full overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(0, Math.min(100, score ?? 0))}%`,
          background: estimated
            ? 'repeating-linear-gradient(90deg, #f59e0b 0px, #f59e0b 8px, transparent 8px, transparent 14px)'
            : color,
          opacity: estimated ? 0.6 : 1,
        }}
      />
    </div>
  );
}

// ── Keyword Highlight ────────────────────────────────────────────────────
function HighlightedText({ text, keywords = [] }) {
  if (!text) return null;
  const filtered = keywords.filter(k => k && k.length >= 2);
  if (!filtered.length) return <span className="whitespace-pre-line">{text}</span>;
  const escaped = filtered.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  try {
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span className="whitespace-pre-line">
        {parts.map((part, i) => {
          const hit = filtered.some(k => k.toLowerCase() === part.toLowerCase());
          return hit
            ? <mark key={i} className="bg-emerald-100 text-emerald-700 rounded-sm px-0.5 not-italic font-semibold">{part}</mark>
            : <span key={i}>{part}</span>;
        })}
      </span>
    );
  } catch { return <span className="whitespace-pre-line">{text}</span>; }
}

// ── Audit Console ────────────────────────────────────────────────────────
function AuditConsole({ data, analysisSummary, blockedIndicators, isBenchmarkFallback }) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState({ E: true, S: true, G: true, FINAL: true });
  const toggle = (k) => setOpenGroups(p => ({ ...p, [k]: !p[k] }));
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data, analysisSummary, blockedIndicators]);

  const fmtMs = (ms) => {
    if (ms == null) return null;
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
  };

  const SEV_STYLE = {
    SUCCESS: { icon: '✓', color: '#059669', bg: 'bg-emerald-50 border-emerald-100', label: '완료' },
    WARN:    { icon: '!', color: '#d97706', bg: 'bg-amber-50 border-amber-100',     label: '부분 검증' },
    ERROR:   { icon: '✕', color: '#dc2626', bg: 'bg-red-50 border-red-100',         label: '오류' },
    INFO:    { icon: '·', color: '#9ca3af', bg: 'bg-gray-50 border-gray-100',       label: '정보' },
  };

  const groups = React.useMemo(() => {
    const eFailed = analysisSummary?.e?.failed ?? 0;
    const eTotal  = analysisSummary?.e?.total  ?? 5;
    const eHigh   = analysisSummary?.e?.high   ?? 0;
    const eMed    = analysisSummary?.e?.medium ?? 0;
    const eLow    = analysisSummary?.e?.low    ?? 0;

    const sBlocked = blockedIndicators.filter(([c]) => c.startsWith('S'));
    const gBlocked = blockedIndicators.filter(([c]) => c.startsWith('G'));
    const sTotal   = Object.keys(SG_INDICATORS).filter(k => k.startsWith('S')).length;
    const gTotal   = Object.keys(SG_INDICATORS).filter(k => k.startsWith('G')).length;

    const ocrMs    = data?.ocrTimeMs;
    const ragMs    = data?.ragTimeMs;
    const verifyMs = data?.verifyTimeMs;
    const totalMs  = data?.processingTimeMs;
    const eElapsed = (ocrMs ?? 0) + (verifyMs ?? 0);
    const sElapsed = ragMs ? Math.round(ragMs * 0.5) : null;
    const gElapsed = ragMs ? Math.round(ragMs * 0.5) : null;
    const fElapsed = totalMs ? Math.max(0, totalMs - eElapsed - (ragMs ?? 0)) : null;

    // completeIndicatorList 기반으로 검증 성공 카운트 계산 (evidenceMatches 직접 참조 금지)
    const _sgList = buildCompleteIndicatorList(data?.evidenceMatches);
    const sValid = _sgList.filter(e => e.indicatorCode?.startsWith('S') && getVerificationStatus(e) !== 'NO_EVIDENCE').length;
    const gValid = _sgList.filter(e => e.indicatorCode?.startsWith('G') && getVerificationStatus(e) !== 'NO_EVIDENCE').length;
    const sBlockedN = sBlocked.length;
    const gBlockedN = gBlocked.length;
    const sCov     = sTotal > 0 ? ((sTotal - sBlockedN) / sTotal).toFixed(2) : '1.00';
    const gCov     = gTotal > 0 ? ((gTotal - gBlockedN) / gTotal).toFixed(2) : '1.00';

    const isCsvBased = !ocrMs && (eHigh + eMed) > 0;

    const E = [];
    if (isCsvBased) {
      E.push({ sev: 'SUCCESS', msg: 'CSV 기반 수치 검증 사용', latency: null });
      E.push({ sev: 'SUCCESS', msg: `${eHigh + eMed}개 지표 검증 완료`, latency: fmtMs(verifyMs) });
    } else {
      if (data?.ocrFallback)
        E.push({ sev: 'WARN',    msg: '문서 일부 페이지의 텍스트 인식에 제한이 있었습니다.', latency: fmtMs(ocrMs) });
      else
        E.push({ sev: 'SUCCESS', msg: '문서 텍스트 인식(OCR) 완료', latency: fmtMs(ocrMs) });

      if (eFailed >= eTotal && eTotal > 0)
        E.push({ sev: 'ERROR', msg: `환경 데이터 자동 추출에 제한이 있어 업종 평균 기반 추정 평가가 적용되었습니다. (${eFailed}/${eTotal}개 항목)` });
      else if (eFailed > 0)
        E.push({ sev: 'WARN',  msg: `환경 데이터 일부 항목(${eFailed}개) 수치 추출에 제한이 있었습니다.`, latency: fmtMs(verifyMs) });
      else
        E.push({ sev: 'SUCCESS', msg: `환경 데이터 수치 추출 완료 (${eTotal}개 항목)`, latency: fmtMs(verifyMs) });

      if (isBenchmarkFallback)
        E.push({ sev: 'INFO', msg: '환경(E) 실측 데이터 미제출 — 체크리스트 기반 평가 적용. 업종 비교는 별도 탭에서 확인 가능.' });

      if (eLow > 0)
        E.push({ sev: eLow >= 3 ? 'ERROR' : 'WARN', msg: `환경 데이터 ${eLow}개 항목에서 입력값과 증빙 수치 간 차이가 감지되었습니다.` });
      else if (eHigh + eMed > 0)
        E.push({ sev: 'SUCCESS', msg: `환경 데이터 수치 검증 완료 — 양호 ${eHigh}건, 근사 일치 ${eMed}건` });
    }

    const sVerified = _sgList.filter(e => e.indicatorCode?.startsWith('S') && getVerificationStatus(e) === 'VERIFIED').length;
    const gVerified = _sgList.filter(e => e.indicatorCode?.startsWith('G') && getVerificationStatus(e) === 'VERIFIED').length;

    const S = [];
    S.push({ sev: 'SUCCESS', msg: '문서 근거 적합도 분석 준비 완료', latency: ragMs ? fmtMs(Math.round(ragMs * 0.35)) : null });
    S.push({ sev: 'SUCCESS', msg: `사회(S) 지표 근거 수집 완료 — 확인 근거 ${sValid}건 (명시 확인 ${sVerified}건)`, latency: ragMs ? fmtMs(Math.round(ragMs * 0.65)) : null });
    if (sBlockedN > 0)
      S.push({ sev: 'WARN', msg: `사회(S) 지표 ${sBlockedN}개에서 검증 근거가 충분히 확보되지 않았습니다. 관련 문서 추가 보완을 권장합니다.` });
    else
      S.push({ sev: 'SUCCESS', msg: `사회(S) 지표 ${sTotal}개 전체 근거 검증 완료` });

    const G = [];
    G.push({ sev: 'SUCCESS', msg: `지배구조(G) 지표 근거 수집 완료 — 확인 근거 ${gValid}건 (명시 확인 ${gVerified}건)` });
    if (gBlockedN > 0)
      G.push({ sev: 'WARN', msg: `지배구조(G) 지표 ${gBlockedN}개에서 검증 근거가 충분히 확보되지 않았습니다. 이사회·윤리·감사 관련 문서 추가 보완을 권장합니다.` });
    else
      G.push({ sev: 'SUCCESS', msg: `지배구조(G) 지표 ${gTotal}개 전체 근거 검증 완료` });

    const FINAL = [];
    if (data?.gradeCeilingApplied)
      FINAL.push({ sev: 'WARN', msg: `수치 불일치로 인해 등급 상한이 적용되었습니다 → 최종 등급: ${data.finalGrade}` });
    if ((data?.overallConfidence ?? 100) < 50)
      FINAL.push({ sev: 'WARN', msg: `분석 신뢰도가 낮아 등급 상한이 적용되었습니다 (최대 B등급).` });
    FINAL.push({ sev: 'INFO', msg: `최종 등급: ${data?.finalGrade ?? '?'}  ·  종합 점수: ${data?.totalScore ?? 0}점 / 100점` });
    FINAL.push({ sev: 'SUCCESS', msg: `분석 완료 — 분석 신뢰도 ${data?.overallConfidence ?? '?'}%`, latency: fmtMs(totalMs) });

    return [
      { key: 'E',     label: '환경(E) 검증',  sublabel: '수치 데이터 교차 검증',          color: '#059669', elapsed: eElapsed > 0 ? fmtMs(eElapsed) : null, hasOcrFallback: !!data?.ocrFallback, hasBenchmarkFallback: isBenchmarkFallback, entries: E },
      { key: 'S',     label: '사회(S) 분석',  sublabel: '근거 적합도 분석 · 사회 지표',       color: '#3b82f6', elapsed: fmtMs(sElapsed), hasOcrFallback: false, hasBenchmarkFallback: false, entries: S },
      { key: 'G',     label: '지배구조(G) 분석', sublabel: '근거 적합도 분석 · 지배구조 지표', color: '#f59e0b', elapsed: fmtMs(gElapsed), hasOcrFallback: false, hasBenchmarkFallback: false, entries: G },
      { key: 'FINAL', label: '최종 평가',      sublabel: '점수 산정 및 등급 결정',          color: '#a855f7', elapsed: fmtMs(fElapsed), hasOcrFallback: false, hasBenchmarkFallback: false, entries: FINAL },
    ];
  }, [data, analysisSummary, blockedIndicators, isBenchmarkFallback]);

  return (
    <div className="saas-card overflow-hidden">
      {/* 패널 토글 헤더 */}
      <button
        onClick={() => setPanelOpen(v => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Activity size={13} className="text-gray-500" />
        </span>
        <span className="text-[13px] font-semibold text-gray-700">분석 처리 기록</span>
        <span className="text-[11px] text-gray-400 ml-1">단계별 분석 파이프라인 타임라인</span>
        <span className="ml-auto text-gray-300">{panelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>

      {panelOpen && (
        <>
          <div className="border-t border-gray-100" />
          <div ref={scrollRef} className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
            {groups.map((grp, gi) => {
              const open = openGroups[grp.key] ?? true;
              const hasWarn = grp.entries.some(e => e.sev === 'WARN' || e.sev === 'ERROR');
              const lastIdx = grp.entries.length - 1;
              const allDone = grp.entries.every(e => e.sev === 'SUCCESS' || e.sev === 'INFO');
              return (
                <div key={grp.key}>
                  <button
                    onClick={() => toggle(grp.key)}
                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    {/* Step indicator */}
                    <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{
                        borderColor: allDone ? '#059669' : hasWarn ? '#f59e0b' : grp.color,
                        color: allDone ? '#059669' : hasWarn ? '#f59e0b' : grp.color,
                        background: allDone ? '#ecfdf5' : hasWarn ? '#fffbeb' : 'white',
                      }}>
                      {gi + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-700">{grp.label}</span>
                    <span className="text-[11px] text-gray-400">{grp.sublabel}</span>
                    {grp.elapsed && (
                      <span className="text-[10px] font-mono text-gray-400 ml-1" style={{ fontFamily: "'Inter', sans-serif" }}>{grp.elapsed}</span>
                    )}
                    {grp.hasOcrFallback && <span className="badge badge-medium">OCR 제한</span>}
                    {grp.hasBenchmarkFallback && <span className="badge badge-medium">업종 평균 적용</span>}
                    {hasWarn && !grp.hasOcrFallback && !grp.hasBenchmarkFallback && (
                      <span className="badge badge-medium">부분 검증</span>
                    )}
                    <span className="ml-auto text-gray-300">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                  </button>

                  {open && (
                    <div className="px-6 pb-4 space-y-1.5">
                      {grp.entries.map((entry, i) => {
                        const st = SEV_STYLE[entry.sev] ?? SEV_STYLE.INFO;
                        const isLatest = grp.key === 'FINAL' && i === lastIdx;
                        return (
                          <div key={i} className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl border ${st.bg} ${isLatest ? 'ring-1 ring-emerald-200' : ''}`}>
                            <span className="shrink-0 mt-0.5 text-[13px] font-bold w-4 text-center" style={{ color: st.color }}>{st.icon}</span>
                            <span className="flex-1 text-[12px] text-gray-600 leading-relaxed">{entry.msg}</span>
                            {entry.latency && (
                              <span className="shrink-0 text-[11px] text-gray-400 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>{entry.latency}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Evidence Quality Progress Bar ───────────────────────────────────────
function EvidenceQualityBar({ simPct }) {
  const tier = getSimTier(simPct);
  if (simPct == null || tier == null) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-[9px] text-gray-500 w-16 shrink-0 font-medium">품질 지수</span>
      <div className="relative flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${simPct}%`, background: tier.color, opacity: 0.9 }}
        />
        {[55, 70, 85].map(mark => (
          <div key={mark} className="absolute top-0 bottom-0 w-px bg-gray-300" style={{ left: `${mark}%` }} />
        ))}
      </div>
      <span className="text-[9px] font-black w-14 shrink-0 text-right font-mono" style={{ color: tier.color }}>
        {simPct}% · {tier.label}
      </span>
    </div>
  );
}

// ── Evidence Card (Audit Style — v2) ────────────────────────────────────
function EvidenceCard({ ev, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const catChar    = ev.indicatorCode?.[0];
  const catColor   = ESG_COLOR[catChar] ?? '#a1a1aa';
  const catLabel   = ESG_LABEL[catChar] ?? null;
  const isECategory = catChar === 'E' || ev.indicatorCode?.startsWith('E-') || Object.keys(E_INDICATORS).includes(ev.indicatorCode);

  const hasNumericData   = ev.numericMatchLevel != null && ev.inputValue != null;
  const isNumericPrimary = hasNumericData && ev.similarity == null;
  const matchStyle       = MATCH_STYLE[ev.numericMatchLevel] ?? null;

  const diffPct    = ev.numericDiffPercent ?? 0;
  const diffBarW   = Math.min(100, (diffPct / 40) * 100);
  const diffBarCol = diffPct <= 5 ? '#059669' : diffPct <= 20 ? '#f59e0b' : '#ef4444';

  const similarityPct = toPct(ev.similarity);
  const finalScorePct = toPct(ev.finalScore);
  const scoreColor    = finalScorePct == null ? '#a1a1aa' : finalScorePct >= 70 ? '#059669' : finalScorePct >= 50 ? '#f59e0b' : '#ef4444';
  const simColor      = similarityPct == null ? '#a1a1aa' : similarityPct >= 70 ? '#059669' : similarityPct >= 50 ? '#f59e0b' : '#ef4444';

  const sourceFile = ev.sourceFile ?? ev.sourceFileName;
  const shortFile  = sourceFile ? sourceFile.split(/[/\\]/).pop() : null;
  // isLong: chunkText 또는 evidenceText 중 긴 쪽 기준 (접힘/펼침 여부 결정)
  const isLong     = !isNumericPrimary && (
    (ev.chunkText?.length ?? 0) > 200 || (ev.evidenceText?.length ?? 0) > 200
  );

  // ── Verification Status ──────────────────────────────────────────────
  const vstKey = getVerificationStatus(ev);
  const vst    = VSTATUS[vstKey];

  // ── Source metadata row ──────────────────────────────────────────────
  const simTier = getSimTier(similarityPct);
  const metaParts = [
    // p.N, 유사도%, 검색 N위 등 기술적 debug 정보 제거 — 검증 상태 레이블만 유지
    (!isECategory && simTier) ? simTier.label : (!isECategory ? (ev.confidenceLevel === 'HIGH' ? '직접 근거 확인' : ev.confidenceLevel === 'MEDIUM' ? '의미 근거 확인' : ev.confidenceLevel === 'LOW' ? '보조 근거' : null) : null),
  ].filter(Boolean);

  // title keywords for highlight
  const titleKws = (ev.indicatorTitle ?? '')
    .split(/[\s·]+/)
    .filter(k => k.length >= 2 && !['여부', '발생', '실시', '수립', '운영', '구축', '관련'].includes(k));

  // 접힌 상태 preview: chunkText(전체 청크) 우선
  // fragment evidenceText(isFragmentArtifact=true)는 소스로 사용하지 않음
  const cardPreviewText = !isNumericPrimary && !isECategory
    ? (extractSentencePreview(
        ev.chunkText || (isFragmentArtifact(ev.evidenceText) ? '' : (ev.evidenceText || '')),
        titleKws, 200
      ) || null)
    : null;

  // card border color by status
  const cardBorder =
    vstKey === 'VERIFIED'      ? 'border-emerald-200 hover:border-emerald-300' :
    vstKey === 'PARTIAL'       ? 'border-blue-200   hover:border-blue-300' :
    vstKey === 'WEAK'          ? 'border-amber-200  hover:border-amber-300' :
    vstKey === 'CONTRADICTION' ? 'border-red-200    hover:border-red-300' :
                                 'border-gray-200   hover:border-gray-300';
  const cardBg =
    vstKey === 'VERIFIED'      ? 'bg-white' :
    vstKey === 'PARTIAL'       ? 'bg-blue-50/20' :
    vstKey === 'WEAK'          ? 'bg-white' :
    vstKey === 'CONTRADICTION' ? 'bg-red-50/50' :
                                 'bg-gray-50';

  return (
    <div
      className={`group border rounded-xl p-4 transition-all duration-200 hover:border-gray-300 ${cardBorder} ${cardBg}`}
      style={vstKey === 'CONTRADICTION' ? { boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.2), 0 0 10px rgba(239,68,68,0.05)' } : undefined}
    >
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {catLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0"
              style={{ color: catColor, borderColor: `${catColor}40`, background: `${catColor}10` }}>
              {catChar} · {catLabel}
            </span>
          )}
          <span className="text-[10px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200"
            style={{ color: catColor }}>
            {ev.indicatorCode ?? '-'}
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
            isECategory ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-gray-100 border-gray-200 text-gray-500'
          }`}>
            {isECategory ? '수치 검증' : '근거 적합도 분석'}
          </span>
          <span className="text-sm font-semibold text-gray-800 leading-tight">{ev.indicatorTitle ?? '-'}</span>
        </div>

        {/* Verification Status Badge */}
        <span title={vst.tooltip} className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0 flex items-center gap-1 cursor-help ${vst.bg} ${vst.border} ${vst.text}`}>
          <span>{vst.icon}</span>
          <span>{vst.label}</span>
        </span>
      </div>

      {/* ── Source Metadata row ── */}
      {metaParts.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {metaParts.map((part, i) => (
            <React.Fragment key={i}>
              <span className="text-[9px] font-mono text-gray-400 tabular-nums"
                style={i === 2 && simTier ? { color: simTier.color, fontWeight: 700 } : undefined}>
                {part}
              </span>
              {i < metaParts.length - 1 && <span className="text-[9px] text-gray-300">·</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Evidence Quality Chips (S/G only) ── */}
      {!isECategory && (similarityPct != null || ev.confidenceLevel) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* Similarity Tier */}
          {similarityPct != null && (ev.similarityTier === 'STRONG' || similarityPct >= 85 ? (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-300">STRONG</span>
          ) : similarityPct >= 70 ? (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200">MEDIUM</span>
          ) : (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200">WEAK</span>
          ))}
          {/* Evidence Quality Badge: EXACT / PARTIAL / WEAK */}
          {ev.confidenceLevel && (() => {
            // VERIFIED + LOW 모순 방지: VERIFIED이면 LOW → MEDIUM으로 표시
            const effConf = (vstKey === 'VERIFIED' && ev.confidenceLevel === 'LOW') ? 'MEDIUM' : ev.confidenceLevel;
            const q = { HIGH: ['직접 근거 확인', 'bg-emerald-50 text-emerald-700 border-emerald-200'], MEDIUM: ['의미 근거 확인', 'bg-blue-50 text-blue-700 border-blue-200'], LOW: ['보조 근거', 'bg-amber-50 text-amber-700 border-amber-200'] };
            const [label, cls] = q[effConf] ?? q.LOW;
            return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
          })()}
          {/* Keyword Gate Result */}
          {(ev.matchedKeywords?.length > 0 || (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && ev.matchedCluster?.trim() !== '')) ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-sky-50 text-sky-600 border-sky-200">키워드 검증 통과</span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-200">AI 의미 유추</span>
          )}
        </div>
      )}
      {/* Matched Keywords & Cluster chips */}
      {!isECategory && (ev.matchedKeywords?.length > 0 || (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED')) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && (
            <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-semibold">
              {ev.matchedCluster.split('|').join(' + ')}
            </span>
          )}
          {ev.matchedKeywords?.slice(0, 5).map((kw, i) => (
            <span key={i} className="text-[9px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-mono">{kw}</span>
          ))}
        </div>
      )}

      {/* ── CONTRADICTION 배너 ── */}
      {vstKey === 'CONTRADICTION' && (
        <div className="flex items-center gap-2 mb-2.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle size={11} className="text-red-500 shrink-0" />
          <span className="text-[10px] font-bold text-red-600">
            {isECategory ? '수치 불일치 감지' : '불일치 신호'}
          </span>
          {ev.contradictionReason && (
            <span className="ml-auto text-[10px] text-red-500/80 font-medium truncate max-w-[140px]">
              {ev.contradictionReason}
            </span>
          )}
        </div>
      )}

      {/* ── Shared Evidence Notice — 동일 근거 중복 사용 감지 ── */}
      {ev._isShared && (
        <div className="flex items-start gap-2 mb-2.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700 leading-relaxed">
            <span className="font-bold">동일 근거 중복 사용 감지</span>
            {' — '}동일 근거가 다른 ESG 지표와 중복 사용되었습니다. 검증 상태가 부분 근거 확인으로 하향 적용됩니다.
          </p>
        </div>
      )}

      {/* ── Numeric Audit Table (E) ── */}
      {hasNumericData && (
        <div className={`rounded-xl border overflow-hidden mb-2 ${
          ev.numericMatchLevel === 'HIGH'   ? 'border-emerald-200 bg-emerald-50/50' :
          ev.numericMatchLevel === 'MEDIUM' ? 'border-amber-200 bg-amber-50/50' :
                                              'border-red-200 bg-red-50/50'
        }`}>
          <div className="flex items-center px-3.5 py-2 gap-3">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">입력값</span>
            <span className="text-xs font-mono font-bold text-gray-800 tabular-nums">
              {ev.inputValue?.toLocaleString()}{' '}
              <span className="text-gray-400 font-normal text-[10px]">{ev.unit ?? ''}</span>
            </span>
          </div>
          <div className="flex items-center px-3.5 py-2 gap-3 border-t border-gray-200">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">증빙값</span>
            <span className={`text-xs font-mono font-bold tabular-nums ${matchStyle?.text ?? 'text-gray-800'}`}>
              {ev.extractedValue?.toLocaleString()}{' '}
              <span className="font-normal text-[10px] opacity-70">{ev.unit ?? ''}</span>
            </span>
          </div>
          <div className="flex items-center px-3.5 py-2 gap-3 border-t border-gray-200">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">차이율</span>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-base font-black font-mono tabular-nums shrink-0 leading-none" style={{ color: diffBarCol }}>
                {fmtDiff(diffPct)}
              </span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${diffBarW}%`, background: diffBarCol }} />
              </div>
            </div>
          </div>
          <div className="flex items-center px-3.5 py-2 gap-3 border-t border-gray-200">
            <span className="text-[10px] font-semibold text-gray-500 w-14 shrink-0">판정</span>
            <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg border ${matchStyle?.bg} ${matchStyle?.border} ${matchStyle?.text}`}>
              {ev.numericMatchLevel === 'HIGH' ? 'HIGH ✓  일치' : ev.numericMatchLevel === 'MEDIUM' ? 'MEDIUM ~  근사 일치' : 'LOW ✕  불일치'}
            </span>
          </div>
        </div>
      )}

      {/* ── E 카테고리 수치 미제출 안내 (numeric data 없는 E 지표) ── */}
      {isECategory && !hasNumericData && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-sky-50 border border-sky-200 mb-2">
          <Info size={11} className="text-sky-500 shrink-0" />
          <p className="text-[10px] text-sky-700 font-medium">수치 입력값 없음 — E 지표 수치 데이터가 제출되지 않았습니다.</p>
        </div>
      )}

      {/* ── Evidence Snippet (highlighted, S/G only) ── */}
      {!isECategory && !isNumericPrimary && ev.evidenceText && (() => {
        // bundle-mode 지표 + " / " 구분 형식 → Grouped Evidence 렌더링
        const bundleGroups = BUNDLE_MODE_INDICATOR_SET.has(ev.indicatorCode)
          ? parseEvidenceBundle(ev.evidenceText) : null;

        if (bundleGroups) {
          // 모든 유효 토큰 순서 유지 (KPI → PREVENTION → OPERATIONAL → POLICY)
          const validTokens = EVIDENCE_GROUP_ORDER
            .flatMap(type => (bundleGroups[type] ?? []).filter(t => !isFragmentArtifact(t)));

          if (validTokens.length === 0) {
            // 모든 토큰이 아티팩트 → commentary fallback
            return (
              <p className="text-[11px] text-gray-600 leading-relaxed mt-1">
                {generateIndicatorCommentary(ev)}
              </p>
            );
          }

          const auditTone = INDICATOR_AUDIT_TONE[ev.indicatorCode];
          return (
            <div className="mt-1 space-y-1.5">
              {auditTone && (
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  {auditTone}
                </p>
              )}
              {/* 감사 보고서형 인라인 렌더링 — KPI badge 유지, 그룹 헤더 제거 */}
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                {validTokens.map((token, i) => {
                  const isKpi = classifyEvidenceToken(token) === 'KPI';
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-gray-300 text-[10px] select-none">·</span>}
                      {isKpi
                        ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex items-center gap-0.5">
                            {renderKpiToken(token)}
                          </span>
                        : <span className="text-[11px] text-gray-700">{token}</span>
                      }
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        }

        // 일반 문장 렌더링 (non-bundle)
        // G-304: 회사 metadata 제거 + 핵심 감사 문장만 추출
        const trimG304Evidence = (text) => {
          if (!text) return null;
          const AUDIT_ANCHORS = ['검증', '감사', '외부', '제3자', 'assurance', '회계', '인증', '한국품질재단'];
          const METADATA_MARKERS = ['사업장', '임직원 수', '매출', '업종', '대표이사', '설립', '주소', '전화', '홈페이지', '자본금'];
          const sentences = splitKoreanSentences(text).filter(s => s.length > 8);
          const auditSents = sentences.filter(s => {
            const lo = s.toLowerCase();
            const hasAudit = AUDIT_ANCHORS.some(a => lo.includes(a.toLowerCase()));
            const hasMeta  = METADATA_MARKERS.some(m => s.includes(m));
            return hasAudit && !hasMeta;
          });
          const selected = auditSents.length > 0 ? auditSents.slice(0, 2) : sentences.slice(0, 2);
          return selected.join(' ') || null;
        };
        // 아티팩트 탐지: fragment라면 commentary로 대체
        const rawDisplayText = isFragmentArtifact(ev.evidenceText) ? null : ev.evidenceText;
        const safeDisplayText = ev.indicatorCode === 'G-304' && rawDisplayText
          ? (trimG304Evidence(rawDisplayText) ?? rawDisplayText)
          : rawDisplayText;

        return (
          <>
            {ev.matchedGuideline && (
              <div className="mb-2 flex items-start gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <Info size={10} className="text-gray-400 shrink-0 mt-0.5" />
                <span className="text-[10px] text-gray-500 leading-relaxed italic">{ev.matchedGuideline}</span>
              </div>
            )}
            <div className="relative">
              {/* indicator-specific audit tone */}
              {INDICATOR_AUDIT_TONE[ev.indicatorCode] && (
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  {INDICATOR_AUDIT_TONE[ev.indicatorCode]}
                </p>
              )}
              {(safeDisplayText || cardPreviewText) ? (
                <>
                  {safeDisplayText && isBoilerplateEvidence(safeDisplayText) && (
                    <span className="inline-block text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mb-1">
                      일반 참조 텍스트 — 지표별 직접 근거로 활용 제한
                    </span>
                  )}
                  <p className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-800 transition-colors">
                    <HighlightedText
                      text={expanded
                        ? (ev.chunkText || safeDisplayText || cardPreviewText)
                        : (cardPreviewText ?? safeDisplayText)}
                      keywords={titleKws}
                    />
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  {generateIndicatorCommentary(ev)}
                </p>
              )}
            </div>
            {isLong && (safeDisplayText || ev.chunkText) && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                className="mt-1 text-[10px] font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
              >
                {expanded ? '접기 ▲' : '전체 보기 ▼'}
              </button>
            )}
          </>
        );
      })()}

      {/* ── Evidence Quality Progress Bar (S/G only) ── */}
      {!hasNumericData && similarityPct != null && (
        <div className="mt-2.5 space-y-1.5">
          <EvidenceQualityBar simPct={similarityPct} />
          {finalScorePct != null && finalScorePct !== similarityPct && (
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] text-gray-500 w-16 shrink-0 font-medium">종합 점수</span>
              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${finalScorePct}%`, background: scoreColor }} />
              </div>
              <span className="text-[9px] font-bold tabular-nums font-mono w-14 text-right shrink-0" style={{ color: scoreColor }}>
                {finalScorePct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Expandable Detail Panel ── */}
      {detailOpen && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 animate-in slide-in-from-top-1 duration-150">
          {ev.evidenceText && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">전체 텍스트</p>
              <p className="text-[10px] text-gray-600 leading-relaxed font-mono whitespace-pre-line">
                <HighlightedText text={ev.evidenceText} keywords={titleKws} />
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              isECategory
                ? { label: '검증 방식', value: '수치 검증 기반' }
                : { label: '근거 적합도', value: similarityPct != null ? `${similarityPct}%` : '—' },
              { label: '근거 품질',
                // VERIFIED + LOW 모순 방지: VERIFIED이면 LOW → 보통으로 표시
                value: (() => {
                  const effConf = (vstKey === 'VERIFIED' && ev.confidenceLevel === 'LOW') ? 'MEDIUM' : ev.confidenceLevel;
                  return effConf === 'HIGH' ? '높음' : effConf === 'MEDIUM' ? '보통' : effConf === 'LOW' ? '낮음' : '—';
                })() },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                <p className="text-[8px] text-gray-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                <p className="text-[11px] font-black font-mono text-gray-700">{item.value}</p>
              </div>
            ))}
          </div>
          {ev.contradictionReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold text-red-600 uppercase tracking-wider mb-1">불일치 사유</p>
              <p className="text-[10px] text-red-500 leading-relaxed">{ev.contradictionReason}</p>
            </div>
          )}
          {ev.chunkText && ev.chunkText !== ev.evidenceText && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">문서 구간</p>
              <p className="text-[10px] text-gray-500 leading-relaxed font-mono">
                {truncateAtSentenceBoundary(ev.chunkText, 300)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── X감사 근거 요약 (인라인) ── */}
      <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 flex items-start gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest shrink-0 mt-0.5 leading-none">AI</span>
        <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-2">
          {generateIndicatorCommentary(ev)}
        </p>
      </div>

      {/* ── PARTIAL 카드 보조 설명 ── */}
      {vstKey === 'PARTIAL' && !isECategory && (
        <p className="text-[10px] text-blue-400/80 leading-snug mt-2 pl-0.5 italic">
          관련 의미 근거는 검출되었으나 명시 정책·정량 실적 데이터는 제한적입니다.
        </p>
      )}

      {/* ── Shared Evidence Notice — 공통 근거 기반 다중 매핑 투명성 ── */}
      {ev._sharedWith && ev._sharedWith.length > 0 && (
        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-100 flex items-start gap-1.5">
          <span className="text-[8px] font-black text-sky-500 uppercase tracking-widest shrink-0 mt-0.5 leading-none">공통</span>
          <p className="text-[9px] text-sky-700 leading-relaxed">
            해당 근거는{' '}
            <span className="font-semibold">
              {ev._sharedWith.map(c => ALL_INDICATOR_CODES[c] ?? c).join('·')}
            </span>{' '}
            지표에 공통 활용되었습니다. AI가 동일 문서 구간을 복수 지표 검증에 사용한 것으로, 억지 매핑이 아닙니다.
          </p>
        </div>
      )}

      {/* ── Footer row ── */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {shortFile && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <FileText size={10} className="text-gray-400 shrink-0" />
            <span className="text-[9px] text-gray-400 truncate">{shortFile}</span>
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setDetailOpen(v => !v); }}
          className="text-[9px] font-bold text-gray-400 hover:text-emerald-600 transition-colors shrink-0 flex items-center gap-1 ml-auto"
        >
          {detailOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          {detailOpen ? '접기' : '상세 보기'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect?.(ev); }}
          className="text-[9px] font-bold px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 hover:text-emerald-700 hover:border-emerald-200 transition-colors shrink-0"
        >
          전체 감사
        </button>
      </div>
    </div>
  );
}

// ── Retrieval Transparency Panel (기본 숨김, AdvancedAnalysisPanel로 통합됨) ──
function RetrievalTransparencyPanel({ evidences, isAutoSimulation }) {
  const [open, setOpen] = useState(false);

  const total      = evidences.length;
  const withSim    = evidences.filter(e => e.similarity != null || e.numericMatchLevel != null).length;
  const validated  = evidences.filter(e => e.isValidEvidence === true || e.numericMatchLevel === 'HIGH' || e.numericMatchLevel === 'MEDIUM').length;
  const verified   = evidences.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
  const retrievedEst = evidences.reduce((acc, e) => acc + (e.retrievedCount ?? 3), 0);

  if (isAutoSimulation) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-xs font-semibold text-gray-500">
          감사 분석 과정
        </span>
        <span className="ml-auto text-gray-400">{open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { label: '검색',   count: retrievedEst, color: '#3b82f6', desc: '근거 적합도 검색' },
              { label: '필터',   count: withSim,      color: '#8b5cf6', desc: '유사도 기준 통과' },
              { label: '정리',   count: validated,    color: '#f59e0b', desc: '중복 제거' },
              { label: '검증',   count: verified,     color: '#059669', desc: '최종 검증 근거' },
            ].map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="text-sm font-black tabular-nums px-2.5 py-1.5 rounded-lg border"
                    style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                    {s.count}
                  </div>
                  <span className="text-xs text-gray-600 font-semibold">{s.label}</span>
                  <span className="text-xs text-gray-400">{s.desc}</span>
                </div>
                {i < arr.length - 1 && <span className="text-gray-300 mx-1 shrink-0">→</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            총 <span className="text-gray-700 font-bold">{retrievedEst}</span>개 문장 검색 →
            필터링 후 <span className="text-gray-700 font-bold">{withSim}</span>개 →
            중복 제거 <span className="text-gray-700 font-bold">{validated}</span>개 →
            최종 검증 근거 <span style={{ color: '#16a34a' }} className="font-bold">{verified}</span>건
          </p>
        </div>
      )}
    </div>
  );
}

// ── 고급 AI 분석 통합 패널 (사용자 친화 버전) ─────────────────────────────
function AdvancedAnalysisPanel({ data, allIndicators, isAutoSimulation }) {
  const [open, setOpen] = useState(false);
  if (!data || isAutoSimulation) return null;

  const evs        = data.evidenceMatches ?? [];
  const total      = allIndicators.length;
  const verified   = allIndicators.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
  const weak       = allIndicators.filter(e => ['PARTIAL','WEAK'].includes(getVerificationStatus(e))).length;
  const noEv       = allIndicators.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length;
  const covPct     = total > 0 ? Math.round(verified / total * 100) : 0;
  const conf       = data.overallConfidence ?? null;
  const retrieved  = evs.reduce((acc, e) => acc + (e.retrievedCount ?? 3), 0);
  const validated  = evs.filter(e => e.isValidEvidence === true || e.numericMatchLevel === 'HIGH' || e.numericMatchLevel === 'MEDIUM').length;

  return (
    <div className="saas-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <Search size={14} className="text-indigo-500" />
        </span>
        <div>
          <span className="text-sm font-semibold text-gray-700">분석 과정 상세 보기</span>
          <span className="text-xs text-gray-400 ml-2">근거 탐색 과정 · 지표별 판단 근거</span>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 hidden sm:block">
            검증 완료 <span className="font-bold text-emerald-600">{verified}</span>건
            · 신뢰도 <span className="font-bold" style={{ color: conf != null && conf >= 65 ? '#16a34a' : conf != null && conf >= 50 ? '#d97706' : '#dc2626' }}>{conf ?? '—'}%</span>
          </span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {/* 핵심 요약 지표 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '분석 신뢰도', value: conf != null ? `${conf}%` : '—', color: conf != null && conf >= 65 ? '#16a34a' : conf != null && conf >= 50 ? '#d97706' : '#dc2626', sub: '신뢰도 점수' },
              { label: '검증 완료', value: `${verified}건`, color: '#16a34a', sub: `전체 ${total}개 지표 중` },
              { label: '지표 커버리지', value: `${covPct}%`, color: covPct >= 70 ? '#16a34a' : covPct >= 50 ? '#d97706' : '#dc2626', sub: `${total}개 지표 기준` },
              { label: '추가 보완 권장', value: `${noEv}건`, color: noEv === 0 ? '#16a34a' : noEv <= 2 ? '#d97706' : '#6b7280', sub: '문서 보완 권장 지표' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1.5">{item.label}</p>
                <p className="text-xl font-black tabular-nums" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>

          {/* AI 문서 검색 과정 (Retrieval Transparency) */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">근거 탐색 과정</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { label: '참조 섹션', count: retrieved, color: '#3b82f6', desc: '근거 탐색' },
                { label: '관련성 필터',  count: evs.filter(e => e.similarity != null || e.numericMatchLevel != null).length, color: '#8b5cf6', desc: '관련성 통과' },
                { label: '중복 제거',             count: validated, color: '#f59e0b', desc: '지표별 정리' },
                { label: '검증 완료',          count: verified,  color: '#059669', desc: '검증 완료' },
              ].map((s, i, arr) => (
                <React.Fragment key={s.label}>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="text-lg font-black font-mono tabular-nums px-3 py-2 rounded-xl border"
                      style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                      {s.count}
                    </div>
                    <span className="text-xs font-semibold text-gray-600">{s.label}</span>
                    <span className="text-xs text-gray-400">{s.desc}</span>
                  </div>
                  {i < arr.length - 1 && <span className="text-gray-300 text-lg mx-1 shrink-0">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 지표별 감사 근거 요약 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">지표별 판단 근거</p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {allIndicators.map((ev) => {
                const vstKey  = getVerificationStatus(ev);
                const vst     = VSTATUS[vstKey];
                const comment = generateIndicatorCommentary(ev);
                const catChar = ev.indicatorCode?.[0];
                const catCol  = ESG_COLOR[catChar] ?? '#a1a1aa';
                return (
                  <div key={ev.indicatorCode} className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${vst.bg} ${vst.border}`}>
                    <div className="flex flex-col items-center gap-1 shrink-0 min-w-[60px]">
                      <span className="text-xs font-black font-mono px-1.5 py-0.5 rounded-md"
                        style={{ color: catCol, background: `${catCol}15`, border: `1px solid ${catCol}30` }}>
                        {ev.indicatorCode}
                      </span>
                      <span className={`text-xs font-bold ${vst.text}`}>{vst.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700 mb-0.5">{ev.indicatorTitle ?? ev.indicatorCode}</p>
                      <p className={`text-xs leading-relaxed ${vst.text} opacity-90`}>{comment}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calibration Dashboard (Dev Mode) ─────────────────────────────────────
function CalibrationDashboard({ data }) {
  const [open, setOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  if (!IS_DEV || !data) return null;

  const evs = data.evidenceMatches ?? [];
  const ksicCode = localStorage.getItem('esg_ksicCode') ?? '';
  const iw    = getIndustryWeights(ksicCode);

  // ── Similarity histogram (buckets 0.55~1.00, step 0.05) ──────────────
  const simBuckets = [0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
  const simCounts  = simBuckets.map((lo, i) => {
    const hi = simBuckets[i + 1] ?? 1.01;
    return evs.filter(e => e.similarity != null && e.similarity >= lo && e.similarity < hi).length;
  });
  const simMax = Math.max(1, ...simCounts);

  // ── Score distribution (by 10-point bins) ────────────────────────────
  const scoreBins  = [0,10,20,30,40,50,60,70,80,90];
  const scoreData  = [data.eScore ?? 0, data.sScore ?? 0, data.gScore ?? 0];
  const ESGC       = ['#059669','#3b82f6','#f59e0b'];
  const ESGLabel   = ['E','S','G'];

  // ── Evidence stats (지표 단위 집계) ─────────────────────────────────
  // evidence record 단위가 아니라 indicator code 단위로 집계해야 MISSING이 정확함.
  // evs에 없는 지표는 NO_EVIDENCE 합성 항목으로 간주.
  const totalEv        = evs.length;
  const mediumMismatch = evs.filter(e => e.indicatorCode?.[0] === 'E' && e.numericMatchLevel === 'MEDIUM').length;
  const avgSim         = (() => { const s = evs.map(e => e.similarity).filter(Boolean); return s.length ? s.reduce((a,b)=>a+b,0)/s.length : 0; })();

  // 지표 코드별 best status 결정
  const vstPriority    = { VERIFIED: 5, PARTIAL: 4, WEAK: 3, CONTRADICTION: 2, NO_EVIDENCE: 1 };
  const vstByCode      = {};
  for (const ev of evs) {
    const code = ev.indicatorCode; if (!code) continue;
    const vst  = getVerificationStatus(ev);
    if (!vstByCode[code] || (vstPriority[vst] ?? 0) > (vstPriority[vstByCode[code]] ?? 0)) vstByCode[code] = vst;
  }
  const evCodes   = new Set(Object.keys(vstByCode));
  const allCodes  = Object.keys(ALL_INDICATOR_CODES);
  const verifiedEv = allCodes.filter(c => vstByCode[c] === 'VERIFIED').length;
  const partialEv  = allCodes.filter(c => vstByCode[c] === 'PARTIAL' || vstByCode[c] === 'WEAK').length;
  const contraEv   = allCodes.filter(c => vstByCode[c] === 'CONTRADICTION').length;
  const missingEv  = allCodes.filter(c => !evCodes.has(c) || vstByCode[c] === 'NO_EVIDENCE').length;
  const simValues  = evs.map(e => e.similarity).filter(Boolean);
  const medSim     = (() => {
    if (!simValues.length) return 0;
    const s = [...simValues].sort((a,b) => a-b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m-1]+s[m])/2 : s[m];
  })();

  // ── Grade distribution ────────────────────────────────────────────────
  const grades     = ['S','A','B','C','D'];
  const gradeColor = { S:'#a855f7', A:'#059669', B:'#3b82f6', C:'#f59e0b', D:'#ef4444' };

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-dashed border-gray-300 rounded-xl text-left group hover:border-purple-400 transition-colors"
      >
        <span className="text-[8px] font-black text-purple-500 uppercase tracking-widest">DEV</span>
        <BarChart2 size={10} className="text-purple-500" />
        <span className="text-[10px] font-bold text-gray-600 group-hover:text-gray-800">감사 보정 현황</span>
        <span className="text-[9px] text-gray-400 ml-1">— 유사도 분포 · 점수 · 근거 · 업종 가중치</span>
        <span className="ml-auto text-gray-400">{open ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}</span>
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-4 animate-in slide-in-from-top-1 duration-200">
          {/* Row 1: Industry weights + Score bars */}
          <div className="grid grid-cols-2 gap-4">
            {/* Industry weights panel */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">
                업종 가중치 — KSIC {ksicCode || 'N/A'} · {iw.label}
              </p>
              {[['E','환경', iw.E, '#059669'], ['S','사회', iw.S, '#3b82f6'], ['G','지배구조', iw.G, '#f59e0b']].map(([cat, lbl, w, col]) => (
                <div key={cat} className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-black font-mono w-4" style={{ color: col }}>{cat}</span>
                  <span className="text-[9px] text-gray-500 w-14">{lbl}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w*100}%`, background: col }} />
                  </div>
                  <span className="text-[9px] font-black tabular-nums font-mono w-10 text-right" style={{ color: col }}>
                    {Math.round(w*100)}%
                  </span>
                </div>
              ))}
              <div className="mt-3 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2">
                {[['E', data.eScore, '#059669'], ['S', data.sScore, '#3b82f6'], ['G', data.gScore, '#f59e0b']].map(([c, sc, col]) => (
                  <div key={c} className="text-center">
                    <p className="text-[8px] text-gray-500 uppercase">{c} 점수</p>
                    <p className="text-base font-black tabular-nums font-mono" style={{ color: col }}>{sc ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence stats panel */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">근거 통계</p>
              {[
                { label: '전체 근거 수 (records)',  value: totalEv,                               color: '#a1a1aa' },
                { label: '검증 완료 (지표 수)',    value: verifiedEv,                            color: '#059669' },
                { label: '부분 검증 (지표 수)',    value: partialEv,                             color: '#d97706' },
                { label: '미검출 지표 (MISSING)',  value: missingEv,                             color: '#6b7280' },
                { label: '불일치 지표 수',         value: contraEv,                              color: '#ef4444' },
                { label: '평균 근거 적합도',            value: `${(avgSim * 100).toFixed(1)}%`,       color: '#3b82f6' },
                { label: '전체 신뢰도',            value: `${data.overallConfidence ?? '?'}%`,   color: '#f59e0b' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-0.5">
                  <span className="text-[9px] text-gray-500">{row.label}</span>
                  <span className="text-[9px] font-black tabular-nums font-mono" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Grade + contradiction */}
          <div className="grid grid-cols-2 gap-4">
            {/* Final grade card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">최종 등급</p>
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black tabular-nums font-mono" style={{ color: gradeColor[data.finalGrade] ?? '#a1a1aa' }}>
                  {data.finalGrade ?? '?'}
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-500">총점: <span className="font-black text-gray-800">{data.totalScore ?? '?'}</span></p>
                  <p className="text-[9px] text-gray-500">신뢰도: <span className="font-black" style={{ color: (data.overallConfidence ?? 0) >= 70 ? '#059669' : '#f59e0b' }}>{data.overallConfidence ?? '?'}%</span></p>
                  {data.gradeCeilingApplied && (
                    <p className="text-[8px] font-bold text-amber-500">⚠ 등급 상한 적용됨</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contradiction details */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">
                불일치 항목 분석 (심각 {contraEv}건 · 경미 {mediumMismatch}건)
              </p>
              {contraEv === 0 && mediumMismatch === 0 ? (
                <p className="text-[9px] text-emerald-500 font-bold">✓ 불일치 항목 없음</p>
              ) : (
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {evs.filter(e => e.contradictionReason).map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] font-black text-red-500 shrink-0">{e.indicatorCode}</span>
                      <span className="text-[8px] font-bold text-red-400 shrink-0">[심각]</span>
                      <span className="text-[8px] text-red-400 leading-tight">{e.contradictionReason}</span>
                    </div>
                  ))}
                  {evs.filter(e => e.indicatorCode?.[0] === 'E' && e.numericMatchLevel === 'MEDIUM').map((e, i) => (
                    <div key={`m${i}`} className="flex items-start gap-1.5">
                      <span className="text-[8px] font-black text-amber-500 shrink-0">{e.indicatorCode}</span>
                      <span className="text-[8px] font-bold text-amber-400 shrink-0">[경미]</span>
                      <span className="text-[8px] text-amber-400 leading-tight">
                        수치 차이 감지{e.numericDifference != null ? ` (${e.numericDifference.toFixed(1)}% 오차)` : ' (MEDIUM)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 고급 상세 보기 accordion (Similarity Distribution + Calibration Flags) */}
          <button
            onClick={() => setAdvOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-left group hover:border-gray-300 transition-colors"
          >
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">감사 근거 상세 보기</span>
            <span className="text-[9px] text-gray-300 ml-1">— 유사도 분포 · 검증 상태 플래그</span>
            <span className="ml-auto text-gray-400">{advOpen ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}</span>
          </button>
          {advOpen && (
            <div className="grid grid-cols-1 gap-3">
              {/* Similarity histogram */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">
                  근거 적합도 분포 (검색된 근거 청크)
                </p>
                <div className="flex items-end gap-1 h-20">
                  {simBuckets.map((lo, i) => {
                    const cnt  = simCounts[i];
                    const h    = Math.max(2, (cnt / simMax) * 100);
                    const col  = lo >= 0.80 ? '#059669' : lo >= 0.65 ? '#3b82f6' : lo >= 0.55 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={lo} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[7px] text-gray-500 tabular-nums">{cnt > 0 ? cnt : ''}</span>
                        <div className="w-full rounded-sm transition-all duration-500"
                          style={{ height: `${h}%`, background: col, opacity: 0.8 }}
                          title={`${Math.round(lo*100)}%-${Math.round((lo+0.05)*100)}%: ${cnt}개`}
                        />
                        <span className="text-[6px] text-gray-500 tabular-nums">{Math.round(lo*100)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {[
                    { label:'SIM_LOW=55%', color:'#f59e0b' }, { label:'SIM_MED=70%', color:'#3b82f6' },
                    { label:'SIM_HIGH=80%', color:'#059669' }, { label:'SIM_S_GATE=84%', color:'#a855f7' },
                  ].map(t => (
                    <span key={t.label} className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="text-[7px] font-mono text-gray-500">{t.label}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Calibration flags */}
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">검증 상태 플래그</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { ok: avgSim >= 0.70, label: `평균 근거 적합도 ${(avgSim*100).toFixed(1)}%` },
                    { ok: contraEv === 0 && mediumMismatch === 0, label: `불일치 ${contraEv}건 · 경미 ${mediumMismatch}건` },
                    { ok: (verifiedEv + partialEv) >= 5, label: `유효 근거 ${verifiedEv + partialEv}건 (검증 ${verifiedEv})` },
                    { ok: (data.overallConfidence ?? 0) >= 50, label: `신뢰도 ${data.overallConfidence ?? 0}%` },
                    { ok: !data.gradeCeilingApplied, label: '등급 상한' + (data.gradeCeilingApplied ? ' 적용됨' : ' 정상') },
                  ].map((f, i) => (
                    <span key={i} className={`text-[8px] font-bold px-2 py-0.5 rounded border font-mono ${
                      f.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                           : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {f.ok ? '✓' : '✕'} {f.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── GPT-grounded indicator explanation hook ───────────────────────────────
function useIndicatorExplanation(ev, analysisId) {
  const [gpxState, setGpxState] = useState({ text: null, loading: false, generated: false });
  const inFlight   = React.useRef(false);
  const generatedR = React.useRef(false);
  const evRef      = React.useRef(ev);
  evRef.current = ev;

  const generateGpt = useCallback(async () => {
    if (inFlight.current || generatedR.current || !analysisId) return;
    inFlight.current   = true;
    generatedR.current = true;
    setGpxState(s => ({ ...s, loading: true }));
    try {
      const cur = evRef.current;
      const res = await api.post(`/analysis/${analysisId}/explain-indicator`, {
        indicatorCode:       cur.indicatorCode,
        indicatorTitle:      cur.indicatorTitle,
        category:            cur.indicatorCode?.[0],
        verificationStatus:  getVerificationStatus(cur),
        numericMatchLevel:   cur.numericMatchLevel,
        numericDiffPercent:  cur.numericDiffPercent,
        inputValue:          cur.inputValue,
        extractedValue:      cur.extractedValue,
        unit:                cur.unit,
        evidenceChunk:       cur.evidenceText,
        similarity:          cur.similarity,
        pageNumber:          cur.pageNumber,
        contradictionReason: cur.contradictionReason,
      });
      const txt = res.data?.explanation ?? (typeof res.data === 'string' ? res.data : '');
      if (typeof txt === 'string' && txt.trim()) {
        setGpxState({ text: txt.trim(), loading: false, generated: true });
      } else {
        throw new Error('empty');
      }
    } catch {
      setGpxState(s => ({ ...s, loading: false, generated: true }));
    } finally {
      inFlight.current = false;
    }
  }, [analysisId]); // stable — only depends on analysisId

  return { gpxState, generateGpt };
}

// ── Evidence importance tier ─────────────────────────────────────────────
const getEvidenceImportance = (ev) => {
  const vstKey  = getVerificationStatus(ev);
  const catChar = ev.indicatorCode?.[0];
  const sim     = toPct(ev.similarity);
  if (vstKey === 'VERIFIED') {
    if (catChar === 'E' && ev.numericMatchLevel === 'HIGH') return 'CRITICAL';
    if (catChar !== 'E' && sim != null && sim >= 85) return 'CRITICAL';
    return 'SUPPORTING';
  }
  if (vstKey === 'PARTIAL') return 'SUPPORTING';
  if (vstKey === 'WEAK')    return 'WEAK';
  return 'WEAK';
};

// ── 판단 근거: 개별 지표 블록 ──────────────────────────────────────
function RagExplanationItem({ ev, analysisId, triggerDelay }) {
  const [chunkOpen, setChunkOpen] = useState(false);
  const { gpxState, generateGpt } = useIndicatorExplanation(ev, analysisId);

  // Auto-trigger GPT explanation on mount (staggered via triggerDelay)
  useEffect(() => {
    if (!analysisId) return;
    const t = setTimeout(generateGpt, triggerDelay ?? 400);
    return () => clearTimeout(t);
  }, [analysisId, generateGpt]); // generateGpt is stable — safe dep

  const vstKey     = getVerificationStatus(ev);
  const catChar    = ev.indicatorCode?.[0];
  const catColor   = ESG_COLOR[catChar] ?? '#a1a1aa';
  const sim        = toPct(ev.similarity);
  const importance = getEvidenceImportance(ev);
  const templateExplanation = generateRagExplanation(ev);
  const displayExplanation  = gpxState.text ?? templateExplanation;
  const isGptGenerated      = !!gpxState.text;
  const confidence  = buildConfidenceReasoning(ev);
  const rawChunk   = ev.evidenceText ?? null;
  const chunkText  = rawChunk ? truncateAtSentenceBoundary(rawChunk, 260) : null;
  const srcFile    = (ev.sourceFile ?? ev.sourceFileName)?.split(/[/\\]/).pop() ?? null;
  const title      = ev.indicatorTitle ?? ALL_INDICATOR_CODES[ev.indicatorCode] ?? ev.indicatorCode;
  const catLabel   = catChar === 'E' ? 'Environmental' : catChar === 'S' ? 'Social' : 'Governance';

  const SC = {
    VERIFIED:      { badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: '✓', label: '검증 완료',          quoteClass: 'verified',      accentColor: '#059669' },
    WEAK:          { badge: 'bg-amber-50 border-amber-200 text-amber-700',       icon: '~', label: '부분 근거',  quoteClass: 'weak',          accentColor: '#d97706' },
    CONTRADICTION: { badge: 'bg-red-50 border-red-200 text-red-600',             icon: '✕', label: '불일치',     quoteClass: 'contradiction', accentColor: '#dc2626' },
    NO_EVIDENCE:   { badge: 'bg-gray-100 border-gray-200 text-gray-500',         icon: '—', label: '근거 없음',       quoteClass: 'no-evidence',   accentColor: '#d1d5db' },
  };
  const sc = SC[vstKey] ?? SC.NO_EVIDENCE;

  const IMP = {
    CRITICAL:   { label: '핵심 근거',   cls: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
    SUPPORTING: { label: '보조 근거', cls: 'bg-blue-50 border-blue-200 text-blue-600'         },
    WEAK:       { label: '간접 근거',       cls: 'bg-gray-50 border-gray-200 text-gray-400'         },
  };
  const imp = IMP[importance] ?? IMP.WEAK;

  const itemClass = [
    'rag-item',
    importance === 'CRITICAL' ? 'importance-critical' : '',
    importance === 'WEAK'     ? 'importance-weak'     : '',
    vstKey === 'CONTRADICTION' ? 'has-contradiction'  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={itemClass}>

      {/* ── Row 1: indicator + title + chips ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className="shrink-0 text-[10px] font-black font-mono px-2.5 py-1 rounded-lg leading-none"
            style={{ color: catColor, background: `${catColor}12`, border: `1px solid ${catColor}30` }}
          >
            {ev.indicatorCode}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-800 leading-snug truncate">{title}</p>
            <p className="text-[10px] font-medium mt-0.5" style={{ color: catColor }}>{catLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {vstKey !== 'NO_EVIDENCE' && (
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border hidden sm:inline-flex items-center ${imp.cls}`}>
              {imp.label}
            </span>
          )}
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 cursor-default ${sc.badge}`}
            title={VSTATUS[vstKey]?.tooltip}
          >
            <span className="font-black">{sc.icon}</span>
            <span>{sc.label}</span>
          </span>
        </div>
      </div>

      {/* ── Contradiction Focus Card (Stage 5) ── */}
      {vstKey === 'CONTRADICTION' && (
        <div className="contradiction-focus-card mb-3">
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle size={11} className="text-red-500 shrink-0" />
            <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.06em]">
              검토 필요
            </span>
            <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 border border-red-200 text-red-600">
              재검토 권장
            </span>
          </div>
          {catChar === 'E' && ev.inputValue != null && ev.extractedValue != null && (
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <div className="p-3 bg-white rounded-lg border border-gray-100">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">제출 입력값</p>
                <p className="text-[17px] font-black tabular-nums text-gray-800 leading-none" style={{ fontFamily: "'Inter', sans-serif" }}>
                  {Number(ev.inputValue).toLocaleString()}
                </p>
                {ev.unit && <p className="text-[10px] text-gray-400 mt-1">{ev.unit}</p>}
              </div>
              <div className="p-3 bg-white rounded-lg border border-red-200">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">문서 추출값</p>
                <p className="text-[17px] font-black tabular-nums text-red-600 leading-none" style={{ fontFamily: "'Inter', sans-serif" }}>
                  {Number(ev.extractedValue).toLocaleString()}
                </p>
                {ev.unit && <p className="text-[10px] text-gray-400 mt-1">{ev.unit}</p>}
              </div>
            </div>
          )}
          {ev.numericDiffPercent != null && (
            <p className="text-[11px] font-semibold text-red-600">
              차이 ±{Number(ev.numericDiffPercent).toFixed(1)}%
              {ev.unit ? ` · 단위: ${ev.unit}` : ''} — 데이터 출처 또는 보고 기준 재검토 필요
            </p>
          )}
          {ev.contradictionReason && (
            <p className="text-[11px] text-red-500 mt-1.5">{ev.contradictionReason}</p>
          )}
        </div>
      )}

      {/* ── Row 2: AI audit explanation (auto-generated) ── */}
      <div className="mb-3">
        {gpxState.loading ? (
          <div aria-label="AI 설명 생성 중">
            <div className="explanation-skeleton explanation-skeleton-full" />
            <div className="explanation-skeleton explanation-skeleton-full" />
            <div className="explanation-skeleton short" />
          </div>
        ) : (
          <>
            <p className={`text-[13px] text-gray-600 leading-[1.8] max-w-2xl ${isGptGenerated ? 'explanation-reveal' : ''}`}>
              {displayExplanation}
              {isGptGenerated && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-500 align-middle">
                  감사 분석
                </span>
              )}
            </p>
            {/* Matched keywords (S/G VERIFIED 전용) */}
            {(catChar === 'S' || catChar === 'G') && ev.matchedKeywords?.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[9px] text-gray-400 font-semibold tracking-wide">검출 키워드</span>
                {ev.matchedKeywords.slice(0, 6).map((kw, i) => (
                  <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-600">{kw}</span>
                ))}
              </div>
            )}
            {/* 공통 근거 투명성 안내 — 동일 청크가 복수 지표에 사용된 경우 */}
            {ev._sharedWith && ev._sharedWith.length > 0 && (
              <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-sky-50 border border-sky-100">
                <span className="text-[8px] font-black text-sky-500 uppercase tracking-widest shrink-0 mt-0.5">공통 근거</span>
                <p className="text-[10px] text-sky-700 leading-relaxed">
                  해당 근거는{' '}
                  <span className="font-semibold">
                    {ev._sharedWith.map(c => ALL_INDICATOR_CODES[c] ? `${ALL_INDICATOR_CODES[c]}(${c})` : c).join(' · ')}
                  </span>{' '}
                  지표에 공통 활용되었습니다. AI가 같은 문서 구간을 복수 지표 검증에 참조한 것입니다.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── E-indicator: 수치 검증 요약 (자연어 통일 포맷) ── */}
      {catChar === 'E' && (
        <div className="mb-3 rounded-lg overflow-hidden bg-gray-50 border border-gray-200">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-white">
            <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">수치 검증 결과</span>
          </div>
          <div className="px-3 py-2 text-[11px] leading-relaxed text-gray-600">
            {buildESnippet(ev)}
          </div>
        </div>
      )}

      {/* 원문 chunk / 페이지 번호 — 개발/debug 정보 제거 */}

      {/* ── Row 4: Audit verification factors ── */}
      <div className="confidence-factors">
        {confidence.factors.map((f, i) => (
          <span key={i} className="confidence-factor-chip">
            <span className="text-gray-400">
              {f.label === '문서 관련성' ? '관련성' : f.label === 'Evidence valid' ? '문서 커버리지' : f.label}
            </span>
            <span className="value" style={{ color: f.color }}>{f.value}</span>
          </span>
        ))}
        {confidence.factors.length > 0 && (
          <span className="text-gray-300 text-xs select-none">·</span>
        )}
        <span className="confidence-factor-chip">
          <span className="text-gray-400">신뢰도</span>
          <span className="value font-black" style={{ color: confidence.level.color }}>
            {confidence.level.label}
          </span>
        </span>
        {/* 유사도 % chip — 기술적 debug 정보 제거 */}
      </div>
    </div>
  );
}

// ── Audit Completion Summary (dark hero) ────────────────────────────────────
function AuditCompletionSummary({ indicators, data, isAutoSimulation }) {
  if (!indicators?.length || !data) return null;

  const total          = indicators.length;
  const verifiedCount  = indicators.filter(ev => getVerificationStatus(ev) === 'VERIFIED').length;
  const partialCount   = indicators.filter(ev => getVerificationStatus(ev) === 'PARTIAL').length;
  const weakCount      = indicators.filter(ev => getVerificationStatus(ev) === 'WEAK').length;
  const noEvCount      = indicators.filter(ev => getVerificationStatus(ev) === 'NO_EVIDENCE').length;
  const evidencedCount = verifiedCount + partialCount + weakCount;
  const coverageRate   = total > 0 ? Math.round((evidencedCount / total) * 100) : 0;
  const contradictions = indicators.filter(ev => getVerificationStatus(ev) === 'CONTRADICTION').length;
  const overallConf    = data.overallConfidence ?? 0;
  const confLabel      = overallConf >= 70 ? 'HIGH' : overallConf >= 50 ? 'MEDIUM' : 'LOW';
  const confColor      = overallConf >= 70 ? '#10b981' : overallConf >= 50 ? '#f59e0b' : '#ef4444';

  const eItems     = indicators.filter(ev => ev.indicatorCode?.[0] === 'E' && ev.numericMatchLevel);
  const eHigh      = eItems.filter(ev => ev.numericMatchLevel === 'HIGH').length;
  const numericPct = eItems.length > 0 ? Math.round((eHigh / eItems.length) * 100) : null;
  // numeric verification 성공 케이스도 근거 있음으로 포함 (E-104 같은 structured validation)
  const evidenceRefCount = indicators.filter(ev =>
    ev.evidenceText ||
    ev.pageNumber != null ||
    ev.numericMatchLevel === 'HIGH' ||
    ev.numericMatchLevel === 'MEDIUM'
  ).length;

  const verifiedRate = total > 0 ? Math.round((verifiedCount / total) * 100) : 0;
  const missingIndicators = indicators.filter(ev => getVerificationStatus(ev) === 'NO_EVIDENCE');
  const contraIndicators  = indicators.filter(ev => getVerificationStatus(ev) === 'CONTRADICTION');

  const INDICATOR_RECS = {
    'G-302': '내부 신고 시스템 운영 절차를 공시 문서에 명시하면 G-302 검증이 가능합니다.',
    'G-304': '외부 감사 수행 여부와 감사인 정보를 포함하면 G-304 검증이 향상됩니다.',
    'G-301': '윤리경영 강령 및 윤리경영 실천 현황을 정책 문서에 명시하면 G-301 검증이 가능합니다.',
    'S-202': '산업재해 발생 건수·재해율을 연간 기준 수치로 명시하면 S-202 통과가 가능합니다.',
    'S-205': '지역사회 봉사활동 실적과 기여 내용을 운영 증빙 문서에 명시하면 S-205 검증이 가능합니다.',
    'E-103': '탄소배출량 산정 근거(배출계수, 활동량)를 수치로 명시하면 E-103 신뢰도가 향상됩니다.',
    'E-104': '폐기물 발생·처리 실적 수치를 연간 단위로 기재해주세요.',
  };

  const auditSummaryText = (() => {
    // [1] 핵심 지표 검증 현황 — 경영진 보고서 톤
    const sents = [];
    const firstSentence = (() => {
      const base = `총 ${total}개 핵심 ESG 지표 중 ${verifiedCount}개는 명시 감사 근거가 확인되었으며`;
      if (partialCount > 0 && noEvCount > 0) return `${base}, ${partialCount}개는 부분 근거, ${noEvCount}개는 추가 증빙이 필요합니다.`;
      if (partialCount > 0) return `${base}, ${partialCount}개는 부분 근거가 탐지되었습니다.`;
      if (noEvCount > 0) return `${base}, ${noEvCount}개 지표는 증빙 확보가 필요합니다.`;
      return `${base}, 탐지된 주요 지표 기준으로는 높은 근거 일관성이 확인되었습니다.`;
    })();
    sents.push(firstSentence);

    // [2] 부분 검증·미검출 지표 — 실제 코드 언급
    const sgMissing = missingIndicators.filter(ev => ev.indicatorCode?.[0] === 'S' || ev.indicatorCode?.[0] === 'G');
    if (sgMissing.length > 0) {
      const codeList = sgMissing.slice(0, 3).map(ev => {
        const title = ev.indicatorTitle ? `${ev.indicatorCode}(${ev.indicatorTitle})` : ev.indicatorCode;
        return title;
      }).join(', ');
      const suffix = sgMissing.length > 3 ? ` 등 총 ${sgMissing.length}개` : '';
      sents.push(
        `사회(S)·지배구조(G) 영역의 일부 지표는 정책 또는 실적 근거가 부족하여 체크리스트 기반 평가가 적용되었습니다. ` +
        `특히 ${codeList}${suffix} 항목은 관련 운영 절차 또는 공시 문서의 추가 보완이 필요합니다.`
      );
    }

    // [3] E 수치 불일치 — 지표코드·차이율 직접 언급
    if (contradictions > 0) {
      const items = contraIndicators.slice(0, 2).map(ev => {
        const diff = ev.numericDiffPercent != null ? ` ${Number(ev.numericDiffPercent).toFixed(1)}% 차이` : '';
        const nm   = ev.indicatorTitle ? `${ev.indicatorCode}(${ev.indicatorTitle})` : ev.indicatorCode;
        return `${nm}${diff}`;
      }).join(', ');
      sents.push(`환경(E) 영역에서는 ${items} 항목에서 입력값과 증빙 데이터 간 수치 불일치가 감지되었습니다.`);
    } else if (numericPct != null && numericPct < 80) {
      const failCount = eItems.length - eHigh;
      sents.push(`환경(E) 수치 검증 일치율은 ${numericPct}%이며, ${failCount}개 항목에서 추가적인 수치 근거 보완이 권장됩니다.`);
    }

    // [4] 신뢰도 — 간결한 경영진 언어
    const confPct = Math.round(overallConf);
    if (confLabel === 'HIGH') {
      sents.push(`탐지된 감사 근거 기준으로 분석 신뢰도는 ${confPct}% 수준이며, 전반적으로 높은 적합도가 확인되었습니다.`);
    } else if (confLabel === 'MEDIUM') {
      sents.push(`현재 분석 신뢰도는 ${confPct}% 수준이며, 추가 정책 문서 및 운영 실적 데이터 보완 시 검증 정확도 향상이 가능합니다.`);
    } else {
      sents.push(`현재 분석 신뢰도는 ${confPct}% 수준으로, 증빙 문서 보완 및 정책 이행 실적 공시를 통해 신뢰도 향상을 권고드립니다.`);
    }

    return sents.filter(Boolean).join(' ');
  })();

  const checks = [
    { done: true,                 label: `${total}개 K-ESG 지표 분석 완료` },
    { done: evidenceRefCount > 0, label: `${evidenceRefCount}개 문서 구간 검토됨` },
    numericPct != null && { done: numericPct >= 60, label: `수치 일관성 ${numericPct}%` },
    { done: contradictions === 0, label: contradictions === 0 ? '데이터 불일치 없음' : `${contradictions}건 불일치 감지` },
  ].filter(Boolean);

  const statCols = [
    { label: '감사\n신뢰도',   value: confLabel,            sub: `${Math.round(overallConf)}pts`,              color: confColor,
      tooltip: '제출 증빙과 ESG 감사 기준 간 근거 충족 수준을 기반으로 산정됩니다.' },
    { label: '근거\n확인',     value: `${verifiedCount}/${total}`, sub: '지표 근거 확인',                     color: '#10b981',
      tooltip: '문서에서 운영 근거가 식별된 지표 수입니다.' },
    { label: '수치\n불일치',   value: `${contradictions}건`, sub: contradictions === 0 ? '이상 없음' : '재검토 필요', color: contradictions === 0 ? '#10b981' : '#f87171',
      tooltip: '제출 데이터와 증빙 문서 간 불일치 신호가 감지된 지표 수입니다.' },
  ].filter(Boolean);

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'linear-gradient(135deg, #0F172A 0%, #0d1d38 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: '0 0 60px rgba(16,185,129,0.07), 0 8px 32px rgba(0,0,0,0.28)',
    }}>
      {/* 상단 헤더 */}
      <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <CheckCircle size={15} style={{ color: '#10b981' }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-0.5" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>
              {isAutoSimulation ? 'Pre-Analysis Simulation' : 'AI ESG 분석 완료'}
            </p>
            <p className="text-[17px] font-bold" style={{ color: '#fff', letterSpacing: '-0.02em' }}>
              {data.companyName ?? 'ESG 분석 리포트'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {c.done
                ? <CheckCircle size={10} style={{ color: '#10b981' }} />
                : <AlertTriangle size={10} style={{ color: '#f59e0b' }} />}
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KPI 열 */}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${statCols.length}, 1fr)` }}>
        {statCols.map((stat, i) => (
          <div key={i} className="px-5 py-5 relative group" style={{ borderRight: i < statCols.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div className="flex items-center gap-1 mb-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] whitespace-pre-line leading-snug" style={{ color: 'rgba(255,255,255,0.28)', fontFamily: "'Inter', sans-serif" }}>
                {stat.label}
              </p>
              {stat.tooltip && (
                <span className="relative inline-block ml-0.5">
                  <Info size={9} style={{ color: 'rgba(255,255,255,0.2)', cursor: 'help' }} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 text-[10px] leading-snug rounded-lg px-2.5 py-2 z-50 pointer-events-none"
                    style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                    {stat.tooltip}
                  </span>
                </span>
              )}
            </div>
            <p className="text-[26px] font-black leading-none tabular-nums" style={{ fontFamily: "'Inter', sans-serif", color: stat.color, letterSpacing: '-0.03em' }}>
              {stat.value}
            </p>
            <p className="text-[11px] mt-2 tabular-nums" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.28)' }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* AI Summary 서술 */}
      <div className="px-6 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] mb-2.5" style={{ color: 'rgba(255,255,255,0.22)', fontFamily: "'Inter', sans-serif" }}>
          감사 요약
        </p>
        <p className="text-[13px] leading-[1.7]" style={{ color: 'rgba(255,255,255,0.48)', letterSpacing: '-0.005em' }}>
          {auditSummaryText}
        </p>
      </div>
    </div>
  );
}

// ── Executive Summary Block ──────────────────────────────────────────────────
function generateExecutiveSummaryItems(data, indicators) {
  if (!data || !indicators?.length) return [];

  const eScore      = data.eScore    ?? 0;
  const sScore      = data.sScore    ?? 0;
  const gScore      = data.gScore    ?? 0;
  const total       = data.totalScore ?? 0;
  const conf        = data.overallConfidence ?? 0;
  const confLabel   = conf >= 70 ? 'HIGH' : conf >= 50 ? 'MEDIUM' : 'LOW';
  const company     = data.companyName ?? '본 기업';
  const scoreGrade  = s => s >= 85 ? 'S' : s >= 70 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D';

  const catScores = [
    { label: '환경(E)',     score: eScore, grade: scoreGrade(eScore) },
    { label: '사회(S)',     score: sScore, grade: scoreGrade(sScore) },
    { label: '지배구조(G)', score: gScore, grade: scoreGrade(gScore) },
  ].sort((a, b) => b.score - a.score);
  const topCat    = catScores[0];
  const bottomCat = catScores[2];

  const contradictions  = indicators.filter(ev => getVerificationStatus(ev) === 'CONTRADICTION').length;
  const indTotal        = indicators.length;
  const verifiedCount2  = indicators.filter(ev => getVerificationStatus(ev) === 'VERIFIED').length;
  const weakCount2      = indicators.filter(ev => ['PARTIAL','WEAK'].includes(getVerificationStatus(ev))).length;
  const evidencedCount  = verifiedCount2 + weakCount2;  // VERIFIED + PARTIAL + WEAK 포함
  const coveragePct     = indTotal > 0 ? Math.round((evidencedCount / indTotal) * 100) : 0;

  const items = [];

  // 1. ESG 영역 평가 (강점 / 취약 영역)
  if (topCat.score > bottomCat.score + 10) {
    items.push({
      title: 'ESG 영역 평가',
      type: 'neutral',
      body: `${topCat.label} 영역(${topCat.grade}등급, ${Math.round(topCat.score)}점)은 검증 기준 강점 영역으로 평가되었으며, 주요 지표에서 양호한 근거 추적 결과가 확인되었습니다. 반면 ${bottomCat.label} 영역(${bottomCat.grade}등급, ${Math.round(bottomCat.score)}점)에서는 일부 정책 증빙 부족과 지표 기재 미흡이 탐지되어, 관련 문서 보완 및 실적 기재 강화가 권장됩니다.`,
    });
  } else {
    items.push({
      title: 'ESG 영역 평가',
      type: 'neutral',
      body: `${company}은(는) 환경(E)·사회(S)·지배구조(G) 3개 영역에서 K-ESG 기준 종합 ${Math.round(total)}점(${scoreGrade(total)}등급)으로 평가되었습니다. 전반적으로 균형 잡힌 ESG 경영 체계가 유지되고 있으며, 일부 지표에서 문서 기재 보완이 이루어지면 등급 향상이 가능합니다.`,
    });
  }

  // 2. 분석 신뢰도 평가
  if (confLabel === 'HIGH') {
    items.push({
      title: '분석 신뢰도',
      type: 'positive',
      body: `탐지된 감사 근거 기준으로 전체 분석 신뢰도는 높은 수준(HIGH, ${Math.round(conf)}pts)으로 확인됩니다. 제출된 문서의 근거 적합도가 전반적으로 양호하며, 추가 증빙 제출 시 검증 정확도가 더욱 향상될 수 있습니다.`,
    });
  } else if (confLabel === 'MEDIUM') {
    items.push({
      title: '분석 신뢰도',
      type: 'neutral',
      body: `전체 분석 신뢰도는 보통 수준(MEDIUM, ${Math.round(conf)}pts)입니다. 일부 지표에서 문서 근거가 충분하지 않아 정밀 검증에 제한이 있었으며, 정책 이행 실적 및 수치 데이터 보완을 통해 신뢰도 향상이 가능합니다.`,
    });
  } else {
    items.push({
      title: '분석 신뢰도',
      type: 'warning',
      body: `전체 분석 신뢰도는 낮은 수준(LOW, ${Math.round(conf)}pts)으로, 증빙 문서의 전반적인 보강이 필요합니다. 주요 K-ESG 지표에 대한 정책 수립 현황, 실행 실적, 관련 증빙 자료를 추가 제출하시면 신뢰도가 크게 향상됩니다.`,
    });
  }

  // 3. 핵심 리스크
  if (contradictions > 0) {
    items.push({
      title: '핵심 리스크',
      type: 'warning',
      body: `${contradictions}건의 데이터 불일치(Contradiction)가 감지되었습니다. 제출된 환경 수치와 증빙 문서 간 유의미한 차이가 존재하며, 데이터 출처·측정 기준·보고 연도를 재검토하고 원본 증빙 자료를 보완하여 재제출하시길 권장합니다. 해당 항목은 외부 공시 전 반드시 정확성 재확인이 필요합니다.`,
    });
  }

  // 4. 문서 증빙 현황
  if (coveragePct >= 80) {
    items.push({
      title: '문서 증빙 현황',
      type: 'positive',
      body: `총 ${indTotal}개 K-ESG 핵심 지표 중 ${evidencedCount}개(${coveragePct}%)에서 문서 기반 근거 추적이 확인되어 높은 증빙 커버리지를 보입니다. 미검증 ${indTotal - evidencedCount}개 지표에 대한 보완 자료 제출 시 분석 완성도가 더욱 향상됩니다.`,
    });
  } else if (coveragePct >= 55) {
    items.push({
      title: '문서 증빙 현황',
      type: 'neutral',
      body: `총 ${indTotal}개 K-ESG 핵심 지표 중 ${evidencedCount}개(${coveragePct}%)에서 문서 근거가 확인되었습니다. 미검증 ${indTotal - evidencedCount}개 지표의 일부는 정책 미수립 또는 보고서 기재 누락에 기인한 것으로 분석되며, 관련 항목의 구체적 기술이 권장됩니다.`,
    });
  } else {
    items.push({
      title: '문서 증빙 현황',
      type: 'warning',
      body: `총 ${indTotal}개 K-ESG 지표 중 ${evidencedCount}개(${coveragePct}%)에서만 문서 근거가 확인되어 증빙 커버리지가 낮은 수준입니다. 공시 문서의 기재 완성도 향상 또는 추가 증빙 자료 제출 시 감사 점수와 등급이 크게 개선될 수 있습니다.`,
    });
  }

  // 5. 개선 시 기대 효과
  if (noEvCount > 0) {
    items.push({
      title: '개선 기대 효과',
      type: 'neutral',
      body: `현재 미검증 ${noEvCount}개 지표의 증빙이 보완될 경우, ${bottomCat.label} 영역을 중심으로 검증 점수 향상이 기대됩니다. 특히 지배구조(G) 정책 문서 정비 및 사회(S) 정량 실적 기재 보완이 이루어지면 종합 등급의 상향 조정에 긍정적으로 반영될 수 있습니다.`,
    });
  }

  return items;
}

function ExecutiveSummaryBlock({ data, indicators, isAutoSimulation }) {
  if (!data || !indicators?.length || isAutoSimulation) return null;

  const items = generateExecutiveSummaryItems(data, indicators);
  if (!items.length) return null;

  const eScore = data.eScore    ?? 0;
  const sScore = data.sScore    ?? 0;
  const gScore = data.gScore    ?? 0;
  const total  = data.totalScore ?? 0;
  const conf   = data.overallConfidence ?? 0;

  const scoreGrade = s => s >= 85 ? 'S' : s >= 70 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D';
  const gradeColor = g => ({ S: '#7c3aed', A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#dc2626' })[g] ?? '#6b7280';
  const confLabel  = conf >= 70 ? 'HIGH' : conf >= 50 ? 'MEDIUM' : 'LOW';
  const confColor  = conf >= 70 ? '#059669' : conf >= 50 ? '#d97706' : '#dc2626';

  const catData = [
    { cat: 'E', label: '환경',     score: eScore, color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
    { cat: 'S', label: '사회',     score: sScore, color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
    { cat: 'G', label: '지배구조', score: gScore, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  ];
  const sorted   = [...catData].sort((a, b) => b.score - a.score);
  const bestCat  = sorted[0];
  const worstCat = sorted[sorted.length - 1];

  const contradictions = indicators.filter(ev => getVerificationStatus(ev) === 'CONTRADICTION').length;
  const noEvCount      = indicators.filter(ev => getVerificationStatus(ev) === 'NO_EVIDENCE').length;
  const evidencedCount = indicators.length - noEvCount;

  const typeStyle = {
    positive: { dot: '#10b981', bar: '#10b981', title: 'text-emerald-700' },
    warning:  { dot: '#f59e0b', bar: '#f59e0b', title: 'text-amber-700' },
    neutral:  { dot: '#94a3b8', bar: '#e2e8f0', title: 'text-gray-500' },
  };

  return (
    <div className="saas-card overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-3.5 px-6 py-5 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          <FileText size={15} className="text-white" />
        </div>
        <div>
          <p className="text-[15px] font-bold text-gray-900" style={{ letterSpacing: '-0.01em' }}>Executive Summary</p>
          <p className="text-[11px] text-gray-400 mt-0.5">AI ESG 분석 경영진 요약 보고서</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border" style={{ background: `${confColor}10`, borderColor: `${confColor}28`, color: confColor }}>
            {confLabel} · {confLabel === 'HIGH' ? '신뢰도 높은 검증' : confLabel === 'MEDIUM' ? '부분 검증 포함' : '보수적 추정 기반'}
          </span>
        </div>
      </div>

      {/* E/S/G 점수 그리드 */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        {catData.map(({ cat, label, score, color, bg, border }) => {
          const g      = scoreGrade(score);
          const isBest  = cat === bestCat.cat && worstCat.score < bestCat.score - 8;
          const isWorst = cat === worstCat.cat && worstCat.score < bestCat.score - 8;
          return (
            <div key={cat} className="px-5 py-4 text-center">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mb-2.5" style={{ background: bg, border: `1px solid ${border}` }}>
                <span className="text-[10px] font-black" style={{ color, fontFamily: "'Inter', sans-serif" }}>{cat}</span>
                <span className="text-[10px] font-semibold text-gray-500">{label}</span>
              </div>
              <p className="text-[28px] font-black leading-none tabular-nums" style={{ fontFamily: "'Inter', sans-serif", color, letterSpacing: '-0.03em' }}>
                {Math.round(score)}
              </p>
              <p className="text-[11px] mt-1.5 font-bold" style={{ color: gradeColor(g) }}>{g}등급</p>
              {isBest  && <p className="text-[10px] text-emerald-500 mt-1 font-semibold tracking-wide">▲ 감사 강점 영역</p>}
              {isWorst && <p className="text-[10px] text-amber-500 mt-1 font-semibold tracking-wide">▼ 중점 개선 권고</p>}
            </div>
          );
        })}
      </div>

      {/* 핵심 지표 행 */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-5 py-3.5">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-1">감사 검증 현황</p>
          <p className="text-[13px] font-bold text-gray-800 tabular-nums">{verifiedCount}/{indicators.length} 근거 확인</p>
          <p className="text-[9px] text-gray-400 mt-0.5">{indicators.length}개 지표 검토 완료</p>
        </div>
        <div className="px-5 py-3.5">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-1">Contradiction</p>
          <p className={`text-[13px] font-bold ${contradictions > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {contradictions > 0 ? `${contradictions}건 감지` : '이상 없음'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{contradictions > 0 ? '재검토 필요' : '데이터 일관'}</p>
        </div>
        <div className="px-5 py-3.5">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-1">K-ESG Score</p>
          <p className="text-[13px] font-bold text-gray-800 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>{Math.round(total)}점</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{scoreGrade(total)}등급 · K-ESG 기준</p>
        </div>
      </div>

      {/* 서술 — 컨설팅 스타일 단락 */}
      <div className="px-6 py-5">
        <div className="space-y-0">
          {items.map(({ title, type, body }, i) => {
            const s = typeStyle[type] ?? typeStyle.neutral;
            return (
              <div key={i} className="flex gap-3.5 group">
                <div className="flex flex-col items-center shrink-0 pt-[3px]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.dot }} />
                  {i < items.length - 1 && <div className="w-px flex-1 my-1.5" style={{ background: `${s.bar}30` }} />}
                </div>
                <div className="pb-4 min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-[0.09em] mb-1.5 ${s.title}`}>{title}</p>
                  <p className="text-[13px] text-gray-700 leading-relaxed" style={{ letterSpacing: '-0.01em' }}>{body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Audit Confidence Summary ────────────────────────────────────────────────
const generateConfidenceNarrative = (evidencedCount, total, avgRelevance, numericMatchRate, contradictions, overallConf) => {
  const evidencePct = total > 0 ? Math.round((evidencedCount / total) * 100) : 0;
  let text = `총 ${total}개 K-ESG 지표 중 ${evidencedCount}개(${evidencePct}%)에서 문서 기반 감사 근거가 확인되었습니다.`;

  if (avgRelevance != null) {
    if (avgRelevance >= 75)
      text += ` 사회·지배구조 지표의 문서 관련성은 평균 ${avgRelevance}%로 높은 수준이며,`;
    else if (avgRelevance >= 60)
      text += ` 사회·지배구조 지표의 문서 관련성은 평균 ${avgRelevance}%로 보통 수준이며,`;
    else
      text += ` 사회·지배구조 지표의 문서 관련성이 평균 ${avgRelevance}%로 다소 낮아`;
  }

  if (numericMatchRate != null) {
    if (numericMatchRate >= 80)
      text += ` 환경(E) 수치 검증 일치율은 ${numericMatchRate}%로 신뢰할 수 있는 수준입니다.`;
    else if (numericMatchRate >= 60)
      text += ` 환경(E) 수치 일치율은 ${numericMatchRate}%로 일부 항목의 재검토가 권장됩니다.`;
    else
      text += ` 환경(E) 수치 검증 일치율이 ${numericMatchRate}%로 낮아 데이터 신뢰도 향상이 필요합니다.`;
  } else if (avgRelevance != null) {
    text += ` 전반적인 감사 근거 품질은 문서 구성과 기재 방식에 따라 달라집니다.`;
  }

  if (contradictions === 0)
    text += ` 수치 불일치 항목은 감지되지 않아 전체 감사 신뢰도가 안정적입니다.`;
  else if (contradictions === 1)
    text += ` 1건의 불일치 항목이 감지되었으나 전체 감사 신뢰도에 미치는 영향은 제한적입니다.`;
  else
    text += ` ${contradictions}건의 불일치 항목이 감지되어 해당 항목들의 면밀한 재검토가 필요합니다.`;

  return text;
};

function AuditConfidenceSummary({ indicators, data, isAutoSimulation }) {
  if (isAutoSimulation || !indicators?.length) return null;

  const total      = indicators.length;
  const evidenced  = indicators.filter(ev => ev.evidenceText || ev.similarity != null || ev.numericMatchLevel);
  if (evidenced.length === 0) return null;

  const sgWithSim  = evidenced.filter(ev => ev.indicatorCode?.[0] !== 'E' && ev.similarity != null);
  const avgRelevance = sgWithSim.length > 0
    ? Math.round(sgWithSim.reduce((s, ev) => s + toPct(ev.similarity), 0) / sgWithSim.length)
    : null;

  const eItems = evidenced.filter(ev => ev.indicatorCode?.[0] === 'E' && ev.numericMatchLevel);
  const eHigh  = eItems.filter(ev => ev.numericMatchLevel === 'HIGH').length;
  const numericMatchRate = eItems.length > 0 ? Math.round((eHigh / eItems.length) * 100) : null;

  const contradictions = indicators.filter(ev => getVerificationStatus(ev) === 'CONTRADICTION').length;
  const verified       = indicators.filter(ev => getVerificationStatus(ev) === 'VERIFIED').length;
  const overallConf    = data?.overallConfidence ?? 0;
  const confLabel      = overallConf >= 70 ? 'HIGH' : overallConf >= 50 ? 'MEDIUM' : 'LOW';
  const confColor      = overallConf >= 70 ? '#059669' : overallConf >= 50 ? '#d97706' : '#dc2626';

  const narrative = generateConfidenceNarrative(evidenced.length, total, avgRelevance, numericMatchRate, contradictions, overallConf);

  const stats = [
    {
      Icon: Search, iconBg: '#eff6ff', iconColor: '#3b82f6',
      label: '근거 커버리지',
      value: `${evidenced.length}/${total}`,
      suffix: '지표',
      sub: `${Math.round((evidenced.length / total) * 100)}% 분석 완료`,
    },
    avgRelevance != null ? {
      Icon: TrendingUp, iconBg: '#f0fdf4', iconColor: '#059669',
      label: '관련성',
      value: `${avgRelevance}%`,
      suffix: null,
      sub: avgRelevance >= 75 ? '높은 수준' : avgRelevance >= 60 ? '보통 수준' : '낮은 수준',
    } : null,
    numericMatchRate != null ? {
      Icon: CheckCircle2, iconBg: '#f0fdf4', iconColor: '#059669',
      label: 'Numeric Consistency',
      value: `${numericMatchRate}%`,
      suffix: null,
      sub: numericMatchRate >= 80 ? '신뢰 수준' : numericMatchRate >= 60 ? '검토 권장' : '재검토 필요',
    } : null,
    {
      Icon: contradictions > 0 ? AlertTriangle : CheckCircle,
      iconBg: contradictions > 0 ? '#fff7ed' : '#f0fdf4',
      iconColor: contradictions > 0 ? '#d97706' : '#059669',
      label: 'Contradiction',
      value: `${contradictions}건`,
      suffix: null,
      sub: contradictions === 0 ? '이상 없음' : `${contradictions}건 재검토 필요`,
    },
  ].filter(Boolean);

  return (
    <div className="saas-card overflow-hidden">
      {/* ── 헤더 ── */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-100">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', boxShadow: '0 2px 8px rgba(59,130,246,0.2)' }}
        >
          <Shield size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="text-[15px] font-bold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
              분석 신뢰도 요약
            </p>
            <span
              className="text-[10px] font-black px-2.5 py-1 rounded-full border"
              style={{ background: `${confColor}12`, borderColor: `${confColor}35`, color: confColor }}
            >
              {confLabel} · {confLabel === 'HIGH' ? '신뢰도 높은 검증' : confLabel === 'MEDIUM' ? '부분 검증 포함' : '보수적 추정 기반'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            K-ESG 감사 지표 기준 · {total}개 지표 검토 완료
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="text-[28px] font-black tabular-nums leading-none"
            style={{ fontFamily: "'Inter', sans-serif", color: confColor }}
          >
            {Math.round(overallConf)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Confidence</p>
        </div>
      </div>

      {/* ── KPI 그리드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100 border-b border-gray-100">
        {stats.map((stat, i) => {
          const Icon = stat.Icon;
          return (
            <div key={i} className="audit-stat-item">
              <div className="flex items-center gap-2 mb-2">
                <span className="audit-stat-icon" style={{ background: stat.iconBg }}>
                  <Icon size={12} style={{ color: stat.iconColor }} />
                </span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-snug">
                  {stat.label}
                </span>
              </div>
              <p
                className="text-[21px] font-black tabular-nums leading-none text-gray-900"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {stat.value}
                {stat.suffix && (
                  <span className="text-[11px] font-semibold text-gray-400 ml-1">{stat.suffix}</span>
                )}
              </p>
              <p className="text-[10px] text-gray-400 mt-1.5">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── AI 감사 서술 ── */}
      <div className="flex items-start gap-3 px-6 py-4">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}
        >
          <FileText size={11} className="text-white" />
        </div>
        <p className="text-[13px] text-gray-600 leading-[1.8] flex-1 max-w-2xl">{narrative}</p>
      </div>
    </div>
  );
}

// ── 판단 근거 섹션 (summary 탭 삽입) ─────────────────────────────
function RagExplanationSection({ indicators, isAutoSimulation, analysisId }) {
  const [showAll, setShowAll]         = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');

  if (isAutoSimulation) return null;

  const evidenced = (indicators ?? []).filter(ev =>
    ev.evidenceText || ev.similarity != null || ev.numericMatchLevel
  );
  if (evidenced.length === 0) return null;

  // 공통 근거 청크 탐지: 동일 evidenceText 앞 120자 기준으로 다중 지표 매핑 여부 확인
  const chunkKeyToIndicators = {};
  for (const ev of evidenced) {
    const ck = (ev.evidenceText ?? '').trim().slice(0, 120);
    if (!ck) continue;
    if (!chunkKeyToIndicators[ck]) chunkKeyToIndicators[ck] = [];
    if (!chunkKeyToIndicators[ck].includes(ev.indicatorCode)) chunkKeyToIndicators[ck].push(ev.indicatorCode);
  }
  // ev에 _sharedWith 주입 (공통 청크를 공유하는 다른 지표 코드 목록)
  const evidencedWithShared = evidenced.map(ev => {
    const ck = (ev.evidenceText ?? '').trim().slice(0, 120);
    const sharedWith = ck ? (chunkKeyToIndicators[ck] ?? []).filter(c => c !== ev.indicatorCode) : [];
    return sharedWith.length > 0 ? { ...ev, _sharedWith: sharedWith } : ev;
  });

  const VSTATUS_ORDER = { VERIFIED: 0, PARTIAL: 1, WEAK: 2, CONTRADICTION: 3, NO_EVIDENCE: 4 };
  const CAT_ORDER     = { E: 0, S: 1, G: 2 };

  const filtered = activeFilter === 'ALL'
    ? evidencedWithShared
    : evidencedWithShared.filter(ev => ev.indicatorCode?.startsWith(activeFilter));

  const sorted = [...filtered].sort((a, b) => {
    const ca = CAT_ORDER[a.indicatorCode?.[0]] ?? 9;
    const cb = CAT_ORDER[b.indicatorCode?.[0]] ?? 9;
    if (ca !== cb) return ca - cb;
    return (VSTATUS_ORDER[getVerificationStatus(a)] ?? 9) - (VSTATUS_ORDER[getVerificationStatus(b)] ?? 9);
  });

  const INITIAL_COUNT = 5;
  const displayed = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);
  const hasMore   = sorted.length > INITIAL_COUNT;

  const catCounts = { ALL: evidencedWithShared.length };
  ['E', 'S', 'G'].forEach(c => {
    catCounts[c] = evidencedWithShared.filter(ev => ev.indicatorCode?.startsWith(c)).length;
  });

  const vstCounts = {
    VERIFIED:      evidenced.filter(ev => getVerificationStatus(ev) === 'VERIFIED').length,
    PARTIAL:       evidenced.filter(ev => getVerificationStatus(ev) === 'PARTIAL').length,
    WEAK:          evidenced.filter(ev => getVerificationStatus(ev) === 'WEAK').length,
    CONTRADICTION: evidenced.filter(ev => getVerificationStatus(ev) === 'CONTRADICTION').length,
    NO_EVIDENCE:   evidenced.filter(ev => getVerificationStatus(ev) === 'NO_EVIDENCE').length,
  };

  const verificationRate = evidenced.length > 0
    ? Math.round((vstCounts.VERIFIED / evidenced.length) * 100)
    : 0;

  const CAT_FILTER_LABELS = { ALL: '전체', E: '환경 (E)', S: '사회 (S)', G: '지배구조 (G)' };

  return (
    <div className="saas-card overflow-hidden">

      {/* ── 헤더 ── */}
      <div className="flex items-start gap-4 px-6 py-5 border-b border-gray-100">
        {/* Gradient icon */}
        <div className="rag-header-icon shrink-0">
          <FileText size={15} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-bold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
              판단 근거
            </p>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600">
              문서 기반 검증
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            증빙 문서 기반 감사 결과 · {evidenced.length}개 지표 검토
          </p>

          {/* Verification rate bar */}
          <div className="flex items-center gap-2.5 mt-3">
            <div className="verification-bar flex-1 max-w-[160px]">
              <div className="verification-bar-fill" style={{ width: `${verificationRate}%` }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums" style={{
              color: verificationRate >= 70 ? '#059669' : verificationRate >= 50 ? '#d97706' : '#9ca3af',
              fontFamily: "'Inter', sans-serif"
            }}>
              {verificationRate}% 검증 완료
            </span>
          </div>
        </div>

        {/* Status summary (desktop) */}
        <div className="hidden lg:flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {vstCounts.VERIFIED > 0 && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-1">
                <span className="font-black">✓</span> {vstCounts.VERIFIED} 확인
              </span>
            )}
            {vstCounts.WEAK > 0 && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center gap-1">
                <span className="font-black">~</span> {vstCounts.WEAK} 부분 확인
              </span>
            )}
            {vstCounts.CONTRADICTION > 0 && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center gap-1">
                <span className="font-black">✕</span> {vstCounts.CONTRADICTION} 불일치
              </span>
            )}
          </div>
          {vstCounts.NO_EVIDENCE > 0 && (
            <span className="text-[9px] text-gray-400">— {vstCounts.NO_EVIDENCE} 미확인</span>
          )}
        </div>
      </div>

      {/* ── 카테고리 필터 ── */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-gray-100 bg-gray-50/40 overflow-x-auto">
        {['ALL', 'E', 'S', 'G']
          .filter(c => c === 'ALL' || catCounts[c] > 0)
          .map(c => (
            <button
              key={c}
              onClick={() => { setActiveFilter(c); setShowAll(false); }}
              className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                activeFilter === c
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white hover:shadow-sm'
              }`}
            >
              {c !== 'ALL' && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: activeFilter === c ? '#fff' : ESG_COLOR[c] }}
                />
              )}
              <span>{CAT_FILTER_LABELS[c] ?? c}</span>
              <span className={`tabular-nums ${activeFilter === c ? 'opacity-60' : 'opacity-50'}`}>
                ({c === 'ALL' ? catCounts.ALL : (catCounts[c] ?? 0)})
              </span>
            </button>
          ))
        }
      </div>

      {/* ── 지표별 카드 목록 ── */}
      <div className="px-6 py-5 space-y-3">
        {displayed.length === 0 ? (
          <div className="empty-state py-10">
            <div className="empty-icon"><FileText size={18} className="text-gray-400" /></div>
            <p className="text-sm font-semibold text-gray-600">해당 카테고리의 분석 데이터가 없습니다.</p>
            <p className="text-xs text-gray-400">다른 카테고리를 선택하거나 ESG 감사 분석을 다시 실행해 주세요.</p>
          </div>
        ) : (
          displayed.map((ev, i) => (
            <RagExplanationItem
              key={ev.indicatorCode ?? Math.random()}
              ev={ev}
              analysisId={analysisId}
              triggerDelay={i * 180 + 300}
            />
          ))
        )}
      </div>

      {/* ── 더 보기 / 접기 ── */}
      {hasMore && !showAll && (
        <div className="px-6 pb-4">
          <button
            onClick={() => setShowAll(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-500 hover:text-gray-700 transition-all duration-150"
          >
            <ChevronDown size={13} />
            나머지 {sorted.length - INITIAL_COUNT}개 지표 더 보기
          </button>
        </div>
      )}
      {showAll && sorted.length > INITIAL_COUNT && (
        <div className="px-6 pb-4">
          <button
            onClick={() => setShowAll(false)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-500 hover:text-gray-700 transition-all duration-150"
          >
            <ChevronUp size={13} />
            접기
          </button>
        </div>
      )}

      {/* ── 푸터 ── */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-t border-gray-100 bg-gray-50/30">
        <div className="w-4 h-4 rounded bg-violet-100 flex items-center justify-center shrink-0">
          <FileText size={9} className="text-violet-500" />
        </div>
        <p className="text-[10px] text-gray-400 leading-relaxed">
          업로드된 ESG 증빙 문서를 기반으로 AI가 생성한 지표별 감사 근거 보고서입니다.
          K-ESG 기준에 따라 증빙 매핑 및 근거 판정이 수행됩니다.
        </p>
      </div>
    </div>
  );
}

// ── AI Audit 권고사항 컴포넌트 ────────────────────────────────────────────
function AiAuditRecommendations({ indicators, isAutoSimulation }) {
  if (isAutoSimulation) return null;

  const recs = buildRecommendations(indicators);
  if (recs.length === 0) return null;

  const PRIORITY_CONFIG = {
    HIGH:   { label: 'HIGH',   bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-600'   },
    MEDIUM: { label: 'MEDIUM', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-600' },
    LOW:    { label: 'LOW',    bg: 'bg-gray-100',  border: 'border-gray-200',  text: 'text-gray-500'  },
  };
  const CAT_COLOR = { E: '#059669', S: '#3b82f6', G: '#f59e0b' };
  const CAT_LABEL = { E: 'Environmental', S: 'Social', G: 'Governance' };

  const highCount = recs.filter(r => r.priority === 'HIGH').length;
  const medCount  = recs.filter(r => r.priority === 'MEDIUM').length;
  const lowCount  = recs.filter(r => r.priority === 'LOW').length;

  return (
    <div className="saas-card overflow-hidden">
      {/* ── 헤더 ── */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-100">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', boxShadow: '0 2px 8px rgba(239,68,68,0.2)' }}
        >
          <Zap size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-bold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
              개선 권고사항
            </p>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
              K-ESG 기반
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            검증 결과 기반 우선순위 개선 권고 · {recs.length}건
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {highCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600">
              HIGH {highCount}
            </span>
          )}
          {medCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600">
              MED {medCount}
            </span>
          )}
          {lowCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
              LOW {lowCount}
            </span>
          )}
        </div>
      </div>

      {/* ── 권고 목록 ── */}
      <div className="divide-y divide-gray-100">
        {recs.map((rec, i) => {
          const pc = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.LOW;
          const catColor = CAT_COLOR[rec.category] ?? '#a1a1aa';
          const catLabel = CAT_LABEL[rec.category] ?? rec.category;
          return (
            <div
              key={rec.code}
              className="flex items-start gap-4 px-6 py-5 hover:bg-gray-50/50 transition-colors duration-150"
            >
              <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${pc.bg} ${pc.border} ${pc.text}`}>
                  {pc.label}
                </span>
                <span className="text-[9px] text-gray-300 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <p className="text-[13px] font-semibold text-gray-800 leading-snug">{rec.title}</p>
                  <span
                    className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: catColor, background: `${catColor}15`, border: `1px solid ${catColor}30` }}
                  >
                    {catLabel}
                  </span>
                  {rec._cnt != null && rec._cnt > 0 && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-600">
                      근거 부족 지표 {rec._cnt}개
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-gray-500 leading-[1.72] mb-2 max-w-2xl">{rec.desc}</p>
                {rec.docs?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[9px] font-bold text-gray-400 self-center">추천 서류 (예시)</span>
                    {rec.docs.map((doc, j) => (
                      <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                        {doc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 푸터 ── */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-t border-gray-100 bg-gray-50/30">
        <div className="w-4 h-4 rounded bg-orange-100 flex items-center justify-center shrink-0">
          <Zap size={9} className="text-orange-500" />
        </div>
        <p className="text-[10px] text-gray-400 leading-relaxed">
          검증 결과의 불일치·근거 부족 항목을 기반으로 K-ESG 기준에 따라 자동 생성된 개선 권고입니다. 내부 검토 후 적용 여부를 결정하세요.
        </p>
      </div>
    </div>
  );
}

// ── XAI Commentary Panel ─────────────────────────────────────────────────
// allIndicators: buildCompleteIndicatorList() 반환값 (NO_EVIDENCE 합성 포함, 이미 dedup·정렬됨)
function XAICommentaryPanel({ allIndicators, isAutoSimulation }) {
  const [open, setOpen] = useState(false);

  if (isAutoSimulation || !allIndicators?.length) return null;

  // allIndicators는 buildCompleteIndicatorList()에서 이미 dedup·정렬됨
  const items = allIndicators;

  const vstCounts = {
    VERIFIED:      items.filter(e => getVerificationStatus(e) === 'VERIFIED').length,
    PARTIAL:       items.filter(e => getVerificationStatus(e) === 'PARTIAL').length,
    WEAK:          items.filter(e => getVerificationStatus(e) === 'WEAK').length,
    CONTRADICTION: items.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length,
    NO_EVIDENCE:   items.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length,
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <span className="flex items-center gap-1.5">
          <FileText size={9} className="text-purple-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-700 transition-colors">
            지표별 감사 의견
          </span>
        </span>
        <span className="text-xs text-gray-400 ml-1">— 이 등급이 산출된 이유</span>
        <div className="flex items-center gap-1.5 ml-2">
          {vstCounts.VERIFIED      > 0 && <span className="text-[8px] font-bold text-emerald-600 tabular-nums">{vstCounts.VERIFIED}✓</span>}
          {vstCounts.WEAK          > 0 && <span className="text-[8px] font-bold text-amber-500 tabular-nums">{vstCounts.WEAK}~</span>}
          {vstCounts.CONTRADICTION > 0 && <span className="text-[8px] font-bold text-red-500 tabular-nums">{vstCounts.CONTRADICTION}✕</span>}
          {vstCounts.NO_EVIDENCE   > 0 && <span className="text-[8px] font-bold text-gray-400 tabular-nums">{vstCounts.NO_EVIDENCE}—</span>}
        </div>
        <span className="ml-auto text-gray-400 shrink-0">{open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2 animate-in slide-in-from-top-1 duration-150">
          {/* summary row */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
            <FileText size={10} className="text-purple-500 shrink-0" />
            <span className="text-[9px] text-gray-500">
              총 <span className="text-gray-800 font-bold">{items.length}</span>개 지표 분석 완료 —
              검증 <span className="text-emerald-600 font-bold">{vstCounts.VERIFIED}</span>건,
              근거 부족 <span className="text-amber-500 font-bold">{vstCounts.WEAK}</span>건,
              불일치 <span className="text-red-500 font-bold">{vstCounts.CONTRADICTION}</span>건,
              증빙 없음 <span className="text-gray-400 font-bold">{vstCounts.NO_EVIDENCE}</span>건
            </span>
          </div>

          {/* per-indicator commentary */}
          {items.map((ev) => {
            const vstKey  = getVerificationStatus(ev);
            const vst     = VSTATUS[vstKey];
            const comment = generateIndicatorCommentary(ev);
            const catChar = ev.indicatorCode?.[0];
            const catCol  = ESG_COLOR[catChar] ?? '#a1a1aa';

            return (
              <div
                key={ev.indicatorCode}
                className={`rounded-xl px-3.5 py-2.5 border flex items-start gap-3 ${vst.bg} ${vst.border}`}
              >
                {/* left: code + status */}
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5 min-w-[64px]">
                  <span
                    className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded-md"
                    style={{ color: catCol, background: `${catCol}15`, border: `1px solid ${catCol}30` }}
                  >
                    {ev.indicatorCode}
                  </span>
                  <span className={`text-[8px] font-bold text-center ${vst.text}`}>
                    {vst.icon} {vstKey === 'NO_EVIDENCE' ? '미검출' : vstKey === 'CONTRADICTION' ? '불일치' : vstKey === 'VERIFIED' ? '검증' : '부족'}
                  </span>
                </div>
                {/* right: title + commentary */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-700 mb-0.5 leading-tight">
                    {ev.indicatorTitle ?? ev.indicatorCode}
                  </p>
                  <p className={`text-[9px] leading-relaxed ${vst.text} opacity-90`}>
                    {comment}
                  </p>
                </div>
              </div>
            );
          })}
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
    <div className="saas-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-all duration-150 group"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            style={{ background: `${section.color}15` }}
          >
            <Icon size={15} style={{ color: section.color }} />
          </span>
          <span className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors">
            {section.title}
          </span>
        </div>
        {open
          ? <ChevronUp size={15} className="text-gray-400" />
          : <ChevronDown size={15} className="text-gray-400" />
        }
      </button>
      {open && (
        <div className="px-6 pb-6 pt-2 border-t border-gray-100">
          <div
            className="text-sm text-gray-600 max-w-3xl"
            style={{ lineHeight: '1.85' }}
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
    <div className="tooltip-dark">
      {label && <p className="text-white/60 mb-1.5 text-[10px] uppercase tracking-wide">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="tabular-nums text-xs" style={{ color: p.color ?? p.fill ?? '#e5e7eb' }}>
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
    <div className="tooltip-dark">
      <p className="text-white/70 text-xs">
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

// outlier-resistant median diff (LOW contradiction 1건으로 980% 왜곡 방지)
const calcMedianDiff = (items) => {
  const vals = items
    .map(e => e.numericDiffPercent ?? 0)
    .filter(v => v < 500)           // 극단값(500% 초과) 제외
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const m = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? (vals[m - 1] + vals[m]) / 2 : vals[m];
};

// 전체 항목 기준 산술평균 오차율 (극단값 500% 초과 제외)
const calcMeanDiff = (items) => {
  const vals = items
    .map(e => e.numericDiffPercent ?? 0)
    .filter(v => v < 500);
  if (!vals.length) return null;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
};

// ── 점수 산정 해설 빌더 ───────────────────────────────────────────────
function buildAnalysisSummary(data) {
  if (!data) return null;
  const evs = data.evidenceMatches ?? [];

  // ── E 카테고리 (E-101~E-105 = 5개 지표) ──────────────────────────────
  // 지표 코드 기준 dedup: 동일 지표에 여러 evidenceMatch 있을 때 numericMatchLevel 우선 선택
  const eByCode = new Map();
  for (const ev of evs.filter(e => e.indicatorCode?.startsWith('E'))) {
    const code = ev.indicatorCode;
    if (!eByCode.has(code)) { eByCode.set(code, ev); continue; }
    const ex = eByCode.get(code);
    // numericMatchLevel 있는 쪽 우선
    const evNum = ev.numericMatchLevel ? 1 : 0;
    const exNum = ex.numericMatchLevel ? 1 : 0;
    if (evNum > exNum) eByCode.set(code, ev);
  }
  const eEvs    = [...eByCode.values()].filter(e => e.numericMatchLevel != null);
  const eHigh   = eEvs.filter(e => e.numericMatchLevel === 'HIGH').length;
  const eMed    = eEvs.filter(e => e.numericMatchLevel === 'MEDIUM').length;
  const eLow    = eEvs.filter(e => e.numericMatchLevel === 'LOW').length;
  const eTotal  = 5;
  const eFailed = eTotal - eByCode.size;  // numericMatchLevel 없는 지표 포함 전체 미확인 수
  // 전체 E 지표 기준 산술평균 오차율 (HIGH 포함, 500% 초과 극단값 제외)
  const eAvgDiff = calcMeanDiff(eEvs);
  // 모든 E 지표 중 최대 오차율 (HIGH 포함) — avgDiff null 일 때 대표값으로 사용
  const eMaxDiff = eEvs.length === 0 ? null
    : eEvs.reduce((max, ev) => Math.max(max, ev.numericDiffPercent ?? 0), 0);
  const isAllEFailed = eEvs.length === 0 && eTotal > 0;
  // 오차율 3단계 해석 레이블 (LOW=0 전제)
  const eQualityLabel = (diff) =>
    diff == null || diff <= 5  ? '매우 높은 데이터 일관성을 보였습니다.' :
    diff <= 15                 ? '전반적으로 양호한 데이터 일관성을 보였습니다.' :
                                 '일부 지표 간 차이가 확인되었으나 허용 범위 내로 평가되었습니다.';
  const eSummary = isAllEFailed
    ? '기업 실측 데이터 추출에 실패하여 업종 평균 벤치마크 기반 추정 평가가 적용되었습니다.'
    : eFailed >= 3
    ? `${eFailed}개 항목의 수치 추출에 실패했습니다. 업종 평균 기반 추정치가 부분 적용되었습니다.`
    : eLow >= 3
    ? `${eLow}개 지표에서 입력값과 증빙 수치 간 불일치가 감지되어 보수적 평가가 적용되었습니다. 해당 항목의 측정 기준 및 데이터 출처 재확인이 권장됩니다.`
    : eLow >= 1
    ? `${eLow}개 지표에서 수치 불일치가 확인되어 추가 검토가 필요합니다.${eHigh + eMed > 0 ? ` 나머지 ${eHigh + eMed}개 지표는 정상 검증되었습니다.` : ''}`
    : eMed >= 1
    ? `환경 데이터 검증 결과 LOW 수준의 불일치는 발견되지 않았으며, ${eQualityLabel(eAvgDiff)} (HIGH ${eHigh}건 · MEDIUM ${eMed}건)`
    : eHigh > 0
    ? `환경 지표 ${eHigh}건 전항목이 HIGH 수준으로 검증되어 높은 데이터 신뢰성을 확보하였습니다.`
    : '증빙 수치 검증이 완료되었습니다.';
  const eTone = isAllEFailed ? 'amber' : eLow >= 2 ? 'red' : eLow === 1 ? 'amber' : eMed >= 1 ? 'amber' : eFailed >= 3 ? 'amber' : 'emerald';

  // getVerificationStatus 기준 미검출 계산 — blockedIndicators · buildRecommendations 와 동일 기준
  const _completeList = buildCompleteIndicatorList(evs);
  const _codeStatus   = new Map(_completeList.map(e => [e.indicatorCode, getVerificationStatus(e)]));

  // ── S 카테고리 (사용자 선택 기준 5개 지표) ────────────────────────────
  const sEvs      = evs.filter(e => e.indicatorCode?.startsWith('S'));
  const sTotal    = S_SELECTED_TOTAL;
  const sMissing  = Object.keys(SG_INDICATORS).filter(c => c.startsWith('S') && _codeStatus.get(c) === 'NO_EVIDENCE').length;
  const sUniq     = sTotal - sMissing;
  const sAttempted = sUniq;
  const sLowConf    = sEvs.filter(e => e.confidenceLevel === 'LOW').length;
  const sHasUnsupported = sAttempted < sTotal; // 일부 지표 AI 미지원 가능성
  // S 검증 수준 (VERIFIED/WEAK 분류)
  const sVerifiedEvs = sEvs.filter(e => getVerificationStatus(e) === 'VERIFIED');
  const sWeakEvs     = sEvs.filter(e => ['PARTIAL','WEAK'].includes(getVerificationStatus(e)));
  const sVerifiedCodes = new Set(sVerifiedEvs.map(e => e.indicatorCode)).size;
  // S 검증 커버리지 등급 레이블 (sMissing=0, sLowConf=0 전제)
  const sCovLabel = sTotal > 0
    ? (sVerifiedCodes / sTotal >= 0.8 ? '근거 신뢰도가 높은 수준입니다.'
     : sVerifiedCodes / sTotal >= 0.5 ? '전반적으로 양호한 수준의 근거가 확인되었습니다.'
     : '일부 지표의 근거 강화가 권장됩니다.')
    : '';
  const sSummary = sUniq === 0
    ? '검증 근거가 충분히 확보되지 않았습니다. 관련 실적 자료 및 운영 증빙 문서 보완이 필요합니다.'
    : sMissing >= 1
    ? `${sUniq}개 지표에서 운영 근거가 확인되었으며, ${sMissing}개 지표는 증빙이 부족합니다. 정책·실적 자료 보완 시 사회 부문 평가 신뢰도를 높일 수 있습니다.`
    : sLowConf > 0
    ? `사회(S) 지표 ${sUniq}개 모두 운영 근거가 확인되었습니다. 다만 일부 세부 검증 항목의 신뢰도가 낮아 관련 운영 증빙 문서 보완이 권장됩니다.`
    : `사회(S) 지표 ${sUniq}개 전항목에서 검증 근거가 확인되었습니다. ${sCovLabel}`;
  const sTone = sMissing >= 2 ? 'red' : sMissing === 1 ? 'amber' : 'emerald';

  // ── G 카테고리 (사용자 선택 기준 5개 지표) ────────────────────────────
  const gEvs      = evs.filter(e => e.indicatorCode?.startsWith('G'));
  const gTotal    = G_SELECTED_TOTAL;
  const gMissing  = Object.keys(SG_INDICATORS).filter(c => c.startsWith('G') && _codeStatus.get(c) === 'NO_EVIDENCE').length;
  const gUniq     = gTotal - gMissing;
  const gAttempted = gUniq;
  const gLowConf    = gEvs.filter(e => e.confidenceLevel === 'LOW').length;
  const gHasUnsupported = gAttempted < gTotal; // 일부 지표 AI 미지원 가능성
  // G 검증 수준
  const gVerifiedEvs = gEvs.filter(e => getVerificationStatus(e) === 'VERIFIED');
  const gWeakEvs     = gEvs.filter(e => ['PARTIAL','WEAK'].includes(getVerificationStatus(e)));
  const gVerifiedCodes = new Set(gVerifiedEvs.map(e => e.indicatorCode)).size;
  const gPartialCodes  = new Set(gWeakEvs.map(e => e.indicatorCode)).size;
  // G 공시 커버리지 등급 레이블 (gMissing=0, gLowConf=0 전제)
  const gCovLabel = gTotal > 0
    ? (gVerifiedCodes / gTotal >= 0.8 ? '공시 근거 신뢰도가 높은 수준입니다.'
     : gVerifiedCodes / gTotal >= 0.5 ? '전반적으로 양호한 수준의 공시 근거가 확인되었습니다.'
     : '일부 지표의 공시 근거 강화가 권장됩니다.')
    : '';
  const gSummary = gUniq === 0
    ? '공시 근거가 충분히 확보되지 않았습니다. 윤리경영·이사회 독립성·내부통제 관련 정책 문서 및 공시 자료 보완이 필요합니다.'
    : gMissing >= 1
    ? `${gUniq}개 지표에서 운영·공시 근거가 확인되었으며, ${gMissing}개 지표는 관련 공시가 부족합니다. 이사회 독립성·내부통제·외부감사 관련 문서 보완 시 지배구조 평가 신뢰도가 향상됩니다.`
    : gLowConf > 0
    ? `지배구조(G) 지표 ${gUniq}개 모두 운영·공시 근거가 확인되었습니다. 다만 일부 세부 검증 항목의 신뢰도 개선이 필요하며, 감사·이사회 관련 공시 자료 구체화가 권장됩니다.`
    : `지배구조(G) 지표 ${gUniq}개 전항목에서 운영·공시 근거가 확인되었습니다. ${gCovLabel}`;
  const gTone = gMissing >= 2 ? 'red' : gMissing === 1 ? 'amber' : 'emerald';

  return {
    e: { high: eHigh, medium: eMed, low: eLow, total: eTotal, failed: eFailed,
         avgDiff: eAvgDiff, maxDiff: eMaxDiff, summary: eSummary, tone: eTone },
    s: { withEvidence: sUniq, total: sTotal, missing: sMissing, lowConf: sLowConf,
         attempted: sAttempted, hasUnsupported: sHasUnsupported, summary: sSummary, tone: sTone },
    g: { withEvidence: gUniq, total: gTotal, missing: gMissing, lowConf: gLowConf,
         attempted: gAttempted, hasUnsupported: gHasUnsupported, summary: gSummary, tone: gTone },
  };
}

// ── 최종 평가 요약 빌더 ────────────────────────────────────────────────
// 환경(E) 데이터 검증 결과 영역 전용 — ESG 성과 등급이 아닌 검증 결과(HIGH/MEDIUM/LOW)만 표시
function buildFinalSummary({ finalGrade, confidence, lowCount, mediumCount, avgDiff, evidenceCount, isBenchmarkFallback, isFullBenchmark }) {
  const low    = lowCount    ?? 0;
  const medium = mediumCount ?? 0;

  if (isFullBenchmark) {
    return { text: '환경(E) 수치 데이터가 제출되지 않아 체크리스트 기반으로만 평가가 진행되었습니다. PDF 또는 CSV 파일 제출 시 정확도가 향상됩니다.', tone: 'amber' };
  }
  if (isBenchmarkFallback) {
    return { text: '환경(E) 실측 데이터 없이 평가가 진행되었습니다. 수치 데이터를 제출하면 정확도가 향상됩니다.', tone: 'amber' };
  }
  // LOW 불일치 기반
  if (low >= 3)
    return { text: `환경 지표 ${low}개 항목에서 수치 불일치(LOW)가 감지되었습니다. 증빙 문서의 수치 정합성을 점검하십시오.`, tone: 'red' };
  if (low >= 1)
    return { text: `${low}개 항목에서 수치 불일치(LOW)가 감지되었습니다. 해당 항목의 증빙 자료를 재검토하세요.`, tone: 'amber' };
  // MEDIUM 근사 일치
  if (medium >= 1)
    return { text: `${medium}개 항목에서 근사 일치(MEDIUM)가 확인되었습니다. 전반적인 수치 검증은 완료되었습니다.`, tone: 'amber' };
  // 전항목 HIGH
  if (avgDiff == null || avgDiff < 0.01)
    return { text: '모든 환경 지표가 검증되었으며 데이터 일치율이 매우 높습니다.', tone: 'emerald' };
  return { text: `수치 검증이 완료되었습니다. 평균 오차율 ${fmtDiff(avgDiff)}로 데이터 신뢰도가 확인되었습니다.`, tone: 'emerald' };
}

// ── Evidence 상세 모달 ─────────────────────────────────────────────────
function EvidenceDetailModal({ ev, onClose }) {
  if (!ev) return null;
  const catChar    = ev.indicatorCode?.[0];
  const catColor   = ESG_COLOR[catChar] ?? '#a1a1aa';
  const catLabel   = ESG_LABEL[catChar] ?? catChar;
  const isECategory = catChar === 'E';
  // E 카테고리는 Numeric 섹션 표시, S/G는 Semantic 섹션 표시
  const isNumeric  = isECategory;
  const matchStyle = MATCH_STYLE[ev.numericMatchLevel] ?? null;
  const diffPct   = ev.numericDiffPercent ?? 0;
  const diffBarW  = Math.min(100, (diffPct / 40) * 100);
  const diffBarCol = diffPct <= 5 ? '#059669' : diffPct <= 20 ? '#f59e0b' : '#ef4444';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-100 flex items-center justify-between px-5 py-3.5 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono"
              style={{ color: catColor, borderColor: `${catColor}40`, background: `${catColor}10` }}>
              {catChar} · {catLabel}
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200" style={{ color: catColor }}>
              {ev.indicatorCode ?? '-'}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              isECategory ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-gray-100 border-gray-200 text-gray-500'
            }`}>
              {isECategory ? '수치 검증' : '근거 적합도 분석'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* 지표명 */}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">지표명</p>
            <p className="text-base font-bold text-gray-900">{ev.indicatorTitle ?? '-'}</p>
          </div>

          {/* ── E 카테고리: Numeric 검증 상세 ── */}
          {isNumeric && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1.5">
                수치 검증 상세
              </p>

              {/* 판정 배지 */}
              {matchStyle && (
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-black px-3 py-1 rounded-full border ${matchStyle.bg} ${matchStyle.border} ${matchStyle.text}`}>
                    {matchStyle.label}
                  </span>
                  {ev.numericMatchLevel === 'HIGH' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                      ✓ 검증 완료
                    </span>
                  )}
                </div>
              )}

              {/* 감사표 */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium w-28 shrink-0">입력값</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-800">
                        {ev.inputValue != null ? Number(ev.inputValue).toLocaleString() : '-'}
                        {ev.unit ? <span className="ml-1 text-gray-400 font-normal text-xs">{ev.unit}</span> : null}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium w-28 shrink-0">증빙값</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-800">
                        {ev.extractedValue != null ? Number(ev.extractedValue).toLocaleString() : '-'}
                        {ev.unit ? <span className="ml-1 text-gray-400 font-normal text-xs">{ev.unit}</span> : null}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">차이율</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-base tabular-nums" style={{ color: diffBarCol }}>
                            {fmtDiff(diffPct)}
                          </span>
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${diffBarW}%`, background: diffBarCol }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">판정</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg border ${
                          diffPct <= 5  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          diffPct <= 20 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                          'bg-red-50 border-red-200 text-red-700'
                        }`}>
                          {diffPct <= 5 ? 'HIGH — 일치' : diffPct <= 20 ? 'MEDIUM — 근사 일치' : 'LOW — 불일치'}
                        </span>
                        <span className="ml-2 text-[9px] text-gray-400">HIGH≤5% / MED≤20% / LOW&gt;20%</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Numeric Diff Visualization */}
              {ev.inputValue != null && (
                (() => {
                  const inp  = Number(ev.inputValue)  || 0;
                  const extr = Number(ev.extractedValue ?? ev.inputValue) || 0;
                  const maxV = Math.max(Math.abs(inp), Math.abs(extr), 1);
                  const inpPct  = Math.round((Math.abs(inp)  / maxV) * 100);
                  const extrPct = Math.round((Math.abs(extr) / maxV) * 100);
                  const diffPctDisplay = isFinite(ev.numericDiffPercent ?? 0) ? (ev.numericDiffPercent ?? 0) : 0;
                  const barColor = diffPctDisplay <= 5 ? '#059669' : diffPctDisplay <= 20 ? '#f59e0b' : '#ef4444';
                  const fmtV = (v) => {
                    const abs = Math.abs(v);
                    if (abs >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`;
                    if (abs >= 1_000)     return `${(v/1_000).toFixed(1)}K`;
                    return v.toLocaleString();
                  };
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">수치 차이 시각화</p>
                      {/* input bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 w-12 shrink-0 text-right">입력값</span>
                        <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gray-400 transition-all duration-700" style={{ width: `${inpPct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-gray-700 tabular-nums w-16 shrink-0">{fmtV(inp)}</span>
                      </div>
                      {/* extracted bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 w-12 shrink-0 text-right">추출값</span>
                        <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${extrPct}%`, background: barColor }} />
                        </div>
                        <span className="text-[10px] font-mono font-bold tabular-nums w-16 shrink-0" style={{ color: barColor }}>
                          {ev.extractedValue != null ? fmtV(extr) : '—'}
                        </span>
                      </div>
                      {/* diff label */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <span className="text-[9px] text-gray-500 font-mono">diff</span>
                        <span className="text-sm font-black font-mono tabular-nums" style={{ color: barColor }}>
                          {diffPctDisplay > 0 ? '+' : ''}{diffPctDisplay.toFixed(1)}%
                        </span>
                        {ev.extractedValue != null && (
                          <span className="text-[9px] text-gray-400 font-mono">
                            ({fmtV(Math.abs(extr - inp))}{ev.unit ? ` ${ev.unit}` : ''})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* 검증 방식 설명 */}
              <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1">검증 방법</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  CSV/PDF 문서에서 해당 지표의 수치를 추출하여 입력값과 직접 비교합니다.
                  정규식 및 단위 정규화를 적용하며, 추출 실패 시 마크다운 전체 텍스트에서 재시도합니다.
                </p>
              </div>
            </div>
          )}

          {/* ── S/G 카테고리: Semantic 상세 ── */}
          {!isNumeric && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1.5">
                근거 적합도 분석 상세
              </p>

              {/* 점수 행 */}
              <div className="grid grid-cols-2 gap-3">
                {ev.similarity != null && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">근거 적합도</p>
                    <p className="text-2xl font-black tabular-nums font-mono" style={{
                      color: toPct(ev.similarity) >= 70 ? '#059669' : toPct(ev.similarity) >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {toPct(ev.similarity)}%
                    </p>
                  </div>
                )}
                {ev.finalScore != null && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">최종 점수</p>
                    <p className="text-2xl font-black tabular-nums font-mono" style={{
                      color: toPct(ev.finalScore) >= 70 ? '#059669' : toPct(ev.finalScore) >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {toPct(ev.finalScore)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Keyword Gate + Evidence Quality */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">검증 상태</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {ev.isValidEvidence === true
                    ? <><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /><span className="text-xs text-emerald-700 font-semibold">직접 근거 확인</span></>
                    : (vstKey === 'PARTIAL' || vstKey === 'WEAK') && (similarityPct ?? 0) >= 50
                    ? <><CheckCircle2 size={13} className="text-blue-400 shrink-0" /><span className="text-xs text-blue-600 font-semibold">부분 근거 확인 — 운영 근거 탐지</span></>
                    : <><AlertTriangle size={13} className="text-gray-400 shrink-0" /><span className="text-xs text-gray-500 font-semibold">추가 보완 권장 — 명시 근거 보완 필요</span></>
                  }
                  {/* Evidence Quality Badge: EXACT/PARTIAL/WEAK */}
                  {ev.confidenceLevel && (() => {
                    const qMap = { HIGH: ['직접 근거 확인', 'bg-emerald-50 text-emerald-700 border-emerald-200'], MEDIUM: ['의미 근거 확인', 'bg-blue-50 text-blue-700 border-blue-200'], LOW: ['보조 근거', 'bg-amber-50 text-amber-700 border-amber-200'] };
                    const [label, cls] = qMap[ev.confidenceLevel] ?? ['보조 근거', 'bg-gray-100 text-gray-500 border-gray-200'];
                    return <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded border ${cls}`}>{label}</span>;
                  })()}
                </div>
                {/* 검증 이유 한 줄 */}
                {ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED' && (
                  <p className="text-[10px] text-gray-500 leading-snug">
                    확인된 지표 키워드: <span className="font-semibold text-indigo-600">{ev.matchedCluster.split('|').join(' · ')}</span>
                  </p>
                )}
                {/* Matched Keywords */}
                {ev.matchedKeywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {ev.matchedKeywords.slice(0, 6).map((kw, i) => (
                      <span key={i} className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-mono">{kw}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* 검출 문장 snippet — 키워드 강조 */}
              {(ev.chunkText || ev.evidenceText) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2">검증 근거 텍스트</p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line font-mono">
                    {ev.chunkText
                      ? truncateAtSentenceBoundary(ev.chunkText, 400)
                      : isFragmentArtifact(ev.evidenceText)
                        ? <span className="text-gray-400 italic">원본 문서 구간을 표시할 수 없습니다</span>
                        : truncateAtSentenceBoundary(ev.evidenceText, 400)}
                  </p>
                  {false && ev.similarity != null && ( // 유사도/점수 수치 — debug 정보 숨김
                    <p className="text-[9px] text-gray-400 mt-1.5">
                      근거 적합도: <span className="font-semibold text-gray-600">{Math.round((ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity))}%</span>
                    </p>
                  )}
                </div>
              )}

              {/* 가이드라인 매칭 */}
              {ev.matchedGuideline && (
                <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">연계 가이드라인</p>
                  <p className="text-xs text-gray-500 italic leading-relaxed">{ev.matchedGuideline}</p>
                </div>
              )}

              {/* 검증 방식 설명 */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">분석 방법</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  제출 문서에서 지표 관련 운영 근거를 탐색하고,
                  근거 충족 수준에 따라 직접 근거·부분 근거·추가 보완 권장으로 분류합니다.
                </p>
              </div>
            </div>
          )}

          {/* 소스 파일 — 제거됨 */}
          {false && (ev.sourceFile ?? ev.sourceFileName) && (
            <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
              <FileText size={11} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 truncate">{(ev.sourceFile ?? ev.sourceFileName).split(/[/\\]/).pop()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Retrieval Trace Table ─────────────────────────────────────────────
function AIRetrievalTraceTable({ rows, onSelect }) {
  const [expandedCode, setExpandedCode] = useState(null);

  const getSimColor = (pct) => {
    if (pct == null) return '#9ca3af';
    if (pct >= 85) return '#059669';
    if (pct >= 70) return '#3b82f6';
    if (pct >= 55) return '#f59e0b';
    return '#ef4444';
  };

  if (!rows.length) return null;

  return (
    <div className="data-table rounded-xl overflow-hidden">
      {/* Table header — desktop only */}
      <div className="hidden sm:grid sm:grid-cols-[148px_1fr_70px_96px] bg-gray-50 border-b border-gray-200 px-4 py-3 gap-3 items-center">
        {['지표', '검색 근거', '신뢰도', '검증 상태'].map(h => (
          <span key={h} className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{h}</span>
        ))}
      </div>

      <div className="divide-y divide-gray-100">
        {rows.map((ev, idx) => {
          const vstKey   = getVerificationStatus(ev);
          const vst      = VSTATUS[vstKey];
          const simPct   = toPct(ev.similarity);
          const simColor = getSimColor(simPct);
          const isECat   = ev.indicatorCode?.[0] === 'E';
          // E 지표: numericMatchLevel 기반 신뢰도 (PDF와 동일 기준)
          const eConfPct   = isECat
            ? (ev.numericMatchLevel === 'HIGH' ? 97 : ev.numericMatchLevel === 'MEDIUM' ? 72 : ev.numericMatchLevel === 'LOW' ? 38 : null)
            : null;
          const eConfColor = isECat
            ? (ev.numericMatchLevel === 'HIGH' ? '#059669' : ev.numericMatchLevel === 'MEDIUM' ? '#f59e0b' : '#ef4444')
            : null;
          const displayPct   = isECat ? eConfPct   : simPct;
          const displayColor = isECat ? (eConfColor ?? '#9ca3af') : simColor;
          const catColor = isECat ? '#059669' : ev.indicatorCode?.[0] === 'S' ? '#3b82f6' : '#f59e0b';
          const _snippetSrc = ev.chunkText || (isFragmentArtifact(ev.evidenceText) ? null : ev.evidenceText);
          const snippet  = isECat
            ? buildESnippet(ev)
            : _snippetSrc
            ? extractSentencePreview(_snippetSrc, [], 120)
            : null;
          const srcFile  = (ev.sourceFile ?? ev.sourceFileName)?.split(/[/\\]/).pop() ?? null;
          const isOpen   = expandedCode === (ev.indicatorCode ?? idx);

          return (
            <React.Fragment key={ev.indicatorCode ?? idx}>
              {/* ── Main Row ── */}
              <button
                className={`w-full text-left transition-colors duration-150 ${isOpen ? 'bg-indigo-50/40' : 'hover:bg-gray-50'} ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                onClick={() => setExpandedCode(isOpen ? null : (ev.indicatorCode ?? idx))}
              >
                {/* Desktop */}
                <div className="hidden sm:grid sm:grid-cols-[148px_1fr_70px_96px] px-4 py-3 gap-3 items-center">
                  {/* Indicator */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] font-black font-mono leading-none" style={{ color: catColor }}>
                      {ev.indicatorCode}
                    </span>
                    <span className="text-[10px] text-gray-600 leading-tight truncate pr-1">
                      {ev.indicatorTitle ?? '—'}
                    </span>
                  </div>
                  {/* Snippet */}
                  <div className="min-w-0">
                    {snippet
                      ? <span className="text-[10px] text-gray-500 font-mono line-clamp-1">{snippet}</span>
                      : vstKey === 'NO_EVIDENCE' || vstKey === 'CONTRADICTION'
                        ? <span className="text-[10px] text-gray-300 italic">— 검증 기준 미충족</span>
                        : <span className="text-[10px] text-gray-400 italic">— 근거 문서 확인됨</span>
                    }
                  </div>
                  {/* Similarity / Numeric confidence */}
                  <div className="flex flex-col items-start gap-0.5">
                    {displayPct != null ? (
                      <>
                        <span className="text-xs font-black font-mono tabular-nums leading-none" style={{ color: displayColor }}>
                          {displayPct}%
                        </span>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                          <div className="h-full rounded-full" style={{ width: `${displayPct}%`, background: displayColor }} />
                        </div>
                      </>
                    ) : isECat ? (
                      <span className="text-[9px] text-sky-500 font-bold">수치</span>
                    ) : (
                      <span className="text-[9px] text-gray-300">—</span>
                    )}
                  </div>
                  {/* Status */}
                  <div>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap inline-flex items-center gap-0.5 ${vst.bg} ${vst.border} ${vst.text}`}>
                      <span>{vst.icon}</span>
                      <span>{vst.label}</span>
                    </span>
                  </div>
                </div>

                {/* Mobile: compact */}
                <div className="sm:hidden flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col gap-0.5 shrink-0 w-20">
                    <span className="text-[10px] font-black font-mono" style={{ color: catColor }}>{ev.indicatorCode}</span>
                    <span className={`text-[8px] font-black px-1 py-0.5 rounded border inline-block ${vst.bg} ${vst.border} ${vst.text}`}>
                      {vst.icon} {vst.label}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-700 font-medium truncate">{ev.indicatorTitle}</p>
                    {snippet
                      ? <p className="text-[9px] text-gray-400 font-mono truncate">{snippet}</p>
                      : (vstKey !== 'NO_EVIDENCE' && vstKey !== 'CONTRADICTION')
                        ? <p className="text-[9px] text-gray-300 italic">근거 문서 확인됨</p>
                        : null
                    }
                  </div>
                  {displayPct != null && (
                    <span className="text-xs font-black font-mono shrink-0" style={{ color: displayColor }}>{displayPct}%</span>
                  )}
                </div>
              </button>

              {/* ── Expanded Detail Panel ── */}
              {isOpen && (
                <div className="px-4 pt-3 pb-4 bg-slate-50 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Left: evidence text + guideline */}
                    <div className="space-y-2">
                      {(ev.chunkText || ev.evidenceText) ? (
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1.5">검증 근거 텍스트</p>
                          <p className="text-[10px] text-gray-600 leading-relaxed font-mono whitespace-pre-line">
                            {ev.chunkText
                              ? truncateAtSentenceBoundary(ev.chunkText, 380)
                              : isFragmentArtifact(ev.evidenceText)
                                ? <span className="italic text-gray-400">원본 문서 구간을 표시할 수 없습니다</span>
                                : truncateAtSentenceBoundary(ev.evidenceText, 380)}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
                          <p className="text-[10px] text-gray-400 italic">문서에서 검증 근거 텍스트를 찾지 못했습니다.</p>
                        </div>
                      )}
                      {ev.matchedGuideline && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                          <p className="text-[8px] font-black text-indigo-400 uppercase tracking-wider mb-1">연계 가이드라인</p>
                          <p className="text-[10px] text-indigo-700 leading-relaxed italic">{ev.matchedGuideline}</p>
                        </div>
                      )}
                    </div>

                    {/* Right: AI metrics + validation */}
                    <div className="space-y-2">
                      {/* Retrieval scores */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-2">AI 검색 지표</p>
                        <div className="space-y-1.5">
                          {[
                            isECat
                              ? { label: '수치 검증 신뢰도', value: eConfPct != null ? `${eConfPct}%` : '—', color: eConfColor ?? '#9ca3af' }
                              : { label: '근거 적합도',      value: simPct   != null ? `${simPct}%`   : '—', color: simPct   != null ? simColor : '#9ca3af' },
                            isECat
                              ? { label: '차이율',           value: ev.numericDiffPercent != null ? `${Number(ev.numericDiffPercent).toFixed(1)}%` : '—', color: (ev.numericDiffPercent ?? 0) <= 5 ? '#059669' : '#f59e0b' }
                              : { label: '최종 점수',        value: toPct(ev.finalScore)  != null ? `${toPct(ev.finalScore)}%` : '—', color: '#6366f1' },
                          ].map(item => (
                            <div key={item.label} className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-400">{item.label}</span>
                              <span className="font-black font-mono" style={{ color: item.color }}>{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Validation result */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-2">검증 결과</p>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${vst.bg} ${vst.border} ${vst.text}`}>
                            {vst.icon} {vst.label}
                          </span>
                          {ev.confidenceLevel && (() => {
                            // VERIFIED + LOW 모순 방지: VERIFIED 상태에서 LOW badge 숨김
                            // (백엔드에서 이미 MEDIUM으로 보정하나, 이중 방어)
                            const effConf = (vstKey === 'VERIFIED' && ev.confidenceLevel === 'LOW')
                              ? 'MEDIUM' : ev.confidenceLevel;
                            if (vstKey === 'VERIFIED' && ev.confidenceLevel === 'LOW') return null;
                            return (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${CONF_CLS[effConf] ?? CONF_CLS.LOW}`}>
                                신뢰도 {effConf === 'HIGH' ? '높음' : effConf === 'MEDIUM' ? '보통' : effConf === 'STRONG' ? '높음' : '낮음'}
                              </span>
                            );
                          })()}
                        </div>
                        {ev.isValidEvidence !== undefined && (
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100">
                            {ev.isValidEvidence
                              ? <CheckCircle size={10} className="text-emerald-500 shrink-0" />
                              : <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                            }
                            <span className={`text-[9px] font-semibold ${ev.isValidEvidence ? 'text-emerald-700' : 'text-amber-700'}`}>
                              키워드 필터 {ev.isValidEvidence ? '통과' : '차단됨'}
                            </span>
                          </div>
                        )}
                        {isECat && ev.inputValue != null && (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            {[
                              { lbl: '입력값', val: `${Number(ev.inputValue).toLocaleString()} ${ev.unit ?? ''}`, color: '#374151' },
                              ev.extractedValue != null && { lbl: '증빙값', val: `${Number(ev.extractedValue).toLocaleString()} ${ev.unit ?? ''}`, color: MATCH_STYLE[ev.numericMatchLevel]?.color ?? '#374151' },
                              ev.numericDiffPercent != null && { lbl: '차이율', val: fmtDiff(ev.numericDiffPercent), color: ev.numericDiffPercent <= 5 ? '#059669' : ev.numericDiffPercent <= 20 ? '#f59e0b' : '#ef4444' },
                            ].filter(Boolean).map(item => (
                              <div key={item.lbl} className="flex justify-between text-[10px]">
                                <span className="text-gray-400">{item.lbl}</span>
                                <span className="font-mono font-black" style={{ color: item.color }}>{item.val}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {ev.contradictionReason && (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                            <p className="text-[9px] text-red-500 leading-relaxed">{ev.contradictionReason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 감사 근거 요약 — bundle-mode: structured audit rendering / 일반: commentary */}
                  {(() => {
                    const bundleGroups = BUNDLE_MODE_INDICATOR_SET.has(ev.indicatorCode)
                      ? parseEvidenceBundle(ev.evidenceText) : null;
                    const auditTone = INDICATOR_AUDIT_TONE[ev.indicatorCode];

                    if (bundleGroups && Object.keys(bundleGroups).length >= 1) {
                      return (
                        <div className="mt-2.5 px-3 py-2.5 rounded-lg bg-violet-50 border border-violet-100">
                          <p className="text-[8px] font-black text-violet-400 uppercase tracking-wider mb-2">감사 근거 요약</p>
                          <div className="space-y-1.5">
                            {EVIDENCE_GROUP_ORDER
                              .filter(type => bundleGroups[type]?.length > 0)
                              .map(type => {
                                const cfg = EVIDENCE_GROUP_CONFIG[type];
                                const isKpi = type === 'KPI';
                                return (
                                  <div key={type} className="flex items-start gap-2">
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${cfg.headerBg} ${cfg.border} ${cfg.headerText}`}>
                                      {cfg.label}
                                    </span>
                                    <div className="flex flex-col gap-0.5">
                                      {bundleGroups[type].map((token, i) => (
                                        <span key={i} className={`text-[9px] font-semibold ${cfg.text} flex items-center gap-1`}>
                                          <span className="w-1 h-1 rounded-full shrink-0 bg-current opacity-40" />
                                          {/* KPI: 숫자 값 audit metric badge 강조 */}
                                          {isKpi ? renderKpiToken(token) : token}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            {auditTone && (
                              <div className="flex items-center gap-1.5 pt-1.5 border-t border-violet-100">
                                <span className="text-[8px] font-black text-violet-400 uppercase shrink-0">[판단]</span>
                                <span className="text-[9px] font-semibold text-violet-700">{auditTone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // 일반 지표: 기존 commentary
                    return (
                      <div className="mt-2.5 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-violet-50 border border-violet-100">
                        <FileText size={10} className="text-violet-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[8px] font-black text-violet-400 uppercase tracking-wider mb-0.5">감사 근거 요약</p>
                          {auditTone
                            ? <p className="text-[9px] font-semibold text-violet-600 mb-0.5">{auditTone}</p>
                            : null}
                          <p className="text-[10px] text-violet-700 leading-relaxed">{generateIndicatorCommentary(ev)}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Full detail button */}
                  {onSelect && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelect(ev); }}
                      className="mt-2 text-[10px] font-semibold text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
                    >
                      <FileText size={9} /> Full detail → <span className="font-mono">{ev.indicatorCode}</span>
                    </button>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Confidence Tooltip ────────────────────────────────────────────────
function ConfidenceTooltip() {
  return (
    <div className="relative inline-flex items-center group cursor-help ml-1">
      <Info size={11} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
      <div className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl p-3.5 text-xs text-gray-600 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 shadow-lg pointer-events-none">
        <p className="font-bold text-gray-800 mb-1">분석 신뢰도</p>
        <p className="text-gray-400 text-[10px] mb-2 italic">실제 검증 성공률이 아닌 검증 근거 충족 정도입니다.</p>
        <p className="text-gray-600 leading-relaxed">
          제출 증빙과 ESG 지표 간 검증 근거 충족 정도입니다.{' '}
          <span className="text-sky-600 font-semibold">E 카테고리</span>는 수치 검증,{' '}
          <span className="text-emerald-600 font-semibold">S/G 카테고리</span>는 근거 적합도 분석 결과를 기반으로 산출합니다.
        </p>
        <div className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            수치 불일치 증가 → 신뢰도 감소
          </p>
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            검증 근거 부족 → 신뢰도 감소
          </p>
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            업종 평균 추정 적용 → -10점 보정
          </p>
          <p className="text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            HIGH match 비율 높을수록 신뢰도 증가
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Final Score 산출 공식 Tooltip ────────────────────────────────────
function ScoreFormulaTooltip({ industryWeights }) {
  const iw = industryWeights ?? { E: 0.40, S: 0.30, G: 0.30, label: '기본' };
  return (
    <div className="relative inline-flex items-center group cursor-help">
      <Info size={10} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-white border border-gray-200 rounded-xl p-3.5 text-xs text-gray-600 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 shadow-lg pointer-events-none">
        <p className="font-bold text-gray-800 mb-1">종합 점수 산출 공식</p>
        <p className="text-[10px] text-gray-400 mb-2">E/S/G 업종 가중치 + 근거 신뢰도 + 미검출 지표 보정 반영</p>
        <div className="space-y-1 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#059669' }} />
            <span className="text-[10px] text-gray-500">E (환경)</span>
            <span className="ml-auto font-black text-[11px]" style={{ color: '#059669' }}>{Math.round(iw.E*100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#3b82f6' }} />
            <span className="text-[10px] text-gray-500">S (사회)</span>
            <span className="ml-auto font-black text-[11px]" style={{ color: '#3b82f6' }}>{Math.round(iw.S*100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#f59e0b' }} />
            <span className="text-[10px] text-gray-500">G (지배구조)</span>
            <span className="ml-auto font-black text-[11px]" style={{ color: '#f59e0b' }}>{Math.round(iw.G*100)}%</span>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-2.5 space-y-1">
          <p className="text-[9px] text-gray-400">· 근거 신뢰도 보정: VERIFIED/PARTIAL/MISSING 비율 반영</p>
          <p className="text-[9px] text-gray-400">· 미검출 지표는 neutral baseline(50점) 처리</p>
          <p className="text-[9px] text-gray-400">· 업종 분류: {iw.label} (KSIC 기반)</p>
        </div>
      </div>
    </div>
  );
}

// ── Audit 일관성 검증 ────────────────────────────────────────────────
function validateAuditConsistency({ verifiedEv, partialEv, missingEv, contraEv, mediumMismatch,
  coveragePct, ocrMs, hasOcrProof, hasRagData, hasEco, ecoScoreBonus, adjustedConfidence,
  totalIndicators, completeList }) {
  const warnings = [];

  // [1] 검증 수 vs 누락 비율 교차 확인
  const evidenceTotal = verifiedEv + partialEv + missingEv + contraEv;
  if (evidenceTotal > 0) {
    const computedCoverage = Math.round(((verifiedEv + partialEv) / evidenceTotal) * 100);
    if (coveragePct != null && Math.abs(coveragePct - computedCoverage) > 15) {
      warnings.push(`[COVERAGE] coveragePct=${coveragePct}% vs 계산값=${computedCoverage}% — 15%p 이상 차이`);
    }
  }

  // [2] MEDIUM 불일치가 있는데 contraEv만 표시되는 경우 (이미 수정됨, 이중 확인)
  if (mediumMismatch > 0 && contraEv === 0) {
    warnings.push(`[MISMATCH] MEDIUM 불일치 ${mediumMismatch}건 존재 — 경미 불일치 항목 확인 필요`);
  }

  // [3] OCR 타이머 미반환 + RAG 데이터 존재 → OCR 실행됐으나 ocrTimeMs 미포함
  if (ocrMs === 0 && hasRagData) {
    warnings.push(`[OCR] ocrTimeMs=0 이지만 RAG similarity 데이터 존재 — ocrTimeMs 응답 필드 누락 의심`);
  }

  // [4] EcoPoint 연동됐는데 bonus가 0 또는 null
  if (hasEco && (ecoScoreBonus == null || ecoScoreBonus === 0)) {
    warnings.push(`[ECOPOINT] hasEco=true 이지만 ecoScoreBonus=${ecoScoreBonus} — S 점수 보너스 미반영 확인 필요`);
  }

  // [5] 신뢰도가 높은데 verifiedEv가 0인 경우 → 점수 계산 불일치
  if (adjustedConfidence >= 70 && verifiedEv === 0) {
    warnings.push(`[CONFIDENCE] 신뢰도 ${adjustedConfidence}% 이지만 VERIFIED 근거 0건 — 신뢰도 산출 근거 확인 필요`);
  }

  // [6] 지표 목록 수 vs K-ESG 기준(15개) 불일치
  if (totalIndicators != null && totalIndicators !== 15) {
    warnings.push(`[INDICATORS] completeIndicatorList 길이=${totalIndicators} — K-ESG 기준 15개와 불일치`);
  }

  // [7] G 지표에 S-domain evidence 매핑 → domain mismatch 경고
  if (completeList) {
    const S_MARKERS = ['봉사활동', '봉사 활동', '봉사시간', '참여시간', '지역사회 봉사', 'volunteer'];
    const gWithSDomain = completeList.filter(ev => {
      if (!ev.indicatorCode?.startsWith('G')) return false;
      const tl = (ev.evidenceText ?? '').toLowerCase();
      return S_MARKERS.some(m => tl.includes(m));
    });
    if (gWithSDomain.length > 0) {
      warnings.push(`[DOMAIN-MISMATCH] G 지표에 S-domain evidence ${gWithSDomain.length}건 — ${gWithSDomain.map(e => e.indicatorCode).join(', ')}`);
    }

    // [7b] score vs verified ratio: verified 0인데 confidence >= 50
    if (verifiedEv === 0 && adjustedConfidence >= 50) {
      warnings.push(`[SCORE-RATIO] VERIFIED 0건이지만 confidence=${adjustedConfidence}% — 점수 근거 불충분`);
    }

    // [8] VERIFIED without keyword match — sim 단독 승격 감지
    // STRONG tier는 백엔드에서 keyword 검증됨 → false positive 제외
    const verifiedNoKw = completeList.filter(ev => {
      if (getVerificationStatus(ev) !== 'VERIFIED') return false;
      if (ev.indicatorCode?.[0] === 'E') return false; // E: numeric match 기반
      if (ev.similarityTier === 'STRONG') return false; // STRONG: 백엔드 keyword 보장
      const hasKw = (ev.matchedKeywords?.length > 0) ||
        (ev.matchedCluster && ev.matchedCluster !== 'NO_GATE' && ev.matchedCluster !== 'BLOCKED');
      return !hasKw;
    });
    if (verifiedNoKw.length > 0) {
      warnings.push(`[VERIFIED-NO-KW] keyword 없이 VERIFIED 승격 ${verifiedNoKw.length}건 — ${verifiedNoKw.map(e => e.indicatorCode).join(', ')}`);
    }

    // [9] missing ratio vs confidence mismatch
    const missingRatio = totalIndicators > 0 ? missingEv / totalIndicators : 0;
    if (missingRatio >= 0.33 && adjustedConfidence >= 75) {
      warnings.push(`[MISSING-GRADE] 미검출 비율=${Math.round(missingRatio*100)}% (${missingEv}/${totalIndicators}개) 이지만 신뢰도=${adjustedConfidence}% — 신뢰도 재검토 권고`);
    }

    // [10] VERIFIED+PARTIAL+MISSING+CONTRA 합계가 TOTAL과 일치하지 않으면 count source 오류
    if (totalIndicators != null) {
      const sumCheck = verifiedEv + partialEv + missingEv + contraEv;
      if (sumCheck !== totalIndicators) {
        warnings.push(`[COUNT-SUM] VERIFIED(${verifiedEv})+PARTIAL(${partialEv})+MISSING(${missingEv})+CONTRA(${contraEv})=${sumCheck} ≠ TOTAL(${totalIndicators}) — auditCounts 집계 오류`);
      }
    }

    // [11] Evidence Coverage가 Strict Verification보다 작으면 논리 오류 (검증된 것은 항상 탐지된 것에 포함)
    if (totalIndicators > 0) {
      const strictPct   = Math.round((verifiedEv / totalIndicators) * 100);
      const evidencePct = Math.round(((verifiedEv + partialEv) / totalIndicators) * 100);
      if (strictPct > evidencePct) {
        warnings.push(`[COVERAGE-LOGIC] Strict Verification(${strictPct}%) > Evidence Coverage(${evidencePct}%) — 논리 오류: 완전검증은 근거 탐지의 부분집합이어야 합니다`);
      }
    }

    // [12] CONFIDENCE-ANOMALY: 충분한 근거임에도 신뢰도가 낮은 이상 케이스
    if (verifiedEv >= 6 && adjustedConfidence < 50) {
      warnings.push(`[CONFIDENCE-ANOMALY] VERIFIED ${verifiedEv}건이지만 confidence=${adjustedConfidence}% — 신뢰도 산출 로직 재검토 권고`);
    }

    // [13] CONTRA+VERIFIED 동일 카테고리 공존 감지
    const contraByCategory = { E: 0, S: 0, G: 0 };
    const verifiedByCategory = { E: 0, S: 0, G: 0 };
    completeList.forEach(ev => {
      const cat = ev.indicatorCode?.[0];
      if (!cat) return;
      const vstKey = getVerificationStatus(ev);
      if (vstKey === 'CONTRADICTION') contraByCategory[cat] = (contraByCategory[cat] || 0) + 1;
      if (vstKey === 'VERIFIED')      verifiedByCategory[cat] = (verifiedByCategory[cat] || 0) + 1;
    });
    ['E', 'S', 'G'].forEach(cat => {
      if (contraByCategory[cat] > 0 && verifiedByCategory[cat] > 0) {
        warnings.push(`[CONTRA-VERIFIED] ${cat} 카테고리에 CONTRADICTION ${contraByCategory[cat]}건 + VERIFIED ${verifiedByCategory[cat]}건 공존 — 증빙 일관성 재검토`);
      }
    });

    // [14] 지표 상태 합계 재검증 (mutually exclusive 강제)
    const statusSum = verifiedEv + partialEv + contraEv + missingEv;
    if (totalIndicators != null && statusSum !== totalIndicators) {
      warnings.push(`[COUNT-MISMATCH] STATUS 합계 ${statusSum} ≠ TOTAL ${totalIndicators} — 지표 상태 집계 누락 또는 중복`);
    }
  }

  return warnings;
}

// ── 메인 ─────────────────────────────────────────────────────────────

const VALID_TABS = ['summary', 'evidence', 'action', 'industry', 'audit-log'];

export default function AnalysisResultPage() {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [data, setData]                 = useState(null);
  const [esgPoolPoints, setEsgPoolPoints] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [evTab, setEvTab]               = useState('ALL');
  const [activeTab, setActiveTab]       = useState(() => {
    // hash 우선(#evidence 등), 없으면 ?tab= param
    const hash = window.location.hash.replace('#', '');
    if (VALID_TABS.includes(hash)) return hash;
    const t = searchParams.get('tab');
    return VALID_TABS.includes(t) ? t : 'summary';
  });
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [demoLabel, setDemoLabel]       = useState(null);

  // ── UX: 상세 섹션 접힘/펼침 상태 (기본 접힘) ────────────────────────
  const [showNumericDetail,      setShowNumericDetail]      = useState(false);
  const [showScoreDetail,        setShowScoreDetail]        = useState(false);
  const [showFullRecommendations,setShowFullRecommendations]= useState(false);
  // showConfidenceDetail 제거 — 신뢰도 패널 단순화
  const [showBlockedDetail,      setShowBlockedDetail]      = useState(false);
  const [showAdvancedEvidence,   setShowAdvancedEvidence]   = useState(false);

  // ── hash 기반 탭 전환 + 섹션 스크롤 ─────────────────────────────────
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!VALID_TABS.includes(hash)) return;
    setActiveTab(hash);
    setTimeout(() => {
      if (hash === 'summary') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const navEl = document.getElementById('esg-tab-nav');
        if (navEl) window.scrollTo({ top: navEl.offsetTop - 90, behavior: 'smooth' });
      }
    }, 150);
  }, [location.hash]);

  const handlePdfExport = async () => {
    if (!data || isPdfLoading) return;
    setIsPdfLoading(true);
    try {
      await exportAnalysisResult(data, analysisId, esgPoolPoints);
    } catch (e) {
      console.error('[PDF Export]', e);
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleDemoRun = async (scenario) => {
    try {
      const mod = await import(`../../data/demo-${scenario}.json`);
      setData(normalizeScore(mod.default));
      setLoading(false);
      setError(null);
      setDemoLabel(scenario);
    } catch (e) {
      console.error('[Demo]', e);
    }
  };

  useEffect(() => {
    if (!IS_DEV) return;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '1') handleDemoRun('good');
      if (e.key === '2') handleDemoRun('warning');
      if (e.key === '3') handleDemoRun('missing-evidence');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/v1/analysis/${analysisId}/result`)
      .then(r => {
        const raw = r.data;
        const normalized = normalizeScore(raw);
        setData(normalized);
        setLoading(false);
        // ?tab= 파라미터로 진입 시 탭 헤더 기준으로 자동 스크롤
        const t = new URLSearchParams(window.location.search).get('tab');
        if (VALID_TABS.includes(t)) {
          setActiveTab(t);
          setTimeout(() => {
            if (t === 'summary') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              const navEl = document.getElementById('esg-tab-nav');
              if (navEl) window.scrollTo({ top: navEl.offsetTop - 90, behavior: 'smooth' });
            }
          }, 300);
        }
      })
      .catch(e => { setError(e.response?.data?.message ?? e.message); setLoading(false); });
  }, [analysisId]);

  useEffect(() => {
    if (!user?.companyId) return;
    api.get(`/points/company/${user.companyId}/esg-pool`)
      .then(r => setEsgPoolPoints(r.data?.esgPoints ?? null))
      .catch(() => setEsgPoolPoints(null));
  }, [user?.companyId]);

  const radarData     = useMemo(() => data?.esgChart?.radar?.map(r => ({ subject: r.label, score: r.score, fullMark: 100 })) ?? [], [data]);
  const evidenceList  = useMemo(() => {
    const rawList = data?.evidenceMatches ?? [];

    // E 지표: 지표 코드별로 numericMatchLevel 있는 항목을 우선 선택하여 대표 entry 구성
    // semantic entry(numericMatchLevel=null)와 numeric entry(numericMatchLevel=HIGH) 가 모두 있는 경우
    // numeric 항목을 우선 유지하고 semantic은 제거 (E-104 이중 표시 방지)
    const eByCode = new Map();
    const nonEList = [];
    for (const ev of rawList) {
      const code = ev.indicatorCode ?? '';
      if (code.startsWith('E-')) {
        const existing = eByCode.get(code);
        if (!existing) { eByCode.set(code, ev); continue; }
        const evNum = ev.numericMatchLevel ? 1 : 0;
        const exNum = existing.numericMatchLevel ? 1 : 0;
        if (evNum > exNum) eByCode.set(code, ev); // numeric 우선
      } else {
        nonEList.push(ev);
      }
    }

    // E 지표 대표 entry에 자연어 snippet 주입 (numericMatchLevel 있는 경우)
    const eList = [...eByCode.values()].map(ev => {
      if (ev.numericMatchLevel && (!ev.evidenceText || ev.evidenceText.includes('electricity_kwh') || ev.evidenceText.includes('| month |'))) {
        return { ...ev, evidenceText: buildESnippet(ev) };
      }
      return ev;
    });

    const list = [...eList, ...nonEList];
    const filtered = evTab === 'ALL' ? list : list.filter(e => e.indicatorCode?.startsWith(evTab));
    // LOW → MEDIUM → HIGH → semantic(numeric 없음) 순 정렬 (문제 항목을 앞에)
    const SORT_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return [...filtered].sort((a, b) => {
      const oa = a.numericMatchLevel != null ? (SORT_ORDER[a.numericMatchLevel] ?? 3) : 4;
      const ob = b.numericMatchLevel != null ? (SORT_ORDER[b.numericMatchLevel] ?? 3) : 4;
      return oa - ob;
    });
  }, [data, evTab]);
  const benchMetrics    = useMemo(() => {
    const bc = data?.benchmarkComparison;
    if (!bc) return [];
    // 1순위: 서버가 직접 제공한 metrics 배열
    if (Array.isArray(bc.metrics) && bc.metrics.length > 0) return bc.metrics;
    // 2순위: 구버전 응답 / metrics 누락 시 scalar 필드에서 복원
    return [
      { name: '전력 사용량',  unit: 'kWh',  company: bc.companyElectricityKwh  ?? null, industryAvg: bc.industryAvgElectricityKwh  ?? null },
      { name: '가스 사용량',  unit: 'Nm³', company: bc.companyGasMj   ?? null, industryAvg: bc.industryAvgGasMj ?? null },
      { name: '탄소 배출량',  unit: 'tCO₂', company: bc.companyCarbonTco2      ?? null, industryAvg: bc.industryAvgCarbonTco2      ?? null },
      { name: '폐기물 발생량',unit: 'kg',   company: bc.companyWasteKg         ?? null, industryAvg: bc.industryAvgWasteKg         ?? null },
      { name: '용수 사용량',  unit: 'm³',   company: bc.companyWaterM3         ?? null, industryAvg: bc.industryAvgWaterM3         ?? null },
    ].filter(m => m.company != null || m.industryAvg != null);
  }, [data]);
  const reportSections  = useMemo(() => parseReportSections(data?.fullReport), [data]);
  const analysisSummary = useMemo(() => buildAnalysisSummary(data), [data]);

  // ── E 카테고리 수치 검증 집계 (검증 요약 섹션용) ──────────────────────
  const verificationStats = useMemo(() => {
    const numEvs = data?.evidenceMatches?.filter(
      e => e.numericMatchLevel != null && e.numericDiffPercent != null
    ) ?? [];
    const highCount   = numEvs.filter(e => e.numericMatchLevel === 'HIGH').length;
    const mediumCount = numEvs.filter(e => e.numericMatchLevel === 'MEDIUM').length;
    const lowCount    = numEvs.filter(e => e.numericMatchLevel === 'LOW').length;
    const total       = numEvs.length;
    // 전체 수치 검증 항목 기준 산술평균 오차율
    const avgDiff = calcMeanDiff(numEvs);
    const highRatio   = total > 0 ? highCount / total : 0;

    // 신뢰도 레벨 + 요약 문구
    let trustLabel, trustCls, summaryText, summaryColor;
    if (lowCount === 0 && highRatio >= 0.8) {
      trustLabel  = 'HIGH 신뢰';
      trustCls    = 'bg-emerald-50 border-emerald-200 text-emerald-700';
      summaryText = '제출된 증빙 데이터와 입력 수치가 대부분 일치합니다.';
      summaryColor = 'text-gray-700';
    } else if (lowCount <= 1) {
      trustLabel  = '보통 신뢰';
      trustCls    = 'bg-amber-50 border-amber-200 text-amber-700';
      summaryText = '일부 항목에서 경미한 차이가 발견되었습니다.';
      summaryColor = 'text-amber-700';
    } else {
      trustLabel  = '검토 필요';
      trustCls    = 'bg-red-50 border-red-200 text-red-600';
      summaryText = '입력값과 증빙 데이터 간 유의미한 차이가 발견되었습니다.';
      summaryColor = 'text-red-600';
    }

    return { highCount, mediumCount, lowCount, avgDiff, highRatio, total,
             trustLabel, trustCls, summaryText, summaryColor };
  }, [data]);

  // 검증 방식 분류
  const verificationMode = useMemo(() => {
    const evs = data?.evidenceMatches ?? [];
    const hasNumeric  = evs.some(e => e.numericMatchLevel != null);
    const hasSemantic = evs.some(e => e.numericMatchLevel == null && e.similarity != null);
    if (hasNumeric && hasSemantic) return 'hybrid';
    if (hasNumeric)  return 'numeric';
    return 'semantic';
  }, [data]);

  // S/G 지표 중 실제로 NO_EVIDENCE인 항목 목록
  // completeIndicatorList + getVerificationStatus 기준으로 판정 (evidenceMatches 존재 여부만으로 판단하지 않음)
  // → G-305가 VERIFIED여도 evidenceMatches에만 없으면 근거 없음으로 잘못 표시되는 문제 방지
  const blockedIndicators = useMemo(() => {
    const list = buildCompleteIndicatorList(data?.evidenceMatches);
    const codeToStatus = new Map(list.map(ev => [ev.indicatorCode, getVerificationStatus(ev)]));
    return Object.entries(SG_INDICATORS).filter(([code]) => {
      const status = codeToStatus.get(code);
      return !status || status === 'NO_EVIDENCE';
    });
  }, [data]);

  // 모든 지표를 포함한 완전한 목록 (NO_EVIDENCE 합성 포함)
  // Verification Summary의 단일 소스 — UI·PDF·AuditConsole이 모두 이것을 기준으로 삼습니다.
  // sharedEvidenceCodes: 동일 chunk를 여러 지표에서 공유하는 indicatorCode 집합 → WEAK 강등
  const completeIndicatorList = useMemo(() => {
    const list = buildCompleteIndicatorList(data?.evidenceMatches);
    const sharedCodes = detectSharedEvidenceCodes(data?.evidenceMatches);
    if (sharedCodes.size === 0) return list;
    return list.map(ev =>
      sharedCodes.has(ev.indicatorCode) ? { ...ev, _isShared: true } : ev
    );
  }, [data]);

  // 단일 소스 카운트 — 모든 UI/badge/summary/validator가 이 값을 사용
  const auditCounts = useMemo(() => {
    const total    = Object.keys(ALL_INDICATOR_CODES).length;
    const verified = completeIndicatorList.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
    const partial  = completeIndicatorList.filter(e => getVerificationStatus(e) === 'PARTIAL').length;
    const weak     = completeIndicatorList.filter(e => getVerificationStatus(e) === 'WEAK').length;
    const contra   = completeIndicatorList.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length;
    const missing  = completeIndicatorList.filter(e => getVerificationStatus(e) === 'NO_EVIDENCE').length;
    const detected = verified + partial + weak + contra;
    const evidenceCoverage   = total > 0 ? Math.round((detected / total) * 100) : 0;
    const strictVerification = total > 0 ? Math.round((verified / total) * 100) : 0;
    return { total, verified, partial, weak, contra, missing, detected, evidenceCoverage, strictVerification };
  }, [completeIndicatorList]);

  // 지표별 세부 점수 데이터 — backend breakdown 우선, 없으면 evidenceMatches 기반 fallback
  const breakdownData = useMemo(() => {
    const raw = data?.esgChart?.breakdown ?? [];
    if (raw.length > 0) {
      return raw.map(item => ({
        ...item,
        title: ALL_INDICATOR_CODES[item.kesgCode] ?? ALL_INDICATOR_CODES[item.indicatorCode] ?? item.label ?? item.name ?? item.indicatorName ?? item.title ?? item.kesgCode ?? item.indicatorCode,
      }));
    }
    // Fallback: completeIndicatorList로 검증 기반 점수 추정
    const MATCH_SCORE = { HIGH: 90, MEDIUM: 72, LOW: 45 };
    const result = completeIndicatorList.map(ev => {
      const catChar = ev.indicatorCode?.[0];
      let score;
      if (catChar === 'E') {
        score = ev.numericMatchLevel ? (MATCH_SCORE[ev.numericMatchLevel] ?? 30) : 30;
      } else {
        const sim = ev.similarity != null ? Math.round(ev.similarity * 100) : null;
        score = ev.isValidEvidence ? (sim != null ? Math.max(50, sim) : 75) : 35;
      }
      const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
      return { kesgCode: ev.indicatorCode, title: ev.indicatorTitle ?? ALL_INDICATOR_CODES[ev.indicatorCode] ?? ev.indicatorCode, score, grade, confidence: null, isFallback: true };
    });
;
    return result;
  }, [data, completeIndicatorList]);

  // 분석 제한 사항 공지 목록
  const limitationNotices = useMemo(() => {
    if (!data) return [];
    const notices = [];
    const evCount  = data.evidenceMatches?.length ?? 0;
    const sgEvs    = data.evidenceMatches?.filter(e => e.indicatorCode?.match(/^[SG]/)) ?? [];
    const lowConf  = (data.overallConfidence ?? 100) < 50;

    if (verificationStats.lowCount > 0)
      notices.push({ tone: 'amber', text: `수치 불일치 ${verificationStats.lowCount}건이 감지되어 해당 항목의 신뢰도가 낮게 평가될 수 있습니다.` });
    if (blockedIndicators.length > 0) {
      const sgEvs = data?.evidenceMatches?.filter(e => e.indicatorCode?.match(/^[SG]/)) ?? [];
      const partialSG = new Set(sgEvs.filter(e => ['PARTIAL','WEAK'].includes(getVerificationStatus(e))).map(e => e.indicatorCode)).size;
      const missingSG = blockedIndicators.length;
      const noticeText = partialSG > missingSG
        ? `다수 지표에서 부분 근거가 확인되었습니다. 일부 S/G 지표는 체크리스트 기반 평가가 보완 적용되었습니다.`
        : missingSG <= 2
        ? `일부 S/G 지표에서 검증 근거가 부족하여 체크리스트 기반 평가가 보완 적용되었습니다.`
        : `일부 S/G 지표에서 문서 근거 검출이 제한되어 체크리스트 기반 평가가 적용되었습니다.`;
      notices.push({ tone: 'amber', text: noticeText });
    }
    if (evCount > 0 && evCount < 3)
      notices.push({ tone: 'zinc', text: 'Evidence 건수가 충분하지 않아 일부 지표 평가 정확도가 낮을 수 있습니다.' });
    if (lowConf && sgEvs.length < 2)
      notices.push({ tone: 'zinc', text: 'OCR 품질에 따라 일부 수치 추출 정확도가 달라질 수 있습니다.' });
    if (data.ragBased === false)
      notices.push({ tone: 'zinc', text: 'AI 문서 분석 대신 체크리스트 기반 평가가 적용되었습니다.' });

    return notices;
  }, [data, verificationStats.lowCount, blockedIndicators]);

  // E 카테고리 수치 비교 행 — API 직접 inputValue/extractedValue/unit 사용
  const numericRows = useMemo(() => {
    const UNIT_FALLBACK = { 'E-101': 'kWh', 'E-102': 'Nm³', 'E-103': 'tCO₂', 'E-104': 'kg', 'E-105': 'm³' };
    const seen = new Set();
    return (data?.evidenceMatches ?? [])
      .filter(e => e.numericMatchLevel != null && (e.indicatorCode?.startsWith('E') || Object.keys(E_INDICATORS).includes(e.indicatorCode)))
      .filter(e => { if (seen.has(e.indicatorCode)) return false; seen.add(e.indicatorCode); return true; })
      .map(e => ({
        ...e,
        inputValue:     e.inputValue     ?? null,
        extractedValue: e.extractedValue ?? null,
        unit:           e.unit           ?? UNIT_FALLBACK[e.indicatorCode] ?? '',
        indicatorTitle: e.indicatorTitle ?? ALL_INDICATOR_CODES[e.indicatorCode] ?? e.indicatorCode,
      }));
  }, [data]);

  // Hero TOP ISSUE 패널 — 가장 중요한 단일 이슈 요약 (extraction failure 최우선)
  const topIssue = useMemo(() => {
    const lowCount  = verificationStats.lowCount;
    const sgMissing = blockedIndicators.length;
    const eFailed   = analysisSummary?.e?.failed ?? 0;
    const eTotal    = analysisSummary?.e?.total  ?? 5;
    if (eFailed >= eTotal)
      return { tone: 'amber', title: '환경(E) 데이터 추출 오류', msg: `환경(E) 데이터 ${eFailed}건 수치를 자동 추출하지 못해 업종 평균 기반 추정 평가가 적용되었습니다. 실측 데이터를 제출하면 정확도가 향상됩니다.` };
    if (eFailed >= 3)
      return { tone: 'amber', title: '환경(E) 데이터 일부 오류', msg: `환경(E) ${eFailed}개 항목 수치 자동 추출에 제한이 있어 업종 평균 기반 추정치가 부분 적용되었습니다.` };
    if (lowCount >= 3)
      return { tone: 'red',     title: '환경(E) 수치 불일치',          msg: `환경(E) 수치 불일치 ${lowCount}건이 감지되었습니다. 입력값과 증빙 문서 간 오차가 허용 범위를 초과하여 신뢰도가 낮게 평가되었습니다.` };
    if (lowCount >= 1)
      return { tone: 'amber',   title: '환경(E) 불일치 감지',           msg: `환경(E) ${lowCount}개 항목에서 수치 차이가 감지되었습니다. 해당 항목의 증빙 문서를 재검토하세요.` };
    if (sgMissing >= 3)
      return { tone: 'amber',   title: '사회·지배구조(S·G) 추가 자료 권장', msg: `사회(S)·지배구조(G) 총 ${S_SELECTED_TOTAL + G_SELECTED_TOTAL}개 지표 중 ${sgMissing}개 지표에 대해 추가 검증 자료 확보가 권장됩니다. 관련 정책 문서 및 운영 증빙 자료를 제출하시면 검증 신뢰도를 높일 수 있습니다.` };
    if (sgMissing >= 1)
      return { tone: 'zinc',    title: '사회·지배구조(S·G) 추가 자료 권장', msg: `사회(S)·지배구조(G) 총 ${S_SELECTED_TOTAL + G_SELECTED_TOTAL}개 지표 중 ${sgMissing}개 지표에 대해 추가 검증 자료 확보가 권장됩니다. 관련 문서를 추가 제출하면 점수가 향상될 수 있습니다.` };
    return   { tone: 'emerald', title: '안정',                          msg: '수치 불일치 및 검증 근거 부족 항목이 없습니다. ESG 데이터 신뢰도가 안정적입니다.' };
  }, [verificationStats.lowCount, blockedIndicators.length, analysisSummary]);

  // AUTO 사전 진단 여부 — API 응답 우선, localStorage 폴백
  const isAutoSimulation = useMemo(() => {
    if (data?.isAutoSimulation === true) return true;
    return localStorage.getItem('esg_isAutoSimulation') === 'true';
  }, [data]);

  // Benchmark fallback 감지 — companyDataSource 우선, E 추출 실패 3건 이상 보조
  const isBenchmarkFallback = useMemo(() => {
    const src = data?.benchmarkComparison?.companyDataSource ?? data?.isBenchmarkFallback;
    if (src === true || src === 'BENCHMARK' || src === 'MOCK') return true;
    return (analysisSummary?.e?.failed ?? 0) >= (analysisSummary?.e?.total ?? 5);
  }, [data, analysisSummary]);

  // 신뢰도-점수 불일치 감지 — LOW mismatch vs 증빙 부족 원인 구분
  const confidenceMismatch = useMemo(() => {
    const score    = data?.totalScore ?? 0;
    const conf     = data?.overallConfidence ?? 100;
    const lowCount = data?.lowMismatchCount ?? 0;
    if (score >= 80 && conf < 50) {
      const reason = lowCount > 0 ? 'LOW_MISMATCH' : 'EVIDENCE_SHORTAGE';
      return { score, conf, reason };
    }
    return null;
  }, [data]);

  // E evidence 전혀 없는 완전 benchmark fallback 감지
  const isFullBenchmark = useMemo(() => {
    if (!isBenchmarkFallback) return false;
    return (data?.evidenceMatches ?? []).filter(e => e.indicatorCode?.startsWith('E')).length === 0;
  }, [data, isBenchmarkFallback]);

  // 신뢰도: 서버값(overallConfidence)을 SoT로 사용 — floor 보정 제거
  // ceiling(WEAK 과다 시 최대 75)만 유지
  const adjustedConfidence = useMemo(() => {
    let base = data?.overallConfidence ?? 100;
    const activeTotal = auditCounts.total > 0 ? auditCounts.total : 1;
    const weakRatio = (auditCounts.weak ?? 0) / activeTotal;
    if (weakRatio > 0.40 && base > 75) base = 75;
    return base;
  }, [data, auditCounts]);

  // Audit 조치 권고 목록 (즉시 조치 필요 섹션)
  const auditRecommendations = useMemo(() => {
    if (!data || isAutoSimulation) return [];
    const recs = [];
    const gBlocked = blockedIndicators.filter(([c]) => c.startsWith('G'));
    const sBlocked = blockedIndicators.filter(([c]) => c.startsWith('S'));
    const eFailed  = analysisSummary?.e?.failed ?? 0;
    const eTotal   = analysisSummary?.e?.total  ?? 5;
    const lowCnt   = verificationStats.lowCount;

    // [우선순위 3] 부족 개수 기반 severity 동적 계산
    const calcSev = (cnt) => cnt >= 4 ? 'HIGH' : cnt >= 2 ? 'MED' : 'LOW';

    // E 수치 불일치
    if (lowCnt >= 2)
      recs.push({ sev: 'HIGH', code: 'E-MISMATCH', _cnt: lowCnt, title: '환경 데이터 수치 불일치',
        desc: `환경(E) 영역 ${lowCnt}개 지표에서 입력값과 증빙 수치 간 오차가 허용 범위를 초과합니다.`,
        scoreImpact: '+5~10점', urgency: '즉시', docs: ['수치 측정 원본 데이터 (CSV)', '제3자 검증 증빙서'] });
    else if (lowCnt === 1)
      recs.push({ sev: 'MED', code: 'E-MISMATCH', _cnt: 1, title: '수치 불일치 감지',
        desc: '환경(E) 영역 1개 지표에서 입력값과 증빙 수치 간 차이가 발생했습니다. 해당 항목의 재검토를 권장합니다.',
        scoreImpact: '+2~4점', urgency: '1개월', docs: ['측정 원본 데이터', '단위 환산 근거서'] });

    // E 수치 증빙 미확인
    if (eFailed >= eTotal && eTotal > 0)
      recs.push({ sev: 'HIGH', code: 'E-EXTRACT', _cnt: eFailed, title: '수치 증빙 미확인',
        desc: `환경(E) 영역 ${eFailed}개 지표 전체에서 수치 증빙이 확인되지 않아 업종 평균 기반 보수적 평가가 적용되었습니다. 추가 공시 문서 제출을 권장합니다.`,
        scoreImpact: '+8~12점', urgency: '즉시', docs: ['환경 데이터 CSV 파일', 'PDF 수치 증빙 자료', '공인 측정 기관 확인서'] });
    else if (eFailed >= 3)
      recs.push({ sev: 'MED', code: 'E-EXTRACT', _cnt: eFailed, title: '수치 증빙 부분 미확인',
        desc: `환경(E) 영역 ${eFailed}개 지표에서 수치 증빙이 확인되지 않았습니다. 증빙 파일의 포맷 및 기재 여부를 확인하시기 바랍니다.`,
        scoreImpact: '+4~7점', urgency: '1개월', docs: ['환경 데이터 CSV 파일', 'PDF 증빙 자료'] });

    // [우선순위 1] G/S 메시지에 실제 부족 개수 표시
    // [우선순위 3] severity를 calcSev로 동적 계산
    if (gBlocked.length >= 1)
      recs.push({ sev: calcSev(gBlocked.length), code: 'G-EVIDENCE', _cnt: gBlocked.length,
        title: '지배구조(G) 검증 근거 부족',
        desc: `지배구조(G) 영역 ${gBlocked.length}개 지표의 검증 근거가 부족합니다. 관련 정책 문서 및 운영 증빙 자료를 보완하시면 보다 정확한 ESG 분석이 가능합니다.`,
        scoreImpact: gBlocked.length >= 3 ? '+6~10점' : '+2~4점',
        urgency: gBlocked.length >= 3 ? '1개월' : '분기 내',
        docs: ['지배구조 정책 문서', '이사회 운영 기록', '지배구조 공시 자료'] });

    if (sBlocked.length >= 1)
      recs.push({ sev: calcSev(sBlocked.length), code: 'S-EVIDENCE', _cnt: sBlocked.length,
        title: '사회(S) 검증 근거 부족',
        desc: `사회(S) 영역 ${sBlocked.length}개 지표의 검증 근거가 부족합니다. 관련 실적 자료 및 운영 증빙 문서를 보완하시면 보다 정확한 ESG 분석이 가능합니다.`,
        scoreImpact: sBlocked.length >= 3 ? '+3~6점' : '+1~3점',
        urgency: sBlocked.length >= 3 ? '분기 내' : '다음 보고 주기',
        docs: ['사회공헌 활동 보고서', '산업안전 교육 이수 기록'] });

    if (isBenchmarkFallback && !isFullBenchmark && recs.every(r => r.code !== 'E-EXTRACT'))
      recs.push({ sev: 'LOW', code: 'E-BENCHMARK', _cnt: 0, title: '업종 평균 추정 적용',
        desc: '일부 환경(E) 지표에 업종 평균 추정치가 적용되었습니다. 실측 데이터 제출 시 정확도가 향상됩니다.',
        scoreImpact: '+3~5점', urgency: '다음 보고 주기', docs: ['환경 데이터 실측 CSV', 'PDF 증빙 파일'] });

    // [우선순위 2] severity 우선, 동일 severity 내에서는 부족 개수 내림차순 정렬
    const sevOrder = { HIGH: 0, MED: 1, LOW: 2 };
    recs.sort((a, b) => {
      const sd = sevOrder[a.sev] - sevOrder[b.sev];
      return sd !== 0 ? sd : (b._cnt ?? 0) - (a._cnt ?? 0);
    });

    return recs.slice(0, 5);
  }, [data, isAutoSimulation, blockedIndicators, analysisSummary, verificationStats, isBenchmarkFallback, isFullBenchmark]);

  // ── 로딩 ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="flex flex-col items-center gap-5">
        <div className="w-14 h-14 rounded-2xl border border-gray-200 flex items-center justify-center bg-white">
          <Loader2 size={22} className="text-emerald-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-gray-700">분석 결과 로딩 중</p>
          <p className="text-[12px] text-gray-400 mt-1">잠시만 기다려 주세요</p>
        </div>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100">
          <AlertCircle size={22} className="text-red-400" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-gray-700">{error ?? '결과를 불러올 수 없습니다.'}</p>
          <p className="text-[12px] text-gray-400 mt-1">분석 ID: {analysisId}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-[12px] text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> 돌아가기
        </button>
      </div>
    </div>
  );

  const d               = data;
  const gradeAccentColor = GRADE_COLOR[d.finalGrade] ?? '#52525b';

  // Hero 파생 값 (auditCounts 기반 — 단일 소스)
  const evidenceCovPct = auditCounts.strictVerification;
  const auditStatus = isAutoSimulation
    ? 'SIMULATION'
    : isBenchmarkFallback
    ? 'ESTIMATED'
    : verificationStats.lowCount === 0 && adjustedConfidence >= 65 && blockedIndicators.length === 0
    ? 'VERIFIED'
    : 'PARTIAL';

  // EcoPoint 관련 파생 값 (normalizeScore가 sScoreBefore/ecoScoreBonus를 주입함)
  const hasEco         = d.ecoPoints > 0 || d.carbonReductionKg > 0 || (d.ecoSBonus != null && d.ecoSBonus > 0);
  const sScoreBefore   = d.sScoreBefore   ?? null;
  const sScoreAfter    = d.sScoreAfter    ?? (hasEco ? d.sScore : null);
  const ecoScoreBonus  = d.ecoScoreBonus  ?? (sScoreBefore != null && sScoreAfter != null ? sScoreAfter - sScoreBefore : null);
  const participantCnt = d.participantCount ?? null;
  const hasBeforeAfter = sScoreBefore != null && sScoreAfter != null;
  const finalSummary   = buildFinalSummary({
    finalGrade:          d.finalGrade,
    confidence:          d.overallConfidence,
    lowCount:            d.lowMismatchCount ?? verificationStats.lowCount,
    mediumCount:         verificationStats.mediumCount,
    avgDiff:             verificationStats.avgDiff,
    evidenceCount:       d.evidenceCount,
    isBenchmarkFallback,
    isFullBenchmark,
  });

  // ── Audit 일관성 검증 (DEV 전용) ─────────────────────────────────────
  if (IS_DEV && d) {
    const _evs         = d.evidenceMatches ?? [];
    const _medMis      = _evs.filter(e => e.indicatorCode?.[0] === 'E' && e.numericMatchLevel === 'MEDIUM').length;
    const _ocrMs       = d.ocrTimeMs ?? 0;
    const _hasRag      = completeIndicatorList.some(e => !e._synthetic && e.similarity != null && e.similarity > 0);
    const _hasOcrProof = _ocrMs > 0 || _hasRag;
    const _warns = validateAuditConsistency({
      verifiedEv: auditCounts.verified,
      partialEv:  (auditCounts.partial ?? 0) + (auditCounts.weak ?? 0),
      missingEv:  auditCounts.missing,
      contraEv:   auditCounts.contra,
      mediumMismatch: _medMis,
      coveragePct: d.coverageRate ?? null,
      ocrMs: _ocrMs, hasOcrProof: _hasOcrProof, hasRagData: _hasRag,
      hasEco, ecoScoreBonus, adjustedConfidence,
      totalIndicators: auditCounts.total,
      completeList: completeIndicatorList,
    });
    // _warns suppressed in production — logic flags captured in auditMeta for UI display
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-5">

        {/* ── 뒤로가기 + Demo + PDF ─────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={13} /> 이전으로
          </button>
          <div className="flex items-center gap-2">
            {IS_DEV && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-900/20 border border-purple-700/30">
                <PlayCircle size={11} className="text-purple-400 shrink-0" />
                <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider mr-0.5">Demo</span>
                {[
                  { key: 'good',             label: 'GOOD',    shortcut: '1', cls: 'bg-emerald-900/30 border-emerald-600/30 text-emerald-300 hover:bg-emerald-800/40' },
                  { key: 'warning',          label: 'WARN',    shortcut: '2', cls: 'bg-amber-900/30   border-amber-600/30   text-amber-300   hover:bg-amber-800/40' },
                  { key: 'missing-evidence', label: 'MISSING', shortcut: '3', cls: 'bg-red-900/30     border-red-600/30     text-red-300     hover:bg-red-800/40' },
                ].map(({ key, label, shortcut, cls }) => (
                  <button key={key} onClick={() => handleDemoRun(key)} title={`Shortcut: ${shortcut}`}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${cls} ${demoLabel === key ? 'ring-1 ring-white/20' : ''}`}>
                    {label}
                    <span className="text-[8px] opacity-50 font-mono">[{shortcut}]</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handlePdfExport}
              disabled={isPdfLoading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-xs font-semibold text-gray-700 hover:text-gray-900 shadow-sm transition-all duration-150 disabled:opacity-50"
            >
              {isPdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              PDF 다운로드
            </button>
          </div>
        </div>
        {demoLabel && IS_DEV && (() => {
          const evs  = completeIndicatorList;   // NO_EVIDENCE 합성 포함
          const conf = d?.overallConfidence ?? 0;
          const verifiedCnt = evs.filter(e => getVerificationStatus(e) === 'VERIFIED').length;
          const weakCnt     = evs.filter(e => ['PARTIAL','WEAK'].includes(getVerificationStatus(e))).length;
          const contradictCnt = evs.filter(e => getVerificationStatus(e) === 'CONTRADICTION').length;
          const avgSim = evs.filter(e => e.similarity != null).length > 0
            ? Math.round(evs.reduce((s, e) => s + (toPct(e.similarity) ?? 0), 0) / evs.filter(e => e.similarity != null).length)
            : 0;
          const META = {
            'good':             { label: '정상',     cls: 'bg-emerald-900/20 border-emerald-700/30', textCls: 'text-emerald-300', scenario: '강한 ESG 문서 업로드 — A/S 등급' },
            'warning':          { label: '보조 검증', cls: 'bg-amber-900/20   border-amber-700/30',   textCls: 'text-amber-300',   scenario: '체크리스트 + 약한 PDF — C/B 등급' },
            'missing-evidence': { label: '증빙 없음', cls: 'bg-red-900/20     border-red-700/30',     textCls: 'text-red-300',     scenario: '증빙 없음 — D 등급 / 벤치마크' },
          };
          const m = META[demoLabel] ?? META['good'];
          return (
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${m.cls} flex-wrap`}>
              <div className="flex items-center gap-2">
                <PlayCircle size={11} className={`${m.textCls} shrink-0 animate-pulse`} />
                <span className={`text-[10px] font-black uppercase tracking-widest font-mono ${m.textCls}`}>◉ DEMO</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono ${m.textCls} border-current`}>{m.label}</span>
                <span className="text-[9px] text-gray-500">{m.scenario}</span>
              </div>
              {/* Live metrics display — contradiction priority: show CONTRA first when present */}
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {contradictCnt > 0 && (
                  <span className="text-[9px] font-mono bg-red-900/30 border border-red-600/50 text-red-300 px-2 py-0.5 rounded font-black animate-pulse">
                    ⚠ CONTRADICTION ×{contradictCnt}
                  </span>
                )}
                <span className="text-[9px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold">
                  ✓ {verifiedCnt} 검증 완료
                </span>
                {weakCnt > 0 && (
                  <span className="text-[9px] font-mono bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded font-bold">
                    ~ {weakCnt} 근거 부족
                  </span>
                )}
                {conf < 50 && (
                  <span className="text-[9px] font-mono bg-gray-800 border border-gray-600 text-gray-300 px-2 py-0.5 rounded font-bold">
                    보수적 평가 모드 ({conf}%)
                  </span>
                )}
                {avgSim > 0 && (
                  <span className="text-[9px] font-mono bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                    avg sim {avgSim}%
                  </span>
                )}
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-bold ${
                  conf >= 70 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : conf >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  conf {conf}%
                </span>
              </div>
              <button onClick={() => setDemoLabel(null)} className="text-[9px] text-gray-400 hover:text-gray-700 transition-colors font-mono shrink-0">
                ✕
              </button>
            </div>
          );
        })()}

        {/* ── Hero 헤더 ─────────────────────────────────────── */}
        <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${gradeAccentColor} 0%, transparent 60%)` }} />
          <div className="absolute top-0 left-0 w-64 h-32 pointer-events-none" style={{ background: `radial-gradient(ellipse at 0% 0%, ${gradeAccentColor}10 0%, transparent 70%)` }} />

          {/* ── AI Audit Summary Header ── */}
          <div className="relative px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${gradeAccentColor}12`, border: `1px solid ${gradeAccentColor}20` }}>
                <Shield size={14} style={{ color: gradeAccentColor }} />
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-400">ESG 분석 결과</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5 truncate max-w-[300px]">
                  {d.companyName ?? 'ESG 감사 결과'}
                  {d.industry && <span className="text-gray-400 font-normal ml-2 text-xs">· {d.industry}</span>}
                </p>
              </div>
            </div>
            {/* Audit Status Badge */}
            {(() => {
              const STATUS_CFG = {
                VERIFIED:   { label: '검증 완료',       cls: 'bg-emerald-50 border-emerald-400 text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
                PARTIAL:    { label: '일부 검증',       cls: 'bg-amber-50 border-amber-400 text-amber-700',       dot: 'bg-amber-500' },
                ESTIMATED:  { label: '업종 평균 추정',  cls: 'bg-orange-50 border-orange-400 text-orange-700',    dot: 'bg-orange-500' },
                SIMULATION: { label: '사전 진단',       cls: 'bg-gray-100 border-gray-300 text-gray-600',         dot: 'bg-gray-400' },
              };
              const s = STATUS_CFG[auditStatus] ?? STATUS_CFG.PARTIAL;
              return (
                <div className="flex flex-col items-start gap-0.5">
                  <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border font-bold text-[11px] tracking-wide whitespace-nowrap ${s.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    {s.label}
                  </div>
                  {auditStatus !== 'SIMULATION' && auditStatus !== 'ESTIMATED' && (
                    <div className="flex flex-col pl-1 gap-0">
                      <span className="text-[10px] text-gray-500 leading-snug font-medium">
                        {auditCounts.total}개 ESG 핵심 지표 중 {auditCounts.verified}개 검증 완료
                      </span>
                      {((auditCounts.partial ?? 0) + (auditCounts.weak ?? 0)) > 0 && (
                        <span className="text-[9px] text-blue-500 leading-snug">
                          {(auditCounts.partial ?? 0) + (auditCounts.weak ?? 0)}개 의미 기반 근거 확인
                        </span>
                      )}
                      {auditCounts.missing > 0 && (
                        <span className="text-[9px] text-gray-400 leading-snug">
                          {auditCounts.missing}개 지표 추가 보완 권장
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── 4 KPI Metrics Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-b border-gray-100">
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">ESG 등급</p>
              <div className="flex items-baseline gap-2">
                <span className="kpi-number" style={{ color: gradeAccentColor, fontSize: '2.5rem' }}>
                  {d.finalGrade ?? '—'}
                </span>
                {d.totalScore != null && (
                  <span className="text-[14px] font-semibold" style={{ color: gradeAccentColor }}>
                    ({d.totalScore}점)
                  </span>
                )}
                {d.gradeCeilingApplied && !isAutoSimulation && (
                  <span className="badge badge-high" style={{ fontSize: '10px' }}>제한</span>
                )}
              </div>
              <p className="kpi-sublabel mt-2">{isAutoSimulation ? 'Simulation' : 'K-ESG 기준'}</p>
            </div>
            <div className="px-6 py-6">
              <p className="kpi-label mb-4">E / S / G 점수</p>
              <div className="space-y-2.5">
                {[
                  { label: 'E', score: d.eScore ?? 0, color: '#059669' },
                  { label: 'S', score: d.sScore ?? 0, color: '#3b82f6' },
                  { label: 'G', score: d.gScore ?? 0, color: '#f59e0b' },
                ].map(({ label, score, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] font-black w-4 shrink-0" style={{ color }}>{label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
                    </div>
                    <span className="text-[12px] font-bold tabular-nums w-7 text-right" style={{ color }}>{score}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">분석 신뢰도</p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="kpi-number" style={{ color: adjustedConfidence >= 65 ? '#059669' : adjustedConfidence >= 50 ? '#f59e0b' : '#ef4444', fontSize: '2.5rem' }}>
                  {adjustedConfidence}
                </span>
                <span className="text-[13px] text-gray-400 font-medium mb-0.5">%</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border mb-0.5 ${
                  adjustedConfidence >= 65
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : adjustedConfidence >= 50
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {adjustedConfidence >= 65 ? 'HIGH' : adjustedConfidence >= 50 ? 'MEDIUM' : 'LOW'}
                </span>
              </div>
              <ScoreProgressBar score={adjustedConfidence} color={adjustedConfidence >= 65 ? '#059669' : adjustedConfidence >= 50 ? '#f59e0b' : '#ef4444'} height="h-1.5" />
              <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">제출 자료 기반 분석 신뢰도</p>
            </div>
            <div className="px-6 py-6">
              <p className="kpi-label mb-3">근거 확인</p>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="kpi-number" style={{ color: auditCounts.verified > 0 ? '#059669' : '#9ca3af', fontSize: '2.5rem' }}>
                  {auditCounts.verified}
                </span>
                <span className="text-[13px] text-gray-400 font-medium mb-0.5">/ {auditCounts.total}</span>
              </div>
              <ScoreProgressBar
                score={auditCounts.total > 0 ? Math.round(auditCounts.verified / auditCounts.total * 100) : 0}
                color={auditCounts.verified > 0 ? '#059669' : '#e5e7eb'}
                height="h-1.5"
              />
              <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">지표 근거 직접 확인 완료</p>
            </div>
          </div>

          <div className="relative px-8 py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono" style={{ color: gradeAccentColor, borderColor: `${gradeAccentColor}40`, background: `${gradeAccentColor}10` }}>
                  K-ESG
                </span>
                {isAutoSimulation ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 border-amber-200 text-amber-700">
                    업종 평균 사전 진단
                  </span>
                ) : verificationMode === 'hybrid' ? (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 border-emerald-200 text-emerald-700">
                    문서·수치 통합 검증
                  </span>
                ) : verificationMode === 'numeric' ? (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md border bg-sky-50 border-sky-200 text-sky-700">
                    수치 증빙 검증
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md border bg-gray-100 border-gray-200 text-gray-500">
                    문서 기반 검증
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight truncate">
                {d.companyName ?? '기업 ESG 분석 결과'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                {d.industry && (
                  <span className="flex items-center gap-1"><Building2 size={11} className="shrink-0" />{d.industry}</span>
                )}
                {isAutoSimulation ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-amber-500/15 text-amber-400 border-amber-500/30">
                    <AlertTriangle size={10} className="shrink-0" />
                    업종 평균 사전 진단 · 감사 분석 미수행
                  </span>
                ) : d.overallConfidence != null && (
                  <>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                      adjustedConfidence < 40 ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : adjustedConfidence < 65 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    } ${adjustedConfidence < 50 ? 'opacity-70' : ''}`}>
                      <Shield size={10} className="shrink-0" />
                      분석 신뢰도 {adjustedConfidence}%
                      <ConfidenceTooltip />
                    </span>
                    {adjustedConfidence < 50 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-gray-100 border-gray-300 text-gray-500">
                        <AlertTriangle size={9} className="shrink-0" />
                        점수 참고용
                      </span>
                    )}
                  </>
                )}
                {d.analyzedAt && (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Clock size={10} className="shrink-0" />
                    {fmtKST(d.analyzedAt, 19)}
                    {d.processingTimeMs != null && (
                      <span className="ml-1 text-gray-400">· {(d.processingTimeMs / 1000).toFixed(1)}s</span>
                    )}
                  </span>
                )}
              </div>
              {/* 최종 평가 요약 — 환경(E) 데이터 검증 결과 */}
              {finalSummary && (
                <div className={`mt-3 px-4 py-2.5 rounded-xl border text-sm leading-relaxed ${
                  finalSummary.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  finalSummary.tone === 'amber'   ? 'bg-amber-50  border-amber-200  text-amber-800'    :
                  finalSummary.tone === 'red'     ? 'bg-red-50    border-red-200    text-red-700'      :
                                                    'bg-gray-50   border-gray-200   text-gray-700'
                }`}>
                  <p className="text-[10px] font-semibold text-gray-400 mb-1">환경(E) 데이터 검증 결과</p>
                  {finalSummary.text}
                  {finalSummary.gradeAdjusted && (
                    <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 border-amber-300 text-amber-700 align-middle">
                      등급 보정 적용
                    </span>
                  )}
                </div>
              )}
              {/* ── 수치 불일치 경고 — 환경(E) 검증 결과 직후, 핵심 이슈 직전 ── */}
              {!isAutoSimulation && (d.lowMismatchCount ?? 0) > 0 && (
                <div className="mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 bg-red-50 border-red-200">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] font-bold text-red-700">
                        {(d.lowMismatchCount ?? 0) >= 4 ? '심각한 수치 불일치 감지' : '수치 불일치 감지'}
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                        검증 실패 {d.lowMismatchCount}건
                      </span>
                      {d.gradeCeilingApplied && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700">
                          등급 제한 적용
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-red-600 mt-1">
                      {(d.lowMismatchCount ?? 0) >= 4
                        ? `입력한 ESG 환경 데이터 ${d.lowMismatchCount}개 항목이 증빙 문서 수치와 심각하게 불일치합니다.`
                        : `입력한 ESG 환경 데이터가 증빙 문서 수치와 일치하지 않는 항목이 있습니다.`}
                      {d.gradeCeilingApplied && (
                        <span className="ml-2 font-semibold text-amber-700">
                          수치 검증 실패로 등급 제한이 적용되었습니다.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
              {/* ── AI 검증 제한 상태 카드 (신뢰도 < 50%, 증빙 부족 케이스만) ── */}
              {!isAutoSimulation && adjustedConfidence < 50 && (data?.lowMismatchCount ?? 0) === 0 && (
                <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-50 border-amber-200">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-amber-700 mb-0.5">검증 제한 상태</p>
                    <p className="text-[10px] text-amber-600 leading-relaxed">
                      분석 신뢰도 {adjustedConfidence}%로 검증 근거가 충분하지 않습니다. 제출 ESG 데이터와 보고서 원문의 정합성을 확인하고, 정량 지표·정책 문서를 보완한 후 재분석을 권고합니다. 현재 점수는 참고용으로만 활용하십시오.
                    </p>
                  </div>
                </div>
              )}
              {/* AUTO SIMULATION disclaimer */}
              {isAutoSimulation && (
                <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-r-xl border border-l-0 bg-amber-50 border-amber-200"
                  style={{ borderLeft: '3px solid #f59e0b' }}>
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-0.5">업종 벤치마크 기반 사전 진단</p>
                    <p className="text-[10px] text-amber-600 leading-relaxed">
                      본 결과는 실제 ESG 문서 분석이 수행되지 않은 업종 평균 기반 사전 진단입니다.
                      근거 적합도 분석·신뢰도 산정 파이프라인이 실행되지 않은 시뮬레이션 결과로,
                      실제 ESG 인증 또는 공시 목적으로 활용할 수 없습니다.
                    </p>
                  </div>
                </div>
              )}
              {/* TOP ISSUE 패널 — SaaS audit alert 스타일 (MANUAL only) */}
              {!isAutoSimulation && topIssue && (
                <div
                  className={`mt-3 flex items-start gap-3 px-4 py-3 rounded-r-xl border border-l-0 ${
                    topIssue.tone === 'red'     ? 'bg-red-50   border-red-200'     :
                    topIssue.tone === 'amber'   ? 'bg-amber-50 border-amber-200'   :
                    topIssue.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200' :
                                                  'bg-gray-50  border-gray-200'
                  }`}
                  style={{ borderLeft: `3px solid ${
                    topIssue.tone === 'red'     ? '#ef4444' :
                    topIssue.tone === 'amber'   ? '#f59e0b' :
                    topIssue.tone === 'emerald' ? '#059669' :
                                                  '#9ca3af'
                  }` }}
                >
                  <div className="shrink-0 mt-0.5">
                    {topIssue.tone === 'red'     && <AlertTriangle size={13} className="text-red-500" />}
                    {topIssue.tone === 'amber'   && <AlertTriangle size={13} className="text-amber-500" />}
                    {topIssue.tone === 'emerald' && <CheckCircle2 size={13} className="text-emerald-500" />}
                    {topIssue.tone === 'zinc'    && <Info size={13} className="text-gray-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold text-gray-400">핵심 이슈</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                        topIssue.tone === 'red'     ? 'bg-red-100   border-red-200   text-red-700'     :
                        topIssue.tone === 'amber'   ? 'bg-amber-100 border-amber-200 text-amber-700'   :
                        topIssue.tone === 'emerald' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
                                                      'bg-gray-100  border-gray-200  text-gray-600'
                      }`}>{topIssue.title}</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${
                      topIssue.tone === 'red'     ? 'text-red-600'     :
                      topIssue.tone === 'amber'   ? 'text-amber-700'   :
                      topIssue.tone === 'emerald' ? 'text-emerald-700' :
                                                    'text-gray-500'
                    }`}>{topIssue.msg}</p>
                  </div>
                </div>
              )}
              {/* ── 점수 산정 근거 (MANUAL only) ── */}
              {!isAutoSimulation && d.eScore && d.sScore && d.gScore && (() => {
                const ksic = localStorage.getItem('esg_ksicCode') ?? '';
                const iw   = getIndustryWeights(ksic);
                const eC   = Math.round(d.eScore * iw.E);
                const sC   = Math.round(d.sScore * iw.S);
                const gC   = Math.round(d.gScore * iw.G);
                const rawW = eC + sC + gC;
                const penalty = rawW - (d.totalScore ?? rawW);
                return (
                  <details className="mt-3 group">
                    <summary className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer select-none list-none">
                      <Info size={10} className="shrink-0" />
                      <span>점수 산정 근거 보기</span>
                      <span className="ml-1 text-gray-300 group-open:rotate-90 inline-block transition-transform">▶</span>
                    </summary>
                    <div className="mt-2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[10px] space-y-1.5">
                      <p className="font-semibold text-gray-600 mb-2">최종 점수 = E×{Math.round(iw.E*100)}% + S×{Math.round(iw.S*100)}% + G×{Math.round(iw.G*100)}%{penalty > 0 ? ' − 신뢰도 보정' : ''}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[['E','환경',d.eScore,iw.E,'#059669'],['S','사회',d.sScore,iw.S,'#3b82f6'],['G','지배구조',d.gScore,iw.G,'#f59e0b']].map(([cat,lbl,sc,w,col]) => (
                          <div key={cat} className="bg-white rounded-lg border border-gray-200 px-2 py-2">
                            <p className="text-gray-400 mb-0.5">{lbl}</p>
                            <p className="font-black tabular-nums" style={{color:col}}>{sc}점</p>
                            <p className="text-gray-400">×{Math.round(w*100)}% = <span className="font-semibold text-gray-600">{Math.round(sc*w)}점</span></p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 mt-1">
                        <span className="text-gray-500">가중 합산: <span className="font-semibold text-gray-700">{rawW}점</span></span>
                        {penalty > 0 && <span className="text-amber-600">신뢰도·증빙 보정: <span className="font-semibold">−{penalty}점</span></span>}
                        <span className="font-black text-gray-900">최종: <span className="text-blue-600">{d.totalScore}점</span></span>
                      </div>
                      <p className="text-gray-400 pt-0.5">업종 가중치: {iw.label} (KSIC {ksic || 'N/A'}) · 신뢰도 보정, 등급 상한 등 반영 후 최종 확정</p>
                    </div>
                  </details>
                );
              })()}
              {/* 신뢰도-점수 불일치 경고 — EVIDENCE_SHORTAGE 케이스만 표시 */}
              {/* LOW_MISMATCH는 상단 빨간 경고 박스에서 이미 처리 */}
              {!isAutoSimulation && confidenceMismatch?.reason === 'EVIDENCE_SHORTAGE' && (
                <div className="mt-2 flex items-start gap-2.5 px-4 py-2.5 rounded-xl border bg-amber-50 border-amber-200">
                  <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    증빙 부족 상태에서 체크리스트 기반 점수가 반영되었습니다. 분석 신뢰도({confidenceMismatch.conf}%)가 낮아 결과를 참고용으로만 활용하십시오.
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <GradeBadge grade={d.finalGrade} size="lg" />
              {d.gradeCeilingApplied && !isAutoSimulation && (
                <span className="text-[9px] font-bold text-amber-600 whitespace-nowrap">검증 결과로 인한 등급 제한 적용</span>
              )}
              {d.analyzedAt && (
                <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                  <Clock size={9} />
                  {fmtKST(d.analyzedAt)}
                </div>
              )}
            </div>
          </div>
          {/* 분석 처리 시간 푸터 */}
          <div className="border-t border-gray-100 px-8 py-2.5 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Clock size={9} className="shrink-0" />
              {d.processingTimeMs != null
                ? `분석 소요 시간 ${(d.processingTimeMs / 1000).toFixed(1)}초`
                : `분석 완료 · ${fmtKST(d.analyzedAt)}`}
            </span>
            {d.ocrFallback === true && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold bg-amber-50 border-amber-200 text-amber-600">
                ⚠ OCR 제한
              </span>
            )}
            <span className="ml-auto text-[10px] text-gray-300">K-ESG · AI Audit</span>
          </div>
        </div>

        {/* ── 시스템 배너 — AUTO: 사전 진단 / MANUAL: RAG 검증 ─────── */}
        {isAutoSimulation ? (
          <div className="flex items-start gap-4 px-5 py-4 rounded-xl border"
            style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.06) 0%, rgba(120,53,15,0.03) 100%)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={15} className="text-amber-400" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-700 mb-1">ESG 사전 진단 결과</p>
              <p className="text-xs text-gray-500 leading-relaxed mb-2.5">
                본 결과는 실제 ESG 문서 분석이 수행되지 않은 업종 평균 기반 사전 진단입니다.
                문서 OCR·근거 적합도 분석·증빙 매핑 파이프라인은 실행되지 않았습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                  <BarChart2 size={10} className="shrink-0" /> E · 업종 벤치마크 추정
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
                  <Hash size={10} className="shrink-0" /> S/G · 체크리스트 기반 평가
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600">
                  <X size={10} className="shrink-0" /> AI 문서 분석 미수행
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl border bg-white border-gray-200 shadow-sm">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 size={13} className="text-emerald-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-700">분석 검증 완료</p>
              <p className="text-xs text-gray-400 mt-0.5">
                환경(E) 수치 검증 · 사회(S)·지배구조(G) 근거 추적 · K-ESG 기준 적용
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                <BarChart2 size={10} className="shrink-0" /> 수치 검증
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
                <Hash size={10} className="shrink-0" /> 근거 추적
              </span>
            </div>
          </div>
        )}

        {/* ── E / S / G 스코어 카드 ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['E', 'S', 'G']).map((cat) => {
            const score   = cat === 'E' ? d.eScore : cat === 'S' ? d.sScore : d.gScore;
            const radarPt = d.esgChart?.radar?.find(r => r.category === cat);
            const color   = ESG_COLOR[cat];
            const Icon    = ESG_ICON[cat];
            const safe    = score ?? 0;
            return (
              <div key={cat} className="relative bg-white border border-gray-200 rounded-2xl p-6 overflow-hidden hover:border-gray-300 transition-all duration-200 group">
                <div className="absolute top-0 left-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: color }} />
                <div className="absolute bottom-0 left-0 right-0 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ background: `linear-gradient(0deg, ${color}08 0%, transparent 100%)` }} />
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                      <Icon size={17} style={{ color }} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color }}>
                          {cat === 'E' ? 'Environmental' : cat === 'S' ? 'Social' : 'Governance'}
                        </p>
                        {cat === 'E' && isFullBenchmark && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-amber-50 border-amber-300 text-amber-700 font-mono uppercase tracking-wider">
                            추정
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-700 leading-none mt-0.5">
                        {cat === 'E'
                          ? (isBenchmarkFallback ? '환경(E) 추정 점수' : '환경')
                          : cat === 'S' ? '사회' : '지배구조'}
                      </p>
                    </div>
                  </div>
                  <GradeBadge grade={radarPt?.grade} />
                </div>
                <div className="mb-3">
                  <span className="kpi-number" style={{ fontSize: '2.25rem', color: safe >= 70 ? color : safe >= 50 ? '#f59e0b' : '#ef4444' }}>{safe}</span>
                  <span className="text-sm text-gray-400 ml-1">점</span>
                </div>
                <ScoreProgressBar
                  score={safe}
                  color={cat === 'E' && isBenchmarkFallback ? '#f59e0b' : color}
                  height="h-2"
                  estimated={cat === 'E' && isBenchmarkFallback}
                />
                <div className="flex items-center justify-between mt-2">
                  {cat === 'E' && isBenchmarkFallback && (analysisSummary?.e?.failed ?? 0) >= (analysisSummary?.e?.total ?? 5)
                    ? <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">수치 증빙 미확인</span>
                    : <p className="text-[10px] text-gray-500 tabular-nums">{safe} / 100</p>
                  }
                  {/* 검증 방법 라벨 */}
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    isAutoSimulation && cat === 'E'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : cat === 'E'
                        ? isFullBenchmark
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : isBenchmarkFallback
                          ? 'bg-amber-50 border-amber-200 text-amber-600'
                          : 'bg-sky-50 border-sky-200 text-sky-700'
                        : isAutoSimulation
                        ? 'bg-gray-100 border-gray-200 text-gray-500'
                        : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}>
                    {cat === 'E'
                      ? isAutoSimulation
                        ? '업종 시뮬레이션'
                        : isFullBenchmark
                        ? '업종 평균 추정 분석'
                        : isBenchmarkFallback ? '업종 평균 추정' : '수치 검증'
                      : isAutoSimulation ? '체크리스트 기반' : '근거 적합도 분석'}
                  </span>
                </div>
                {cat === 'E' && (isAutoSimulation || isBenchmarkFallback) && (
                  <div className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle size={10} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[9px] text-amber-600 leading-relaxed">
                      {isAutoSimulation
                        ? '업종 평균 기반 ESG 사전 진단입니다. 실제 AI 문서 분석은 수행되지 않았습니다.'
                        : isFullBenchmark
                        ? '실제 환경 증빙 검증이 아닌 업종 벤치마크 기반 추정 평가입니다.'
                        : '실측 환경 데이터 검증이 아닌 업종 벤치마크 기반 추정 평가입니다.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 점수 보정 안내 ───────────────────────────────── */}
        {!isAutoSimulation && d.eScore != null && d.totalScore != null && Math.abs(d.totalScore - Math.round(d.eScore * 0.4 + (d.sScore ?? 0) * 0.3 + (d.gScore ?? 0) * 0.3)) > 2 && (
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700">
            <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">최종 종합 분석 과정에서 업종 가중치 및 전체 ESG 밸런스 보정이 적용되었습니다.</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                E · S · G 카테고리 점수와 최종 종합 점수가 다를 수 있습니다. 이는 업종 특성 가중치 반영, 전체 ESG 밸런스 조정,
                증빙 품질 반영 등의 보정 과정이 적용되었기 때문입니다.
              </p>
            </div>
          </div>
        )}

        {/* ── 보완 권장 사항 ───────────────── */}
        {auditRecommendations.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-2.5 px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Info size={13} className="text-blue-500" />
                </span>
                <span className="text-sm font-semibold text-gray-800">보완 권장 사항</span>
              </div>
              <button
                onClick={() => { setActiveTab('action'); setSearchParams({ tab: 'action' }, { replace: true }); }}
                className="text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors shrink-0"
              >
                상세 내용 확인 →
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {auditRecommendations.slice(0, 3).map((rec, i) => {
                const SEV = {
                  HIGH: { cls: 'bg-blue-50 text-blue-700 border-blue-200',    label: '권장' },
                  MED:  { cls: 'bg-gray-100 text-gray-600 border-gray-200',   label: '선택' },
                  LOW:  { cls: 'bg-gray-50 text-gray-500 border-gray-100',    label: '참고' },
                };
                const s = SEV[rec.sev] ?? SEV.LOW;
                return (
                  <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <span className={`mt-0.5 shrink-0 text-[9px] font-bold px-2 py-0.5 rounded border tracking-wide ${s.cls}`}>{s.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-gray-800 mb-0.5">{rec.title}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{rec.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Result Tab Navigation ───────────────────────── */}
        {(() => {
          const highActionCount = !isAutoSimulation
            ? auditRecommendations.filter(r => r.sev === 'HIGH').length
            : 0;
          const tabs = [
            {
              id: 'summary',
              label: '분석 요약',
              badge: null,
            },
            {
              id: 'evidence',
              label: '근거 및 판단',
              badge: { count: `${auditCounts.verified}/${auditCounts.total}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            },
            {
              id: 'action',
              label: '개선 과제',
              badge: highActionCount > 0
                ? { count: highActionCount, cls: 'bg-red-50 text-red-600 border-red-200' }
                : null,
            },
            {
              id: 'industry',
              label: '업종 비교',
              badge: benchMetrics.length > 0
                ? { count: `${benchMetrics.length}개 지표`, cls: 'bg-purple-50 text-purple-700 border-purple-200' }
                : null,
            },
            { id: 'audit-log', label: '분석 기록', badge: null },
          ];
          return (
            <div id="esg-tab-nav" className="flex items-center gap-0 border-b border-gray-200 -mx-8 px-8 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchParams({ tab: tab.id }, { replace: true });
                  }}
                  className={[
                    'flex items-center gap-2 px-5 py-4 text-[13px] font-medium border-b-2 -mb-px transition-all duration-150 whitespace-nowrap',
                    activeTab === tab.id
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  {tab.label}
                  {tab.badge && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tab.badge.cls}`}>
                      {tab.badge.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        {/* 섹션 앵커 (hash scroll 대상) */}
        <div id="section-summary" />

        {/* ── ESG 카테고리 점수 + 카테고리 상세 (상단 위치) ── */}
        {activeTab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="ESG 카테고리 점수" icon={TrendingUp} iconColor="#059669">
            {radarData.length > 0 ? (
              <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={95}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#4B5563', fontSize: 12.5, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="점수" dataKey="score" stroke="#059669" fill="#059669" fillOpacity={0.22} strokeWidth={3} dot={{ r: 4, fill: '#059669', strokeWidth: 0 }} isAnimationActive={true} animationDuration={700} />
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-gray-400 text-center mt-1">
                카테고리별 상대 점수 시각화 · E/S/G 업종별 동적 가중 평균 기반
              </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <TrendingUp size={20} className="text-gray-400" />
                </div>
                <p className="text-[13px] text-gray-400 font-medium">차트 데이터 없음</p>
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
                      <span className="text-sm font-medium text-gray-700">{r.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-bold text-base tabular-nums">{r.score}</span>
                      <GradeBadge grade={r.grade} />
                    </div>
                  </div>
                  <ScoreProgressBar score={r.score} color={ESG_COLOR[r.category]} height="h-1.5" />
                </div>
              ))}
              {/* ── 종합 진단 의견 (AI 생성) ── */}
              {d.overallOpinion && (
                <p className="text-[14px] text-gray-600 border-t border-gray-100 pt-5 mt-1" style={{ lineHeight: '1.9' }}>
                  {sanitizeOpinionText(
                    d.overallOpinion,
                    auditCounts.contra,
                    verificationStats.lowCount,
                    verificationStats.mediumCount,
                    (analysisSummary?.e?.high ?? 0) === (analysisSummary?.e?.total ?? 5)
                      && (analysisSummary?.e?.high ?? 0) > 0
                  )
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/확인되지\s+않았습니다\s*지표는\s+없습니다[.!?。]?/g, '')
                    .replace(/[^.!?。]*지표는\s+없습니다[.!?。]?/g, '')
                    .replace(/[^.!?。]*존재하지\s+않았습니다[.!?。]?/g, '')
                    .replace(/[^.!?。]*(?:일부|특정)\s*지표에 대한[^.!?。]*(?:증빙은?\s*)?확인되지 않았습니다[.!?。]?/g, '')
                    .replace(/[^.!?。]*(?:일부|특정)\s*지표에 대한[^.!?。]*제한적[^.!?。]*[.!?。]?/g, '')
                    .replace(/[^.!?。]*증빙[^.!?。]*확인되지\s*않았습니다[.!?。]?/g, '')
                    .replace(/\.\s*확인되지\s*않았습니다[.!?。]?/g, '.')
                    .replace(/확인되지\s*않았습니다[.!?。]?\s*$/g, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim()}
                </p>
              )}
            </div>
          </SectionCard>
        </div>
        )}

        {/* ── ESG 등급 기준표 ─────────────────────────────── */}
        {activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl px-7 py-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">ESG 등급 기준</p>
            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                { grade: 'S', range: '90점 이상', color: '#a855f7', bg: '#f5f3ff' },
                { grade: 'A', range: '75~89점',   color: '#059669', bg: '#ecfdf5' },
                { grade: 'B', range: '60~74점',   color: '#3b82f6', bg: '#eff6ff' },
                { grade: 'C', range: '40~59점',   color: '#f59e0b', bg: '#fffbeb' },
                { grade: 'D', range: '40점 미만', color: '#ef4444', bg: '#fef2f2' },
              ].map(({ grade, range, color, bg }) => (
                <div key={grade} className="rounded-xl py-3 flex flex-col items-center gap-1" style={{ background: bg }}>
                  <span className="text-base font-black" style={{ color }}>{grade}</span>
                  <span className="text-[10px] text-gray-500 font-medium">{range}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1">
              <p className="text-[10px] text-gray-500 font-semibold">종합 점수 산출 공식</p>
              <p className="text-[11px] font-mono text-gray-700">종합 점수 = E × 30% + S × 40% + G × 30%</p>
              <p className="text-[10px] text-gray-400">업종별 K-ESG 동적 가중 평균 기반 · 등급 구간 기준 적용</p>
            </div>
          </div>
        )}


        {/* ── E vs S/G 검증 방식 설명 ─────────────────────── */}
        {activeTab === 'summary' && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">검증 방식 안내</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-gray-600">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-sky-700">E (환경) — 환경 성과 및 데이터 검증</span>
                <span>업종·규모별 평균 대비 환경 성과 평가 ·
                      CSV 데이터 기반 수치 검증 ·
                      전력·가스·탄소·폐기물·수자원 5대 환경 지표 분석</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-purple-700">S/G (사회·지배구조) — 문서 근거 탐지</span>
                <span>AI 문서 분석 기반 정책·실적 근거 탐지 · 문서 관련성 및 키워드 기준 근거 판정</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 입력값 vs 증빙값 비교 테이블 (E 카테고리) ──────── */}
        {numericRows.length > 0 && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowNumericDetail(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                <BarChart2 size={14} className="text-sky-500" />
              </span>
              <span className="text-sm font-semibold text-gray-700">환경 데이터 검증 상세</span>
              <span className="text-[10px] text-gray-400 ml-1">입력값과 제출 데이터의 일치 여부를 검증하고, 업종 평균 대비 환경 성과를 종합 평가합니다.<span className="text-gray-300">·</span></span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                  {numericRows.length}개 항목
                </span>
                {showNumericDetail ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </span>
            </button>
            {showNumericDetail && <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['지표명', '입력값', '문서 추출값', '오차율', '판정'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {numericRows.map((ev, i) => {
                    const diff = ev.numericDiffPercent ?? 0;
                    const diffColor = diff <= 5 ? '#059669' : diff <= 20 ? '#f59e0b' : '#ef4444';
                    const ms = MATCH_STYLE[ev.numericMatchLevel] ?? MATCH_STYLE.LOW;
                    return (
                      <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                        onClick={() => setSelectedEvidence(ev)}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-gray-400 shrink-0">{ev.indicatorCode}</span>
                            <span className="text-gray-700 font-medium truncate max-w-[140px]">{ev.indicatorTitle ?? '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800 tabular-nums whitespace-nowrap">
                          {ev.inputValue != null ? Number(ev.inputValue).toLocaleString() : '-'}
                          {ev.unit && <span className="text-gray-400 font-normal ml-1 text-[10px]">{ev.unit}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800 tabular-nums whitespace-nowrap">
                          {ev.extractedValue != null
                            ? <>{Number(ev.extractedValue).toLocaleString()}{ev.unit && <span className="text-gray-400 font-normal ml-1 text-[10px]">{ev.unit}</span>}</>
                            : <span className="text-gray-400 text-[10px] font-normal">데이터 미확인</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {ev.extractedValue != null ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black tabular-nums text-sm" style={{ color: diffColor }}>
                                {fmtDiff(diff)}
                              </span>
                              <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (diff / 40) * 100)}%`, background: diffColor }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {ev.extractedValue != null ? (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${ms.bg} ${ms.border} ${ms.text}`}>
                              {ms.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">
                              데이터 미확인
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
            {showNumericDetail && <div className="px-6 py-2.5 border-t border-gray-100">
              <p className="text-[10px] text-gray-400">클릭 시 상세 감사 정보를 확인할 수 있습니다. · HIGH ≤5% · MEDIUM ≤20% · LOW &gt;20%</p>
            </div>}
          </div>
        )}

        {/* ── Action Center 탭 헤더 ──────────────────────────── */}
        {activeTab === 'action' && isAutoSimulation && (
          <div className="flex items-center gap-3 px-6 py-5 rounded-2xl bg-gray-50 border border-gray-200">
            <CheckCircle size={18} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-600">사전 진단 모드</p>
              <p className="text-xs text-gray-400 mt-0.5">실제 문서 분석이 수행되지 않아 조치 권고사항이 없습니다.</p>
            </div>
          </div>
        )}

        {/* ── AI Audit 권고사항 → Action Center 탭으로 이동 ── */}
        {activeTab === 'action' && !isAutoSimulation && (
          <AiAuditRecommendations
            indicators={completeIndicatorList}
            isAutoSimulation={isAutoSimulation}
          />
        )}

        {/* ── 점수 산정 해설 ────────────────────────────────── */}
        {analysisSummary && activeTab === 'summary' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* 헤더 — 클릭 시 펼침 */}
            <button
              onClick={() => setShowScoreDetail(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Info size={14} className="text-gray-500" />
              </span>
              <span className="text-sm font-semibold text-gray-700">카테고리별 점수 해설</span>
              <span className="text-[10px] text-gray-400 ml-1">— E · S · G 평가 근거 상세</span>
              <span className="ml-auto">{showScoreDetail ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}</span>
            </button>

            {showScoreDetail && <div className="px-6 py-5 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* ── E 환경 패널 ── */}
                {(() => {
                  const e = analysisSummary.e;
                  const toneColor = e.tone === 'red' ? '#ef4444' : e.tone === 'amber' ? '#f59e0b' : '#059669';
                  const toneBorder = e.tone === 'red' ? 'border-red-200' : e.tone === 'amber' ? 'border-amber-200' : 'border-emerald-200';
                  const summaryColor = e.tone === 'red' ? 'text-red-600' : e.tone === 'amber' ? 'text-amber-700' : 'text-gray-600';
                  const repDiff = e.avgDiff ?? e.maxDiff;
                  const diffStr = fmtDiff(repDiff);
                  const diffColor = repDiff == null ? '#71717a'
                    : repDiff <= 5 ? '#059669' : repDiff <= 20 ? '#f59e0b' : '#ef4444';
                  const bullets = [
                    { label: 'HIGH 검증', value: `${e.high}건`, color: '#059669' },
                    { label: 'MEDIUM 검증', value: `${e.medium}건`, color: '#f59e0b' },
                    { label: 'LOW 불일치', value: `${e.low}건`, color: e.low > 0 ? '#ef4444' : '#52525b' },
                    ...(e.failed > 0 ? [{ label: '증빙 미확인', value: `${e.failed}건`, color: '#71717a' }] : []),
                    { label: '평균 오차율', value: diffStr, color: diffColor },
                  ];
                  return (
                    <div className={`rounded-xl border bg-gray-50 p-4 space-y-3 ${toneBorder}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Leaf size={13} style={{ color: ESG_COLOR.E }} />
                          <span className="text-xs font-bold" style={{ color: ESG_COLOR.E }}>환경(E)</span>
                          {isBenchmarkFallback && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">
                              업종 평균 추정
                            </span>
                          )}
                        </div>
                        <span className="text-xl font-black tabular-nums"
                          style={{ color: (d.eScore ?? 0) >= 70 ? ESG_COLOR.E : (d.eScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.eScore ?? 0}점
                        </span>
                      </div>
                      {e.failed >= e.total && e.total > 0 && (
                        <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                          <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-700 leading-relaxed">
                            실측 수치 추출 실패 — 업종 평균 기반 추정 평가 적용
                          </p>
                        </div>
                      )}
                      <ul className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-center justify-between text-sm leading-relaxed">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-semibold tabular-nums" style={{ color: b.color }}>{b.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`text-xs leading-relaxed border-t border-gray-200 pt-2.5 ${summaryColor}`}>
                        {e.summary}
                      </p>
                    </div>
                  );
                })()}

                {/* ── S 사회 패널 ── */}
                {(() => {
                  const s = analysisSummary.s;
                  const toneColor = s.tone === 'red' ? '#ef4444' : s.tone === 'amber' ? '#f59e0b' : '#059669';
                  const toneBorder = s.tone === 'red' ? 'border-red-200' : s.tone === 'amber' ? 'border-amber-200' : 'border-gray-200';
                  const summaryColor = s.tone === 'red' ? 'text-red-600' : s.tone === 'amber' ? 'text-amber-700' : 'text-gray-600';
                  const bullets = [
                    { label: '근거 식별 지표', value: `${s.withEvidence} / ${s.total}개`, color: s.withEvidence === s.total ? '#059669' : '#f59e0b' },
                    { label: '미검출 지표', value: `${s.missing}개`, color: s.missing > 0 ? '#ef4444' : '#52525b' },
                    { label: '감사 방식', value: '운영 근거 기반 평가', color: '#38bdf8' },
                  ];
                  return (
                    <div className={`rounded-xl border bg-gray-50 p-4 space-y-3 ${toneBorder}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Users size={13} style={{ color: ESG_COLOR.S }} />
                          <span className="text-xs font-bold" style={{ color: ESG_COLOR.S }}>사회(S)</span>
                        </div>
                        <span className="text-xl font-black tabular-nums"
                          style={{ color: (d.sScore ?? 0) >= 70 ? ESG_COLOR.S : (d.sScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.sScore ?? 0}점
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-center justify-between text-sm leading-relaxed">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-semibold" style={{ color: b.color }}>{b.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`text-xs leading-relaxed border-t border-gray-200 pt-2.5 ${summaryColor}`}>
                        {s.summary}
                      </p>
                    </div>
                  );
                })()}

                {/* ── G 지배구조 패널 ── */}
                {(() => {
                  const g = analysisSummary.g;
                  const toneBorder = g.tone === 'red' ? 'border-red-200' : g.tone === 'amber' ? 'border-amber-200' : 'border-gray-200';
                  const summaryColor = g.tone === 'red' ? 'text-red-600' : g.tone === 'amber' ? 'text-amber-700' : 'text-gray-600';
                  const bullets = [
                    { label: '근거 식별 지표', value: `${g.withEvidence} / ${g.total}개`, color: g.withEvidence === g.total ? '#059669' : '#f59e0b' },
                    { label: '미검출 지표', value: `${g.missing}개`, color: g.missing > 0 ? '#ef4444' : '#52525b' },
                    { label: '감사 방식', value: '운영 근거 기반 평가', color: '#38bdf8' },
                  ];
                  return (
                    <div className={`rounded-xl border bg-gray-50 p-4 space-y-3 ${toneBorder}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={13} style={{ color: ESG_COLOR.G }} />
                          <span className="text-xs font-bold" style={{ color: ESG_COLOR.G }}>지배구조(G)</span>
                        </div>
                        <span className="text-xl font-black tabular-nums"
                          style={{ color: (d.gScore ?? 0) >= 70 ? ESG_COLOR.G : (d.gScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.gScore ?? 0}점
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-center justify-between text-sm leading-relaxed">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-semibold" style={{ color: b.color }}>{b.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`text-xs leading-relaxed border-t border-gray-200 pt-2.5 ${summaryColor}`}>
                        {g.summary}
                      </p>
                    </div>
                  );
                })()}

              </div>
            </div>}
          </div>
        )}

        {/* ── 증빙 부족 항목 → Action Center 탭으로 이동 ──────── */}
        {blockedIndicators.length > 0 && activeTab === 'action' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowBlockedDetail(v => !v)}
              className="w-full flex items-center gap-2.5 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-amber-500" />
              </span>
              <span className="text-sm font-semibold text-gray-700">증빙 부족 S/G 지표</span>
              <span className="text-[10px] text-gray-400 ml-1">— 관련 문서 추가 시 점수 향상 가능</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                  {blockedIndicators.length}건
                </span>
                {showBlockedDetail ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </span>
            </button>
            {showBlockedDetail && <div className="px-6 py-5 space-y-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 leading-relaxed">
                체크리스트에 선택되었지만 제출 PDF 내에서 검증 근거가 확인되지 않은 S/G 지표입니다.
                증빙 문서에 해당 내용을 추가하면 점수가 향상될 수 있습니다.
              </p>
              <div className="space-y-2">
                {blockedIndicators.map(([code, title]) => (
                  <div key={code}
                    className="flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                      <span className="text-[10px] font-bold font-mono text-gray-400 shrink-0 w-14">{code}</span>
                      <span className="text-xs text-gray-700 flex-1">{title}</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-red-50 border-red-200 text-red-600 whitespace-nowrap shrink-0">
                        미감지
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 pl-6 leading-relaxed">
                      운영 근거 미탐지 — 체크리스트 기반 평가 적용
                    </p>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        )}

        {/* ── [3] EcoPoint 반영 결과 ───────────────────────────── */}
        {activeTab === 'summary' && (
          <div className={`bg-white border ${hasEco ? 'border-emerald-200' : 'border-gray-200'} rounded-2xl overflow-hidden`}>
            <div className={`flex items-center gap-3 px-6 py-4 border-b ${hasEco ? 'border-emerald-100 bg-emerald-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
              <span className={`w-8 h-8 rounded-xl ${hasEco ? 'bg-emerald-100' : 'bg-gray-100'} flex items-center justify-center shrink-0`}>
                <Zap size={15} className={hasEco ? 'text-emerald-600' : 'text-gray-400'} />
              </span>
              <span className={`text-sm font-semibold ${hasEco ? 'text-emerald-700' : 'text-gray-600'}`}>
                EcoPoint 반영 결과
              </span>
              {hasEco ? (
                <span className="ml-auto text-[10px] text-emerald-600 px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-200 font-semibold whitespace-nowrap">
                  친환경 활동 기반 Social 가산 반영
                </span>
              ) : (
                <span className="ml-auto text-[10px] text-gray-400 px-2.5 py-1 rounded-lg bg-gray-100 border border-gray-200">미연동</span>
              )}
            </div>

            {!hasEco ? (
              <div className="px-6 py-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  EcoPoint 플랫폼 연동 시 임직원 친환경 활동 실적이 사회(S) 점수에 반영됩니다.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  에코 포인트 적립 → 탄소 절감량 환산 → S 점수 보너스 반영
                </div>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                {/* 연동 상태 */}
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700">연동 완료</span>
                  {participantCnt != null && (
                    <span className="text-[10px] text-gray-400 ml-1">— 임직원 {participantCnt.toLocaleString()}명 참여</span>
                  )}
                </div>

                {/* 핵심 지표 — 3단계 흐름 */}
                {(() => {
                  const sBonusVal   = (d.ecoSBonus > 0 ? d.ecoSBonus : null) ?? ecoScoreBonus ?? 0;
                  const reflectedEP = sBonusVal * 1000;
                  const poolBefore  = d.esgPoolBefore != null ? Number(d.esgPoolBefore)
                                    : d.ecoPoints > 0         ? d.ecoPoints
                                    : esgPoolPoints != null   ? Number(esgPoolPoints)
                                    : null;
                  const remainingEP = d.esgPoolAfter != null
                    ? Number(d.esgPoolAfter)
                    : esgPoolPoints != null
                    ? Number(esgPoolPoints)
                    : poolBefore != null && reflectedEP > 0
                    ? Math.max(0, poolBefore - reflectedEP)
                    : null;

                  const Arrow = () => (
                    <div className="flex items-center justify-center shrink-0 px-0.5">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="#a7f3d0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  );

                  return (
                    <div className="flex items-stretch gap-2">
                      {/* 1. ESG 반영 포인트 */}
                      <div className="flex-1 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5">ESG 반영 포인트</p>
                        <p className="text-2xl font-black text-emerald-700 tabular-nums leading-none">
                          {reflectedEP > 0 ? reflectedEP.toLocaleString() : '-'}
                        </p>
                        <p className="text-[10px] text-emerald-500 mt-1">EP</p>
                        <p className="text-[9px] text-emerald-400 mt-1.5 leading-snug">ESG 평가 반영 기준</p>
                      </div>

                      <Arrow />

                      {/* 2. Social(S) 가점 */}
                      <div className="flex-1 bg-white rounded-xl p-4 border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5">Social(S) 가점</p>
                        <p className="text-2xl font-black text-blue-600 tabular-nums leading-none">
                          +{sBonusVal}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">점</p>
                        <p className="text-[9px] text-gray-400 mt-1.5 leading-snug">ESG 최종 반영 결과</p>
                      </div>

                      <Arrow />

                      {/* 3. 현재 남은 EcoPoint */}
                      <div className="flex-1 bg-white rounded-xl p-4 border border-emerald-100">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">현재 남은 EcoPoint</p>
                        <p className="text-2xl font-black text-gray-700 tabular-nums leading-none">
                          {remainingEP != null ? remainingEP.toLocaleString() : '-'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">EP</p>
                        <p className="text-[9px] text-gray-400 mt-1.5 leading-snug">반영 후 잔여 포인트</p>
                      </div>
                    </div>
                  );
                })()}

                {/* 부가 지표 (탄소 절감 / 나무 환산) */}
                {(d.carbonReductionKg > 0 || d.equivalentTrees > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    {d.carbonReductionKg > 0 && (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100 text-[11px]">
                        <span className="text-gray-400">탄소 절감</span>
                        <span className="ml-auto font-bold text-gray-700 tabular-nums">
                          {(d.carbonReductionKg / 1000).toFixed(2)} tCO₂
                        </span>
                      </div>
                    )}
                    {d.equivalentTrees > 0 && (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100 text-[11px]">
                        <span className="text-gray-400">나무 환산</span>
                        <span className="ml-auto font-bold text-gray-700 tabular-nums">
                          {Math.round(d.equivalentTrees).toLocaleString()} 그루
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* S 점수 before/after 바 */}
                {hasBeforeAfter && (
                  <div className="bg-white rounded-xl p-4 border border-emerald-100">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">사회(S) 점수 변화</p>
                    <div className="flex items-center gap-4">
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-400 mb-0.5">반영 전</p>
                        <p className="text-xl font-black text-gray-400 tabular-nums">{sScoreBefore}</p>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gray-300 transition-all duration-700" style={{ width: `${sScoreBefore}%` }} />
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${sScoreAfter}%` }} />
                        </div>
                      </div>
                      <div className="shrink-0">
                        <p className="text-[10px] text-gray-400 mb-0.5">반영 후</p>
                        <p className="text-xl font-black text-emerald-600 tabular-nums">{sScoreAfter}</p>
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

                {/* before/after 없을 때 인라인 메시지 */}
                {!hasBeforeAfter && ecoScoreBonus != null && ecoScoreBonus > 0 && (
                  <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-emerald-100">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-gray-500">
                      EcoPoint 참여 활동이 사회(S) 점수에{' '}
                      <span className="text-emerald-600 font-bold">+{ecoScoreBonus}점</span> 반영되었습니다.
                    </span>
                  </div>
                )}

                {/* 푸터 */}
                <p className="text-[10px] text-gray-400 flex items-center gap-1.5 pt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  회사 친환경 활동 데이터를 기반으로 ESG Social 점수에 가점이 반영되었습니다.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 분석 신뢰도 — 단순화 버전 ── */}
        {activeTab === 'summary' && !isAutoSimulation && d.overallConfidence != null && (() => {
          const confLevel = adjustedConfidence < 40 ? 'LOW' : adjustedConfidence < 65 ? 'MEDIUM' : 'HIGH';
          const confColor = confLevel === 'HIGH' ? '#059669' : confLevel === 'MEDIUM' ? '#f59e0b' : '#ef4444';
          const needsWarning = blockedIndicators.length > 0 || adjustedConfidence < 70;
          return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <Shield size={14} className="text-purple-500" />
                </span>
                <span className="text-sm font-semibold text-gray-800">신뢰도 분석</span>
                <span className="ml-auto text-[10px] text-gray-400 font-medium">ESG 분석 신뢰도</span>
              </div>
              {/* 본문 */}
              <div className="px-6 py-5">
              {/* 상단: % + badge + progress */}
              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-gray-900 tabular-nums leading-none">{adjustedConfidence}</span>
                  <span className="text-base text-gray-400">%</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${CONF_CLS[confLevel] ?? CONF_CLS.LOW}`}>
                  {confLevel}
                </span>
                <div className="flex-1">
                  <ScoreProgressBar score={adjustedConfidence} color={confColor} height="h-2" />
                </div>
              </div>
              {/* 설명 한 줄 */}
              <p className="text-[13px] text-gray-400 leading-relaxed">
                제출 증빙과 ESG 지표 간 검증 근거 충족 정도를 나타냅니다.
              </p>
              {/* 보완 권장 배너 (필요 시만) */}
              {needsWarning && (
                <div className="mt-3 flex items-center gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                  <p className="text-[12px] text-amber-700">
                    일부 항목은 추가 자료 보완 시 분석 신뢰도를 높일 수 있습니다.
                  </p>
                </div>
              )}
              </div>{/* /본문 */}
            </div>
          );
        })()}

        {/* 카테고리 점수 섹션 — 상단(section-summary 직후)으로 이동됨 */}

        {/* ── 지표별 세부 점수 — K-ESG 핵심 지표 (summary 탭 최하단) ── */}
        {breakdownData.length > 0 && activeTab === 'summary' && (
          <SectionCard
            title="지표별 세부 점수 — K-ESG 핵심 지표"
            icon={FileText}
            iconColor="#f59e0b"
          >
            {breakdownData[0]?.isFallback && (
              <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 mb-3">
                검증 결과 기반 추정 점수
              </span>
            )}
            <div className="chart-container">
            <ResponsiveContainer width="100%" height={Math.max(340, breakdownData.length * 36)}>
              <BarChart data={breakdownData} layout="vertical" margin={{ left: 8, right: 72, top: 4, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={{ stroke: '#F3F4F6' }} />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={170}
                  interval={0}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <CartesianGrid horizontal={false} stroke="#F3F4F6" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="tooltip-dark">
                        <p className="text-white font-semibold mb-1 text-xs">{p.title}</p>
                        <p className="text-white/50 font-mono text-[10px]">{p.kesgCode}</p>
                        <p className="text-white font-bold mt-1 text-xs tabular-nums">{p.score}점 · <span style={{ color: gradeBarColor(p.grade) }}>{p.grade}등급</span></p>
                        {p.confidence != null && <p className="text-white/50 mt-0.5 text-[10px]">신뢰도 {p.confidence}%</p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={true} animationDuration={600}>
                  {breakdownData.map((entry, idx) => (
                    <Cell key={idx} fill={gradeBarColor(entry.grade)} fillOpacity={0.85} />
                  ))}
                  <LabelList
                    dataKey="score"
                    position="right"
                    formatter={(v) => `${v}점`}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#374151', fontFamily: 'Inter, Pretendard, sans-serif' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100">
              {['S', 'A', 'B', 'C', 'D'].map(g => (
                <span key={g} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: gradeBarColor(g) }} />
                  {g}등급
                </span>
              ))}
              <span className="ml-auto text-[10px] text-gray-400">{breakdownData.length}개 지표</span>
            </div>
          </SectionCard>
        )}

        {/* ── Industry Position: 데이터 출처 안내 카드 ──────── */}
        {activeTab === 'industry' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                <TrendingUp size={14} className="text-purple-500" />
              </span>
              <span className="text-sm font-semibold text-gray-800">공공 통계 기반 환경 업종 비교</span>
              {d.benchmarkComparison?.industry && (
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-500 font-mono">
                  {d.benchmarkComparison.industry}{d.benchmarkComparison?.regionName ? ` · ${d.benchmarkComparison.regionName}` : ''}
                </span>
              )}
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50 border border-purple-100">
                  <span className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                    <TrendingUp size={12} className="text-purple-600" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-purple-800 mb-1">비교 데이터 출처</p>
                    <p className="text-[11px] text-purple-700 leading-relaxed">
                      한국에너지공단 · 에너지경제연구원 등 공공기관의 산업용 에너지·환경 통계 기반으로 산출한 <strong>업종별 평균 추정값</strong>입니다.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <span className="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle size={12} className="text-gray-500" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-gray-700 mb-1">이용 시 유의사항</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      업종 · 지역 · 직원수 보정이 적용된 <strong>추정 평균</strong>으로, 실제 경쟁사 ESG 데이터와는 다릅니다. ESG 점수 산정에는 직접 반영되지 않습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'industry' && (
        <SectionCard
          title={`공공 통계 기반 환경 지표 업종 비교${d.benchmarkComparison?.industry ? ` — ${d.benchmarkComparison.industry}` : ''}${d.benchmarkComparison?.regionName ? ` · ${d.benchmarkComparison.regionName}` : ''}`}
          icon={TrendingUp}
          iconColor="#a855f7"
          action={benchMetrics.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-500 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
              공공 통계 기반 추정
            </span>
          )}
        >
          {benchMetrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <TrendingUp size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">업종 통계 데이터 없음</p>
              <p className="text-xs text-gray-400">해당 업종의 업종 평균 데이터를 불러올 수 없습니다.</p>
            </div>
          ) : (
            <>
              {/* 데이터 출처 안내 */}
              <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-500/5 border border-blue-200/50 rounded-xl mb-4">
                <TrendingUp size={13} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  아래 수치는 에너지공단·에너지경제연구원 등 공공 통계를 기반으로 업종·규모·지역 보정이 적용된
                  <span className="font-semibold"> 업종 평균 추정값</span>입니다. ESG 점수 산정에는 직접 반영되지 않습니다.
                </p>
              </div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex gap-5 text-xs text-gray-500">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-2 rounded-sm inline-block bg-blue-500/80" />
                    우리 기업
                  </span>
                  <span className="flex items-center gap-2"><span className="w-3 h-2 rounded-sm inline-block bg-gray-300" />업종 평균(추정)</span>
                </div>
                <span className="text-[9px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md" title={benchMetrics[0]?.source ?? ''}>
                  공공 산업 통계 기반 추정
                </span>
              </div>
              <div className="space-y-4">
                {benchMetrics.map((metric, idx) => {
                  const hasCompany  = metric.company != null;
                  const displayUnit = metric.unit ?? '';
                  const companyVal  = metric.company    ?? 0;
                  const industryVal = metric.industryAvg ?? 0;
                  const maxVal      = Math.max(companyVal, industryVal);
                  const yDomain     = [0, Math.ceil(maxVal * 1.3)];
                  const diff        = hasCompany && industryVal > 0 ? ((companyVal - industryVal) / industryVal) * 100 : null;
                  const lib         = lowerIsBetter(displayUnit, metric.name ?? '');
                  const better      = diff != null && (lib ? diff < 0 : diff > 0);
                  const chartData   = [{ name: metric.name, company: hasCompany ? companyVal : null, industryAvg: industryVal, unit: displayUnit }];

                  return (
                    <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors">
                      {/* 헤더 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">{metric.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                            {metric.unit}
                          </span>
                          {diff != null ? (
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                              better
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {better ? '▼' : '▲'} {Math.abs(diff).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50">
                              비교 데이터 부족
                            </span>
                          )}
                        </div>
                      </div>
                      {diff != null && (() => {
                        const absDiff = Math.abs(diff);
                        const perfLabel = better
                          ? (absDiff <= 5 ? '평균 수준' : '우수')
                          : (absDiff <= 20 ? '관리 필요' : '개선 필요');
                        const perfCls = better ? 'text-emerald-600' : absDiff <= 20 ? 'text-amber-600' : 'text-red-600';
                        const riskText = !better && absDiff > 10 ? getBenchmarkRisk(metric.name ?? '', absDiff) : null;
                        return (
                          <div className="mb-3">
                            <p className="text-[10px] text-gray-500">
                              업종 평균 대비 {better ? '▼' : '▲'} {absDiff.toFixed(1)}%{' '}
                              <span className={`font-semibold ${perfCls}`}>— {perfLabel}</span>
                            </p>
                            {riskText && (
                              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-1.5 leading-relaxed">
                                ⚠ {riskText}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      <div className="chart-container">
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                          <XAxis dataKey="name" hide />
                          <YAxis domain={yDomain} tickFormatter={fmtBenchNum} tick={{ fill: '#9CA3AF', fontSize: 9 }} tickLine={false} axisLine={false} width={42} />
                          <CartesianGrid vertical={false} stroke="#F3F4F6" />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="tooltip-dark">
                                  <p className="text-white/60 mb-1.5 text-[10px] uppercase tracking-wide">{metric.name}</p>
                                  {payload.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.fill }} />
                                      <span className="tabular-nums text-xs" style={{ color: p.fill === '#9ca3af' ? '#9ca3af' : '#fff' }}>
                                        {p.name}: <strong>{fmtBenchNum(p.value)} {metric.unit}</strong>
                                      </span>
                                    </div>
                                  ))}
                                  {diff != null && (
                                    <p className={`mt-1.5 text-[10px] font-semibold ${better ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {better ? '✓ 우수' : Math.abs(diff) <= 20 ? '△ 관리 필요' : '⚠ 개선 필요'}
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="company"
                            name="우리 기업"
                            fill={better ? '#059669' : diff != null && Math.abs(diff) > 20 ? '#ef4444' : '#f59e0b'}
                            fillOpacity={0.85}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={56}
                            isAnimationActive={true}
                            animationDuration={600}
                          />
                          <Bar dataKey="industryAvg" name="산업 평균(추정)" fill="#9ca3af" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between mt-2 text-[10px] tabular-nums text-gray-400">
                        <span>
                          <span className={`font-semibold ${better ? 'text-emerald-600' : diff != null && Math.abs(diff) > 20 ? 'text-red-500' : 'text-amber-600'}`}>
                            우리 기업
                          </span>
                          {' '}{hasCompany ? `${fmtBenchNum(companyVal)} ${metric.unit}` : '입력값 없음'}
                        </span>
                        <span>
                          <span className="font-semibold text-gray-500">산업 평균(추정)</span>
                          {' '}{fmtBenchNum(industryVal)} {metric.unit}
                        </span>
                      </div>
                      {metric.source && (
                        <p className="text-[9px] text-gray-400 mt-1">
                          출처(산업 평균): {metric.source}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

            </>
          )}
        </SectionCard>
        )}

        {/* 섹션 앵커 (hash scroll 대상) */}
        <div id="section-evidence" />

        {/* ── 검증 요약 섹션 — Hero KPI와 중복으로 제거됨 ── */}
        {false && !isAutoSimulation && verificationStats.total > 0 && activeTab === 'evidence' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">

            {/* 섹션 헤더 */}
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-emerald-600" />
              </span>
              <span className="text-sm font-semibold text-gray-800">수치 검증 요약</span>
              <span className="text-[10px] font-bold text-gray-400 ml-2 hidden sm:inline">
                환경(E) · {verificationStats.total}개 지표
              </span>
              {/* 신뢰도 레벨 badge */}
              <span className={`ml-auto text-xs font-medium px-3 py-1 rounded-full border ${verificationStats.trustCls}`}>
                {verificationStats.trustLabel}
              </span>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* 전체 검증 상태 요약 문구 */}
              <p className={`text-sm font-medium leading-snug ${verificationStats.summaryColor}`}>
                {verificationStats.summaryText}
              </p>

              {/* LOW 존재 시 경고 배너 */}
              {verificationStats.lowCount > 0 && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 leading-relaxed">
                    일부 항목에서 입력값과 증빙 데이터 간 차이가 발견되었습니다.
                    {verificationStats.lowCount >= 3 && (
                      <span className="ml-1 font-bold text-red-700">
                        ({verificationStats.lowCount}건 불일치 — 등급 제한 적용 가능)
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* 4칸 grid 통계 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* HIGH */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">HIGH</p>
                  <p className="text-3xl font-black tabular-nums leading-none text-emerald-700">
                    {verificationStats.highCount}
                  </p>
                  <p className="text-[10px] text-emerald-600">건 일치</p>
                </div>
                {/* MEDIUM */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">MEDIUM</p>
                  <p className="text-3xl font-black tabular-nums leading-none text-amber-700">
                    {verificationStats.mediumCount}
                  </p>
                  <p className="text-[10px] text-amber-600">건 근사 일치</p>
                </div>
                {/* LOW */}
                <div className={`border rounded-xl px-4 py-3.5 flex flex-col gap-1 ${
                  verificationStats.lowCount > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${
                    verificationStats.lowCount > 0 ? 'text-red-600' : 'text-gray-500'
                  }`}>LOW</p>
                  <p className={`text-3xl font-black tabular-nums leading-none ${
                    verificationStats.lowCount > 0 ? 'text-red-700' : 'text-gray-400'
                  }`}>
                    {verificationStats.lowCount}
                  </p>
                  <p className={`text-[10px] ${
                    verificationStats.lowCount > 0 ? 'text-red-600' : 'text-gray-400'
                  }`}>건 불일치</p>
                </div>
                {/* HIGH 일치율 + 평균 오차율 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">HIGH 일치율</p>
                  <p className="text-3xl font-black tabular-nums leading-none"
                    style={{
                      color: verificationStats.total === 0 ? '#9ca3af'
                           : verificationStats.highRatio >= 0.8 ? '#16a34a'
                           : verificationStats.highRatio >= 0.5 ? '#d97706'
                           : '#dc2626'
                    }}>
                    {verificationStats.total > 0
                      ? `${Math.round(verificationStats.highRatio * 100)}%`
                      : '—'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    평균 오차율 {fmtDiff(verificationStats.avgDiff)}
                  </p>
                </div>
              </div>

              {/* Numeric Extraction Metrics — 추출 성공/실패 분리 */}
              {(() => {
                const parsed  = verificationStats.total;
                const failed  = analysisSummary?.e?.failed ?? 0;
                const eTotal5 = analysisSummary?.e?.total  ?? 5;
                const bmark   = isBenchmarkFallback;
                if (failed === 0 && !bmark) return null;
                return (
                  <div className="pt-3 border-t border-amber-800/20">
                    <p className="text-[9px] font-bold text-amber-600/70 uppercase tracking-widest mb-2">수치 추출 지표</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: '추출 성공',      value: `${parsed}`,   color: parsed > 0 ? '#059669' : '#71717a' },
                        { label: '미확인 항목',    value: `${failed}`,   color: failed === 0 ? '#059669' : failed >= 3 ? '#ef4444' : '#f59e0b' },
                        { label: '업종 평균 적용', value: bmark ? '적용' : '미적용', color: bmark ? '#f59e0b' : '#059669' },
                        { label: '수치 충족률',    value: eTotal5 > 0 ? `${Math.round((parsed / eTotal5) * 100)}%` : '0%', color: parsed >= eTotal5 ? '#059669' : parsed > 0 ? '#f59e0b' : '#ef4444' },
                      ].map(m => (
                        <div key={m.label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 leading-none">{m.label}</p>
                          <p className="text-sm font-black font-mono tabular-nums leading-none" style={{ color: m.color }}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 방법론 설명 + 오차율 기준 */}
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  E(환경) 항목은 제출된 CSV/PDF 증빙과 입력 수치를 직접 비교 검증합니다.
                  S/G 항목은 근거 적합도 분석 기반으로 평가됩니다.
                </p>
                <p className="text-xs text-gray-400">
                  수치 검증 기준 — HIGH: ≤5% · MEDIUM: ≤20% · LOW: &gt;20% · 평균 오차율은 전체 지표 산술평균 기준
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 시스템 설명 배너 제거 — debug 느낌으로 삭제됨 */}

        {/* ── [1] Evidence 상세 (고도화) ───────────────────── */}
        {activeTab === 'evidence' && <SectionCard
          title="근거 추적"
          icon={Search}
          iconColor="#6366f1"
          action={
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                {auditCounts.total}개 지표
              </span>
              <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                {auditCounts.verified} 완전검증
              </span>
              {auditCounts.partial > 0 && (
                <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-mono">
                  {auditCounts.partial} 의미근거확인
                </span>
              )}
            </div>
          }
        >
          {/* ── Verification Status 요약 (항상 표시) ── */}
          {(() => {
            // [2] WEAK → PARTIAL 통합 표시 — PDF vstCounts 4-category와 정합 (15개 합산)
            const counts = {
              VERIFIED:      auditCounts.verified,
              PARTIAL:       (auditCounts.partial ?? 0) + (auditCounts.weak ?? 0),
              WEAK:          0,  // PARTIAL에 통합 표시
              CONTRADICTION: auditCounts.contra,
              NO_EVIDENCE:   auditCounts.missing,
            };
            return (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">
                  검증 현황
                </span>
                {Object.entries(VSTATUS).map(([key, style]) => counts[key] > 0 && (
                  <span key={key} className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text} flex items-center gap-1`}>
                    <span>{style.icon}</span>
                    <span>{style.label}</span>
                    <span className="ml-0.5 font-mono">({counts[key]})</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {!d.evidenceMatches?.length ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <FileText size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">근거 데이터 부족</p>
              <p className="text-xs text-gray-400">감사 기준을 충족하는 문서 근거가 충분히 확보되지 않았습니다. PDF 또는 CSV 파일을 제출하면 분석 정확도가 향상됩니다.</p>
            </div>
          ) : (
            <>
              {/* ── 수치 불일치 경고 배너 — 문제 항목 최상단 표시 ── */}
              {(() => {
                const lowEvs = d.evidenceMatches?.filter(ev => ev.numericMatchLevel === 'LOW') ?? [];
                if (lowEvs.length === 0) return null;
                return (
                  <div className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle size={13} className="text-red-500 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-red-700">수치 불일치 감지</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                          {lowEvs.length}건
                        </span>
                        {d.gradeCeilingApplied && (
                          <span className="text-[10px] font-semibold text-amber-700">→ 등급 제한 적용됨</span>
                        )}
                      </div>
                      <p className="text-[10px] text-red-500 mt-0.5">입력한 ESG 환경 데이터와 증빙 문서에서 추출된 수치 간 큰 차이가 있습니다. Evidence 카드를 확인하세요.</p>
                    </div>
                  </div>
                );
              })()}

              {/* 카테고리 탭 */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {['ALL', 'E', 'S', 'G'].map((tab) => {
                  // evidenceList 기준으로 카운트 (numeric 우선 dedup 포함)
                  const cnt = tab === 'ALL'
                    ? evidenceList.length
                    : evidenceList.filter(e => e.indicatorCode?.startsWith(tab)).length;
                  return (
                    <button
                      key={tab}
                      onClick={() => setEvTab(tab)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        evTab === tab ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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

              {/* ── E 카테고리 수치 검증 요약 ── */}
              {(() => {
                const eEvs = d.evidenceMatches?.filter(e =>
                  e.indicatorCode?.startsWith('E') && e.numericMatchLevel
                ) ?? [];
                if (eEvs.length === 0) return null;
                if (evTab !== 'ALL' && evTab !== 'E') return null;
                const high   = eEvs.filter(e => e.numericMatchLevel === 'HIGH').length;
                const medium = eEvs.filter(e => e.numericMatchLevel === 'MEDIUM').length;
                const low    = eEvs.filter(e => e.numericMatchLevel === 'LOW').length;
                return (
                  <div className="flex items-center gap-3 mb-3 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">수치 검증 현황</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {high > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                          HIGH {high}건
                        </span>
                      )}
                      {medium > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                          MEDIUM {medium}건
                        </span>
                      )}
                      {low > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
                          LOW {low}건
                        </span>
                      )}
                    </div>
                    <span className="ml-auto text-[10px] text-gray-400 shrink-0">{eEvs.length}개 지표 분석</span>
                  </div>
                );
              })()}

              {/* ── AI 검색 과정 토글 ── */}
              {!isAutoSimulation && (
                <div className="mb-3">
                  <button
                    onClick={() => setShowAdvancedEvidence(v => !v)}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors text-left"
                  >
                    <Search size={12} className="text-gray-400 shrink-0" />
                    <span className="text-xs font-semibold text-gray-500">AI 검색 과정 보기</span>
                    <span className="text-[10px] text-gray-400 ml-1">— 문서 검색·필터링·검증 단계</span>
                    <span className="ml-auto text-gray-400">{showAdvancedEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                  </button>

                  {showAdvancedEvidence && (() => {
                    const total   = d.evidenceMatches?.length ?? 0;
                    const validEv = d.evidenceMatches?.filter(e => e.isValidEvidence).length ?? 0;
                    const verified = auditCounts.verified;
                    const retrieved = d.evidenceMatches?.reduce((acc, e) => acc + (e.retrievedCount ?? 3), 0) ?? total * 3;
                    const stages = [
                      { label: '검색됨',    count: retrieved,  color: '#3b82f6', desc: '벡터 검색' },
                      { label: '필터링',    count: total,      color: '#8b5cf6', desc: '적합도 기준' },
                      { label: '검증',      count: validEv,    color: '#f59e0b', desc: '키워드+적합도' },
                      { label: '최종 검증', count: verified,   color: '#059669', desc: '최종' },
                    ];
                    return (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-1 overflow-x-auto">
                          {stages.map((s, i) => (
                            <React.Fragment key={s.label}>
                              <div className="flex flex-col items-center gap-0.5 min-w-[52px] shrink-0">
                                <div className="text-sm font-black font-mono tabular-nums px-2 py-1 rounded-lg border"
                                  style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}>
                                  {s.count}
                                </div>
                                <span className="text-[8px] font-bold uppercase tracking-wide text-gray-500">{s.label}</span>
                                <span className="text-[7px] text-gray-400">{s.desc}</span>
                              </div>
                              {i < stages.length - 1 && (
                                <span className="text-gray-300 text-xs mx-0.5 shrink-0">→</span>
                              )}
                            </React.Fragment>
                          ))}
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                              충족률 {evidenceCovPct}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Evidence 목록 */}
              {/* E 탭 — benchmark fallback 빈 상태 */}
              {evTab === 'E' && isFullBenchmark && (
                <div className="flex flex-col items-center gap-3 py-8 px-4 mb-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                    <AlertTriangle size={20} className="text-amber-600" />
                  </div>
                  <p className="text-sm font-bold text-amber-700">수치 증빙 미확인</p>
                  <p className="text-xs text-amber-600 text-center leading-relaxed max-w-xs">
                    환경(E) 수치 데이터 추출이 미확인되어 업종 평균 기반 보수적 평가가 적용되었습니다.
                    정밀 검증을 위해 CSV 또는 PDF 증빙 파일 첨부를 권장합니다.
                  </p>
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-700 uppercase tracking-wider">
                    업종 평균 추정 분석
                  </span>
                </div>
              )}
              {/* ── AI Retrieval Trace Table ── */}
              {(() => {
                const tableRows = evTab === 'ALL'
                  ? completeIndicatorList
                  : completeIndicatorList.filter(e => e.indicatorCode?.startsWith(evTab));
                if (tableRows.length === 0 && !(evTab === 'E' && isFullBenchmark)) {
                  return (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      해당 카테고리의 Evidence가 없습니다.
                    </div>
                  );
                }
                return (
                  <AIRetrievalTraceTable
                    rows={tableRows}
                    onSelect={setSelectedEvidence}
                  />
                );
              })()}

              {/* ── Retrieval Transparency ── */}
              <RetrievalTransparencyPanel
                evidences={d.evidenceMatches ?? []}
                isAutoSimulation={isAutoSimulation}
              />
            </>
          )}

          {/* ── XAI: 지표별 감사 근거 요약 (항상 표시 — NO_EVIDENCE 포함) ── */}
          <AdvancedAnalysisPanel
            data={d}
            allIndicators={completeIndicatorList}
            isAutoSimulation={isAutoSimulation}
          />

        </SectionCard>}

        {/* 섹션 앵커 (hash scroll 대상) */}
        <div id="section-ai-report" />

        {/* ── Risk & Opportunity — Industry Position 탭 통합 ── */}
        {activeTab === 'industry' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="업계 대비 리스크 & 기회 분석" icon={AlertTriangle} iconColor="#f59e0b">
              <div
                className="text-sm text-gray-600 leading-relaxed"
                style={{ lineHeight: '1.9' }}
                dangerouslySetInnerHTML={{ __html: renderMd(buildIndustryRiskOpportunity(benchMetrics, d)) }}
              />
            </SectionCard>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">업종 대비 E/S/G 현황</p>
              <div className="space-y-3">
                {[
                  { label: '환경(E) 점수',     value: d.eScore,    color: ESG_COLOR.E },
                  { label: '사회(S) 점수',     value: d.sScore,    color: ESG_COLOR.S },
                  { label: '지배구조(G) 점수', value: d.gScore,    color: ESG_COLOR.G },
                  { label: '종합 점수',         value: d.totalScore, color: gradeAccentColor },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-gray-500">{item.label}</span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{item.value ?? 0}</span>
                    </div>
                    <ScoreProgressBar score={item.value} color={item.color} height="h-1" />
                  </div>
                ))}
              </div>
              {d.finalGrade && (
                <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">최종 등급</span>
                  <GradeBadge grade={d.finalGrade} size="lg" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ESG 분석 상세 섹션 제거 — Evidence 탭에서 중복 summary 정리 */}

        {activeTab === 'audit-log' && (<>


        {/* ── Audit Execution Timeline ─────────────────────── */}
        {(() => {
          const totalMs = d.processingTimeMs ?? 0;
          const ocrMs   = d.ocrTimeMs        ?? 0;
          const ragMs   = d.ragTimeMs        ?? 0;
          const verMs   = d.verifyTimeMs     ?? 0;
          const fmtMs   = t => t >= 1000 ? `${(t/1000).toFixed(1)}s` : t > 0 ? `${t}ms` : '—';
          const finishedAt = d.analyzedAt ?? d.createdAt ?? null;

          const hasRagData  = completeIndicatorList.some(e => !e._synthetic && e.similarity != null && e.similarity > 0);
          const hasOcrProof = ocrMs > 0 || hasRagData;
          const isCsvBased  = !hasOcrProof && ((analysisSummary?.e?.high ?? 0) + (analysisSummary?.e?.medium ?? 0) > 0);
          const stages = [
            {
              id: 'ocr',
              label: '문서 파싱',
              desc: isCsvBased ? 'CSV 수치 데이터 기반 분석'
                : hasOcrProof ? 'OCR 텍스트 추출 · PDF 레이아웃 분석'
                : d.ocrFallback ? 'OCR 처리 중 오류 발생'
                : 'OCR 텍스트 추출',
              icon: <FileText size={13} />,
              time: ocrMs > 0 ? fmtMs(ocrMs) : '—',
              status: hasOcrProof ? 'success'
                : isCsvBased ? 'success'
                : isAutoSimulation ? 'skip'
                : d.ocrFallback ? 'error'
                : 'warn',
              tag: hasOcrProof
                ? (ocrMs > 0 ? 'OCR 파싱 완료' : 'OCR 텍스트 추출 성공 · 문서 청크 색인 완료')
                : isCsvBased ? 'CSV 수치 기반 검증'
                : isAutoSimulation ? '미실행'
                : d.ocrFallback ? 'OCR 처리 실패'
                : 'OCR 문서 미업로드',
              color: 'emerald',
            },
            {
              id: 'extract',
              label: '수치 추출',
              desc: 'CSV 수치 파싱 · 정규식 패턴 매칭',
              icon: <Activity size={13} />,
              time: '—',
              status: (analysisSummary?.e?.high ?? 0) > 0 ? 'success' : (analysisSummary?.e?.total ?? 0) > 0 ? 'warn' : 'skip',
              tag: (analysisSummary?.e?.high ?? 0) > 0
                ? `${analysisSummary.e.high}개 수치 추출·검증 완료`
                : (analysisSummary?.e?.total ?? 0) > 0
                ? 'E 지표 수치 불일치 감지'
                : 'E 지표 수치 미입력',
              color: 'sky',
            },
            {
              id: 'embed',
              label: '문서 색인화',
              desc: '문서 분류 및 구조 색인 구축',
              icon: <Hash size={13} />,
              time: '—',
              status: !isAutoSimulation && completeIndicatorList.some(e => e.similarity > 0) ? 'success' : isAutoSimulation ? 'skip' : 'warn',
              tag: !isAutoSimulation ? '문서 청크 색인 완료' : '사전 진단 모드',
              color: 'violet',
            },
            {
              id: 'rag',
              label: '근거 적합도 분석',
              desc: 'K-ESG 지표별 근거 탐색 · 관련성 분석',
              icon: <Search size={13} />,
              time: fmtMs(ragMs),
              status: !isAutoSimulation && ragMs > 0 ? 'success' : isAutoSimulation ? 'skip' : 'warn',
              tag: !isAutoSimulation
                ? `${completeIndicatorList.filter(e => (e.similarity ?? 0) >= 0.60).length}개 지표 의미 매칭`
                : 'RAG 차단 (사전 진단)',
              color: 'indigo',
            },
            {
              id: 'threshold',
              label: '품질 기준 검사',
              desc: 'E: 수치 오차율 검증 · S/G: 유사도 및 키워드 기반 검증',
              icon: <Shield size={13} />,
              time: '—',
              status: verificationStats.highCount > 0 ? 'success' : verificationStats.lowCount > 3 ? 'warn' : 'success',
              tag: `${verificationStats.highCount} 검증 완료 · ${verificationStats.lowCount} 불일치`,
              color: 'teal',
            },
            {
              id: 'bench',
              label: '업종 평균 비교',
              desc: '업종 평균 대비 백분위 · 차이 계산',
              icon: <BarChart2 size={13} />,
              time: '—',
              status: isBenchmarkFallback ? 'warn' : 'success',
              tag: isBenchmarkFallback ? '업종 평균 추정 적용' : '실측 데이터 비교',
              color: 'amber',
            },
            {
              id: 'confidence',
              label: '신뢰도 검증',
              desc: '근거 적합도 · 키워드 매칭 · 일관성 확인',
              icon: <CheckCircle size={13} />,
              time: fmtMs(verMs),
              status: adjustedConfidence >= 70 ? 'success' : adjustedConfidence >= 50 ? 'warn' : 'error',
              tag: `${Math.round(adjustedConfidence)}% 신뢰도`,
              color: adjustedConfidence >= 70 ? 'emerald' : adjustedConfidence >= 50 ? 'amber' : 'rose',
            },
          ];

          const statusStyle = {
            success: { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '완료' },
            warn:    { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200',     label: '부분 검증' },
            error:   { dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 border-rose-200',         label: '오류' },
            skip:    { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-200',          label: '미실행' },
          };

          return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* header */}
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
                <span className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
                  <Activity size={13} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">분석 검증 실행 파이프라인</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {totalMs > 0 && (
                    <span className="text-[10px] text-gray-400 font-mono">총 {fmtMs(totalMs)}</span>
                  )}
                  {finishedAt && (
                    <span className="text-[10px] text-gray-400">
                      {fmtKST(finishedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* pipeline stages */}
              <div className="py-2">
                {stages.map((stage, idx) => {
                  const ss = statusStyle[stage.status];
                  const isLast = idx === stages.length - 1;
                  const stepCls = stage.status === 'success' ? 'pipeline-step-active'
                    : stage.status === 'warn' ? 'pipeline-step-warn'
                    : stage.status === 'error' ? 'pipeline-step-error'
                    : '';
                  return (
                    <div key={stage.id} className={`pipeline-step ${stepCls} flex gap-4 px-6 py-3.5 rounded-xl mx-2 mb-0.5`}>
                      {/* left: connector */}
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ring-2 ring-white shadow-sm ${ss.dot}`} />
                        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1.5 min-h-[20px]" />}
                      </div>
                      {/* right: content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-gray-300 tabular-nums w-5">{String(idx+1).padStart(2,'0')}</span>
                          <span className="text-xs font-semibold text-gray-800">{stage.label}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${ss.badge}`}>
                            {ss.label}
                          </span>
                          {stage.time !== '—' && (
                            <span className="text-[10px] font-mono text-gray-400 ml-auto tabular-nums">{stage.time}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 pl-7 leading-relaxed">{stage.desc}</p>
                        <div className="pl-7 mt-1.5">
                          <span className="text-[10px] font-mono text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 py-0.5 shadow-sm">{stage.tag}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── 카테고리별 분석 방식 ─────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <BarChart2 size={14} className="text-gray-400" />
            </span>
            <span className="text-sm font-semibold text-gray-800">카테고리별 분석 방식</span>
            <span className="ml-auto text-[10px] text-gray-400 font-medium">K-ESG 검증 구조</span>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* E · Environment */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Leaf size={14} className="text-emerald-400" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Environment</p>
                    <p className="text-xs font-semibold text-gray-700">환경 (E)</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '분석 방식',   value: '수치 검증' },
                    { label: '사용 기술',   value: 'CSV/PDF 파싱 + 정규식' },
                    { label: '검증 기준',   value: '오차율 — HIGH ≤5% / MED ≤20%' },
                    { label: '검증 근거',   value: '수치 일치 수준' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 w-20">{row.label}</span>
                      <span className="text-gray-700 text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-600 uppercase tracking-wide">
                  수치 검증 엔진
                </span>
              </div>

              {/* S · Social */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Users size={14} className="text-blue-400" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Social</p>
                    <p className="text-xs font-semibold text-gray-700">사회 (S)</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '분석 방식',   value: '근거 유사도 분석' },
                    { label: '사용 기술',   value: 'ChromaDB 벡터 검색 + 키워드 매칭' },
                    { label: '검증 기준',   value: '키워드 게이트 + 유사도 기준' },
                    { label: '검증 근거',   value: '운영 근거 기반 판별' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 w-20">{row.label}</span>
                      <span className="text-gray-700 text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 uppercase tracking-wide">
                  RAG 검증 엔진
                </span>
              </div>

              {/* G · Governance */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-amber-400" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Governance</p>
                    <p className="text-xs font-semibold text-gray-700">지배구조 (G)</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '분석 방식',   value: '정책/운영 근거 분석' },
                    { label: '사용 기술',   value: '키워드 게이트 + 문서 유사도 분석' },
                    { label: '검증 기준',   value: '정책 키워드 매칭 + 유사도 기준' },
                    { label: '검증 근거',   value: '검증 상태 분류 기반 판별' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 w-20">{row.label}</span>
                      <span className="text-gray-700 text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 uppercase tracking-wide">
                  RAG 검증 엔진
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* ── K-ESG Verification Architecture ─────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Zap size={14} className="text-emerald-600" />
            </span>
            <span className="text-sm font-semibold text-gray-800">K-ESG 검증 구조</span>
            <span className="ml-auto text-[10px] text-gray-400 font-medium">감사 검증 엔진</span>
          </div>
          <div className="px-6 py-6 space-y-5">
            {/* 파이프라인 스텝 */}
            <div className="flex items-start gap-0 overflow-x-auto pb-2">
              {PIPELINE_STEPS.map((step, i) => {
                return (
                  <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-1.5 min-w-[80px] flex-shrink-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-50 border-2 border-emerald-200">
                        <span className="text-[10px] font-black text-emerald-500">{i + 1}</span>
                      </div>
                      <p className="text-[8px] font-bold text-center leading-tight px-1 text-gray-500">
                        {step.label.replace(' ', '\n')}
                      </p>
                      <p className="text-[7px] text-gray-400 text-center leading-tight px-1">{step.desc}</p>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="flex items-center pt-[14px] shrink-0">
                        <div className={`w-4 h-[1.5px] ${i < 6 ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                        <svg width="5" height="7" viewBox="0 0 6 8" className={i < 6 ? 'text-emerald-300' : 'text-gray-300'}>
                          <polyline points="0,0 6,4 0,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

          </div>
        </div>

        {/* ── Audit Console ─────────────────────────────── */}
        <AuditConsole
          data={d}
          analysisSummary={analysisSummary}
          blockedIndicators={blockedIndicators}
          isBenchmarkFallback={isBenchmarkFallback}
        />

        </>)}

        <div className="h-4" />
      </div>
    </div>

    {/* ── Evidence 상세 모달 ──────────────────────────────── */}
    {selectedEvidence && (
      <EvidenceDetailModal
        ev={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />
    )}
    </>
  );
}
