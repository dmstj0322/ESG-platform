import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import NotificationPanel from './NotificationPanel';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, isLoggedIn } = useAuth();
  
  const [points, setPoints] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  // 🌟 알림 영역 감지를 위한 Ref 생성
  const notificationRef = useRef(null);

  const isAdmin = user?.role === 'SYSTEM_ADMIN' || user?.role === 'COMPANY_ADMIN';

  const fetchPoints = useCallback(async () => {
    const memberId = user?.memberId || user?.id || localStorage.getItem('memberId');
    if (!memberId || isAdmin) return;
    try {
      const res = await api.get(`/points/${memberId}/balance`);
      setPoints(res.data);
    } catch (err) {
      console.error("포인트 조회 실패");
    }
  }, [user, isAdmin]);

  const { hasUnread, setHasUnread } = useNotification(
    user?.memberId || user?.id,
    fetchPoints
  );

  useEffect(() => {
    if (isLoggedIn && !isAdmin) {
      fetchPoints();
    }
  }, [isLoggedIn, isAdmin, fetchPoints, location.key]);

  // 🌟 알림창 바깥 클릭 시 닫기 로직
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsPanelOpen(false);
      }
    };

    if (isPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPanelOpen]);

  const handleLogout = () => {
    logout();
    alert('로그아웃 되었습니다.');
    navigate('/login');
  };

  const logoTo = isLoggedIn ? (isAdmin ? '/analysis/dashboard' : '/community') : '/';

  return (
    <header style={headerStyle}>
      <div style={leftSectionStyle}>
        <Link to={logoTo} style={logoStyle}>GreenTrace</Link>
        {isLoggedIn && (
          <nav style={mainNavStyle}>
            {isAdmin && (
              <NavLink to="/analysis" style={({ isActive }) => isActive ? activeStyle : navItemStyle}>분석</NavLink>
            )}
            <NavLink to="/community" style={({ isActive }) => isActive ? activeStyle : navItemStyle}>커뮤니티</NavLink>
            <NavLink to="/market" style={({ isActive }) => isActive ? activeStyle : navItemStyle}>ESG 마켓</NavLink>
          </nav>
        )}
      </div>

      <div style={rightSectionStyle}>
        {isLoggedIn ? (
          <>
            {isAdmin ? (
              <Link to="/admin" style={adminButtonStyle}>ADMIN DASHBOARD</Link>
            ) : (
              <>
                <div style={pointBadgeStyle}>
                  <Link to="/points/history" style={pointLinkStyle}>
                    포인트 <span style={pointValueStyle}>: {points.toLocaleString()}P</span>
                  </Link>
                </div>

                {/* 🌟 Ref를 이곳에 지정하여 아이콘과 패널 전체를 감쌉니다. */}
                <div style={{ position: 'relative' }} ref={notificationRef}>
                  <button onClick={() => setIsPanelOpen(!isPanelOpen)} style={bellButtonStyle}>
                    🔔
                    {hasUnread && <span style={redDotStyle}></span>}
                  </button>
                  
                  {isPanelOpen && (
                    <NotificationPanel 
                      memberId={user?.memberId || user?.id} 
                      onClose={() => setIsPanelOpen(false)}
                      onRead={() => setHasUnread(false)}
                    />
                  )}
                </div>
                <Link to="/mypage" style={myPageLinkStyle}>👤 마이페이지</Link>
              </>
            )}
            <button onClick={handleLogout} style={logoutButtonStyle}>로그아웃</button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link to="/login"><button style={authButtonStyle}>로그인</button></Link>
            <Link to="/signup"><button style={authButtonStyle}>회원가입</button></Link>
          </div>
        )}
      </div>
    </header>
  );
};

const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#fff', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 100 };
const leftSectionStyle = { display: 'flex', alignItems: 'center', gap: '20px' };
const logoStyle = { textDecoration: 'none', fontWeight: 'bold', fontSize: '22px', color: '#339af0' };
const mainNavStyle = { display: 'flex', gap: '25px', marginLeft: '30px' };
const navItemStyle = { textDecoration: 'none', color: '#495057', fontSize: '16px', fontWeight: '500' };
const activeStyle = { ...navItemStyle, color: '#339af0', fontWeight: 'bold' };
const rightSectionStyle = { display: 'flex', alignItems: 'center', gap: '20px' };
const pointBadgeStyle = { backgroundColor: '#f8f9fa', padding: '6px 14px', borderRadius: '20px', border: '1px solid #e9ecef' };
const pointLinkStyle = { textDecoration: 'none', color: '#444', fontSize: '14px' };
const pointValueStyle = { fontWeight: 'bold', color: '#339af0', marginLeft: '5px' };
const bellButtonStyle = { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' };
const redDotStyle = { position: 'absolute', top: '2px', right: '2px', width: '8px', height: '8px', backgroundColor: '#fa5252', borderRadius: '50%', border: '2px solid #fff' };
const myPageLinkStyle = { textDecoration: 'none', color: '#666', fontSize: '14px', fontWeight: '500' };
const logoutButtonStyle = { border: 'none', background: 'none', cursor: 'pointer', color: '#adb5bd', fontSize: '14px' };
const adminButtonStyle = { backgroundColor: '#ff6b6b', color: '#fff', padding: '6px 18px', borderRadius: '20px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' };
const authButtonStyle = { padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #dee2e6', backgroundColor: '#fff' };

export default Header;