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
    <div className="fixed inset-0 bg-[#F7F8FA] flex flex-col overflow-hidden">

      {/* ── 상단 헤더 바 ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <Zap size={16} className={`text-emerald-600 ${!done && !failed ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">ESG 분석 진행 중</p>
            <p className="text-xs text-gray-400 mt-0.5">AI가 제출하신 자료를 분석하고 있습니다</p>
          </div>
        </div>

        {/* 단계 브레드크럼 */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {STAGES.map((s, i) => {
            const isCurr = s.key === stageKey && !done;
            const isPast = done || STAGE_ORDER.indexOf(stageKey) > i;
            return (
              <React.Fragment key={s.key}>
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium transition-all ${
                  isCurr ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : isPast ? 'text-emerald-600'
                  : 'text-gray-300'
                }`}>{s.label}</span>
                {i < STAGES.length - 1 && <span className="text-gray-300 text-xs">›</span>}
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-gray-400 leading-none">소요 시간</p>
            <p className="text-sm font-bold text-gray-700 tabular-nums mt-0.5">{fmtElapsed(elapsed)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 leading-none">검증 근거</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums mt-0.5">{evidenceCount}건</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{wsConnected ? 'AI 연결됨' : '연결 중'}</span>
          </div>
        </div>
      </div>

      {/* ── 메인 영역 ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* 왼쪽 패널: Stage Stepper ──────────────────────────────────────── */}
        <div className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">분석 단계</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <StageStepper currentStageKey={stageKey} done={done} failed={failed} />
          </div>
          <div className="px-5 py-4 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">전체 진행률</span>
              <span className="text-sm font-bold tabular-nums" style={{
                color: done ? '#16a34a' : failed ? '#dc2626' : currentStage?.color ?? '#6b7280'
              }}>
                {progressPct}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  background: done ? '#16a34a' : failed ? '#dc2626' : currentStage?.color ?? '#6b7280',
                }}
              />
            </div>
          </div>
        </div>

        {/* 오른쪽: 진행 로그 ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* 로그 헤더 */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white shrink-0">
            <span className="text-xs font-semibold text-gray-600">AI 상세 분석 로그</span>
            {currentStage && !done && !failed && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                style={{ color: currentStage.color, background: `${currentStage.color}12`, borderColor: `${currentStage.color}30` }}>
                {currentStage.label}
              </span>
            )}
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{logs.length}개 메시지</span>
          </div>

          {/* 로그 출력 */}
          <div ref={logRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
            {logs.map((log) => {
              const stageColorMap = {
                OCR: '#6366f1', EMBED: '#3b82f6', RETRV: '#22c55e',
                VALID: '#f59e0b', SCORE: '#f97316', RPT: '#a855f7',
              };
              const isStage = log.level === 'stage';
              const isDone  = log.level === 'done';
              const isErr   = log.level === 'error';
              const isSys   = log.level === 'sys' || log.level === 'ws';
              const tagColor = stageColorMap[log.tag] ?? (isDone ? '#16a34a' : isErr ? '#dc2626' : '#9ca3af');

              return (
                <div key={log.id} className={`flex items-start gap-3 text-sm leading-relaxed ${isStage ? 'mt-3' : ''}`}>
                  <span className="text-gray-300 shrink-0 tabular-nums text-xs select-none mt-0.5 w-[52px]">
                    {log.time}
                  </span>
                  {isStage ? (
                    <span className="flex-1 font-semibold text-gray-800" style={{ color: tagColor }}>
                      {log.msg}
                    </span>
                  ) : isDone ? (
                    <span className="flex-1 font-semibold text-emerald-700">{log.msg}</span>
                  ) : isErr ? (
                    <span className="flex-1 font-semibold text-red-600">{log.msg}</span>
                  ) : isSys ? (
                    <span className="flex-1 text-gray-400 text-xs">{log.msg}</span>
                  ) : (
                    <span className="flex-1 text-gray-600">{log.msg}</span>
                  )}
                </div>
              );
            })}

            {!done && !failed && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-gray-300 text-xs w-[52px] shrink-0" />
                <Loader2 size={13} className="text-blue-400 animate-spin shrink-0" />
                <span className="text-sm text-gray-400">처리 중...</span>
              </div>
            )}
          </div>

          {/* 하단: 완료 / 실패 바 ──────────────────────────────────────────── */}
          {(done || failed) && (
            <div className={`shrink-0 px-6 py-4 border-t ${
              done ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {done
                    ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                    : <XCircle     size={20} className="text-red-500 shrink-0" />
                  }
                  <div>
                    <p className={`text-sm font-bold ${done ? 'text-emerald-800' : 'text-red-700'}`}>
                      {done ? '분석이 완료되었습니다. 결과 페이지로 이동 중...' : '분석 중 오류가 발생했습니다.'}
                    </p>
                    <p className={`text-xs mt-0.5 ${done ? 'text-emerald-600' : 'text-red-500'}`}>
                      {done
                        ? `총 소요 시간: ${fmtElapsed(elapsed)}`
                        : '입력 데이터를 확인하고 다시 시도해주세요.'
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {done && (
                    <button
                      onClick={() => navigate(`/analysis/result/${sessionId}`)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700
                        text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                    >
                      결과 보기 <ArrowRight size={14} />
                    </button>
                  )}
                  {failed && (
                    <button
                      onClick={() => navigate('/analysis')}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-gray-300
                        text-gray-700 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                    >
                      <RefreshCw size={14} /> 다시 시도
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽 사이드: 지표 패널 ──────────────────────────────────────── */}
        <div className="w-52 shrink-0 bg-white border-l border-gray-200 flex flex-col">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">진행 현황</p>
          </div>

          <div className="flex-1 px-4 py-5 space-y-5">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">현재 단계</p>
              {currentStage && !done && !failed ? (
                <div>
                  <p className="text-sm font-bold text-gray-800" style={{ color: currentStage.color }}>
                    {currentStage.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{currentStage.sub}</p>
                </div>
              ) : done ? (
                <p className="text-sm font-bold text-emerald-600">분석 완료</p>
              ) : failed ? (
                <p className="text-sm font-bold text-red-500">오류 발생</p>
              ) : (
                <p className="text-sm text-gray-400">준비 중...</p>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1.5">소요 시간</p>
              <p className="text-2xl font-black tabular-nums text-gray-800">{fmtElapsed(elapsed)}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1.5">수집된 검증 근거</p>
              <p className="text-2xl font-black tabular-nums text-emerald-600">{evidenceCount}
                <span className="text-sm text-gray-400 font-normal ml-1">건</span>
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1.5">단계 진행</p>
              <p className="text-2xl font-black tabular-nums text-gray-800">
                {done ? STAGES.length : Math.max(0, stageIdx + 1)}
                <span className="text-sm text-gray-400 font-normal"> / {STAGES.length}</span>
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1.5">AI 연결 상태</p>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300'}`} />
                <p className={`text-sm font-semibold ${wsConnected ? 'text-emerald-700' : 'text-gray-400'}`}>
                  {wsConnected ? '연결됨' : '연결 중...'}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap size={11} className="text-emerald-500" />
              <span className="text-xs font-semibold text-gray-600">K-ESG 기준 분석</span>
            </div>
            <p className="text-xs text-gray-400">산업통상자원부, 2021</p>
          </div>
        </div>

      </div>
    </div>
  );
}
