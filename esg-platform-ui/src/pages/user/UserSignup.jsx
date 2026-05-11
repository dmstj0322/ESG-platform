import React, { useState } from 'react';
import api from '../../api/api';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const navigate = useNavigate();
  const isPasswordValid = password.length >= 8;

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/signup/user', { email, password, nickname });
      alert('회원가입 성공! 로그인 페이지로 이동합니다.');
      navigate('/login');
    } catch (error) {
      alert('회원가입 실패: ' + (error.response?.data?.message || '등록되지 않은 회사 도메인입니다.'));
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', textAlign: 'center' }}>
      <h2>직원 회원가입</h2>
      <p style={{ fontSize: '13px', color: '#666' }}>회사 메일 계정으로 가입해주세요.</p>
      <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input type="email" placeholder="회사 이메일 (ex: name@samsung.com)" onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호(8자 이상)" minLength={8} onChange={(e) => setPassword(e.target.value)} required />
        <input type="text" placeholder="이름(닉네임)" onChange={(e) => setNickname(e.target.value)} required />
        {password.length > 0 && password.length < 8 && (
          <p style={{ color: 'red', fontSize: '12px' }}>비밀번호는 8자 이상이어야 합니다.</p>
        )}
        <button type="submit" disabled={!isPasswordValid} style={{ opacity: isPasswordValid ? 1 : 0.5, backgroundColor: '#22c55e', color: 'white', padding: '10px', border: 'none', borderRadius: '5px' }}>
          가입하기
        </button>
      </form>
      <div style={{ marginTop: '20px', fontSize: '14px' }}>
        회사를 새로 등록해야 하나요? <Link to="/signup/admin" style={{ color: '#3b82f6' }}>회사 관리자 가입</Link>
      </div>
    </div>
  );
};

export default Signup;