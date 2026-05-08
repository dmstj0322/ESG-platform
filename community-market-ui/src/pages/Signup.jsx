import React, { useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/signup', { email, password, nickname });
      alert('회원가입 성공! 로그인 페이지로 이동합니다.');
      navigate('/login');
    } catch (error) {
      alert('회원가입 실패: ' + (error.response?.data?.message || '알 수 없는 오류'));
    }
  };

  return (
    <form onSubmit={handleSignup}>
      <h2>회원가입</h2>
      <input type="email" placeholder="이메일" onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="비밀번호" onChange={(e) => setPassword(e.target.value)} required />
      <input type="text" placeholder="닉네임" onChange={(e) => setNickname(e.target.value)} required />
      <button type="submit">가입하기</button>
    </form>
  );
};

export default Signup;