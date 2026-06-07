import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'lucide-react';

// ── Level config — enterprise slate palette (non-neon) ────────────────────────
const LEVELS = {
  READY: { prefix: '준비', color: '#4ade80' },
  IDLE:  { prefix: '대기', color: '#64748b' },
  INPUT: { prefix: '입력', color: '#fbbf24' },
  RUN:   { prefix: '시작', color: '#60a5fa' },
  PROC:  { prefix: '진행', color: '#93c5fd' },
  DONE:  { prefix: '완료', color: '#4ade80' },
  ERROR: { prefix: '오류', color: '#f87171' },
  INFO:  { prefix: '확인', color: '#94a3b8' },
};

let _uid = 0;
const mkLog = (level, text) => ({
  id: ++_uid,
  level,
  text,
  time: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(11, 19),
});

// ── 감사 단계별 로그 시퀀스 ──────────────────────────────────────────────────
// E_PIPELINE / S_PIPELINE / G_PIPELINE 제거 — 실제 WS 이벤트로 대체

const FINAL_PIPELINE = [
  [     0, 'RUN',  '통합 ESG 감사 분석 시작'],
  [  2000, 'PROC', '분석 결과 통합 처리 중...'],
  [  6000, 'PROC', '증빙 문서 근거 색인 완료'],
  [ 12000, 'PROC', 'K-ESG 15개 지표 최종 검증 중... (환경 5개 · 사회 5개 · 지배구조 5개)'],
  [ 18000, 'INFO', '환경(E) 지표 감사 완료'],
  [ 22000, 'INFO', '사회(S) 지표 감사 완료'],
  [ 26000, 'INFO', '지배구조(G) 지표 감사 완료'],
  [ 30000, 'PROC', 'AI 감사 의견 생성 중...'],
  [ 40000, 'PROC', '업종별 가중치 적용 및 최종 등급 산출 중...'],
];

// ── Component ─────────────────────────────────────────────────────────────────
const LOG_PREVIEW = 5;

const WS_STAGE_LOG = {
  // 최종 리포트 단계 (FinalReportService)
  RULE_BASED_SCORING:   'K-ESG 업종 가중치 적용 및 점수 산출 중...',
  GPT_SUMMARY:          'AI 종합 진단 의견 생성 중...',
  MERGING_SCORE:        '최종 등급 확정 및 리포트 저장 중...',
  // 환경(E) 카테고리 분석 단계
  'OCR_PROCESSING:E':   '환경(E) 증빙 문서 분석 중...',
  'VECTOR_INDEXING:E':  '환경(E) 지표 벡터 인덱싱 중...',
  'RETRIEVAL:E':        '환경(E) K-ESG 지표별 근거 탐색 중...',
  'VALIDATION:E':       '환경(E) 점수 신뢰도 산정 중...',
  'SCORING:E':          '환경(E) 최종 등급 확정 중...',
  // 사회(S) 카테고리 분석 단계
  'OCR_PROCESSING:S':   '사회(S) 증빙 문서 분석 중...',
  'VECTOR_INDEXING:S':  '사회(S) 지표 벡터 인덱싱 중...',
  'RETRIEVAL:S':        '사회(S) K-ESG 지표별 근거 탐색 중...',
  'VALIDATION:S':       '사회(S) 점수 신뢰도 산정 중...',
  'SCORING:S':          '사회(S) 최종 등급 확정 중...',
  // 지배구조(G) 카테고리 분석 단계
  'OCR_PROCESSING:G':   '지배구조(G) 증빙 문서 분석 중...',
  'VECTOR_INDEXING:G':  '지배구조(G) 지표 벡터 인덱싱 중...',
  'RETRIEVAL:G':        '지배구조(G) K-ESG 지표별 근거 탐색 중...',
  'VALIDATION:G':       '지배구조(G) 점수 신뢰도 산정 중...',
  'SCORING:G':          '지배구조(G) 최종 등급 확정 중...',
};

