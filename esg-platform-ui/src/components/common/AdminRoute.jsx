import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('accessToken');
  
  try {
    if (!token) return <Navigate to="/login" />;
    
    const decoded = jwtDecode(token);
    const role = decoded.role;
    // 서버에서 설정한 role이 "ADMIN"인지 확인
    if (role !== 'SYSTEM_ADMIN' && role !== 'COMPANY_ADMIN') {
      alert("관리자만 접근 가능한 페이지입니다.");
      return <Navigate to="/" />;
    }
    
    return children;
  } catch (error) {
    console.error("인증 확인 중 오류:", error);
    return <Navigate to="/login" />;
  }
};

export default AdminRoute;