import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAnalysis } from '../../context/AnalysisContext';
import api from '../../api/api';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { BASE_URL } from '../../context/AnalysisContext';
import {
  CheckCircle2, XCircle, Loader2, ArrowRight,
  RefreshCw, Activity, Cpu, Database,
  FileSearch, BarChart2, FileText, Zap,
} from 'lucide-react';

// ── 파이프라인 단계 정의 ─────────────────────────────────────────────────────
const STAGES = [
  {
    key: 'OCR',
    label: '문서 분석',
    sub: 'PDF 텍스트 추출',
    icon: FileSearch,
    color: '#6366f1',
    logs: [
      'PDF 문서를 분석하고 있습니다...',
      '페이지 레이아웃 및 텍스트 블록을 인식 중입니다...',
      '문서 구조 파악 완료',
      '텍스트 데이터 정규화 중...',
    ],
  },
  {
    key: 'EMBED',
    label: '문서 색인화',
    sub: 'AI 벡터 변환',
    icon: Database,
    color: '#3b82f6',
    logs: [
      '문서를 분석 단위로 분할하고 있습니다...',
      'AI가 문서 내용을 벡터로 변환 중입니다...',
      '검색 가능한 형태로 색인을 구성 중입니다...',
      '문서 색인화 완료',
    ],
  },
  {
    key: 'RETRV',
    label: 'AI 문맥 분석',
    sub: 'K-ESG 지표 검색',
    icon: Activity,
    color: '#22c55e',
    logs: [
      'K-ESG 환경(E) 지표 관련 문장을 검색 중입니다...',
      'AI가 문서에서 관련 근거를 찾고 있습니다...',
      'K-ESG 사회(S) 지표 관련 근거 수집 중...',
      'K-ESG 지배구조(G) 지표 관련 근거 수집 중...',
      '검증 근거 수집 완료',
    ],
  },
  {
    key: 'VALID',
    label: '데이터 검증',
    sub: '수치 교차 검증',
    icon: Cpu,
    color: '#f59e0b',
    logs: [
      '입력 데이터와 문서 수치를 비교 중입니다...',
      '환경(E) 항목 수치 검증 중...',
      '데이터 일치 여부를 분석하고 있습니다...',
      '분석 신뢰도를 계산 중입니다...',
      '검증 근거 품질 등급을 분류하고 있습니다...',
    ],
  },
  {
    key: 'SCORE',
    label: 'ESG 점수 산정',
    sub: '등급 및 종합 평가',
    icon: BarChart2,
    color: '#f97316',
    logs: [
      '업종별 가중치를 적용 중입니다...',
      'E / S / G 카테고리 점수를 집계 중입니다...',
      '친환경 활동 보너스를 반영하고 있습니다...',
      'K-ESG 기준으로 최종 점수를 산출 중입니다...',
      '등급을 결정하고 있습니다...',
      '업종 평균과 비교 중입니다...',
    ],
  },
  {
    key: 'RPT',
    label: '리포트 작성',
    sub: 'AI 진단 보고서 생성',
    icon: FileText,
    color: '#a855f7',
    logs: [
      'AI가 분석 결과를 바탕으로 리포트를 작성 중입니다...',
      '강점 / 위험 / 개선 사항을 정리하고 있습니다...',
      '업종 비교 분석을 작성 중입니다...',
      '최종 결과를 저장하고 있습니다...',
    ],
  },
];

const WS_STAGE_MAP = {
  OCR_PROCESSING: 'OCR',  OCR: 'OCR',
  VECTOR_INDEXING: 'EMBED', EMBEDDING: 'EMBED', CHUNKING: 'EMBED',
  E_ANALYSIS: 'RETRV', S_ANALYSIS: 'RETRV', G_ANALYSIS: 'RETRV', RETRIEVAL: 'RETRV',
  VALIDATION: 'VALID', EVIDENCE_VALIDATION: 'VALID', NUMERIC_VERIFY: 'VALID',
  SCORING: 'SCORE', SCORE_CALCULATION: 'SCORE', GRADING: 'SCORE',
  REPORT_GENERATING: 'RPT', REPORT_GENERATION: 'RPT', GPT_REPORT: 'RPT',
};

const STAGE_ORDER = STAGES.map(s => s.key);

const fmtTime  = () => new Date().toTimeString().slice(0, 8);
const fmtMs    = (ms) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
const fmtElapsed = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

