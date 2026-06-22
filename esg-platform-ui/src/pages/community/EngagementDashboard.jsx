import React, { useState } from 'react';
import {
  PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Users, TrendingUp, AlertCircle, Award } from 'lucide-react';

const mockData = [
  { id: 1, name: '김동현', activities: 24, points: 2400, tier: 'High' },
  { id: 2, name: '이서연', activities: 21, points: 2100, tier: 'High' },
  { id: 3, name: '박지훈', activities: 19, points: 1900, tier: 'High' },
  { id: 4, name: '최유진', activities: 18, points: 1800, tier: 'High' },
  { id: 5, name: '정민수', activities: 12, points: 1200, tier: 'Medium' },
  { id: 6, name: '강수진', activities: 14, points: 1400, tier: 'Medium' },
  { id: 7, name: '조현우', activities: 9, points: 900, tier: 'Medium' },
  { id: 8, name: '윤아영', activities: 11, points: 1100, tier: 'Medium' },
  { id: 9, name: '장동건', activities: 8, points: 800, tier: 'Medium' },
  { id: 10, name: '임나은', activities: 13, points: 1300, tier: 'Medium' },
  { id: 11, name: '한우진', activities: 7, points: 700, tier: 'Medium' },
  { id: 12, name: '오세훈', activities: 10, points: 1000, tier: 'Medium' },
  { id: 13, name: '신지아', activities: 6, points: 600, tier: 'Medium' },
  { id: 14, name: '권준호', activities: 11, points: 1100, tier: 'Medium' },
  { id: 15, name: '황보람', activities: 2, points: 200, tier: 'Low' },
  { id: 16, name: '백승기', activities: 0, points: 0, tier: 'Low' },
  { id: 17, name: '송지은', activities: 3, points: 300, tier: 'Low' },
  { id: 18, name: '안도현', activities: 1, points: 100, tier: 'Low' },
  { id: 19, name: '양선영', activities: 4, points: 400, tier: 'Low' },
  { id: 20, name: '배성민', activities: 0, points: 0, tier: 'Low' },
];

const COLORS = { High: '#10b981', Medium: '#3b82f6', Low: '#ef4444' };

