import React, { useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  // 1. 변수명을 서버와 똑같이 'email'로 바꿉니다.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/auth/login', {
        email: email, 
        password: password 
      });

      console.log("서버 응답 데이터:", response.data);

      const { accessToken, refreshToken } = response.data;

      login(accessToken, refreshToken);

      alert('로그인 성공!');
      const decoded = jwtDecode(accessToken);
      const role = decoded.role;
      if (role === 'SYSTEM_ADMIN' || role === 'COMPANY_ADMIN') {
        navigate('/analysis');
      } else {
        navigate('/community');
      }
    } catch (error) {
      console.error('로그인 실패:', error);
      alert('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #eee' }}>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2>로그인</h2>
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" style={{ padding: '10px', backgroundColor: '#20c997', color: 'white', border: 'none', cursor: 'pointer' }}>로그인</button>
      </form>
    </div>
  );
};

export default Login;