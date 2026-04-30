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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Card, Statistic, Spin, Typography, Input, Tag, Button, Upload, message, Divider } from 'antd';
import { UploadOutlined, DownloadOutlined, CheckCircleFilled } from '@ant-design/icons';
import { exportToPdf } from '../utils/analysisExporter';

const { Title, Text } = Typography;
const { Search } = Input;

const Dashboard = () => {
    const [companyId, setCompanyId] = useState(6);
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recentReport, setRecentReport] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const fetchData = useCallback(async (id) => {
        try {
            setLoading(true);
            const res = await axios.get(`http://localhost:8081/api/v1/analysis/stats/${id}`);
            setStats(res.data || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(companyId); }, [companyId, fetchData]);

    const uploadProps = {
        name: 'file',
        action: 'http://localhost:8081/api/v1/analysis/report',
        headers: { 'X-UserId': '1', 'X-CompanyId': companyId.toString() },
        onChange(info) {
            if (info.file.status === 'uploading') setIsAnalyzing(true);
            if (info.file.status === 'done') {
                setIsAnalyzing(false);
                setRecentReport(info.file.response);
                fetchData(companyId);
                message.success("분석이 완료되었습니다!");
            }
            if (info.file.status === 'error') {
                setIsAnalyzing(false);
                message.error("분석 중 오류가 발생했습니다.");
            }
        },
        showUploadList: false,
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans">
            <header className="flex justify-between items-center mb-10">
                <div>
                    <Title level={2} className="!m-0">ESG 경영 분석 대시보드</Title>
                    <Text className="text-slate-500">실시간 등급 통계 및 심층 분석 리포트</Text>
                </div>
                <div className="flex gap-3">
                    <Search placeholder="기업 ID" onSearch={(v) => setCompanyId(parseInt(v))} className="w-40" />
                    <Upload {...uploadProps}>
                        <Button type="primary" danger icon={<UploadOutlined />} size="large" loading={isAnalyzing}>
                            {isAnalyzing ? 'AI 분석 중...' : '신규 리포트 분석'}
                        </Button>
                    </Upload>
                </div>
            </header>

            <Spin spinning={loading || isAnalyzing} tip="데이터를 불러오는 중...">
                {/* 통계 카드 섹션 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                    {stats.map((item, index) => (
                        <Card key={index} className="rounded-2xl border-none shadow-sm">
                            <Statistic title={`${item.grade} 등급`} value={item.count} suffix="건" />
                        </Card>
                    ))}
                </div>

                {/* 상세 분석 결과 요약 섹션 (줄글 형식) */}
                {recentReport && (
                    <Card className="rounded-2xl border-none shadow-md overflow-hidden animate-fade-in">
                        <div className="bg-white p-8">
                            <div className="flex justify-between items-center mb-6">
                                <Title level={4} className="!m-0">
                                    <Tag color="blue" icon={<CheckCircleFilled />} className="py-1 px-3 text-sm">Latest</Tag>
                                    상세 분석 결과 요약
                                </Title>
                                <Button
                                    type="primary"
                                    icon={<DownloadOutlined />}
                                    onClick={() => exportToPdf(recentReport)}
                                    className="bg-green-600 hover:bg-green-700 border-none"
                                >
                                    리포트 PDF 저장
                                </Button>
                            </div>
                            <Divider className="my-0 mb-8" />

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                {/* 전문가 총평 (줄글) */}
                                <div className="lg:col-span-2">
                                    <Text strong className="text-lg block mb-4">전문가 총평</Text>
                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 text-lg leading-relaxed whitespace-pre-wrap">
                                        {recentReport.fullReport}
                                    </div>
                                </div>

                                {/* 등급 표시 카드 */}
                                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-center flex flex-col justify-center shadow-lg">
                                    <Text className="text-blue-100 text-lg mb-2">종합 ESG 등급</Text>
                                    <Title level={1} className="!m-0 !text-white !text-8xl font-black">
                                        {recentReport.finalGrade}
                                    </Title>
                                    <div className="mt-6 py-2 px-4 bg-white/20 rounded-full text-white text-sm inline-block mx-auto">
                                        실시간 AI 평가 완료
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                )}
            </Spin>
        </div>
    );
};

export default Dashboard;