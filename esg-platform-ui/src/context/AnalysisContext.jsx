import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import api from '../api/api';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { marked } from 'marked';

const AnalysisContext = createContext(null);
export const BASE_URL = 'http://localhost:8081/';

const LS_REPORT_CACHE = 'esg_report_cache';

// ── K-ESG 가이드라인 (산업통상자원부, 2021) 공식 가중치 ─────────────
export const K_ESG_WEIGHTS = Object.freeze({ E: 0.40, S: 0.30, G: 0.30 });

// K-ESG 등급 기준 (100점 만점)
export const K_ESG_GRADE_THRESHOLDS = Object.freeze({ S: 90, A: 75, B: 60, C: 40 });

// ── 2021~2024 한국 업종별 연간 탄소 배출 기준값 (tCO₂eq, 중소기업 500인) ──
export const KSIC_CARBON_ANNUAL_AVG = Object.freeze({
  '26': 280,
  '24': 520,
  '20': 450,
  '23': 480,
  '29': 310,
  '30': 380,
  '13': 260,
  '10': 290,
  '62': 180,
  '64': 210,
  '35': 620,
  '19': 580,
  '21': 320,
  '25': 340,
  '28': 300,
  '17': 240,
  '22': 270,
  '33': 220,
  '46': 190,
  '47': 170,
});
export const KSIC_CARBON_DEFAULT_AVG = 350;

// ── 정량(탄소절감) + 정성(AI 분석) 통합 최종 등급 산출 ──────────────
export const computeKEsgGrade = (sections = [], carbonReductionKg = 0) => {
  if (!sections.length) return null;
  const eScore = sections.find(s => s.category === 'Environment')?.score ?? 0;
  const sScore = sections.find(s => s.category === 'Social')?.score ?? 0;
  const gScore = sections.find(s => s.category === 'Governance')?.score ?? 0;
  const qualScore = eScore * K_ESG_WEIGHTS.E + sScore * K_ESG_WEIGHTS.S + gScore * K_ESG_WEIGHTS.G;
  const quantBonus = Math.min(3, Math.floor((carbonReductionKg ?? 0) / 1000));
  const finalScore = Math.min(100, Math.max(0, qualScore + quantBonus));
  if (finalScore >= K_ESG_GRADE_THRESHOLDS.S) return 'S';
  if (finalScore >= K_ESG_GRADE_THRESHOLDS.A) return 'A';
  if (finalScore >= K_ESG_GRADE_THRESHOLDS.B) return 'B';
  if (finalScore >= K_ESG_GRADE_THRESHOLDS.C) return 'C';
  return 'D';
};

