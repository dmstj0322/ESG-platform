// import React, { useEffect, useState, useCallback, useRef } from 'react';
// import axios from 'axios';
// import { Card, Statistic, Spin, Typography, Input, Tag, Button, Upload, message, Divider } from 'antd';
// import { UploadOutlined, DownloadOutlined, CheckCircleFilled } from '@ant-design/icons';
// import { exportToPdf } from '../utils/analysisExporter';
//
// const { Title, Text } = Typography;
// const { Search } = Input;
//
// const Dashboard = () => {
//     const [companyId, setCompanyId] = useState(6);
//     const [stats, setStats] = useState([]);
//     const [loading, setLoading] = useState(true);
//     const [recentReport, setRecentReport] = useState(null);
//     const [isAnalyzing, setIsAnalyzing] = useState(false);
//
//     const analysisFinished = useRef(false);
//     const pollingTimer = useRef(null);
//
//     // 1. 데이터 및 통계 갱신
//     const fetchData = useCallback(async (id) => {
//         try {
//             setLoading(true);
//             const res = await axios.get(`http://localhost:8081/api/v1/analysis/stats/${id}`);
//             setStats(res.data || []);
//         } catch (e) { console.error(e); } finally { setLoading(false); }
//     }, []);
//
//     useEffect(() => { fetchData(companyId); }, [companyId, fetchData]);
//
//     // 2. 분석 완료 처리 (로딩 끄고 결과 반영)
//     const finalizeAnalysis = useCallback((reportData, isCache = false) => {
//         if (analysisFinished.current) return;
//         analysisFinished.current = true;
//
//         if (pollingTimer.current) clearInterval(pollingTimer.current);
//
//         setRecentReport(reportData);
//         setIsAnalyzing(false);
//         fetchData(companyId);
//
//         message.success(isCache ? "기존 분석 결과를 즉시 로드했습니다." : "ESG 분석이 완료되었습니다!");
//     }, [companyId, fetchData]);
//
//     // 3. 신규 파일 업로드 시 결과가 나올 때까지 반복 확인 (WebSocket 대안)
//     const startPollingResult = useCallback((id) => {
//         if (pollingTimer.current) clearInterval(pollingTimer.current);
//
//         console.log("신규 분석 감지: 결과를 가져오기 위해 폴링을 시작합니다.");
//         pollingTimer.current = setInterval(async () => {
//             try {
//                 // 백엔드에 현재 기업의 가장 최근 분석 리포트 1건을 요청하는 API가 있다고 가정
//                 // 없다면 stats/통계 API를 호출하여 데이터 변화를 감지해야 함
//                 const res = await axios.get(`http://localhost:8081/api/v1/analysis/latest/${id}`);
//
//                 if (res.data && res.data.fullReport) {
//                     // 데이터가 존재하면 분석 완료로 간주
//                     finalizeAnalysis(res.data, false);
//                 }
//             } catch (e) {
//                 console.log("아직 분석 중...");
//             }
//         }, 5000); // 5초마다 확인
//     }, [finalizeAnalysis]);
//
//     // 4. 업로드 설정
//     const uploadProps = {
//         name: 'file',
//         action: 'http://localhost:8081/api/v1/analysis/report',
//         headers: { 'X-UserId': '1', 'X-CompanyId': companyId.toString() },
//         onChange(info) {
//             if (info.file.status === 'uploading') {
//                 setIsAnalyzing(true);
//                 analysisFinished.current = false;
//                 setRecentReport(null); // 이전 결과 초기화
//             }
//
//             if (info.file.status === 'done') {
//                 const res = info.file.response;
//                 console.log("서버 응답:", res);
//
//                 // [중요] 응답에 결과가 바로 있으면 (Cache Hit) 즉시 반영
//                 if (res && (res.fullReport || (res.data && res.data.fullReport))) {
//                     finalizeAnalysis(res.data || res, true);
//                 } else {
//                     // [핵심] 신규 파일이라 응답에 결과가 없다면, 폴링 시작
//                     // 소켓이 안 되기 때문에 여기서 직접 결과를 찾으러 가야 함
//                     startPollingResult(companyId);
//
//                     // 만약 폴링 API가 마땅치 않다면, 강제로 35초 뒤 새로고침 (최후의 수단)
//                     setTimeout(() => {
//                         if (!analysisFinished.current) {
//                             fetchData(companyId);
//                             setIsAnalyzing(false);
//                             message.info("분석 시간이 초과되어 화면을 갱신합니다.");
//                         }
//                     }, 40000);
//                 }
//             }
//
//             if (info.file.status === 'error') {
//                 setIsAnalyzing(false);
//                 message.error("분석 서버 응답 오류");
//             }
//         },
//         showUploadList: false,
//     };
//
//     return (
//         <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans">
//             <header className="flex justify-between items-center mb-10">
//                 <Title level={2}>ESG 경영 분석 대시보드</Title>
//                 <div className="flex gap-3">
//                     <Search placeholder="ID 입력" enterButton onSearch={(v) => setCompanyId(parseInt(v))} className="w-48" />
//                     <Upload {...uploadProps}>
//                         <Button type="primary" danger icon={<UploadOutlined />} size="large" loading={isAnalyzing}>
//                             {isAnalyzing ? 'AI 분석 중...' : '새 리포트 분석 요청'}
//                         </Button>
//                     </Upload>
//                 </div>
//             </header>
//
//             <Spin spinning={loading || isAnalyzing} description={isAnalyzing ? "AI가 신규 리포트를 정밀 분석 중입니다 (약 30초)..." : ""}>
//                 <div className="grid grid-cols-4 gap-6 mb-10">
//                     {stats.map((item, index) => (
//                         <Card key={index} className="rounded-2xl border-none shadow-sm">
//                             <Statistic
//                                 title={`${item.grade} 등급`}
//                                 value={item.count}
//                                 suffix="건"
//                                 styles={{ content: { color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 4], fontWeight: 800 } }}
//                             />
//                         </Card>
//                     ))}
//                 </div>
//
//                 {recentReport && (
//                     <Card className="rounded-2xl border-none shadow-sm animate-fade-in">
//                         <Title level={4}><Tag color="blue" icon={<CheckCircleFilled />}>Latest</Tag> 분석 상세 결과</Title>
//                         <Divider />
//                         <div className="grid grid-cols-3 gap-8">
//                             <div className="col-span-2 p-6 bg-slate-50 rounded-2xl whitespace-pre-wrap leading-relaxed text-slate-700 border border-slate-100">
//                                 {recentReport.fullReport}
//                             </div>
//                             <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-3xl text-center border border-blue-100 flex flex-col justify-center">
//                                 <Text className="text-blue-600 mb-2">최종 ESG 등급</Text>
//                                 <Title level={1} className="!m-0 !text-blue-700 !text-7xl font-black">{recentReport.finalGrade}</Title>
//                                 <Button type="primary" className="mt-8 h-12 rounded-xl" onClick={() => exportToPdf(recentReport)}>PDF 저장</Button>
//                             </div>
//                         </div>
//                     </Card>
//                 )}
//             </Spin>
//         </div>
//     );
// };
//
// export default Dashboard;