export default function RealtimeAuditPanel({
  eLoading = false,
  sLoading = false,
  gLoading = false,
  finalPipelineActive = false,
  eFile,
  sFile,
  gFile,
  socialAnswers,
  governanceAnswers,
  wsStage = null,
}) {
  const [logs, setLogs] = useState(() => {
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(11, 19);
    return [
      { id: ++_uid, level: 'READY', text: '기업 프로파일 확인 완료',          time: now },
      { id: ++_uid, level: 'READY', text: 'GreenTrace ESG 분석 시스템 준비 완료', time: now },
      { id: ++_uid, level: 'IDLE',  text: '문서 업로드를 기다리는 중...',    time: now },
    ];
  });
  const [recentInput, setRecentInput] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const logRef     = useRef(null);
  const timers     = useRef([]);
  const inputTimer = useRef(null);

  const isAnalyzing = eLoading || sLoading || gLoading || finalPipelineActive;
  const isLive      = isAnalyzing || recentInput;

  const push = useCallback((level, text) => {
    setLogs(prev => [...prev.slice(-299), mkLog(level, text)]);
  }, []);

  const flashLive = useCallback(() => {
    clearTimeout(inputTimer.current);
    setRecentInput(true);
    inputTimer.current = setTimeout(() => setRecentInput(false), 900);
  }, []);

  const runPipeline = useCallback((steps) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    steps.forEach(([delay, level, text]) => {
      timers.current.push(setTimeout(() => push(level, text), delay));
    });
  }, [push]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    clearTimeout(inputTimer.current);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  // ── WebSocket 실시간 이벤트 → 로그 반영 ───────────────────────────────────────
  useEffect(() => {
    const text = WS_STAGE_LOG[wsStage];
    if (text) push('RUN', text);
  }, [wsStage, push]);

  // ── File upload events ─────────────────────────────────────────────────────
  const prevEFile = useRef(undefined);
  useEffect(() => {
    if (prevEFile.current === undefined) { prevEFile.current = eFile; return; }
    const prev = prevEFile.current;
    prevEFile.current = eFile;
    if (eFile === prev) return;
    if (eFile) {
      flashLive();
      push('INPUT', `환경 증빙 파일: "${eFile.name}" (${(eFile.size / 1024).toFixed(1)} KB)`);
    } else {
      flashLive();
      push('INPUT', '환경 증빙 파일 제거됨');
    }
  }, [eFile, push, flashLive]);

  const prevSFile = useRef(undefined);
  useEffect(() => {
    if (prevSFile.current === undefined) { prevSFile.current = sFile; return; }
    const prev = prevSFile.current;
    prevSFile.current = sFile;
    if (sFile === prev) return;
    if (sFile) {
      flashLive();
      push('INPUT', `사회(S) 증빙 파일: "${sFile.name}"`);
    } else {
      flashLive();
      push('INPUT', '사회(S) 증빙 파일 제거됨');
    }
  }, [sFile, push, flashLive]);

  const prevGFile = useRef(undefined);
  useEffect(() => {
    if (prevGFile.current === undefined) { prevGFile.current = gFile; return; }
    const prev = prevGFile.current;
    prevGFile.current = gFile;
    if (gFile === prev) return;
    if (gFile) {
      flashLive();
      push('INPUT', `지배구조(G) 증빙 파일: "${gFile.name}"`);
    } else {
      flashLive();
      push('INPUT', '지배구조(G) 증빙 파일 제거됨');
    }
  }, [gFile, push, flashLive]);

  // ── Checklist toggle events ────────────────────────────────────────────────
  const prevSocial = useRef(undefined);
  useEffect(() => {
    if (prevSocial.current === undefined) { prevSocial.current = socialAnswers; return; }
    if (socialAnswers === prevSocial.current) return;
    prevSocial.current = socialAnswers;
    const n = Object.values(socialAnswers).filter(Boolean).length;
    const t = Object.keys(socialAnswers).length;
    flashLive();
    push('INPUT', `사회(S) 항목 ${n}/${t} 선택됨`);
  }, [socialAnswers, push, flashLive]);

  const prevGov = useRef(undefined);
  useEffect(() => {
    if (prevGov.current === undefined) { prevGov.current = governanceAnswers; return; }
    if (governanceAnswers === prevGov.current) return;
    prevGov.current = governanceAnswers;
    const n = Object.values(governanceAnswers).filter(Boolean).length;
    const t = Object.keys(governanceAnswers).length;
    flashLive();
    push('INPUT', `지배구조(G) 항목 ${n}/${t} 선택됨`);
  }, [governanceAnswers, push, flashLive]);

  // ── Per-category analysis transitions ─────────────────────────────────────
  const prevEL = useRef(false);
  useEffect(() => {
    const was = prevEL.current;
    prevEL.current = eLoading;
    if (eLoading && !was)  push('RUN', '환경(E) 지표 감사 시작');
    else if (!eLoading && was) push('DONE', '환경(E) 지표 감사 완료');
  }, [eLoading, push]);

  const prevSL = useRef(false);
  useEffect(() => {
    const was = prevSL.current;
    prevSL.current = sLoading;
    if (sLoading && !was)  push('RUN', '사회(S) 지표 감사 시작');
    else if (!sLoading && was) push('DONE', '사회(S) 지표 감사 완료');
  }, [sLoading, push]);

  const prevGL = useRef(false);
  useEffect(() => {
    const was = prevGL.current;
    prevGL.current = gLoading;
    if (gLoading && !was)  push('RUN', '지배구조(G) 지표 감사 시작');
    else if (!gLoading && was) push('DONE', '지배구조(G) 지표 감사 완료');
  }, [gLoading, push]);

  // ── Final pipeline transition ──────────────────────────────────────────────
  const prevFL = useRef(false);
  useEffect(() => {
    const was = prevFL.current;
    prevFL.current = finalPipelineActive;
    if (finalPipelineActive && !was)  runPipeline(FINAL_PIPELINE);
    else if (!finalPipelineActive && was) {
      timers.current.forEach(clearTimeout); timers.current = [];
      push('DONE', 'ESG 감사 완료 — 결과 보고서 생성 중...');
    }
  }, [finalPipelineActive, push, runPipeline]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{
        background: '#1a2535',
        border: '1px solid #2a3a50',
        fontFamily: "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid #253347', background: '#111c2a' }}
      >
        <Terminal size={12} style={{ color: '#60a5fa' }} />
        <span className="text-[10px] font-medium tracking-tight" style={{ color: '#cbd5e1' }}>
          AI 분석 로그
        </span>

        {isLive ? (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ background: '#052e16', border: '1px solid #166534' }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
            <span className="text-[9px] font-semibold" style={{ color: '#4ade80' }}>분석 중</span>
          </span>
        ) : (
          <span
            className="text-[9px] px-2 py-0.5 rounded-full"
            style={{ border: '1px solid #334155', color: '#64748b' }}
          >
            대기
          </span>
        )}

        {isAnalyzing && (
          <span className="ml-auto text-[9px] flex items-center gap-1.5" style={{ color: '#fbbf24' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: '#fbbf24' }} />
            {finalPipelineActive ? '통합 분석 진행 중' : '지표 감사 진행 중'}
          </span>
        )}
      </div>

      {/* Log area */}
      {(() => {
        const visibleLogs = showAllLogs ? logs : logs.slice(-LOG_PREVIEW);
        const hiddenCount = logs.length - LOG_PREVIEW;
        return (
          <>
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto px-4 py-3"
              style={{
                height: showAllLogs ? '420px' : 'auto',
                maxHeight: showAllLogs ? '420px' : undefined,
                scrollbarWidth: 'thin',
                scrollbarColor: '#334155 transparent',
              }}
            >
              <div className="space-y-3">
                {visibleLogs.map((log, i) => {
                  const lv     = LEVELS[log.level] ?? LEVELS.INFO;
                  const isLast = i === visibleLogs.length - 1 && !isAnalyzing;
                  return (
                    <div
                      key={log.id}
                      className="flex items-start text-[11px] leading-snug"
                      style={isLast ? { animation: 'fadeIn 0.2s ease-out' } : undefined}
                    >
                      <span
                        className="tabular-nums shrink-0 select-none text-[10px] mr-2"
                        style={{ color: '#1e2d3d', minWidth: '54px' }}
                      >
                        {log.time}
                      </span>
                      <span
                        className="font-bold shrink-0 text-[10px] mr-2"
                        style={{ color: lv.color, minWidth: '38px' }}
                      >
                        {lv.prefix}
                      </span>
                      <span
                        className="break-all flex-1"
                        style={{ color: isLast ? '#e2e8f0' : '#94a3b8' }}
                      >
                        {log.text}
                      </span>
                    </div>
                  );
                })}

                {isAnalyzing && (
                  <div className="flex items-center text-[11px]">
                    <span className="mr-2 shrink-0" style={{ minWidth: '54px' }} />
                    <span className="mr-2 shrink-0" style={{ minWidth: '38px' }} />
                    <span className="flex gap-[3px] items-center mt-1">
                      {[0, 1, 2].map(j => (
                        <span
                          key={j}
                          className="w-[3px] h-[3px] rounded-full animate-bounce"
                          style={{ background: '#60a5fa', animationDelay: `${j * 0.15}s` }}
                        />
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Expand / Collapse button */}
            {!showAllLogs && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllLogs(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors"
                style={{
                  borderTop: '1px solid #253347',
                  background: '#111c2a',
                  color: '#4a7fa5',
                }}
              >
                <span>이전 로그 ({hiddenCount}개)</span>
                <span style={{ color: '#2d4a62' }}>▼</span>
              </button>
            )}
            {showAllLogs && logs.length > LOG_PREVIEW && (
              <button
                onClick={() => setShowAllLogs(false)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors"
                style={{
                  borderTop: '1px solid #253347',
                  background: '#111c2a',
                  color: '#36526a',
                }}
              >
                <span>접기</span>
                <span>▲</span>
              </button>
            )}
          </>
        );
      })()}

      {/* Footer */}
      <div
        className="px-4 py-1.5 flex items-center justify-between shrink-0"
        style={{ borderTop: '1px solid #253347', background: '#111c2a' }}
      >
        <span className="text-[9px] tabular-nums" style={{ color: '#2d4a62' }}>
          {logs.length}
        </span>
        <span className="text-[9px]" style={{ color: '#182638', letterSpacing: '0.04em' }}>ESG Audit</span>
      </div>
    </div>
  );
}
