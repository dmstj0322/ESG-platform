import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('accessToken'));
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        // 토큰 내부의 정보를 user 상태에 저장
        setUser({
          memberId: decoded.memberId,
          role: decoded.role,
          companyId: decoded.companyId,
          email: decoded.sub
        });
      } catch (err) {
        console.error("토큰 복구 실패", err);
        logout(); // 유효하지 않은 토큰일 경우 로그아웃 처리
      }
    }
  }, []);

  const login = (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    
    const decoded = jwtDecode(accessToken);
    // 토큰에서 정보를 직접 추출하여 저장
    const userData = {
      memberId: decoded.memberId,
      role: decoded.role,
      companyId: decoded.companyId,
      email: decoded.sub
    };
    
    localStorage.setItem('memberId', decoded.memberId);
    localStorage.setItem('role', decoded.role);
    localStorage.setItem('companyId', decoded.companyId);
    
    setIsLoggedIn(true);
    setUser(userData);
  };

  const logout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);