// src/components/Dashboard.jsx

// import React, { useEffect, useState, useCallback } from 'react';
// import axios from 'axios';
// import { Card, Statistic, Spin, Typography, Input, Tag, Button, Upload, message, Divider } from 'antd';
// import { UploadOutlined, DownloadOutlined, CheckCircleFilled } from '@ant-design/icons';
// import { exportToPdf } from '../utils/analysisExporter';
// import ESGAnalysisCharts from './analysis/ESGAnalysisCharts';
//
// const { Title, Text } = Typography;
// const { Search } = Input;
//
// const Dashboard = () => {
//     const [companyId, setCompanyId] = useState(6);
//     const [stats, setStats] = useState([]);
//     const [loading, setLoading] = useState(true);
//     const [recentReport, setRecentReport] = useState(null);
//     const [isAnalyzing, setIsAnalyzing] = useState(false);
//
//     const fetchData = useCallback(async (id) => {
//         try {
//             setLoading(true);
//             const res = await axios.get(`http://localhost:8081/api/v1/analysis/stats/${id}`);
//             setStats(res.data || []);
//         } catch (e) { console.error(e); }
//         finally { setLoading(false); }
//     }, []);
//
//     useEffect(() => { fetchData(companyId); }, [companyId, fetchData]);
//
//     const uploadProps = {
//         name: 'file',
//         action: 'http://localhost:8081/api/v1/analysis/report',
//         headers: { 'X-UserId': '1', 'X-CompanyId': companyId.toString() },
//         onChange(info) {
//             if (info.file.status === 'uploading') setIsAnalyzing(true);
//             if (info.file.status === 'done') {
//                 setTimeout(async () => {
//                     try {
//                         const res = await axios.get(`http://localhost:8081/api/v1/analysis/latest/${companyId}`);
//                         if (res.data) {
//                             setRecentReport(res.data); // 이미 객체이므로 바로 저장
//                             fetchData(companyId);
//                             message.success("분석 완료!");
//                         }
//                     } catch (e) { message.error("데이터 로드 실패"); }
//                     finally { setIsAnalyzing(false); }
//                 }, 4000);
//             }
//         },
//         showUploadList: false,
//     };
//
//     return (
//         <div className="min-h-screen bg-slate-50 p-12">
//             <header className="flex justify-between items-center mb-10">
//                 <Title level={2}>ESG 경영 분석 대시보드</Title>
//                 <div className="flex gap-4">
//                     <Search placeholder="기업 ID" onSearch={(v) => setCompanyId(v)} className="w-48" />
//                     <Upload {...uploadProps}><Button type="primary" danger icon={<UploadOutlined />}>신규 분석</Button></Upload>
//                 </div>
//             </header>
//
//             <Spin spinning={loading || isAnalyzing}>
//                 <div className="grid grid-cols-4 gap-6 mb-12">
//                     {stats.map((item, index) => (
//                         <Card key={index}><Statistic title={`${item.grade} 등급`} value={item.count} suffix="건" /></Card>
//                     ))}
//                 </div>
//
//                 {recentReport && (
//                     <div className="space-y-12">
//                         {recentReport.sections && (
//                             <div className="bg-white p-10 rounded-[32px] shadow-sm">
//                                 <ESGAnalysisCharts sections={recentReport.sections} />
//                             </div>
//                         )}
//                         <Card className="rounded-[32px] shadow-xl overflow-hidden">
//                             <div className="p-10 bg-white">
//                                 <div className="flex justify-between items-center mb-8">
//                                     <Title level={3}>상세 분석 결과 요약</Title>
//                                     <Button type="primary" icon={<DownloadOutlined />} onClick={() => exportToPdf(recentReport)}>PDF 저장</Button>
//                                 </div>
//                                 <Divider />
//                                 <div className="grid grid-cols-3 gap-10">
//                                     <div className="col-span-2">
//                                         <div className="p-8 bg-slate-50 rounded-2xl whitespace-pre-wrap">{recentReport.fullReport}</div>
//                                     </div>
//                                     <div className="bg-indigo-600 p-10 rounded-[40px] text-center flex flex-col justify-center shadow-lg">
//                                         <Text className="text-white text-xl">종합 ESG 등급</Text>
//                                         <Title level={1} className="!text-white !text-8xl">{recentReport.finalGrade}</Title>
//                                     </div>
//                                 </div>
//                             </div>
//                         </Card>
//                     </div>
//                 )}
//             </Spin>
//         </div>
//     );
// };
//
// export default Dashboard;

