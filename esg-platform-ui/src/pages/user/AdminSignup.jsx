import React, { useState } from 'react';
import api from '../../api/api';
import { useNavigate, Link } from 'react-router-dom';

const AdminSignup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const navigate = useNavigate();
  const isPasswordValid = password.length >= 8;

  const handleAdminSignup = async (e) => {
    e.preventDefault();
    try {
      // 회사 관리자용 엔드포인트 호출 (가입 시 새로운 Company 데이터가 생성됨)
      await api.post('/auth/signup/company-admin', { email, password, nickname });
      alert('회사 등록 및 관리자 가입 성공! 메일로 발송된 안내를 확인해주세요.');
      navigate('/login');
    } catch (error) {
      alert('가입 실패: ' + (error.response?.data?.message || '이미 등록된 회사 도메인입니다.'));
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', textAlign: 'center', padding: '20px', border: '2px solid #3b82f6', borderRadius: '15px' }}>
      <h2 style={{ color: '#3b82f6' }}>B2B 회사 등록 (관리자)</h2>
      <p style={{ fontSize: '13px', color: '#666' }}>이 가입을 통해 귀하의 회사 도메인이 시스템에 등록됩니다.</p>

      <form onSubmit={handleAdminSignup} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input type="email" placeholder="관리자 메일 (ex: admin@samsung.com)" onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호(8자 이상)" minLength={8} onChange={(e) => setPassword(e.target.value)} required />
        <input type="text" placeholder="담당자 성함(닉네임)" onChange={(e) => setNickname(e.target.value)} required />
        {password.length > 0 && password.length < 8 && (
          <p style={{ color: 'red', fontSize: '12px' }}>비밀번호는 8자 이상이어야 합니다.</p>
        )}
        <button type="submit" disabled={!isPasswordValid} style={{ opacity: isPasswordValid ? 1 : 0.5, backgroundColor: '#3b82f6', color: 'white', padding: '10px', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
          회사 등록 및 가입
        </button>
      </form>

      <div style={{ marginTop: '20px', fontSize: '14px' }}>
        이미 회사가 등록되어 있다면? <Link to="/signup" style={{ color: '#22c55e' }}>직원 가입으로 가기</Link>
      </div>
    </div>
  );
};

export default AdminSignup;