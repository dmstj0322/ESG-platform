import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Leaf, Plus, ChevronDown, LogOut, User,
  BarChart3, FileText, Users, ShoppingBag, Settings,
} from 'lucide-react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const NAV_ADMIN = [
  { to: '/analysis', label: 'ESG 분석',  icon: BarChart3,  matchPrefix: '/analysis' },
  { to: '/community', label: '커뮤니티',   icon: Users,       matchPrefix: '/community' },
  { to: '/market',    label: 'ESG 마켓',   icon: ShoppingBag, matchPrefix: '/market' },
];

const NAV_USER = [
  { to: '/community', label: '커뮤니티', icon: Users,       matchPrefix: '/community' },
  { to: '/market',    label: 'ESG 마켓',  icon: ShoppingBag, matchPrefix: '/market' },
];

export default function Header() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { isLoggedIn, logout, user } = useAuth();

  const [points,      setPoints]      = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isSystemAdmin  = user?.role === 'SYSTEM_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isAdmin        = isSystemAdmin || isCompanyAdmin;
  const navItems       = isAdmin ? NAV_ADMIN : NAV_USER;

  const fetchPoints = useCallback(async () => {
    const memberId = localStorage.getItem('memberId');
    if (!memberId) return;
    try {
      const res = await api.get(`/points/${memberId}/balance`);
      setPoints(res.data);
    } catch (_) { }
  }, []);

  useEffect(() => {
    if (isLoggedIn && !isAdmin) fetchPoints();
  }, [isLoggedIn, isAdmin, fetchPoints, location.key]);

  // close dropdown when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;
    const handle = () => setUserMenuOpen(false);
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, [userMenuOpen]);

  const handleLogout = () => {
    logout();
    alert('로그아웃 되었습니다.');
    navigate('/login');
  };

  const logoTo = isLoggedIn
    ? (isAdmin ? '/analysis/dashboard' : '/community')
    : '/';

  return (
    <header
      className="sticky top-0 z-50 border-b border-gray-100"
      style={{
        fontFamily: "'Pretendard', sans-serif",
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center justify-between px-6 h-14 max-w-screen-2xl mx-auto">

        {/* ── Left: logo + nav ─────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Link
            to={logoTo}
            className="flex items-center gap-2 no-underline mr-4 group"
          >
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm group-hover:bg-emerald-500 transition-colors duration-150">
              <Leaf size={15} color="#fff" />
            </div>
            <span className="font-bold text-[15px] text-gray-900 tracking-tight group-hover:text-gray-700 transition-colors duration-150">
              GreenTrace
            </span>
          </Link>

          {isLoggedIn && (
            <nav className="flex items-center gap-0.5">
              {navItems.map(({ to, label, icon: Icon, matchPrefix }) => {
                const active = location.pathname.startsWith(matchPrefix);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={[
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 no-underline relative',
                      active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/70',
                    ].join(' ')}
                  >
                    <Icon size={13} className={active ? 'text-emerald-600' : ''} />
                    {label}
                    {active && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-emerald-500 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* ── Right: actions ───────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <>
              {!isAdmin && (
                <Link
                  to="/points/history"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-[13px] no-underline transition-all duration-150 font-medium"
                >
                  <span className="text-gray-500">포인트</span>
                  <span className="font-bold text-emerald-600 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>{points}P</span>
                </Link>
              )}

              {/* user dropdown */}
              <div
                className="relative"
                onClick={e => { e.stopPropagation(); setUserMenuOpen(v => !v); }}
              >
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition-all duration-150">
                  <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                    <User size={12} color="#059669" />
                  </div>
                  <span className="hidden sm:block text-gray-700 font-medium">
                    {user?.name || '내 계정'}
                  </span>
                  <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+6px)] w-44 bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-200/50 py-1.5 z-50 animate-fade-in">
                    {!isAdmin && (
                      <Link
                        to="/mypage"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 no-underline transition-colors duration-100"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User size={13} className="text-gray-400" />
                        마이페이지
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 no-underline transition-colors duration-100"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings size={13} className="text-gray-400" />
                        Admin Dashboard
                      </Link>
                    )}
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 transition-colors duration-100"
                    >
                      <LogOut size={13} />
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3.5 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 no-underline font-medium transition-colors duration-150"
              >
                로그인
              </Link>
              <Link
                to="/signup"
                className="px-3.5 py-1.5 bg-emerald-600 text-white text-[13px] font-semibold rounded-lg hover:bg-emerald-500 no-underline transition-all duration-150 shadow-sm shadow-emerald-200"
              >
                회원가입
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
