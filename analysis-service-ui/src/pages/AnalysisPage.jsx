import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, message, Progress } from 'antd';
import axios from 'axios';
import {
  FileText, Wifi, CheckCircle2, AlertCircle,
  Loader2, Upload as UploadIcon, ArrowRight,
} from 'lucide-react';
import { useAnalysis, BASE_URL } from '../context/AnalysisContext';

const { Dragger } = Upload;

// ── ESG 팔레트 ────────────────────────────────────────────────────
const C = {
  green: '#16a34a', greenL: '#dcfce7',
  navy:  '#1e3a5f', blue:   '#1d4ed8', blueL: '#eff6ff',
  amber: '#f59e0b', red: '#ef4444',
  white: '#ffffff', gray50: '#f8fafc', gray100: '#f1f5f9',
  gray300: '#cbd5e1', gray500: '#64748b', gray700: '#334155', gray900: '#0f172a',
};

// ── WebSocket 상태 → 진행률·메시지 매핑 ──────────────────────────
const STATUS_MAP = {
  PREPROCESSING:     { pct: 10,  label: '📄 보고서 텍스트 추출 중...', color: C.blue },
  INDEXING_REPORT:   { pct: 22,  label: '🗂️ 보고서 벡터 인덱싱 중 (ChromaDB)...', color: C.blue },
  RETRIEVING_CONTEXT:{ pct: 40,  label: '🔍 K-ESG 지표별 컨텍스트 매칭 중...', color: C.amber },
  AI_ANALYZING:      { pct: 65,  label: '🤖 AI 지표별 정밀 분석 중 (18개 지표)...', color: C.amber },
  MERGING_SCORE:     { pct: 85,  label: '📊 점수 집계 및 종합 등급 산출 중...', color: C.green },
  COMPLETE:          { pct: 100, label: '✅ 종합 분석 완료!', color: C.green },
  FAILED:            { pct: 100, label: '❌ 분석 중 오류가 발생했습니다.', color: C.red },
};

