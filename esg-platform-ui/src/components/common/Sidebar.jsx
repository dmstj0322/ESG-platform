import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, BarChart3, FileText, Leaf } from 'lucide-react';

const NAV = [
  { to: '/analysis/dashboard',         icon: LayoutDashboard, label: '관제 대시보드' },
  { to: '/analysis/detail', icon: BarChart3,        label: '분석 & 트래킹' },
  { to: '/analysis/report',   icon: FileText,         label: '종합 리포트' },
];

const NAVY   = '#1e3a5f';
const GREEN  = '#16a34a';
const ACTIVE = '#d1fae5';

export default function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside style={{
      width: '220px',
      minWidth: '220px',
      background: NAVY,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
      position: 'sticky',
      top: 0,
    }}>
      {/* 로고 영역 */}
      <div style={{
        padding: '28px 24px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            background: GREEN,
            borderRadius: '10px',
            width: '36px', height: '36px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Leaf size={20} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '15px', lineHeight: '1.2' }}>
              ESG Platform
            </div>
            <div style={{ color: '#93c5fd', fontSize: '11px' }}>K-ESG 관제 시스템</div>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        {NAV.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '11px 14px',
                borderRadius: '10px',
                marginBottom: '4px',
                textDecoration: 'none',
                color:      active ? NAVY : 'rgba(255,255,255,0.75)',
                background: active ? ACTIVE : 'transparent',
                fontWeight: active ? 700 : 400,
                fontSize: '14px',
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={18} color={active ? NAVY : 'rgba(255,255,255,0.75)'} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* 하단 버전 */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.35)',
        fontSize: '11px',
      }}>
        K-ESG 가이드라인 (산업통상자원부, 2021)
      </div>
    </aside>
  );
}
