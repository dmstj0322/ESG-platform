import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('accessToken');
  
  try {
    if (!token) return <Navigate to="/login" />;
    
    const decoded = jwtDecode(token);
    // 서버에서 설정한 role이 "ADMIN"인지 확인
    if (decoded.role !== 'ADMIN') {
      alert("관리자만 접근 가능한 페이지입니다.");
      return <Navigate to="/community" />;
    }
    
    return children;
  } catch (error) {
    return <Navigate to="/login" />;
  }
};

export default AdminRoute;