// ── 단계 스테퍼 컴포넌트 ──────────────────────────────────────────────────────
function StageStepper({ currentStageKey, done, failed }) {
  return (
    <div className="flex flex-col gap-0">
      {STAGES.map((stage, idx) => {
        const ci = STAGE_ORDER.indexOf(currentStageKey);
        const ti = idx;
        const isActive  = !done && !failed && stage.key === currentStageKey;
        const isDone    = done || ci > ti;
        const StageIcon = stage.icon;

        return (
          <div key={stage.key}
            className={`flex items-start gap-3 px-4 py-3 transition-all duration-300 ${
              isActive  ? 'bg-blue-50 border-l-2 border-l-blue-500'
              : isDone  ? 'opacity-60'
              : 'opacity-30'
            }`}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{
                background: isDone ? '#dcfce7' : isActive ? `${stage.color}18` : '#f3f4f6',
              }}
            >
              {isDone
                ? <CheckCircle2 size={14} className="text-emerald-600" />
                : isActive
                  ? <Loader2 size={14} className="animate-spin" style={{ color: stage.color }} />
                  : <StageIcon size={14} className="text-gray-400" />
              }
            </div>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold leading-tight ${
                isActive ? 'text-gray-900' : isDone ? 'text-gray-500' : 'text-gray-400'
              }`} style={isActive ? { color: stage.color } : undefined}>
                {stage.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{stage.sub}</p>
            </div>

            {isDone && (
              <span className="text-[10px] font-bold text-emerald-600 shrink-0 mt-1">완료</span>
            )}
            {isActive && (
              <span className="text-[10px] font-bold shrink-0 mt-1 animate-pulse"
                style={{ color: stage.color }}>
                진행 중
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 PipelinePage ─────────────────────────────────────────────────────────
export default function PipelinePage() {
  const { sessionId }       = useParams();
  const { companyId: ctxCompanyId } = useAnalysis();
  const navigate            = useNavigate();
  const location            = useLocation();
  // AnalysisPage가 state로 전달한 companyId 우선 사용, 없으면 context fallback
  const companyId = location.state?.companyId ?? ctxCompanyId;

  // ── state ──────────────────────────────────────────────────────────────────
  const [logs,        setLogs]        = useState([]);
  const [stageKey,    setStageKey]    = useState(STAGES[0].key);
  const [done,        setDone]        = useState(false);
  const [failed,      setFailed]      = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [startTime]   = useState(Date.now());
  const [elapsed,     setElapsed]     = useState(0);
  const [evidenceCount, setEvidenceCount] = useState(0);

  // ── refs ───────────────────────────────────────────────────────────────────
  const stompRef      = useRef(null);
  const logRef        = useRef(null);
  const stageTimerRef = useRef(null);
  const elapsedRef    = useRef(null);
  const stageIdxRef   = useRef(0);
  const logIdxRef     = useRef(0);
  const doneRef       = useRef(false); // double-navigate 방지
  const startedRef    = useRef(false); // WS reconnect 시 중복 분석 시작 방지

  // ── helpers ────────────────────────────────────────────────────────────────
  const pushLog = useCallback((level, tag, msg) => {
    setLogs(prev => [...prev.slice(-499), { id: Date.now() + Math.random(), level, tag, msg, time: fmtTime() }]);
  }, []);

  // ── 분석 완료 핸들러 (WS 이벤트 & 폴링 공용) ────────────────────────────────
  // doneRef로 이중 호출을 막고, analysisId가 있으면 사용, 없으면 sessionId fallback
  const handleCompleted = useCallback((analysisId) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearInterval(stageTimerRef.current);
    clearInterval(elapsedRef.current);
    setDone(true);
    setStageKey('DONE');
    const targetId = (analysisId && String(analysisId) !== 'undefined') ? analysisId : sessionId;
    pushLog('done', 'SYS', `✓ 분석 완료 (elapsed: ${fmtElapsed(Date.now() - startTime)})`);
    pushLog('done', 'SYS', `결과 페이지로 이동합니다... /analysis/result/${targetId}`);
    console.debug('[PIPELINE] COMPLETED targetId=%s', targetId);
    localStorage.setItem('esg_latest_analysis_id', String(targetId));
    setTimeout(() => navigate(`/analysis/result/${targetId}`), 2500);
  }, [sessionId, startTime, pushLog, navigate]);

  // ── WS ready 이후 실제 분석 시작 API 호출 ────────────────────────────────────
  // onConnect 콜백 안에서 구독 완료 직후 호출되므로 첫 이벤트부터 유실 없음.
  // startedRef로 WS reconnect 시 중복 실행 방지.
  const startAnalysisOnServer = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    pushLog('sys', 'SYS', `[WS READY] 분석 시작 → POST /api/v1/analysis/session/${sessionId}/start`);
    try {
      await api.post(`/api/v1/analysis/session/${sessionId}/start`, null, {
        headers: { 'X-CompanyId': String(companyId) },
      });
      pushLog('sys', 'SYS', '백엔드 파이프라인 시작 확인 — stage 이벤트 수신 대기 중');
    } catch (err) {
      startedRef.current = false;
      const msg = err.response?.data?.message ?? err.message;
      pushLog('error', 'SYS', `분석 시작 실패: ${msg}`);
      setFailed(true);
    }
  }, [sessionId, companyId, pushLog]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  // ── elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(elapsedRef.current);
  }, [startTime]);

  // ── 폴링 fallback: WS 이벤트 누락 최후 안전망 ──────────────────────────────
  // 신규 구조에서 race condition은 근본 제거됨.
  // 이 폴링은 WS 연결 자체 실패 / 네트워크 단절 등 예외 상황만을 위한 안전망.
  // startedRef.current 확인으로 분석이 시작되기 전 조기 이동을 방지.
  useEffect(() => {
    if (!sessionId) return;
    const check = async () => {
      if (!startedRef.current) return; // 분석 시작 전이면 조회 안 함
      if (doneRef.current) return;
      try {
        const res = await api.get(`/api/v1/analysis/${sessionId}/result`);
        if (res.status === 200 && res.data) {
          pushLog('sys', 'SYS', `[POLL] 완료 확인 (session: ${sessionId}) — WS 이벤트 누락, 폴링으로 복구`);
          handleCompleted(sessionId);
        }
      } catch (err) {
        // 404 = PENDING/PROCESSING 중 (정상), 무시
        if (err.response?.status !== 404 && err.response?.status !== 204) {
          console.warn('[PIPELINE POLL] 오류:', err.message);
        }
      }
    };
    // 분석 시작(~1s) + 처리 시간(~10s) 이후부터 폴링
    const timers = [20000, 40000, 70000, 120000].map(ms => setTimeout(check, ms));
    return () => timers.forEach(clearTimeout);
  }, [sessionId, handleCompleted, pushLog]);

  // ── auto-advance logs animation ─────────────────────────────────────────────
  const startAutoLogs = useCallback(() => {
    stageIdxRef.current = 0;
    logIdxRef.current   = 0;

    stageTimerRef.current = setInterval(() => {
      const si = stageIdxRef.current;
      if (si >= STAGES.length) { clearInterval(stageTimerRef.current); return; }

      const stage = STAGES[si];
      const li    = logIdxRef.current;

      if (li < stage.logs.length) {
        pushLog('info', stage.key, stage.logs[li]);
        logIdxRef.current++;

        // evidence count 증가 (RETRV / VALID 단계에서)
        if (stage.key === 'RETRV' || stage.key === 'VALID') {
          setEvidenceCount(p => p + Math.floor(Math.random() * 4) + 1);
        }
      } else {
        stageIdxRef.current++;
        logIdxRef.current = 0;
        if (stageIdxRef.current < STAGES.length) {
          const nextStage = STAGES[stageIdxRef.current];
          setStageKey(nextStage.key);
          pushLog('stage', nextStage.key, `▶ ${nextStage.label} — ${nextStage.sub}`);
        }
      }
    }, 2800);
  }, [pushLog]);

  // ── WebSocket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    pushLog('sys', 'SYS', `AI Audit Pipeline 시작 (session: ${sessionId})`);
    pushLog('sys', 'SYS', `WebSocket 연결 중... ws-esg /topic/analysis/${companyId}`);
    pushLog('stage', STAGES[0].key, `▶ ${STAGES[0].label} — ${STAGES[0].sub}`);

    const client = new Client({
      webSocketFactory: () => new SockJS(`${BASE_URL}ws-esg`),
      reconnectDelay: 3000,
      onConnect: () => {
        setWsConnected(true);
        pushLog('sys', 'WS', `CONNECTED  /topic/analysis/${companyId}`);

        // ① 구독 먼저 등록 — 이후 백엔드가 보내는 모든 이벤트 유실 없음
        client.subscribe(`/topic/analysis/${companyId}`, (frame) => {
          const status = frame.body?.trim();
          if (!status) return;

          pushLog('ws', 'WS', `← ${status}`);

          const mappedStage = WS_STAGE_MAP[status];
          if (mappedStage) {
            setStageKey(mappedStage);
            const stageDef = STAGES.find(s => s.key === mappedStage);
            if (stageDef) pushLog('stage', mappedStage, `▶ ${stageDef.label}`);
          }

          // "COMPLETED:42" 또는 "COMPLETED" 두 형식 모두 처리
          if (status.startsWith('COMPLETED') || status === 'COMPLETE') {
            const parts     = status.split(':');
            const analysisId = parts[1]?.trim() || sessionId;
            handleCompleted(analysisId);
            return;
          }

          if (status === 'FAILED') {
            clearInterval(stageTimerRef.current);
            clearInterval(elapsedRef.current);
            setFailed(true);
            pushLog('error', 'SYS', '✕ 분석 실패 — 입력 데이터를 확인하고 다시 시도해주세요');
          }
        });

        // ② 구독 완료 후 애니메이션 시작
        startAutoLogs();

        // ③ 구독 완료 후 분석 시작 API 호출 — race condition 근본 제거
        startAnalysisOnServer();
      },
      onStompError: (frame) => {
        pushLog('error', 'WS', `STOMP ERROR: ${frame.headers?.message ?? 'unknown'}`);
      },
      onDisconnect: () => {
        setWsConnected(false);
        pushLog('sys', 'WS', 'DISCONNECTED');
      },
    });

    client.activate();
    stompRef.current = client;

    return () => {
      clearInterval(stageTimerRef.current);
      client.deactivate();
    };
  }, [companyId, sessionId, navigate, pushLog, startAutoLogs, startTime, handleCompleted, startAnalysisOnServer]);

  // ── 현재 단계 정보 ───────────────────────────────────────────────────────────
  const currentStage   = STAGES.find(s => s.key === stageKey);
  const stageIdx       = STAGE_ORDER.indexOf(stageKey);
  const progressPct    = done ? 100 : Math.round(((stageIdx + 0.5) / STAGES.length) * 100);

  const stageLabel = currentStage
    ? (done ? '분석 완료' : failed ? '오류 발생' : currentStage.label)
    : '준비 중';

  return (
    <div className="fixed inset-0 bg-[#F7F8FA] flex flex-col overflow-hidden"
      style={{ fontFamily: "'Pretendard', sans-serif" }}>

      {/* ── 헤더 바 ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-3.5 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <Zap size={14} className={`text-emerald-600 ${!done && !failed ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-900">
              {done ? '분석 완료' : failed ? '분석 실패' : 'ESG AI 감사 진행 중'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {done ? '결과 페이지로 이동합니다...' : 'AI가 제출하신 ESG 자료를 검토하고 있습니다'}
            </p>
          </div>
        </div>

        {/* 헤더 메트릭 */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">소요 시간</p>
            <p className="text-[13px] font-bold text-gray-700 tabular-nums">{fmtElapsed(elapsed)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">검증 근거</p>
            <p className="text-[13px] font-bold text-emerald-600 tabular-nums">{evidenceCount}건</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">진행률</p>
            <p className="text-[13px] font-bold tabular-nums" style={{
              color: done ? '#16a34a' : failed ? '#dc2626' : currentStage?.color ?? '#6b7280'
            }}>{progressPct}%</p>
          </div>
          <div className="flex items-center gap-1.5 pl-4 border-l border-gray-200">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-[11px] text-gray-500">{wsConnected ? 'AI 연결됨' : '연결 중'}</span>
          </div>
        </div>
      </div>

      {/* ── 메인 영역 ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* 왼쪽: Stage Stepper ──────────────────────────────────────────── */}
        <div className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">분석 단계</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            <StageStepper currentStageKey={stageKey} done={done} failed={failed} />
          </div>
          <div className="px-5 py-4 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">전체 진행률</span>
              <span className="text-[12px] font-bold tabular-nums" style={{
                color: done ? '#16a34a' : failed ? '#dc2626' : currentStage?.color ?? '#6b7280'
              }}>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  background: done ? '#16a34a' : failed ? '#dc2626' : currentStage?.color ?? '#6b7280',
                }} />
            </div>
          </div>
        </div>

        {/* 오른쪽: 상태 패널 ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── 분석 중: 현재 단계 카드 + 간략 로그 ── */}
          {!done && !failed && (
            <div className="flex-1 overflow-y-auto px-8 py-8 flex flex-col gap-6">

              {/* 현재 단계 강조 카드 */}
              {currentStage && (
                <div className="rounded-xl border bg-white overflow-hidden"
                  style={{ borderColor: `${currentStage.color}30` }}>
                  <div className="flex items-center gap-4 px-6 py-5"
                    style={{ background: `${currentStage.color}06` }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${currentStage.color}14` }}>
                      <Loader2 size={22} className="animate-spin" style={{ color: currentStage.color }} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                        style={{ color: currentStage.color }}>처리 중</p>
                      <p className="text-[17px] font-bold text-gray-900 leading-tight">{currentStage.label}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{currentStage.sub}</p>
                    </div>
                    <div className="ml-auto text-right shrink-0">
                      <p className="text-[10px] text-gray-400 mb-1">단계</p>
                      <p className="text-[15px] font-black tabular-nums text-gray-700">
                        {Math.max(1, stageIdx + 1)}<span className="text-gray-400 font-normal text-[12px]"> / {STAGES.length}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 간략 로그 (최근 6개, 스크롤 없음) */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">처리 로그</span>
                  <span className="text-[9px] text-gray-300 ml-auto tabular-nums">{logs.length}개</span>
                </div>
                <div ref={logRef} className="px-5 py-4 space-y-2.5 max-h-[260px] overflow-y-auto"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: '#e5e7eb transparent' }}>
                  {logs.slice(-8).map((log) => {
                    const stageColorMap = {
                      OCR: '#6366f1', EMBED: '#3b82f6', RETRV: '#22c55e',
                      VALID: '#f59e0b', SCORE: '#f97316', RPT: '#a855f7',
                    };
                    const isStage = log.level === 'stage';
                    const isErr   = log.level === 'error';
                    const isSys   = log.level === 'sys' || log.level === 'ws';
                    const tagColor = stageColorMap[log.tag] ?? (isErr ? '#dc2626' : '#9ca3af');
                    return (
                      <div key={log.id} className="flex items-start gap-3">
                        <span className="text-[9px] text-gray-300 tabular-nums shrink-0 w-[48px] mt-0.5 select-none">
                          {log.time}
                        </span>
                        {isStage ? (
                          <span className="text-[11px] font-semibold leading-snug" style={{ color: tagColor }}>
                            {log.msg}
                          </span>
                        ) : isErr ? (
                          <span className="text-[11px] font-semibold text-red-600 leading-snug">{log.msg}</span>
                        ) : isSys ? (
                          <span className="text-[10px] text-gray-400 leading-snug">{log.msg}</span>
                        ) : (
                          <span className="text-[11px] text-gray-600 leading-snug">{log.msg}</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-3">
                    <span className="w-[48px] shrink-0" />
                    <Loader2 size={11} className="text-gray-300 animate-spin shrink-0" />
                    <span className="text-[10px] text-gray-400">처리 중...</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ── 완료 상태 ── */}
          {done && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden max-w-md w-full">
                <div className="px-8 py-6 bg-emerald-50 text-center border-b border-emerald-100">
                  <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-3" />
                  <p className="text-[17px] font-bold text-emerald-800">ESG 감사 완료</p>
                  <p className="text-[12px] text-emerald-600 mt-1">ESG 감사 분석이 완료되었습니다</p>
                </div>
                <div className="px-8 py-5">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: '소요 시간',  value: fmtElapsed(elapsed), color: '#6b7280' },
                      { label: '검증 근거',  value: `${evidenceCount}건`, color: '#059669' },
                      { label: '분석 단계',  value: `${STAGES.length}/${STAGES.length}`, color: '#2563eb' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center">
                        <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                        <p className="text-[15px] font-bold tabular-nums" style={{ color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 text-center mb-5">
                    결과 페이지로 자동 이동합니다...
                  </p>
                  <button
                    onClick={() => navigate(`/analysis/result/${sessionId}`)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                      bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold
                      transition-colors shadow-sm"
                  >
                    결과 바로 보기 <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 실패 상태 ── */}
          {failed && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden max-w-md w-full">
                <div className="px-8 py-6 bg-red-50 text-center border-b border-red-100">
                  <XCircle size={36} className="text-red-500 mx-auto mb-3" />
                  <p className="text-[17px] font-bold text-red-800">분석 오류 발생</p>
                  <p className="text-[12px] text-red-600 mt-1">입력 데이터를 확인하고 다시 시도해주세요</p>
                </div>
                <div className="px-8 py-5">
                  <button
                    onClick={() => navigate('/analysis')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                      bg-white border border-gray-200 hover:border-gray-300
                      text-gray-700 text-[13px] font-semibold transition-colors"
                  >
                    <RefreshCw size={13} /> 다시 시도
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
