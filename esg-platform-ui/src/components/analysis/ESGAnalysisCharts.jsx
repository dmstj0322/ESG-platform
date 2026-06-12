// // import React, { useMemo } from 'react';
// // import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from 'recharts';
// //
// // const ESGAnalysisCharts = ({ sections }) => {
// //   const chartData = useMemo(() => {
// //     if (!sections) return [];
// //     return sections.map(s => ({ subject: s.category, score: s.score }));
// //   }, [sections]);
// //
// //   if (chartData.length === 0) return null;
// //
// //   return (
// //     <div className="w-full">
// //       <h3 className="text-center text-2xl font-bold mb-8">항목별 ESG 성과 점수</h3>
// //       <ResponsiveContainer width="100%" aspect={1.8}>
// //         <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
// //           <PolarGrid />
// //           <PolarAngleAxis dataKey="subject" tick={{ fontSize: 16, fontWeight: 700 }} />
// //           <PolarRadiusAxis angle={30} domain={[0, 100]} />
// //           <Radar name="점수" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} />
// //           <Tooltip />
// //         </RadarChart>
// //       </ResponsiveContainer>
// //     </div>
// //   );
// // };
// //
// // export default ESGAnalysisCharts;
//
// import React, { useMemo } from 'react';
// import {
//     Radar, RadarChart, PolarGrid,
//     PolarAngleAxis, PolarRadiusAxis,
//     Tooltip, ResponsiveContainer
// } from 'recharts';
//
// const ESGAnalysisCharts = ({ sections }) => {
//
//     const chartData = useMemo(() => {
//         if (!sections || !Array.isArray(sections)) return [];
//         return sections.map(s => ({
//             subject: s.category,
//             score: s.score,
//             fullMark: 100,
//         }));
//     }, [sections]);
//
//     if (chartData.length === 0) {
//         return (
//             <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
//                 데이터를 분석 중이거나 결과가 없습니다.
//             </div>
//         );
//     }
//
//     return (
//         <div style={{ width: '100%', background: '#fff', padding: '24px', borderRadius: '24px' }}>
//             <h3 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: '#1e1b4b' }}>
//                 지표별 ESG 성과 분석
//             </h3>
//             <ResponsiveContainer width="100%" aspect={1.5}>
//                 <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
//                     <PolarGrid stroke="#e2e8f0" />
//                     <PolarAngleAxis
//                         dataKey="subject"
//                         tick={{ fontSize: 14, fontWeight: 600, fill: '#475569' }}
//                     />
//                     <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 12 }} />
//                     <Radar
//                         name="ESG 점수"
//                         dataKey="score"
//                         stroke="#6366f1"
//                         fill="#818cf8"
//                         fillOpacity={0.6}
//                     />
//                     <Tooltip
//                         contentStyle={{
//                             borderRadius: '15px',
//                             border: 'none',
//                             boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
//                         }}
//                     />
//                 </RadarChart>
//             </ResponsiveContainer>
//         </div>
//     );
// };
//
// export default ESGAnalysisCharts;