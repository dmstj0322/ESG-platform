// import React, { useState } from 'react';
// import {
//   useReactTable,
//   getCoreRowModel,
//   getSortedRowModel,
//   getFilteredRowModel,
//   flexRender,
// } from '@tanstack/react-table';
// import PropTypes from 'prop-types';
//
// const GRADE_COLOR = { S: '#7c3aed', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
// const CONSISTENCY_COLOR = { High: '#22c55e', Medium: '#f59e0b', Low: '#ef4444' };
//
// // 3-tier Semantic Match Quality: HIGH ≥85% / MEDIUM 65~84% / LOW <65%
// const confidenceLevel = (v) => {
//   if (v >= 85) return { color: '#16a34a', label: 'HIGH',   bar: '#16a34a' };
//   if (v >= 65) return { color: '#d97706', label: 'MEDIUM', bar: '#d97706' };
//   return             { color: '#ef4444', label: 'LOW',    bar: '#ef4444' };
// };
//
// const COLUMNS = [
//   {
//     accessorKey: 'kesgCode',
//     header: 'K-ESG 코드',
//     cell: info => (
//       <span style={{
//         background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px',
//         borderRadius: '6px', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap',
//       }}>
//         {info.getValue() || '—'}
//       </span>
//     ),
//   },
//   {
//     accessorKey: 'indicator',
//     header: '지표명',
//     cell: info => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>,
//   },
//   {
//     accessorKey: 'evidence',
//     header: '원문 근거 (Evidence)',
//     cell: info => {
//       const v = info.getValue();
//       return v ? (
//         <span style={{ color: '#374151', fontStyle: 'italic', fontSize: '13px' }}>
//           &ldquo;{v}&rdquo;
//         </span>
//       ) : (
//         <span style={{ color: '#d1d5db', fontSize: '12px' }}>—</span>
//       );
//     },
//   },
//   {
//     accessorKey: 'consistency',
//     header: '일관성',
//     cell: info => {
//       const v = info.getValue();
//       const color = CONSISTENCY_COLOR[v] || '#9ca3af';
//       return (
//         <span style={{
//           background: color + '22', color,
//           padding: '2px 10px', borderRadius: '99px', fontWeight: 700, fontSize: '12px',
//         }}>
//           {v || '—'}
//         </span>
//       );
//     },
//   },
//   {
//     accessorKey: 'confidenceScore',
//     header: () => (
//       <span title="근거 신뢰도: 제출 문서와 K-ESG 지표 간 근거 일치 품질 지표입니다. HIGH(≥85%) = 명시적 근거 확인, MEDIUM(65~84%) = 부분 문맥 일치, LOW(<65%) = 보조 근거 탐지. E 카테고리 수치 검증과는 별도로 계산됩니다.">
//         근거 신뢰도 ⓘ
//       </span>
//     ),
//     cell: info => {
//       const ev = info.row.original;
//       // Use similarity (RAG cosine score) as primary — confidenceScore may be backend-scaled differently
//       const simRaw = ev.similarity ?? ev.finalScore;
//       const simPct = simRaw != null ? Math.round(simRaw <= 1 ? simRaw * 100 : simRaw) : null;
//       let v = simPct ?? (info.getValue() ?? 0);
//       // E-category: numericMatchLevel HIGH → minimum MEDIUM tier (65%)
//       if (ev.indicatorCode?.[0] === 'E' && ev.numericMatchLevel === 'HIGH') v = Math.max(v, 65);
//       const { color, label, bar } = confidenceLevel(v);
//       return (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '80px' }}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
//             <div style={{
//               flex: 1, height: '6px', background: '#e5e7eb',
//               borderRadius: '3px', overflow: 'hidden',
//             }}>
//               <div style={{
//                 width: `${v}%`, height: '100%',
//                 background: bar, borderRadius: '3px',
//                 transition: 'width 0.3s ease',
//               }} />
//             </div>
//             <span style={{ color, fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
//               {v}%
//             </span>
//           </div>
//           <span style={{
//             background: color + '18', color,
//             padding: '1px 6px', borderRadius: '99px',
//             fontSize: '10px', fontWeight: 600, alignSelf: 'flex-start',
//           }}>
//             {label}
//           </span>
//         </div>
//       );
//     },
//   },
//   {
//     accessorKey: 'score',
//     header: '점수',
//     cell: info => {
//       const v = info.getValue();
//       return v != null
//         ? <span style={{ fontWeight: 700 }}>{v}점</span>
//         : <span style={{ color: '#d1d5db' }}>—</span>;
//     },
//   },
//   {
//     accessorKey: 'grade',
//     header: '등급',
//     cell: info => {
//       const v = info.getValue();
//       const color = GRADE_COLOR[v] || '#6b7280';
//       return v ? (
//         <span style={{
//           background: color + '22', color,
//           padding: '2px 10px', borderRadius: '99px',
//           fontWeight: 800, fontSize: '14px',
//         }}>
//           {v}
//         </span>
//       ) : <span style={{ color: '#d1d5db' }}>—</span>;
//     },
//   },
// ];
//
// export default function EvidenceTable({ data }) {
//   const [sorting, setSorting] = useState([]);
//   const [globalFilter, setGlobalFilter] = useState('');
//
//   const table = useReactTable({
//     data,
//     columns: COLUMNS,
//     state: { sorting, globalFilter },
//     onSortingChange: setSorting,
//     onGlobalFilterChange: setGlobalFilter,
//     getCoreRowModel: getCoreRowModel(),
//     getSortedRowModel: getSortedRowModel(),
//     getFilteredRowModel: getFilteredRowModel(),
//   });
//
//   if (!data || data.length === 0) {
//     return (
//       <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px' }}>
//         원문 근거 데이터가 없습니다.
//       </div>
//     );
//   }
//
//   return (
//     <div>
//       <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//         <span style={{ color: '#6b7280', fontSize: '13px' }}>
//           총 {table.getFilteredRowModel().rows.length}개 지표 · 열 헤더 클릭 시 정렬 · 근거 신뢰도: HIGH ≥85% / MEDIUM 65~84% / LOW &lt;65%
//         </span>
//         <input
//           value={globalFilter}
//           onChange={e => setGlobalFilter(e.target.value)}
//           placeholder="지표명 / 원문 검색..."
//           style={{
//             padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
//             fontSize: '13px', width: '220px', outline: 'none',
//           }}
//         />
//       </div>
//
//       <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
//         <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
//           <thead>
//             {table.getHeaderGroups().map(hg => (
//               <tr key={hg.id}>
//                 {hg.headers.map(h => (
//                   <th
//                     key={h.id}
//                     onClick={h.column.getToggleSortingHandler()}
//                     style={{
//                       background: '#f8fafc', padding: '10px 14px',
//                       borderBottom: '2px solid #e2e8f0', textAlign: 'left',
//                       cursor: h.column.getCanSort() ? 'pointer' : 'default',
//                       fontWeight: 600, color: '#374151', whiteSpace: 'nowrap',
//                       userSelect: 'none',
//                     }}
//                   >
//                     {flexRender(h.column.columnDef.header, h.getContext())}
//                     {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
//                   </th>
//                 ))}
//               </tr>
//             ))}
//           </thead>
//           <tbody>
//             {table.getRowModel().rows.map((row, idx) => (
//               <tr
//                 key={row.id}
//                 style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}
//                 onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
//                 onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
//               >
//                 {row.getVisibleCells().map(cell => (
//                   <td
//                     key={cell.id}
//                     style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}
//                   >
//                     {flexRender(cell.column.columnDef.cell, cell.getContext())}
//                   </td>
//                 ))}
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//
//       {/* ── Evidence Quality 범례 ── */}
//       <div style={{
//         marginTop: '16px', padding: '14px 18px',
//         background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
//       }}>
//         <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginBottom: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
//           Semantic Match Quality 기준
//         </p>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//           {[
//             { label: 'HIGH', color: '#16a34a', bg: '#f0fdf4', desc: '신뢰도 ≥85% — 직접 수치·정책 문장 일치, 명시적 근거 확인' },
//             { label: 'MEDIUM', color: '#d97706', bg: '#fffbeb', desc: '신뢰도 65~84% — 부분 문맥 일치, 관련 근거 일부 확인' },
//             { label: 'LOW', color: '#ef4444', bg: '#fff1f2', desc: '신뢰도 <65% — 보조 근거 탐지 (반드시 검증 실패를 의미하지는 않음)' },
//           ].map(({ label, color, bg, desc }) => (
//             <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
//               <span style={{ background: bg, color, border: `1px solid ${color}33`, padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
//                 {label}
//               </span>
//               <span style={{ fontSize: '11px', color: '#4b5563', lineHeight: '1.5' }}>{desc}</span>
//             </div>
//           ))}
//         </div>
//         <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
//           E 카테고리: 정량 수치 오차율 기반 판정 (Semantic Match Quality와 별도) · S/G 카테고리: OCR + embedding + semantic similarity 기반 정책·실적 근거 탐지
//         </p>
//       </div>
//     </div>
//   );
// }
//
// EvidenceTable.propTypes = {
//   data: PropTypes.arrayOf(PropTypes.shape({
//     indicator:       PropTypes.string,
//     kesgCode:        PropTypes.string,
//     evidence:        PropTypes.string,
//     page:            PropTypes.number,
//     consistency:     PropTypes.string,
//     confidenceScore: PropTypes.number,
//     score:           PropTypes.number,
//     grade:           PropTypes.string,
//   })),
// };
//
// EvidenceTable.defaultProps = { data: [] };