import React, { useState, useCallback, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import api from '../../api/api';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Card, Spin, Typography, Input, Button, Upload, message, Empty, Row, Col, Statistic, Divider } from 'antd';
import { RocketFilled, FilePdfOutlined, ThunderboltFilled } from '@ant-design/icons';
import { marked } from 'marked';
import { exportESGReport } from './exportESGReport';
import ESGAnalysisCharts from './analysis/ESGAnalysisCharts';
import AnalysisStepProgress from './analysis/AnalysisStepProgress';
import CarbonBenchmarkChart from './analysis/CarbonBenchmarkChart';
import EvidenceTable from './analysis/EvidenceTable';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { Search } = Input;

const Dashboard = () => {
    // companyId: localStorage에서 복원, 없으면 기본값 9
    const [companyId, setCompanyId] = useState(() => {
        const saved = localStorage.getItem('companyId');
        return saved ? Number(saved) : 9;
    });
    const [loading, setLoading] = useState(false);
    const [recentReport, setRecentReport] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [wsStatus, setWsStatus] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [ecoPreview, setEcoPreview] = useState(null);
    const [benchmarkData, setBenchmarkData] = useState(null);
    const pollingTimer = useRef(null);
    const stompClient = useRef(null);
    const [carbonStats, setCarbonStats] = useState([]);
    const { user } = useAuth();

    const fetchEcoPreview = useCallback(async () => {
        try {
            const res = await axios.get('/analysis/eco/preview');
            setEcoPreview(res.data);
        } catch (e) {
            console.error('에코 포인트 미리보기 조회 실패:', e);
            setEcoPreview(null);
        }
    }, []);

    // Company 테이블 기반 자동 벤치마크 조회 (regionCode/ksicCode 하드코딩 제거)
    const fetchBenchmarkData = useCallback(async () => {
        try {
            const res = await axios.get(
                '/analysis/benchmark/company',
                { params: { year: new Date().getFullYear() } }
            );
            setBenchmarkData(res.data);
        } catch (e) {
            console.error('벤치마크 데이터 로드 실패:', e);
        }
    }, []);

    useEffect(() => {
        fetchEcoPreview();
        fetchBenchmarkData();
    }, [fetchEcoPreview, fetchBenchmarkData]);

    const fetchLatestData = useCallback(async () => {
        try {
            setLoading(true);
            const noCache = { headers: { 'Cache-Control': 'no-store, no-cache' }, params: { _t: Date.now() } };
            const [analysisRes, carbonRes] = await Promise.all([
                axios.get('/analysis/latest', noCache),
                axios.get('/analysis/carbon/stats', {
                    params: { year: new Date().getFullYear(), _t: Date.now() }
                }).catch(() => ({ data: [] })),
            ]);

            if (analysisRes.status === 200 && analysisRes.data) {
                const raw = analysisRes.data;
                let parsed = {};
                if (typeof raw.analysisResult === 'string') {
                    try { parsed = JSON.parse(raw.analysisResult); }
                    catch (e) { parsed = { fullReport: raw.analysisResult }; }
                } else {
                    parsed = raw.analysisResult || {};
                }
                setRecentReport({
                    finalGrade: raw.finalGrade || parsed?.finalGrade,
                    fullReport: marked(parsed?.fullReport || '리포트 내용이 없습니다.'),
                    sections: Array.isArray(parsed?.sections) ? parsed.sections : [],
                    evidenceMapping: Array.isArray(parsed?.evidenceMapping) ? parsed.evidenceMapping : [],
                    ecoPoints: parsed?.ecoPoints ?? null,
                    carbonReductionKg: parsed?.carbonReductionKg ?? null,
                    equivalentTrees: parsed?.equivalentTrees ?? null,
                });
                setCarbonStats(Array.isArray(carbonRes.data) ? carbonRes.data : []);
            }
            setIsAnalyzing(false);
            if (pollingTimer.current) clearTimeout(pollingTimer.current);
            // 분석 완료 후 에코 미리보기도 갱신
            fetchEcoPreview();
        } catch (e) {
            console.error('데이터 로드 에러:', e);
        } finally {
            setLoading(false);
        }
    }, [fetchEcoPreview]);

    useEffect(() => {
        fetchLatestData();
    }, [fetchLatestData]);

    const connectWebSocket = useCallback((id) => {
        if (stompClient.current) stompClient.current.deactivate();
        const client = new Client({
            webSocketFactory: () => new SockJS('http://localhost:8081/ws-esg'),
            reconnectDelay: 3000,
            onConnect: () => {
                client.subscribe(`/topic/analysis/${id}`, (msg) => {
                    const status = msg.body;
                    setWsStatus(status);
                    if (status === 'COMPLETE') {
                        setIsAnalyzing(false);
                        fetchLatestData(id);
                        if (pollingTimer.current) clearTimeout(pollingTimer.current);
                    }
                    if (status === 'FAILED') {
                        setIsAnalyzing(false);
                        if (pollingTimer.current) clearTimeout(pollingTimer.current);
                        message.error('분석 중 오류가 발생했습니다. 다시 시도해주세요.');
                    }
                });
                client.subscribe(`/topic/admin/alert`, (msg) => {
                    const alert = JSON.parse(msg.body);
                    message.warning({
                        content: `⚠️ 기업 ID ${alert.companyId} — ${alert.message} (포인트: ${alert.userPoints})`,
                        duration: 10,
                    });
                });
            },
            onStompError: (frame) => console.error('WebSocket 연결 오류:', frame),
        });
        client.activate();
        stompClient.current = client;
    }, [fetchLatestData]);

    // [F-304] PDF 익스포트
    const handleExportPDF = async () => {
        if (!recentReport) return;
        setIsExporting(true);
        try {
            await exportESGReport(
                recentReport,
                companyId,
                {},                          // metrics (미사용)
                {                            // companyInfo
                    name: benchmarkData?.companyName || `기업 ID ${companyId}`,
                    analysisYear: new Date().getFullYear(),
                    industry: benchmarkData?.industryName || '제조업',
                    region: benchmarkData?.regionName || '',
                    analysisRange: `${new Date().getFullYear()}년 1월 ~ 12월`,
                },
                carbonStats,
                benchmarkData              // ← RegionalBenchmarkDto 전체 전달
            );
            message.success('PDF 다운로드가 완료되었습니다.');
        } catch (e) {
            console.error('PDF 생성 에러:', e);
            message.error('PDF 생성 중 오류가 발생했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleEcoCommit = async () => {
        if (isAnalyzing) return;
        setIsAnalyzing(true);
        setWsStatus(null);
        setRecentReport(null);

        connectWebSocket(companyId);
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            await api.post('/analysis/eco/commit');
            message.success('성과 확정 처리가 시작됩니다. AI가 재분석을 수행합니다...');
            pollingTimer.current = setTimeout(() => {
                fetchLatestData();
                setIsAnalyzing(false);
            }, 30000);
        } catch (e) {
            message.error('성과 확정 실패: ' + (e.response?.data?.message || e.message));
            setIsAnalyzing(false);
            setWsStatus(null);
        }
    };

    const handleUpload = async (options) => {
        const { file, onSuccess, onError } = options;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('companyId', companyId);

        setIsAnalyzing(true);
        setWsStatus(null);
        setRecentReport(null);

        connectWebSocket(companyId);
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            await api.post('/analysis/report', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            message.success('PDF 업로드 성공! 분석을 시작합니다.');
            onSuccess("ok");
            pollingTimer.current = setTimeout(() => {
                fetchLatestData();
                setIsAnalyzing(false);
            }, 20000);
        } catch (e) {
            message.error('업로드 실패: ' + (e.response?.data?.message || e.message));
            setIsAnalyzing(false);
            setWsStatus(null);
            onError(e);
        }
    };

    return (
        <div style={{ padding: '40px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <Title level={2}>ESG 실시간 분석 대시보드</Title>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Search
                        placeholder="기업 ID"
                        onSearch={(v) => {
                            const id = Number(v);
                            localStorage.setItem('esg_companyId', String(id));
                            setCompanyId(id);
                        }}
                        style={{ width: 180 }}
                        defaultValue={companyId}
                    />
                    <Upload customRequest={handleUpload} showUploadList={false}>
                        <Button type="primary" size="large" icon={<RocketFilled />} loading={isAnalyzing}>
                            {isAnalyzing ? "AI 분석 진행 중..." : "새 보고서 분석"}
                        </Button>
                    </Upload>
                    {recentReport && (
                        <Button
                            size="large"
                            icon={<FilePdfOutlined />}
                            loading={isExporting}
                            onClick={handleExportPDF}
                            style={{ borderColor: '#6366f1', color: '#6366f1' }}
                        >
                            {isExporting ? "PDF 생성 중..." : "리포트 PDF 저장"}
                        </Button>
                    )}
                </div>
            </div>

            {/* 에코 포인트 성과 확정 위젯 */}
            {ecoPreview && (
                <Card
                    style={{
                        marginBottom: '24px',
                        background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                        border: '1px solid #6ee7b7',
                        borderRadius: '20px',
                    }}
                    bodyStyle={{ padding: '20px 28px' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Text strong style={{ fontSize: '16px', color: '#065f46', display: 'block', marginBottom: '16px' }}>
                                🌿 반영 예정 에코 포인트 성과
                            </Text>
                            <div style={{ display: 'flex', gap: '40px' }}>
                                <Statistic
                                    title={<span style={{ color: '#047857' }}>에코 포인트</span>}
                                    value={ecoPreview.ecoPoints}
                                    suffix="EP"
                                    valueStyle={{ color: '#065f46', fontWeight: 700 }}
                                />
                                <Statistic
                                    title={<span style={{ color: '#047857' }}>탄소 절감량</span>}
                                    value={ecoPreview.carbonReductionKg}
                                    suffix="kg CO₂"
                                    precision={1}
                                    valueStyle={{ color: '#065f46', fontWeight: 700 }}
                                />
                                <Statistic
                                    title={<span style={{ color: '#047857' }}>소나무 환산</span>}
                                    value={ecoPreview.equivalentTrees}
                                    suffix="그루"
                                    precision={1}
                                    valueStyle={{ color: '#065f46', fontWeight: 700 }}
                                />
                                <Statistic
                                    title={<span style={{ color: '#047857' }}>E 점수 보정</span>}
                                    value={`+${ecoPreview.eBonus}`}
                                    suffix="점"
                                    valueStyle={{ color: '#059669', fontWeight: 700 }}
                                />
                                <Statistic
                                    title={<span style={{ color: '#047857' }}>S 점수 보정</span>}
                                    value={`+${ecoPreview.sBonus}`}
                                    suffix="점"
                                    valueStyle={{ color: '#059669', fontWeight: 700 }}
                                />
                            </div>
                        </div>
                        <Button
                            size="large"
                            icon={<ThunderboltFilled />}
                            loading={isAnalyzing}
                            disabled={isAnalyzing || (ecoPreview.ecoPoints === 0)}
                            onClick={handleEcoCommit}
                            style={{
                                background: '#059669',
                                borderColor: '#059669',
                                color: '#fff',
                                borderRadius: '14px',
                                height: '52px',
                                padding: '0 28px',
                                fontSize: '15px',
                                fontWeight: 700,
                            }}
                        >
                            {isAnalyzing ? 'AI 재분석 중...' : '성과 확정 및 반영'}
                        </Button>
                    </div>
                </Card>
            )}

            <AnalysisStepProgress wsStatus={wsStatus} />

            <Spin spinning={loading} description="데이터를 불러오는 중...">
                {recentReport ? (
                    <div>
                        <Row gutter={[32, 32]}>
                            <Col span={10}>
                                <Card style={{ borderRadius: '24px', minHeight: '500px', display: 'flex', alignItems: 'center' }}>
                                    {recentReport.sections?.length > 0 ? (
                                        <ESGAnalysisCharts sections={recentReport.sections} />
                                    ) : (
                                        <Empty description="차트 데이터를 파싱 중입니다..." />
                                    )}
                                </Card>
                            </Col>
                            <Col span={14}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <Card style={{
                                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                        borderRadius: '24px',
                                        border: 'none',
                                    }}>
                                        <Text style={{ color: '#e0e7ff', fontSize: '18px' }}>최종 ESG 평가 등급</Text>
                                        <Title level={1} style={{ color: '#fff', fontSize: '80px', margin: '10px 0' }}>
                                            {recentReport.finalGrade}
                                        </Title>
                                        {recentReport.equivalentTrees != null && (
                                            <>
                                                <Divider style={{ borderColor: 'rgba(255,255,255,0.3)', margin: '8px 0' }} />
                                                <Text style={{ color: '#d1fae5', fontSize: '15px', display: 'block' }}>
                                                    🌲 소나무 {recentReport.equivalentTrees}그루 식재 효과
                                                </Text>
                                                <Text style={{ color: '#a7f3d0', fontSize: '13px', display: 'block', marginTop: '4px' }}>
                                                    탄소 {recentReport.carbonReductionKg} kg 절감 ({Number(recentReport.ecoPoints).toLocaleString()} EP)
                                                </Text>
                                            </>
                                        )}
                                    </Card>
                                    <Card title="🔍 AI 상세 분석 요약" style={{ borderRadius: '24px' }}>
                                        <div
                                            style={{ maxHeight: '500px', overflowY: 'auto', lineHeight: '1.8' }}
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(recentReport.fullReport) }}
                                        />
                                    </Card>
                                </div>
                            </Col>
                        </Row>
                    </div>
                ) : (
                    !isAnalyzing && (
                        <div style={{ textAlign: 'center', marginTop: '100px' }}>
                            <Empty description="데이터가 없습니다. 상단 버튼을 눌러 PDF를 업로드해 주세요." />
                        </div>
                    )
                )}
            </Spin>

            {/* F-303 데이터 출처 정밀 매핑 (Evidence Mapping) */}
            {recentReport?.evidenceMapping?.length > 0 && (
                <Card
                    title="📋 데이터 출처 정밀 매핑 — F-303 Source Attribution"
                    style={{ borderRadius: '24px', marginTop: '32px' }}
                    headStyle={{ fontSize: '15px', fontWeight: 700 }}
                    extra={
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>
                            React Table • {recentReport.evidenceMapping.length}개 지표 · 클릭 정렬 · 키워드 검색 지원
                        </span>
                    }
                >
                    <EvidenceTable data={recentReport.evidenceMapping} />
                </Card>
            )}

            {/* 탄소 배출 지역 벤치마크 섹션 */}
            {benchmarkData && (
                <Card
                    title="📊 탄소 배출 지역 벤치마크 — 우리 기업 vs 지역 평균"
                    style={{ borderRadius: '24px', marginTop: '32px' }}
                    headStyle={{ fontSize: '16px', fontWeight: 700 }}
                >
                    <CarbonBenchmarkChart data={benchmarkData} />
                </Card>
            )}

            <style>{`
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: center; }
                th { background: #f8fafc; font-weight: 600; }
            `}</style>
        </div>
    );
};

export default Dashboard;