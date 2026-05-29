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

const AUTH_STYLE = `
  .auth-wrap * { box-sizing: border-box; }
  .auth-wrap {
    --green: #16A87A; --green-dark: #0D7A58; --green-light: #E6F7F1; --green-mid: #A8DFD0;
    --bg: #FAFAFA; --bg2: #F4F4F2; --bg3: #E8E8E5;
    --text-1: #0F0F0E; --text-2: #4A4A46; --text-3: #898983;
    --border: #E2E2DE; --border2: #CCCCC6; --white: #FFFFFF;
    --r-sm: 8px; --r-md: 12px;
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .auth-page { display: flex; min-height: 100vh; }

  /* ── LEFT ── */
  .auth-left {
    flex: 0 0 42%; background: #F7FAF8; border-right: 1px solid var(--border);
    padding: 52px 48px; display: flex; flex-direction: column;
  }
  .auth-logo { display: flex; align-items: center; gap: 11px; margin-bottom: 48px; cursor: pointer; }
  .auth-logo-dot {
    width: 34px; height: 34px; border-radius: 9px; background: var(--green);
    display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;
  }
  .auth-logo-name { font-size: 17px; font-weight: 800; color: var(--text-1); display: block; letter-spacing: -.02em; }
  .auth-logo-sub  { font-size: 11px; color: var(--text-3); display: block; margin-top: 1px; font-weight: 500; }

  .auth-l-eyebrow {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10.5px; font-weight: 700; color: var(--green-dark);
    background: var(--green-light); border: 1px solid var(--green-mid);
    border-radius: 100px; padding: 4px 13px; margin-bottom: 16px; margin-top: 0; letter-spacing: .05em;
  }
  .auth-l-headline {
    font-size: 22px; font-weight: 800; line-height: 1.45; letter-spacing: -.025em;
    color: var(--text-1); margin-bottom: 10px;
  }
  .auth-l-headline em { color: var(--green); font-style: normal; }
  .auth-l-desc { font-size: 13px; color: var(--text-2); line-height: 1.85; margin-bottom: 28px; max-width: 260px; }

  .auth-feats { display: flex; flex-direction: column; gap: 9px; margin-bottom: 40px; }
  .auth-feat {
    background: var(--white); border: 1px solid var(--border); border-radius: var(--r-md);
    padding: 12px 15px; display: flex; align-items: flex-start; gap: 12px; transition: border-color .15s;
  }
  .auth-feat:hover { border-color: var(--green-mid); }
  .auth-feat-ico {
    width: 34px; height: 34px; border-radius: var(--r-sm); background: var(--green-light);
    display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0;
  }
  .auth-feat-t { font-size: 12.5px; font-weight: 700; color: var(--text-1); margin-bottom: 2px; }
  .auth-feat-d { font-size: 11px; color: var(--text-3); line-height: 1.5; }

  .auth-flow {
    margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border);
    display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  }
  .auth-flow-lbl {
    font-size: 10px; font-weight: 700; color: var(--text-3); letter-spacing: .07em;
    text-transform: uppercase; margin-right: 4px;
  }
  .auth-flow-step {
    font-size: 11px; font-weight: 600; color: var(--text-2);
    background: var(--bg2); border: 1px solid var(--border2); border-radius: 6px; padding: 4px 9px;
  }
  .auth-flow-arr { font-size: 11px; color: var(--border2); }

  /* ── RIGHT ── */
  .auth-right {
    flex: 1; background: var(--white);
    display: flex; align-items: flex-start; justify-content: center;
    padding: 52px 40px; overflow-y: auto;
  }
  .auth-box { width: 100%; max-width: 420px; }

  .auth-r-eyebrow {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10.5px; font-weight: 700; color: var(--green-dark);
    background: var(--green-light); border: 1px solid var(--green-mid);
    border-radius: 100px; padding: 4px 12px; margin-bottom: 18px; letter-spacing: .05em;
  }
  .auth-title    { font-size: 26px; font-weight: 800; letter-spacing: -.025em; color: var(--text-1); margin-bottom: 5px; }
  .auth-subtitle { font-size: 13.5px; color: var(--text-2); line-height: 1.65; margin-bottom: 24px; }

  /* Step indicator */
  .auth-steps { display: flex; align-items: center; margin-bottom: 26px; }
  .auth-step-wrap { display: flex; align-items: center; }
  .auth-step-num {
    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; transition: background .2s, color .2s;
  }
  .auth-step-num.on   { background: var(--green); color: #fff; }
  .auth-step-num.done { background: var(--green-light); color: var(--green-dark); border: 1.5px solid var(--green-mid); }
  .auth-step-num.off  { background: var(--bg2); color: var(--text-3); border: 1.5px solid var(--border2); }
  .auth-step-lbl { font-size: 12px; font-weight: 600; margin-left: 8px; }
  .auth-step-lbl.on  { color: var(--green-dark); }
  .auth-step-lbl.off { color: var(--text-3); }
  .auth-step-line { flex: 1; height: 1.5px; margin: 0 12px; }
  .auth-step-line.done { background: var(--green-mid); }
  .auth-step-line.off  { background: var(--border); }

  /* Section label */
  .auth-sec-lbl {
    font-size: 10.5px; font-weight: 700; color: var(--text-3); letter-spacing: .08em;
    text-transform: uppercase; padding-bottom: 10px; border-bottom: 1px solid var(--border); margin-bottom: 16px;
  }

  /* Fields */
  .auth-field { margin-bottom: 14px; }
  .auth-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
  .auth-label-note { font-weight: 400; color: var(--text-3); font-size: 11px; margin-left: 5px; }
  .auth-req { color: #C94040; margin-left: 2px; }
  .auth-iw { position: relative; }
  .auth-input {
    display: block; width: 100%; height: 50px; padding: 0 14px;
    border: 1.5px solid var(--border2); border-radius: var(--r-sm);
    font-size: 14px; color: var(--text-1); background: var(--white);
    font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .auth-input:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(22,168,122,.1); }
  .auth-input.pr { padding-right: 46px; }
  .auth-select {
    display: block; width: 100%; height: 50px; padding: 0 36px 0 14px;
    border: 1.5px solid var(--border2); border-radius: var(--r-sm);
    font-size: 14px; color: var(--text-1); background: var(--white);
    font-family: inherit; outline: none; cursor: pointer; appearance: none;
    transition: border-color .15s, box-shadow .15s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23898983' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 14px center;
  }
  .auth-select:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(22,168,122,.1); }
  .auth-select.ph { color: var(--text-3); }
  .auth-eye {
    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; color: var(--text-3); font-size: 14px; padding: 0;
  }
  .auth-hint { font-size: 11px; color: var(--text-3); margin-top: 5px; line-height: 1.5; }
  .auth-hint.g { color: var(--green-dark); font-weight: 600; }

  /* Domain preview tag */
  .auth-domain-tag {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; font-weight: 600; color: var(--green-dark);
    background: var(--green-light); border: 1px solid var(--green-mid);
    border-radius: 6px; padding: 4px 10px; margin-top: 6px;
  }
  .auth-domain-tag-ico { font-size: 11px; }

  /* Password strength */
  .auth-pw-bar  { height: 3px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin-top: 8px; }
  .auth-pw-fill { height: 100%; border-radius: 2px; transition: width .3s ease, background .3s ease; }
  .auth-pw-row  { display: flex; align-items: center; justify-content: space-between; margin-top: 5px; }
  .auth-pw-lbl  { font-size: 11px; font-weight: 600; }

  /* ESG benchmark info panel */
  .auth-bench-panel {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-md);
    padding: 14px 16px; margin-bottom: 16px;
  }
  .auth-bench-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .auth-bench-ico {
    width: 26px; height: 26px; border-radius: 6px; background: var(--green-light);
    display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0;
  }
  .auth-bench-title { font-size: 12.5px; font-weight: 700; color: var(--text-1); }
  .auth-bench-desc  { font-size: 11px; color: var(--text-3); line-height: 1.65; }

  /* Err banner */
  .auth-err-banner {
    background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: var(--r-sm);
    padding: 11px 14px; display: flex; align-items: flex-start; gap: 8px;
    font-size: 12.5px; color: #991B1B; margin-bottom: 16px; line-height: 1.55;
  }

  /* Buttons */
  .auth-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; height: 50px; border-radius: var(--r-sm);
    font-size: 14.5px; font-weight: 700; cursor: pointer; font-family: inherit;
    border: none; transition: background .15s, opacity .15s; margin-bottom: 0;
  }
  .auth-btn.green { background: var(--green); color: #fff; }
  .auth-btn.green:hover { background: var(--green-dark); }
  .auth-btn.green:disabled { opacity: .5; cursor: not-allowed; }
  .auth-btn.ghost { background: var(--bg2); color: var(--text-2); border: 1.5px solid var(--border2); font-size: 13.5px; font-weight: 500; }
  .auth-btn.ghost:hover { background: var(--bg3); }

  /* Step btn grid */
  .auth-step-btns { display: grid; gap: 10px; margin-top: 8px; }
  .auth-step-btns.one { grid-template-columns: 1fr; }
  .auth-step-btns.two { grid-template-columns: 1fr 2fr; }

  .auth-hr { border: none; border-top: 1px solid var(--border); margin: 4px 0 18px; }

  .auth-links { text-align: center; font-size: 13px; color: var(--text-3); }
  .auth-links a { color: var(--green-dark); font-weight: 600; text-decoration: none; }
  .auth-links a:hover { text-decoration: underline; }
  .auth-links .s { margin: 0 7px; color: var(--border2); }
  .auth-links.mt { margin-top: 10px; }

  @media (max-width: 800px) {
    .auth-left { display: none; }
    .auth-right { padding: 32px 20px; }
    .auth-step-btns.two { grid-template-columns: 1fr 1.5fr; }
  }
`;

