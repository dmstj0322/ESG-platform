import React, { useState } from 'react';
import api from '../../api/api';
import { useNavigate, Link } from 'react-router-dom';

const REGIONS = [
  { code: '11', name: '서울특별시' },
  { code: '26', name: '부산광역시' },
  { code: '27', name: '대구광역시' },
  { code: '28', name: '인천광역시' },
  { code: '29', name: '광주광역시' },
  { code: '30', name: '대전광역시' },
  { code: '31', name: '울산광역시' },
  { code: '36', name: '세종특별자치시' },
  { code: '41', name: '경기도' },
  { code: '42', name: '강원도' },
  { code: '43', name: '충청북도' },
  { code: '44', name: '충청남도' },
  { code: '45', name: '전라북도' },
  { code: '46', name: '전라남도' },
  { code: '47', name: '경상북도' },
  { code: '48', name: '경상남도' },
  { code: '50', name: '제주특별자치도' },
];

const INDUSTRIES = [
  { code: '26110', name: '전자·반도체' },
  { code: '30110', name: '자동차' },
  { code: '24100', name: '1차 금속(철강)' },
  { code: '20110', name: '화학제품' },
  { code: '23910', name: '비금속 광물' },
  { code: '29120', name: '기계·장비' },
  { code: '10110', name: '식품 제조' },
  { code: '13110', name: '섬유·의류' },
  { code: '62010', name: '소프트웨어·IT' },
  { code: '64110', name: '금융·보험' },
  { code: '56100', name: '음식·숙박' },
];

const AdminSignup = () => {
  const [form, setForm] = useState({
    email: '',
    password: '',
    nickname: '',
    companyName: '',
    regionCode: '',
    regionName: '',
    ksicCode: '',
    industryName: '',
    employeeCount: '',
  });
  const navigate = useNavigate();

  const isPasswordValid = form.password.length >= 8;
  const isFormValid = isPasswordValid && form.regionCode && form.ksicCode;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegionChange = (e) => {
    const selected = REGIONS.find((r) => r.code === e.target.value);
    setForm((prev) => ({
      ...prev,
      regionCode: selected?.code ?? '',
      regionName: selected?.name ?? '',
    }));
  };

  const handleIndustryChange = (e) => {
    const selected = INDUSTRIES.find((i) => i.code === e.target.value);
    setForm((prev) => ({
      ...prev,
      ksicCode: selected?.code ?? '',
      industryName: selected?.name ?? '',
    }));
  };

  const handleAdminSignup = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/signup/company-admin', {
        email: form.email,
        password: form.password,
        nickname: form.nickname,
        companyName: form.companyName || undefined,
        regionCode: form.regionCode,
        regionName: form.regionName,
        ksicCode: form.ksicCode,
        industryName: form.industryName,
        employeeCount: form.employeeCount ? Number(form.employeeCount) : null,
      });
      alert('회사 등록 및 관리자 가입 성공!');
      navigate('/login');
    } catch (error) {
      alert('가입 실패: ' + (error.response?.data?.message || '이미 등록된 회사 도메인입니다.'));
    }
  };

  const inputStyle = {
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: '440px', margin: '50px auto', padding: '28px', border: '2px solid #3b82f6', borderRadius: '15px' }}>
      <h2 style={{ color: '#3b82f6', textAlign: 'center', marginBottom: '6px' }}>B2B 회사 등록 (관리자)</h2>
      <p style={{ fontSize: '13px', color: '#666', textAlign: 'center', marginBottom: '20px' }}>
        회사 도메인 및 업종·지역 정보가 시스템에 등록됩니다.
      </p>

      <form onSubmit={handleAdminSignup} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          style={inputStyle}
          type="email"
          name="email"
          placeholder="관리자 메일 (ex: admin@samsung.com)"
          onChange={handleChange}
          required
        />
        <input
          style={inputStyle}
          type="password"
          name="password"
          placeholder="비밀번호 (8자 이상)"
          minLength={8}
          onChange={handleChange}
          required
        />
        {form.password.length > 0 && form.password.length < 8 && (
          <p style={{ color: 'red', fontSize: '12px', margin: 0 }}>비밀번호는 8자 이상이어야 합니다.</p>
        )}
        <input
          style={inputStyle}
          type="text"
          name="nickname"
          placeholder="담당자 성함 (닉네임)"
          onChange={handleChange}
          required
        />
        <input
          style={inputStyle}
          type="text"
          name="companyName"
          placeholder="회사명 (선택, 미입력 시 도메인 사용)"
          onChange={handleChange}
        />

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', marginTop: '4px' }}>
          <p style={{ fontSize: '13px', color: '#374151', fontWeight: 'bold', marginBottom: '8px' }}>
            ESG 벤치마크 비교 정보
          </p>

          <select
            style={{ ...inputStyle, color: form.regionCode ? '#111' : '#9ca3af' }}
            value={form.regionCode}
            onChange={handleRegionChange}
            required
          >
            <option value="" disabled>지역 선택 *</option>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>

          <div style={{ marginTop: '8px' }}>
            <select
              style={{ ...inputStyle, color: form.ksicCode ? '#111' : '#9ca3af' }}
              value={form.ksicCode}
              onChange={handleIndustryChange}
              required
            >
              <option value="" disabled>업종 선택 *</option>
              {INDUSTRIES.map((i) => (
                <option key={i.code} value={i.code}>{i.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: '8px' }}>
            <input
              style={inputStyle}
              type="number"
              name="employeeCount"
              placeholder="임직원 수 (선택)"
              min={1}
              onChange={handleChange}
            />
          </div>

          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
            * 선택한 지역·업종으로 동종업계 탄소 배출량을 비교합니다.
          </p>
        </div>

        <button
          type="submit"
          disabled={!isFormValid}
          style={{
            opacity: isFormValid ? 1 : 0.5,
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '11px',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: isFormValid ? 'pointer' : 'not-allowed',
            marginTop: '4px',
          }}
        >
          회사 등록 및 가입
        </button>
      </form>

      <div style={{ marginTop: '18px', fontSize: '14px', textAlign: 'center' }}>
        이미 회사가 등록되어 있다면?{' '}
        <Link to="/signup" style={{ color: '#22c55e' }}>직원 가입으로 가기</Link>
      </div>
    </div>
  );
};

export default AdminSignup;