export function AnalysisProvider({ children }) {
  const [companyId, setCompanyId] = useState(() => {
    const saved = localStorage.getItem('companyId');
    return saved ? Number(saved) : 1;
  });
  const [companyProfileName, setCompanyProfileName] = useState(() =>
    localStorage.getItem('esg_companyName') || null
  );
  const [latestReport, setLatestReport] = useState(null);
  const [ecoPreview, setEcoPreview]     = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [carbonStats, setCarbonStats]   = useState([]);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [wsStatus, setWsStatus]         = useState(null);
  const stompClientRef = useRef(null);

  const fetchLatestData = useCallback(async () => {
    try {
      const noCache = { headers: { 'Cache-Control': 'no-store, no-cache' }, params: { _t: Date.now() } };
      const [analysisRes, carbonRes] = await Promise.all([
        api.get('/analysis/latest', noCache),
        api.get('/analysis/carbon/stats', {
          params: { year: new Date().getFullYear(), _t: Date.now() },
        }).catch(() => ({ data: [] })),
      ]);
      if (analysisRes.status === 200 && analysisRes.data) {
        const raw = analysisRes.data;
        let parsed = {};
        if (typeof raw.analysisResult === 'string') {
          try { parsed = JSON.parse(raw.analysisResult); } catch { parsed = {}; }
        } else {
          parsed = raw.analysisResult || {};
        }

        const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
        const carbonReductionKg = parsed?.carbonReductionKg ?? null;

        const finalGrade = raw.finalGrade || parsed?.finalGrade
          || computeKEsgGrade(sections, carbonReductionKg);

        // 기업명 우선순위: AI 추출 → 원시 응답 → 프로필(localStorage) → null
        const companyName = parsed?.companyName
          || raw.companyName
          || localStorage.getItem('esg_companyName')
          || null;
        if (companyName) {
          localStorage.setItem('esg_companyName', companyName);
          setCompanyProfileName(companyName);
        }

        // subIndicators의 pageNumber로 evidenceMapping 페이지 번호 보완
        const allSubs = sections.flatMap(s => s.subIndicators || []);
        const subPageByCode = Object.fromEntries(
          allSubs
            .filter(s => s.kesgCode && s.pageNumber > 0)
            .map(s => [s.kesgCode, s.pageNumber])
        );

        const reportPayload = {
          finalGrade,
          companyName,
          fullReport:      marked(parsed?.fullReport || '분석 리포트가 없습니다.'),
          _rawFullReport:  parsed?.fullReport || '',
          sections,
          evidenceMapping: Array.isArray(parsed?.evidenceMapping)
            ? parsed.evidenceMapping.map(e => {
                const rawPage = e.page ?? e.page_number ?? e.pageNumber ?? null;
                const page = (rawPage != null && Number(rawPage) > 0)
                  ? Number(rawPage)
                  : (e.kesgCode ? (subPageByCode[e.kesgCode] ?? null) : null);
                return {
                  ...e,
                  page,
                  confidenceScore: typeof e.confidenceScore === 'number'
                    ? Math.round(e.confidenceScore)
                    : typeof e.confidence === 'number'
                      ? Math.round(e.confidence)
                      : (e.reliabilityScore ?? 0),
                };
              })
            : [],
          overallOpinion:    parsed?.overallOpinion  || '',
          riskOpportunity:   parsed?.riskOpportunity || '',
          ecoPoints:         parsed?.ecoPoints         ?? null,
          carbonReductionKg,
          equivalentTrees:   parsed?.equivalentTrees   ?? null,
        };

        setLatestReport(reportPayload);

        // 성공 시 localStorage에 캐싱 (네트워크 오류 시 fallback으로 사용)
        try {
          localStorage.setItem(LS_REPORT_CACHE, JSON.stringify(reportPayload));
        } catch {}

        setCarbonStats(Array.isArray(carbonRes.data) ? carbonRes.data : []);
      }
    } catch (e) {
      console.error('데이터 로드 실패:', e);
      // localStorage 캐시에서 복구 시도
      try {
        const cached = JSON.parse(localStorage.getItem(LS_REPORT_CACHE) || 'null');
        if (cached?.sections?.length) {
          setLatestReport({
            ...cached,
            fullReport: cached._rawFullReport
              ? marked(cached._rawFullReport)
              : cached.fullReport || '분석 리포트가 없습니다.',
          });
          if (cached.companyName) {
            setCompanyProfileName(cached.companyName);
            localStorage.setItem('esg_companyName', cached.companyName);
          }
        }
      } catch {}
    }
  }, []);

  const fetchEcoPreview = useCallback(async () => {
    try {
      const res = await api.get('/analysis/eco/preview');
      setEcoPreview(res.data);
    } catch { setEcoPreview(null); }
  }, []);

  const fetchBenchmarkData = useCallback(async () => {
    try {
      const res = await api.get('/analysis/benchmark/company', {
        params: { year: new Date().getFullYear() },
      });
      setBenchmarkData(res.data);
      if (res.data?.companyName) {
        localStorage.setItem('esg_companyName', res.data.companyName);
        setCompanyProfileName(res.data.companyName);
      }
    } catch { setBenchmarkData(null); }
  }, []);

  const saveCompanyProfile = useCallback(async ({ regionCode, ksicCode, employeeCount }) => {
    await api.post('/analysis/benchmark/company/profile', { regionCode, ksicCode, employeeCount });
    localStorage.setItem('esg_regionCode',    regionCode);
    localStorage.setItem('esg_ksicCode',      ksicCode);
    localStorage.setItem('esg_employeeCount', String(employeeCount));
    // 저장 직후 벤치마크 재조회
    try {
      const res = await api.get('/analysis/benchmark/company', {
        params: { year: new Date().getFullYear() },
      });
      setBenchmarkData(res.data);
    } catch { setBenchmarkData(null); }
  }, []);

  const connectWebSocket = useCallback((id, onComplete, onFailed) => {
    if (stompClientRef.current) stompClientRef.current.deactivate();
    const client = new Client({
      webSocketFactory: () => new SockJS(`${BASE_URL}/ws-esg`),
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/analysis/${id}`, (msg) => {
          const status = msg.body;
          setWsStatus(status);
          if (status === 'COMPLETE') {
            setIsAnalyzing(false);
            fetchLatestData(id);
            onComplete?.();
          }
          if (status === 'FAILED') {
            setIsAnalyzing(false);
            onFailed?.();
          }
        });
        client.subscribe('/topic/admin/alert', (msg) => {
          console.warn('[Admin Alert]', JSON.parse(msg.body));
        });
      },
      onStompError: (frame) => console.error('WS 오류:', frame),
    });
    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, [fetchLatestData]);

  const setCompanyIdPersisted = useCallback((id) => {
    localStorage.setItem('companyId', String(id));
    setCompanyId(id);
  }, []);

  const value = {
    companyId, setCompanyId: (id) => { localStorage.setItem('companyId', id); setCompanyId(id); },
    companyProfileName,
    latestReport, setLatestReport,
    ecoPreview, setEcoPreview,
    benchmarkData,
    carbonStats,
    isAnalyzing, setIsAnalyzing,
    wsStatus, setWsStatus,
    fetchLatestData, fetchEcoPreview, fetchBenchmarkData, saveCompanyProfile,
    connectWebSocket,
    K_ESG_WEIGHTS,
    KSIC_CARBON_ANNUAL_AVG,
    KSIC_CARBON_DEFAULT_AVG,
  };

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export const useAnalysis = () => {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be inside AnalysisProvider');
  return ctx;
};