function mapAdminError(msg) {
  if (!msg) return '가입 중 오류가 발생했습니다. 다시 시도해주세요.';
  if (msg.includes('이미 등록된 회사 도메인')) {
    return '이미 등록된 회사 도메인입니다. 기존 계정으로 로그인하거나 직원으로 가입해 주세요.';
  }
  if (msg.includes('이미 존재하는 이메일')) {
    return '이미 사용 중인 이메일입니다. 로그인 페이지에서 로그인해 주세요.';
  }
  return msg;
}

const FEATURES = [
  { ico: '📊', t: '기업 ESG 분석 자동화', d: 'K-ESG 기준 문서 분석 및 자동 등급 산출' },
  { ico: '🏭', t: '업종 벤치마크 비교', d: '업종 평균 ESG 성과 비교 분석' },
  { ico: '📄', t: 'ESG 리포트 즉시 생성', d: '검증 근거 포함 리포트를 즉시 다운로드' },
];

const AdminSignup = () => {
  const [step, setStep] = useState(1);
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
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const pwLen = form.password.length;
  const isPwValid = pwLen >= 8;
  const isStep1Valid = form.email && isPwValid && form.nickname;
  const isStep2Valid = form.regionCode && form.ksicCode;
  const isFormValid = isStep1Valid && isStep2Valid;

  // 이메일에서 도메인 추출 (중복 가입 안내에 활용)
  const emailDomain = form.email.includes('@') ? form.email.split('@')[1] : '';

  let pw = { label: '', color: '', w: 0 };
  if (pwLen > 0 && pwLen < 8)        pw = { label: '취약',  color: '#C94040', w: 30 };
  else if (pwLen >= 8 && pwLen < 12) pw = { label: '보통', color: '#D97706', w: 65 };
  else if (pwLen >= 12)              pw = { label: '강함', color: '#16A87A', w: 100 };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleRegionChange = (e) => {
    const selected = REGIONS.find(r => r.code === e.target.value);
    setForm(prev => ({ ...prev, regionCode: selected?.code ?? '', regionName: selected?.name ?? '' }));
  };

  const handleIndustryChange = (e) => {
    const selected = INDUSTRIES.find(i => i.code === e.target.value);
    setForm(prev => ({ ...prev, ksicCode: selected?.code ?? '', industryName: selected?.name ?? '' }));
  };

  const goToStep2 = () => {
    setError('');
    setStep(2);
  };

  const handleAdminSignup = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    setError('');
    setLoading(true);
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
      alert('기업 등록이 완료됐습니다!');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data || '';
      setError(mapAdminError(typeof msg === 'string' ? msg : ''));
      // 도메인/이메일 오류는 Step 1로 되돌림
      if (typeof msg === 'string' && (msg.includes('도메인') || msg.includes('이메일'))) {
        setStep(1);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{AUTH_STYLE}</style>
      <div className="auth-wrap">
        <div className="auth-page">

          {/* ── LEFT: 관리자 역할 소개 ── */}
          <div className="auth-left">
            <span className="auth-l-eyebrow">🏢 기업 ESG 관리자 등록</span>

            <h2 className="auth-l-headline">
              기업 ESG를<br />
              <em>체계적으로</em><br />
              관리하세요
            </h2>
            <p className="auth-l-desc">
              업종·지역 정보를 등록하면 동종업계<br />
              벤치마크 비교 기준이 자동으로 설정됩니다.
            </p>

            <div className="auth-feats">
              {FEATURES.map((f, i) => (
                <div className="auth-feat" key={i}>
                  <div className="auth-feat-ico">{f.ico}</div>
                  <div>
                    <div className="auth-feat-t">{f.t}</div>
                    <div className="auth-feat-d">{f.d}</div>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* ── RIGHT: 기업 등록 폼 (2-step) ── */}
          <div className="auth-right">
            <div className="auth-box">
              <span className="auth-r-eyebrow">🏢 회사 관리자 가입</span>
              <h1 className="auth-title">기업 등록</h1>
              <p className="auth-subtitle">
                회사 도메인이 등록되면 같은 도메인의<br />임직원이 바로 가입할 수 있습니다.
              </p>

              {/* Step 진행 표시 */}
              <div className="auth-steps">
                <div className="auth-step-wrap">
                  <div className={`auth-step-num ${step === 1 ? 'on' : 'done'}`}>
                    {step > 1 ? '✓' : '1'}
                  </div>
                  <span className={`auth-step-lbl ${step === 1 ? 'on' : 'off'}`}>계정 정보</span>
                </div>
                <div className={`auth-step-line ${step > 1 ? 'done' : 'off'}`} />
                <div className="auth-step-wrap">
                  <div className={`auth-step-num ${step === 2 ? 'on' : 'off'}`}>2</div>
                  <span className={`auth-step-lbl ${step === 2 ? 'on' : 'off'}`}>기업 정보</span>
                </div>
              </div>

              {error && (
                <div className="auth-err-banner">
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* ── STEP 1: 계정 정보 ── */}
              {step === 1 && (
                <>
                  <p className="auth-sec-lbl">관리자 계정 정보</p>

                  <div className="auth-field">
                    <label className="auth-label">관리자 이메일</label>
                    <input
                      className="auth-input"
                      type="email"
                      name="email"
                      placeholder="admin@company.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                    {/* 도메인 미리보기: 중복 가입 인지 강화 */}
                    {emailDomain && (
                      <div className="auth-domain-tag">
                        <span className="auth-domain-tag-ico">🏢</span>
                        <span>등록될 회사 도메인: <strong>@{emailDomain}</strong></span>
                      </div>
                    )}
                    <p className="auth-hint" style={{ marginTop: emailDomain ? 6 : 5 }}>
                      이미 등록된 도메인은 중복 가입이 불가합니다.
                    </p>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">
                      비밀번호
                      <span className="auth-label-note">8자 이상</span>
                    </label>
                    <div className="auth-iw">
                      <input
                        className="auth-input pr"
                        type={showPw ? 'text' : 'password'}
                        name="password"
                        placeholder="비밀번호를 입력하세요"
                        value={form.password}
                        onChange={handleChange}
                        minLength={8}
                        required
                      />
                      <button type="button" className="auth-eye" onClick={() => setShowPw(p => !p)}>
                        {showPw ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {pwLen > 0 && (
                      <>
                        <div className="auth-pw-bar">
                          <div className="auth-pw-fill" style={{ width: pw.w + '%', background: pw.color }} />
                        </div>
                        <div className="auth-pw-row">
                          <p className="auth-hint" style={{ margin: 0 }}>
                            {pwLen < 8 ? '8자 이상 입력해 주세요.' : '비밀번호 조건 충족'}
                          </p>
                          <span className="auth-pw-lbl" style={{ color: pw.color }}>{pw.label}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">담당자 이름</label>
                    <input
                      className="auth-input"
                      type="text"
                      name="nickname"
                      placeholder="홍길동"
                      value={form.nickname}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="auth-step-btns one">
                    <button
                      type="button"
                      className="auth-btn green"
                      disabled={!isStep1Valid}
                      onClick={goToStep2}
                    >
                      다음 — 기업 정보 입력 →
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 2: 기업 정보 ── */}
              {step === 2 && (
                <form onSubmit={handleAdminSignup}>
                  <p className="auth-sec-lbl">기업 정보</p>

                  <div className="auth-field">
                    <label className="auth-label">
                      회사명
                      <span className="auth-label-note">미입력 시 도메인 사용</span>
                    </label>
                    <input
                      className="auth-input"
                      type="text"
                      name="companyName"
                      placeholder="(주)그린트레이스"
                      value={form.companyName}
                      onChange={handleChange}
                    />
                  </div>

                  <hr className="auth-hr" />

                  <div className="auth-bench-panel">
                    <div className="auth-bench-hdr">
                      <div className="auth-bench-ico">📊</div>
                      <span className="auth-bench-title">ESG 벤치마크 기준 설정</span>
                    </div>
                    <p className="auth-bench-desc">
                      지역·업종 정보는 동종업계 ESG 평균 점수 비교 및<br />
                      탄소 배출량 벤치마크에 활용됩니다.
                    </p>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">
                      지역 <span className="auth-req">*</span>
                    </label>
                    <select
                      className={`auth-select${form.regionCode ? '' : ' ph'}`}
                      value={form.regionCode}
                      onChange={handleRegionChange}
                      required
                    >
                      <option value="" disabled>지역을 선택하세요</option>
                      {REGIONS.map(r => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">
                      업종 <span className="auth-req">*</span>
                    </label>
                    <select
                      className={`auth-select${form.ksicCode ? '' : ' ph'}`}
                      value={form.ksicCode}
                      onChange={handleIndustryChange}
                      required
                    >
                      <option value="" disabled>업종을 선택하세요</option>
                      {INDUSTRIES.map(i => (
                        <option key={i.code} value={i.code}>{i.name}</option>
                      ))}
                    </select>
                    <p className="auth-hint g">업종 평균 ESG 벤치마크 비교에 활용됩니다.</p>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">
                      임직원 수
                      <span className="auth-label-note">선택</span>
                    </label>
                    <input
                      className="auth-input"
                      type="number"
                      name="employeeCount"
                      placeholder="예: 500"
                      min={1}
                      value={form.employeeCount}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="auth-step-btns two">
                    <button type="button" className="auth-btn ghost" onClick={() => setStep(1)}>
                      ← 이전
                    </button>
                    <button
                      type="submit"
                      className="auth-btn green"
                      disabled={!isFormValid || loading}
                    >
                      {loading ? '등록 중...' : '기업 등록 완료 →'}
                    </button>
                  </div>
                </form>
              )}

              <div className="auth-links" style={{ marginTop: 20 }}>
                이미 회사가 등록되어 있나요?
                <span className="s">·</span>
                <Link to="/signup">직원으로 가입</Link>
                <span className="s">·</span>
                <Link to="/login">로그인</Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default AdminSignup;