export default function App() {
  const [filterTier, setFilterTier] = useState('All');

  const pieData = [
    { name: '우수 (High)', value: mockData.filter(d => d.tier === 'High').length, color: COLORS.High },
    { name: '보통 (Medium)', value: mockData.filter(d => d.tier === 'Medium').length, color: COLORS.Medium },
    { name: '저조 (Low)', value: mockData.filter(d => d.tier === 'Low').length, color: COLORS.Low },
  ];

  const groupedData = Object.values(
    mockData.reduce((acc, curr) => {
      const key = `${curr.activities}_${curr.points}`;
      if (!acc[key]) {
        acc[key] = { ...curr, name: curr.name, count: 1 };
      } else {
        acc[key].name += `, ${curr.name}`; // 이름 이어붙이기
        acc[key].count += 1;               // 겹친 인원수 증가
      }
      return acc;
    }, {})
  );

  const scatterData = groupedData.map(d => ({ ...d, fill: COLORS[d.tier] }));
  const filteredData = filterTier === 'All' ? mockData : mockData.filter(d => d.tier === filterTier);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
          <p className="font-bold text-gray-800">{data.name}
            {data.count > 1 && <span className="text-blue-600 ml-2 text-sm">({data.count}명)</span>}
          </p>
          <p className="text-sm text-gray-600">참여 횟수: <span className="font-semibold text-green-600">{data.activities}회</span></p>
          <p className="text-sm text-gray-600">획득 포인트: <span className="font-semibold text-blue-600">{data.points} P</span></p>
          <div className="mt-2 text-xs font-bold px-2 py-1 rounded inline-block"
            style={{ backgroundColor: `${COLORS[data.tier]}20`, color: COLORS[data.tier] }}>
            {data.tier} Engagement
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="text-green-600" />
          임직원 ESG 참여도 대시보드
        </h1>
        <p className="text-gray-500 mt-1 text-sm">전사 임직원의 ESG 활동 내역 및 참여 수준을 한눈에 모니터링합니다.</p>
      </div>

      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">전체 대상자</p>
            <p className="text-2xl font-bold text-gray-800">20<span className="text-sm font-normal text-gray-500 ml-1">명</span></p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Award size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">평균 참여 횟수</p>
            <p className="text-2xl font-bold text-gray-800">9.4<span className="text-sm font-normal text-gray-500 ml-1">회</span></p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">실질 참여율 (1회 이상)</p>
            <p className="text-2xl font-bold text-gray-800">90<span className="text-sm font-normal text-gray-500 ml-1">%</span></p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">독려 필요 대상 (0회)</p>
            <p className="text-2xl font-bold text-gray-800">2<span className="text-sm font-normal text-gray-500 ml-1">명</span></p>
          </div>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 flex flex-col justify-between">
          <h2 className="text-lg font-bold text-gray-800 mb-2">참여 수준별 그룹 비율</h2>
          <div className="w-full h-56 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="45%"
                  innerRadius={60} outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}명`, '인원']} />
                <Legend verticalAlign="bottom" height={30} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 text-center mt-2 border-t border-gray-50 pt-3">
            우수(상위 20%), 보통(중위 50%), 저조(하위 30%)
          </p>
        </div>

        {/* 산점도 차트 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 lg:col-span-2">
          <h2 className="text-lg font-bold text-gray-800 mb-4">직원별 활동량 및 포인트 분포도</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis type="number" dataKey="activities" name="참여 횟수" unit="회" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                <YAxis type="number" dataKey="points" name="포인트" unit="P" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="직원" data={scatterData} fillOpacity={0.7} stroke="#ffffff" strokeWidth={1} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 text-right mt-2">* 각 점은 직원 1명을 의미하며, 마우스를 올리면 상세 정보가 나타납니다.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
          <h2 className="text-lg font-bold text-gray-800">임직원 상세 데이터</h2>
          <div className="flex gap-2">
            {['All', 'High', 'Medium', 'Low'].map(tier => (
              <button
                key={tier}
                onClick={() => setFilterTier(tier)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${filterTier === tier
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {tier === 'All' ? '전체 보기' : tier}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-4 text-center">이름</th>
                <th className="px-6 py-4 text-center">참여 횟수</th>
                <th className="px-6 py-4 text-center">누적 포인트</th>
                <th className="px-6 py-4 text-center">참여 등급</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredData.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-800 text-center">{row.name}</td>
                  <td className="px-6 py-4 text-center text-gray-600">{row.activities}회</td>
                  <td className="px-6 py-4 text-center font-medium text-blue-600">{row.points.toLocaleString()} P</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 text-xs font-bold rounded-md ${row.tier === 'High' ? 'bg-green-100 text-green-700' :
                        row.tier === 'Medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-red-700'
                      }`}>
                      {row.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// import React, { useState, useEffect } from 'react';
// import {
//   PieChart, Pie, Cell,
//   ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
// } from 'recharts';
// import { Users, TrendingUp, AlertCircle, Award } from 'lucide-react';
// import api from '../../api/api'; // 🌟 api 경로를 프로젝트에 맞게 수정해주세요!

// const COLORS = { High: '#10b981', Medium: '#3b82f6', Low: '#ef4444' };

// export default function EngagementDashboard() {
//   // 🌟 실제 데이터를 담을 State
//   const [dashboardData, setDashboardData] = useState([]);
//   const [filterTier, setFilterTier] = useState('All');
//   const [isLoading, setIsLoading] = useState(true);

//   // 🌟 1. 컴포넌트 마운트 시 백엔드 API 호출
//   useEffect(() => {
//     const fetchStats = async () => {
//       try {
//         const response = await api.get('/admin/engagement');
//         setDashboardData(response.data);
//       } catch (error) {
//         console.error("통계 데이터를 불러오지 못했습니다.", error);
//       } finally {
//         setIsLoading(false);
//       }
//     };
//     fetchStats();
//   }, []);

//   // 🌟 2. 상단 요약 카드를 위한 실시간 통계 계산
//   const totalEmployees = dashboardData.length;
//   const totalActivities = dashboardData.reduce((sum, d) => sum + d.activities, 0);
//   const avgActivities = totalEmployees > 0 ? (totalActivities / totalEmployees).toFixed(1) : 0;
//   const activeEmployees = dashboardData.filter(d => d.activities > 0).length;
//   const activeRate = totalEmployees > 0 ? Math.round((activeEmployees / totalEmployees) * 100) : 0;
//   const inactiveCount = dashboardData.filter(d => d.activities === 0).length;

//   // 🌟 3. 차트용 데이터 가공
//   const pieData = [
//     { name: '우수 (High)', value: dashboardData.filter(d => d.tier === 'High').length, color: COLORS.High },
//     { name: '보통 (Medium)', value: dashboardData.filter(d => d.tier === 'Medium').length, color: COLORS.Medium },
//     { name: '저조 (Low)', value: dashboardData.filter(d => d.tier === 'Low').length, color: COLORS.Low },
//   ];

//   const scatterData = dashboardData.map(d => ({
//     ...d,
//     fill: COLORS[d.tier]
//   }));

//   const filteredData = filterTier === 'All' ? dashboardData : dashboardData.filter(d => d.tier === filterTier);

//   // 커스텀 툴팁 (산점도용 - 부서 정보 삭제)
//   const CustomTooltip = ({ active, payload }) => {
//     if (active && payload && payload.length) {
//       const data = payload[0].payload;
//       return (
//         <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
//           <p className="font-bold text-gray-800">{data.name}</p>
//           <p className="text-sm text-gray-600">참여 횟수: <span className="font-semibold text-green-600">{data.activities}회</span></p>
//           <p className="text-sm text-gray-600">획득 포인트: <span className="font-semibold text-blue-600">{data.points} P</span></p>
//           <div className="mt-2 text-xs font-bold px-2 py-1 rounded inline-block"
//                style={{ backgroundColor: `${COLORS[data.tier]}20`, color: COLORS[data.tier] }}>
//             {data.tier} Engagement
//           </div>
//         </div>
//       );
//     }
//     return null;
//   };

//   // 로딩 중 화면 처리
//   if (isLoading) {
//     return (
//       <div className="flex justify-center items-center min-h-screen bg-gray-50 text-green-600 font-bold text-lg">
//         데이터를 분석하는 중입니다... 🌱
//       </div>
//     );
//   }

//   return (
//     <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen font-sans">
//       <div className="mb-8">
//         <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
//           <TrendingUp className="text-green-600" />
//           임직원 ESG 참여도 대시보드
//         </h1>
//         <p className="text-gray-500 mt-1 text-sm">전사 임직원의 ESG 활동 내역 및 참여 수준을 한눈에 모니터링합니다.</p>
//       </div>

//       {/* 상단 요약 카드 (동적 데이터 적용) */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
//         <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
//           <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24} /></div>
//           <div>
//             <p className="text-sm text-gray-500 font-medium">전체 대상자</p>
//             <p className="text-2xl font-bold text-gray-800">{totalEmployees}<span className="text-sm font-normal text-gray-500 ml-1">명</span></p>
//           </div>
//         </div>
//         <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
//           <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Award size={24} /></div>
//           <div>
//             <p className="text-sm text-gray-500 font-medium">평균 참여 횟수</p>
//             <p className="text-2xl font-bold text-gray-800">{avgActivities}<span className="text-sm font-normal text-gray-500 ml-1">회</span></p>
//           </div>
//         </div>
//         <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
//           <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={24} /></div>
//           <div>
//             <p className="text-sm text-gray-500 font-medium">실질 참여율 (1회 이상)</p>
//             <p className="text-2xl font-bold text-gray-800">{activeRate}<span className="text-sm font-normal text-gray-500 ml-1">%</span></p>
//           </div>
//         </div>
//         <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
//           <div className="p-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle size={24} /></div>
//           <div>
//             <p className="text-sm text-gray-500 font-medium">독려 필요 대상 (0회)</p>
//             <p className="text-2xl font-bold text-gray-800">{inactiveCount}<span className="text-sm font-normal text-gray-500 ml-1">명</span></p>
//           </div>
//         </div>
//       </div>

//       {/* 차트 영역 */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
//         {/* 도넛 차트 */}
//         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1">
//           <h2 className="text-lg font-bold text-gray-800 mb-4">참여 수준별 그룹 비율</h2>
//           <div className="h-64">
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie
//                   data={pieData}
//                   cx="50%" cy="50%"
//                   innerRadius={60} outerRadius={80}
//                   paddingAngle={5}
//                   dataKey="value"
//                 >
//                   {pieData.map((entry, index) => (
//                     <Cell key={`cell-${index}`} fill={entry.color} />
//                   ))}
//                 </Pie>
//                 <Tooltip formatter={(value) => [`${value}명`, '인원']} />
//                 <Legend verticalAlign="bottom" height={36}/>
//               </PieChart>
//             </ResponsiveContainer>
//           </div>
//           <p className="text-xs text-gray-500 text-center mt-2">우수(상위 20%), 보통(중위 50%), 저조(하위 30%)</p>
//         </div>

//         {/* 산점도 차트 */}
//         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 lg:col-span-2">
//           <h2 className="text-lg font-bold text-gray-800 mb-4">직원별 활동량 및 포인트 분포도</h2>
//           <div className="h-64">
//             <ResponsiveContainer width="100%" height="100%">
//               <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
//                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
//                 <XAxis type="number" dataKey="activities" name="참여 횟수" unit="회" stroke="#9ca3af" tick={{fontSize: 12}} />
//                 <YAxis type="number" dataKey="points" name="포인트" unit="P" stroke="#9ca3af" tick={{fontSize: 12}} />
//                 <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
//                 <Scatter name="직원" data={scatterData} fill="#8884d8" />
//               </ScatterChart>
//             </ResponsiveContainer>
//           </div>
//           <p className="text-xs text-gray-500 text-right mt-2">* 각 점은 직원 1명을 의미하며, 마우스를 올리면 상세 정보가 나타납니다.</p>
//         </div>
//       </div>

//       {/* 상세 데이터 테이블 */}
//       <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
//         <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
//           <h2 className="text-lg font-bold text-gray-800">임직원 상세 데이터</h2>
//           <div className="flex gap-2">
//             {['All', 'High', 'Medium', 'Low'].map(tier => (
//               <button
//                 key={tier}
//                 onClick={() => setFilterTier(tier)}
//                 className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
//                   filterTier === tier
//                     ? 'bg-gray-800 text-white'
//                     : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
//                 }`}
//               >
//                 {tier === 'All' ? '전체 보기' : tier}
//               </button>
//             ))}
//           </div>
//         </div>
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm text-left">
//             <thead className="bg-gray-50 text-gray-600 font-medium">
//               <tr>
//                 <th className="px-6 py-4">이름</th>
//                 <th className="px-6 py-4 text-center">참여 횟수</th>
//                 <th className="px-6 py-4 text-center">누적 포인트</th>
//                 <th className="px-6 py-4 text-center">참여 등급</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-gray-100">
//               {filteredData.map((row) => (
//                 <tr key={row.memberId} className="hover:bg-gray-50 transition-colors">
//                   <td className="px-6 py-4 font-medium text-gray-800">{row.name}</td>
//                   <td className="px-6 py-4 text-center text-gray-600">{row.activities}회</td>
//                   <td className="px-6 py-4 text-center font-medium text-blue-600">{row.points.toLocaleString()} P</td>
//                   <td className="px-6 py-4 text-center">
//                     <span className={`px-2 py-1 text-xs font-bold rounded-md ${
//                       row.tier === 'High' ? 'bg-green-100 text-green-700' :
//                       row.tier === 'Medium' ? 'bg-blue-100 text-blue-700' :
//                       'bg-red-100 text-red-700'
//                     }`}>
//                       {row.tier}
//                     </span>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }