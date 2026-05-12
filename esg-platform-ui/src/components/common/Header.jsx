import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, logout, user } = useAuth();
  const [points, setPoints] = useState(0);
  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isAdmin = isSystemAdmin || isCompanyAdmin;

  const fetchPoints = useCallback(async () => {
    const memberId = localStorage.getItem('memberId');
    if (!memberId) return;

    try {
      const res = await api.get(`/points/${memberId}/balance`);
      setPoints(res.data);
    } catch (err) {
      console.error("포인트 조회 실패");
    }
  }, []);

  useEffect(() => {
    //   if (isLoggedIn) {
    //     const token = localStorage.getItem('accessToken');
    //     console.log("localStorage에서 읽은 토큰:", token);
    //     if (token) {
    //       try {
    //         const decoded = jwtDecode(token);
    //         console.log("디코딩된 토큰 정보:", decoded);
    //         console.log("Role 확인:", decoded.role);
    //         const adminStatus = decoded.role === 'ADMIN';
    //         setIsAdmin(adminStatus);

    //         if (!adminStatus) {
    //           fetchPoints();
    //         }
    //       } catch (e) {
    //         console.error("토큰 디코딩 실패", e);
    //       }
    //     } else {
    //       console.warn("로그인 상태인데 토큰이 없습니다!");
    //     }
    //   } else {
    //     setIsAdmin(false);
    //   }
    // }, [isLoggedIn, fetchPoints, location.key]);
    if (isLoggedIn && !isAdmin) {
      fetchPoints();
    }
  }, [isLoggedIn, isAdmin, fetchPoints, location.key]);

  const handleLogout = () => {
    logout();
    // setIsAdmin(false);
    alert('로그아웃 되었습니다.');
    navigate('/login');
  };

  const navItemStyle = { textDecoration: 'none', color: 'black', marginRight: '15px' };
  const activeStyle = { ...navItemStyle, fontWeight: 'bold', color: '#339af0' };

  const logoTo = isLoggedIn
    ? (isAdmin ? '/analysis/dashboard' : '/community')
    : '/';

  return (
    <header style={{
      padding: '15px 20px',
      borderBottom: '1px solid #ccc',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      {/* 좌측 메뉴: 홈 및 서비스 탭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <Link to={logoTo} style={{ textDecoration: 'none', fontWeight: 'bold', fontSize: '20px', color: '#2b8a3e' }}>
          GreenTrace
        </Link>

        {isLoggedIn && (
          <nav style={{ display: 'flex', marginLeft: '20px' }}>
            {isAdmin && (
              <NavLink to="/analysis" style={({ isActive }) => isActive ? activeStyle : navItemStyle}>분석</NavLink>
            )}
            <NavLink to="/community" style={({ isActive }) => isActive ? activeStyle : navItemStyle}>커뮤니티</NavLink>
            <NavLink to="/market" style={({ isActive }) => isActive ? activeStyle : navItemStyle}>ESG 마켓</NavLink>
          </nav>
        )}
      </div>

      {/* 우측 메뉴: 포인트, 마이페이지, 로그아웃 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {isLoggedIn ? (
          <>
            {isAdmin ? (
              <Link to="/admin" style={{ backgroundColor: '#ff6b6b', color: '#fff', padding: '5px 15px', borderRadius: '20px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' }}>
                ADMIN DASHBOARD
              </Link>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8f9fa', padding: '5px 10px', borderRadius: '20px' }}>
                  <Link to="/points/history" style={{ textDecoration: 'none', color: '#444', fontSize: '14px' }}>
                    포인트 <span style={{ fontWeight: 'bold', marginLeft: '5px', color: '#339af0' }}>: {points}P</span>
                  </Link>
                </div>
                <Link to="/mypage" style={{ textDecoration: 'none', color: '#666', fontSize: '14px' }}>
                  👤 마이페이지
                </Link>
              </>
            )}
            <button onClick={handleLogout} style={{ cursor: 'pointer' }}>로그아웃</button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link to="/login"><button>로그인</button></Link>
            <Link to="/signup"><button>회원가입</button></Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;