const Card = ({ children, style = {} }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      style={{
        background: C.white,
        borderRadius: '24px',
        boxShadow: hovered
          ? '0 8px 32px rgba(0,0,0,0.10)'
          : '0 2px 8px rgba(0,0,0,0.05)',
        padding: '28px',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease',
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
};

// ── WebSocket 상태 패널 ────────────────────────────────────────────
const WebSocketPanel = ({ wsStatus, isAnalyzing, onNavigate }) => {
  const info = STATUS_MAP[wsStatus] ?? null;
  const done = wsStatus === 'COMPLETE';
  const fail = wsStatus === 'FAILED';

  if (!wsStatus && !isAnalyzing) return null;

  return (
    <Card style={{ border: `2px solid ${done ? C.green : fail ? C.red : C.blue}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Wifi size={18} color={done ? C.green : fail ? C.red : C.blue} />
        <span style={{ fontWeight: 700, fontSize: '15px', color: C.gray900 }}>
          실시간 분석 상태 모니터
        </span>
        {isAnalyzing && !done && !fail && (
          <Loader2 size={16} color={C.blue} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {done  && <CheckCircle2 size={16} color={C.green} />}
        {fail  && <AlertCircle  size={16} color={C.red}   />}
      </div>

      {/* 프로그레스 바 */}
      <Progress
        percent={info?.pct ?? 5}
        strokeColor={info?.color ?? C.blue}
        trailColor={C.gray100}
        strokeWidth={10}
        style={{ marginBottom: '16px' }}
        status={fail ? 'exception' : done ? 'success' : 'active'}
      />

      {/* 상태 로그 */}
      <div style={{
        background: C.gray900, borderRadius: '12px', padding: '16px',
        fontFamily: 'monospace', fontSize: '13px',
        minHeight: '80px',
      }}>
        {info ? (
          <div style={{ color: done ? '#4ade80' : fail ? '#f87171' : '#60a5fa' }}>
            {info.label}
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>분석 준비 중...</div>
        )}

        {/* 상태 히스토리 흔적 (완료된 단계) */}
        {Object.entries(STATUS_MAP)
          .filter(([k]) => k !== 'COMPLETE' && k !== 'FAILED')
          .map(([k, v]) => {
            const passed = info && v.pct < (info.pct ?? 0);
            return passed ? (
              <div key={k} style={{ color: '#4b5563', marginTop: '4px', fontSize: '12px' }}>
                ✓ {v.label}
              </div>
            ) : null;
          })
        }
      </div>

      {/* 완료 시 리포트 이동 버튼 */}
      {done && (
        <button
          onClick={onNavigate}
          style={{
            marginTop: '20px', width: '100%',
            padding: '14px', background: C.green, color: C.white,
            border: 'none', borderRadius: '12px',
            fontWeight: 700, fontSize: '15px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          종합 리포트 확인하기 <ArrowRight size={18} />
        </button>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Card>
  );
};

// ── 업로드 가이드 스텝 ────────────────────────────────────────────
const UploadGuide = () => {
  const steps = [
    { n: '01', t: 'PDF 보고서 준비', d: 'ESG 또는 지속가능경영 보고서 PDF (한국어 권장)' },
    { n: '02', t: '파일 드래그 업로드', d: '아래 업로드 존에 파일을 끌어다 놓으세요' },
    { n: '03', t: 'AI 자동 분석', d: 'K-ESG 18개 지표를 AI가 순차 분석합니다 (약 2~3분)' },
    { n: '04', t: '리포트 확인', d: '분석 완료 즉시 종합 리포트 페이지로 이동합니다' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
      {steps.map(s => (
        <div key={s.n} style={{
          background: C.blueL, borderRadius: '14px', padding: '16px',
          borderLeft: `4px solid ${C.blue}`,
        }}>
          <div style={{ fontSize: '20px', fontWeight: 900, color: C.blue, marginBottom: '6px' }}>
            {s.n}
          </div>
          <div style={{ fontWeight: 700, color: C.gray900, fontSize: '13px', marginBottom: '4px' }}>
            {s.t}
          </div>
          <div style={{ color: C.gray500, fontSize: '12px' }}>{s.d}</div>
        </div>
      ))}
    </div>
  );
};

// ── 메인 분석 페이지 ─────────────────────────────────────────────
export default function AnalysisPage() {
  const navigate = useNavigate();
  const {
    companyId,
    isAnalyzing, setIsAnalyzing,
    wsStatus, setWsStatus,
    connectWebSocket, fetchLatestData, fetchEcoPreview,
  } = useAnalysis();

  const [uploadedFile, setUploadedFile] = useState(null);
  const pollingRef = useRef(null);

  const handleNavigateToReport = useCallback(() => {
    navigate('/report');
  }, [navigate]);

  const startAnalysis = useCallback(async (file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('companyId', companyId);

    setIsAnalyzing(true);
    setWsStatus(null);

    // WebSocket 먼저 연결
    connectWebSocket(
      companyId,
      () => {
        // COMPLETE 콜백
        if (pollingRef.current) clearTimeout(pollingRef.current);
        Promise.all([fetchLatestData(companyId), fetchEcoPreview(companyId)]);
      },
      () => {
        // FAILED 콜백
        if (pollingRef.current) clearTimeout(pollingRef.current);
        message.error('분석 중 오류가 발생했습니다. 다시 시도해주세요.');
      },
    );

    await new Promise(r => setTimeout(r, 600));

    try {
      await axios.post(`${BASE_URL}/api/v1/analysis/report`, formData, {
        headers: { 'X-UserId': '1', 'X-CompanyId': String(companyId) },
      });
      message.success('PDF 업로드 성공! AI 분석을 시작합니다.');

      // 폴백: 3분 후 강제 데이터 로드
      pollingRef.current = setTimeout(async () => {
        await fetchLatestData(companyId);
        setIsAnalyzing(false);
      }, 180_000);

    } catch (e) {
      message.error('업로드 실패: ' + (e.response?.data?.message || e.message));
      setIsAnalyzing(false);
      setWsStatus(null);
    }
  }, [companyId, connectWebSocket, fetchLatestData, fetchEcoPreview, setIsAnalyzing, setWsStatus]);

  const draggerProps = {
    name: 'file',
    accept: '.pdf',
    multiple: false,
    showUploadList: false,
    disabled: isAnalyzing,
    beforeUpload: (file) => {
      if (file.type !== 'application/pdf') {
        message.error('PDF 파일만 업로드 가능합니다.');
        return Upload.LIST_IGNORE;
      }
      if (file.size > 50 * 1024 * 1024) {
        message.error('50MB 이하 파일만 업로드 가능합니다.');
        return Upload.LIST_IGNORE;
      }
      setUploadedFile(file);
      startAnalysis(file);
      return false; // 자동 업로드 방지
    },
  };

  return (
    <div style={{ padding: '36px 48px', width: '100%', boxSizing: 'border-box' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: C.gray900 }}>
          ESG 분석 & 실시간 트래킹
        </h1>
        <div style={{ color: C.gray500, fontSize: '14px', marginTop: '4px' }}>
          PDF 보고서를 업로드하면 AI가 K-ESG 18개 지표를 자동으로 분석합니다
        </div>
      </div>

      {/* 업로드 가이드 */}
      <UploadGuide />

      {/* 업로드 존 */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: C.gray900, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color={C.blue} />
          보고서 PDF 업로드
          <span style={{ color: C.gray500, fontWeight: 400, fontSize: '13px' }}>
            — 기업 ID: {companyId}
          </span>
        </div>

        <Dragger
          {...draggerProps}
          style={{ borderRadius: '16px', border: `2px dashed ${isAnalyzing ? C.gray300 : C.blue}` }}
        >
          <div style={{ padding: '32px 0' }}>
            <div style={{ marginBottom: '16px' }}>
              <UploadIcon size={48} color={isAnalyzing ? C.gray300 : C.blue} />
            </div>
            {isAnalyzing ? (
              <>
                <div style={{ fontWeight: 700, fontSize: '16px', color: C.gray500 }}>
                  AI 분석 진행 중...
                </div>
                <div style={{ color: C.gray300, marginTop: '8px', fontSize: '13px' }}>
                  분석이 완료되면 자동으로 리포트 페이지로 이동합니다.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: '16px', color: C.gray900 }}>
                  PDF를 이곳에 드래그하거나 클릭하여 업로드
                </div>
                <div style={{ color: C.gray500, marginTop: '8px', fontSize: '13px' }}>
                  ESG 지속가능경영 보고서 PDF · 최대 50MB · 한국어 권장
                </div>
              </>
            )}
            {uploadedFile && !isAnalyzing && (
              <div style={{
                marginTop: '16px', padding: '8px 16px',
                background: C.greenL, borderRadius: '8px', display: 'inline-flex',
                alignItems: 'center', gap: '8px', color: C.green, fontSize: '13px', fontWeight: 600,
              }}>
                <CheckCircle2 size={14} />
                {uploadedFile.name}
              </div>
            )}
          </div>
        </Dragger>
      </Card>

      {/* WebSocket 실시간 상태창 */}
      <WebSocketPanel
        wsStatus={wsStatus}
        isAnalyzing={isAnalyzing}
        onNavigate={handleNavigateToReport}
      />

      {/* 분석 완료 시 자동 라우팅 안내 */}
      {wsStatus === 'COMPLETE' && (
        <div style={{
          marginTop: '16px', padding: '14px 20px',
          background: C.greenL, borderRadius: '12px',
          color: C.green, fontWeight: 600, fontSize: '14px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <CheckCircle2 size={18} />
          분석이 완료되었습니다. 상단 버튼을 눌러 종합 리포트를 확인하세요.
        </div>
      )}
    </div>
  );
}
