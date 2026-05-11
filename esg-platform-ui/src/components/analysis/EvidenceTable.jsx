import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import PropTypes from 'prop-types';

const GRADE_COLOR = { S: '#7c3aed', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
const CONSISTENCY_COLOR = { High: '#22c55e', Medium: '#f59e0b', Low: '#ef4444' };

// 신뢰도 구간별 레이블·색상 (변별력 있게)
const confidenceLevel = (v) => {
  if (v >= 85) return { color: '#16a34a', label: '매우 높음', bar: '#16a34a' };
  if (v >= 70) return { color: '#22c55e', label: '높음',      bar: '#22c55e' };
  if (v >= 55) return { color: '#f59e0b', label: '보통',      bar: '#f59e0b' };
  if (v >= 40) return { color: '#f97316', label: '약함',      bar: '#f97316' };
  return             { color: '#ef4444', label: '낮음',       bar: '#ef4444' };
};

const COLUMNS = [
  {
    accessorKey: 'kesgCode',
    header: 'K-ESG 코드',
    cell: info => (
      <span style={{
        background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px',
        borderRadius: '6px', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap',
      }}>
        {info.getValue() || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'indicator',
    header: '지표명',
    cell: info => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>,
  },
  {
    accessorKey: 'evidence',
    header: '원문 근거 (Evidence)',
    cell: info => {
      const v = info.getValue();
      return v ? (
        <span style={{ color: '#374151', fontStyle: 'italic', fontSize: '13px' }}>
          &ldquo;{v}&rdquo;
        </span>
      ) : (
        <span style={{ color: '#d1d5db', fontSize: '12px' }}>—</span>
      );
    },
  },
  {
    accessorKey: 'page',
    // 업로드한 PDF의 페이지 번호 (K-ESG 가이드라인 페이지 아님)
    header: () => (
      <span title="사용자가 업로드한 PDF의 페이지 번호입니다 (K-ESG 가이드라인 아님)">
        업로드 PDF p. ⓘ
      </span>
    ),
    cell: info => {
      const v = info.getValue();
      // page_number 메타데이터만 표시; 0이하·null은 미확인으로 표시
      const valid = v != null && Number(v) > 0;
      return valid ? (
        <span style={{
          background: '#e0f2fe', color: '#0369a1', padding: '2px 10px',
          borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700,
        }}>
          p.{v}
        </span>
      ) : (
        <span style={{ color: '#d1d5db', fontSize: '12px' }}>—</span>
      );
    },
  },
  {
    accessorKey: 'consistency',
    header: '일관성',
    cell: info => {
      const v = info.getValue();
      const color = CONSISTENCY_COLOR[v] || '#9ca3af';
      return (
        <span style={{
          background: color + '22', color,
          padding: '2px 10px', borderRadius: '99px', fontWeight: 700, fontSize: '12px',
        }}>
          {v || '—'}
        </span>
      );
    },
  },
  {
    accessorKey: 'confidenceScore',
    header: '신뢰도',
    cell: info => {
      const v = info.getValue() ?? 0;
      const { color, label, bar } = confidenceLevel(v);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{
              flex: 1, height: '6px', background: '#e5e7eb',
              borderRadius: '3px', overflow: 'hidden',
            }}>
              <div style={{
                width: `${v}%`, height: '100%',
                background: bar, borderRadius: '3px',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ color, fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
              {v}%
            </span>
          </div>
          <span style={{
            background: color + '18', color,
            padding: '1px 6px', borderRadius: '99px',
            fontSize: '10px', fontWeight: 600, alignSelf: 'flex-start',
          }}>
            {label}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'score',
    header: '점수',
    cell: info => {
      const v = info.getValue();
      return v != null
        ? <span style={{ fontWeight: 700 }}>{v}점</span>
        : <span style={{ color: '#d1d5db' }}>—</span>;
    },
  },
  {
    accessorKey: 'grade',
    header: '등급',
    cell: info => {
      const v = info.getValue();
      const color = GRADE_COLOR[v] || '#6b7280';
      return v ? (
        <span style={{
          background: color + '22', color,
          padding: '2px 10px', borderRadius: '99px',
          fontWeight: 800, fontSize: '14px',
        }}>
          {v}
        </span>
      ) : <span style={{ color: '#d1d5db' }}>—</span>;
    },
  },
];

export default function EvidenceTable({ data }) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px' }}>
        원문 근거 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#6b7280', fontSize: '13px' }}>
          총 {table.getFilteredRowModel().rows.length}개 지표 · 열 헤더 클릭 시 정렬 · 신뢰도 구간: 85%↑ 매우높음 / 70~84% 높음 / 55~69% 보통 / 40~54% 약함 / ~39% 낮음
        </span>
        <input
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="지표명 / 원문 검색..."
          style={{
            padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
            fontSize: '13px', width: '220px', outline: 'none',
          }}
        />
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    style={{
                      background: '#f8fafc', padding: '10px 14px',
                      borderBottom: '2px solid #e2e8f0', textAlign: 'left',
                      cursor: h.column.getCanSort() ? 'pointer' : 'default',
                      fontWeight: 600, color: '#374151', whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

EvidenceTable.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    indicator:       PropTypes.string,
    kesgCode:        PropTypes.string,
    evidence:        PropTypes.string,
    page:            PropTypes.number,
    consistency:     PropTypes.string,
    confidenceScore: PropTypes.number,
    score:           PropTypes.number,
    grade:           PropTypes.string,
  })),
};

EvidenceTable.defaultProps = { data: [] };
