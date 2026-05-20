import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScanSearch, ClipboardList, Leaf, Building2, ChevronRight, MapPin } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';

const SECTIONS = [
  {
    label: '분석',
    items: [
      { to: '/analysis/dashboard', icon: LayoutDashboard, label: '대시보드' },
      { to: '/analysis',            icon: ScanSearch,       label: 'AI ESG Audit', exact: true },
      { to: '/analysis/report',    icon: ClipboardList,    label: 'Audit 기록' },
    ],
  },
];

function SidebarItem({ to, icon: Icon, label, anchor, exact }) {
  const { pathname } = useLocation();
  const active = exact
    ? pathname === to || pathname.startsWith('/analysis/pipeline/')
    : pathname === to || pathname.startsWith(to + '/');

  return (
    <NavLink
      to={anchor ? to + anchor : to}
      className={[
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors no-underline',
        active
          ? 'bg-emerald-50 text-emerald-700'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
      ].join(' ')}
    >
      <Icon
        size={15}
        className={active ? 'text-emerald-600' : 'text-gray-400'}
      />
      {label}
    </NavLink>
  );
}

function CompanyInfoCard() {
  const navigate = useNavigate();
  const { companyProfileName, latestReport, benchmarkData } = useAnalysis();

  const companyName = companyProfileName
    || latestReport?.companyName
    || localStorage.getItem('esg_companyName')
    || null;

  const industryName = benchmarkData?.industryName
    || localStorage.getItem('esg_ksicCode')
    || null;

  const regionName = benchmarkData?.regionName || null;

  const employeeCount = localStorage.getItem('esg_employeeCount');

  return (
    <div className="mx-3 mb-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">기업 정보</p>
      <p className="text-[13px] font-semibold text-gray-800 truncate leading-snug">
        {companyName ?? '기업명 미설정'}
      </p>
      <div className="mt-1.5 space-y-0.5">
        {industryName && (
          <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
            <Building2 size={10} className="shrink-0 text-gray-400" />
            {industryName}
          </p>
        )}
        {regionName && (
          <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
            <MapPin size={10} className="shrink-0 text-gray-400" />
            {regionName}
          </p>
        )}
        {employeeCount && (
          <p className="text-[11px] text-gray-400 tabular-nums">
            임직원 {Number(employeeCount).toLocaleString()}명
          </p>
        )}
      </div>
      <button
        onClick={() => navigate('/analysis')}
        className="mt-2.5 w-full flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
      >
        회사 정보 관리
        <ChevronRight size={10} />
      </button>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-[220px] min-w-[220px] bg-white border-r border-gray-200 min-h-screen flex flex-col sticky top-14">

      {/* ── Nav sections ─────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {SECTIONS.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-5' : ''}>
            <div className="px-3 mb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              {section.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map(item => (
                <SidebarItem key={item.to + (item.anchor || '')} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── 기업 정보 카드 ────────────────────────────────────── */}
      <CompanyInfoCard />

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center flex-shrink-0">
            <Leaf size={11} color="#fff" />
          </div>
          <span className="text-[11px] text-gray-400 leading-tight">
            K-ESG 가이드라인<br />
            <span className="text-gray-300">산업통상자원부, 2021</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
