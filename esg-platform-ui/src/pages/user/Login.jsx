import React, { useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

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

  /* Role cards */
  .auth-roles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 36px; }
  .auth-role-card {
    background: var(--white); border: 1px solid var(--border); border-radius: var(--r-md);
    padding: 14px 12px; transition: border-color .15s;
  }
  .auth-role-card:hover { border-color: var(--green-mid); }
  .auth-role-ico {
    width: 30px; height: 30px; border-radius: var(--r-sm); background: var(--green-light);
    display: flex; align-items: center; justify-content: center; font-size: 14px; margin-bottom: 9px;
  }
  .auth-role-title { font-size: 11.5px; font-weight: 700; color: var(--text-1); margin-bottom: 7px; }
  .auth-role-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  .auth-role-list li { font-size: 10.5px; color: var(--text-3); display: flex; align-items: flex-start; gap: 5px; line-height: 1.4; }
  .auth-role-list li::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--green-mid); flex-shrink: 0; margin-top: 4px; }

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
    display: flex; align-items: center; justify-content: center;
    padding: 52px 40px; overflow-y: auto;
  }
  .auth-box { width: 100%; max-width: 400px; }

  .auth-r-eyebrow {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10.5px; font-weight: 700; color: var(--green-dark);
    background: var(--green-light); border: 1px solid var(--green-mid);
    border-radius: 100px; padding: 4px 12px; margin-bottom: 18px; letter-spacing: .05em;
  }
  .auth-title    { font-size: 26px; font-weight: 800; letter-spacing: -.025em; color: var(--text-1); margin-bottom: 5px; }
  .auth-subtitle { font-size: 13.5px; color: var(--text-2); line-height: 1.65; margin-bottom: 28px; }

  .auth-org-notice {
    display: flex; align-items: center; gap: 9px;
    background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-sm);
    padding: 10px 14px; margin-bottom: 22px;
    font-size: 12px; color: var(--text-2);
  }
  .auth-org-notice-ico { font-size: 13px; flex-shrink: 0; }

  .auth-err-banner {
    background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: var(--r-sm);
    padding: 11px 14px; display: flex; align-items: flex-start; gap: 8px;
    font-size: 12.5px; color: #991B1B; margin-bottom: 16px; line-height: 1.55;
  }

  .auth-field { margin-bottom: 14px; }
  .auth-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
  .auth-iw { position: relative; }
  .auth-input {
    display: block; width: 100%; height: 50px; padding: 0 14px;
    border: 1.5px solid var(--border2); border-radius: var(--r-sm);
    font-size: 14px; color: var(--text-1); background: var(--white);
    font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .auth-input:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(22,168,122,.1); }
  .auth-input.pr  { padding-right: 46px; }
  .auth-eye {
    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; color: var(--text-3); font-size: 14px; padding: 0;
  }

  .auth-check-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .auth-check-lbl { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-2); cursor: pointer; }
  .auth-check-lbl input { accent-color: var(--green); cursor: pointer; }
  .auth-muted-a { font-size: 12px; color: var(--text-3); text-decoration: none; }
  .auth-muted-a:hover { color: var(--text-2); }

  .auth-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; height: 50px; border-radius: var(--r-sm);
    font-size: 14.5px; font-weight: 700; cursor: pointer; font-family: inherit;
    border: none; transition: background .15s, opacity .15s; margin-bottom: 12px;
  }
  .auth-btn.green { background: var(--green); color: #fff; }
  .auth-btn.green:hover { background: var(--green-dark); }
  .auth-btn.green:disabled { opacity: .5; cursor: not-allowed; }

  .auth-links { text-align: center; font-size: 13px; color: var(--text-3); }
  .auth-links a { color: var(--green-dark); font-weight: 600; text-decoration: none; }
  .auth-links a:hover { text-decoration: underline; }
  .auth-links .s { margin: 0 7px; color: var(--border2); }
  .auth-links.mt { margin-top: 10px; }

  .auth-signup-links {
    margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);
    display: flex; gap: 8px;
  }
  .auth-signup-link-btn {
    flex: 1; padding: 10px 12px; border: 1.5px solid var(--border2); border-radius: var(--r-sm);
    background: var(--white); cursor: pointer; font-family: inherit;
    transition: border-color .15s, background .15s; text-align: left;
  }
  .auth-signup-link-btn:hover { border-color: var(--green-mid); background: var(--green-light); }
  .auth-signup-link-top { font-size: 11px; font-weight: 700; color: var(--text-2); margin-bottom: 2px; }
  .auth-signup-link-sub { font-size: 10px; color: var(--text-3); }

  @media (max-width: 800px) {
    .auth-left { display: none; }
    .auth-right { padding: 32px 20px; }
    .auth-roles { grid-template-columns: 1fr; }
    .auth-signup-links { flex-direction: column; }
  }
`;

function mapLoginError(err) {
  const msg = err?.response?.data?.message ?? err?.response?.data ?? '';
  if (typeof msg === 'string') {
    if (msg.includes('존재하지 않는 회원')) return '등록된 계정을 찾을 수 없습니다.';
    if (msg.includes('비밀번호가 일치하지 않')) return '비밀번호가 올바르지 않습니다.';
  }
  return '이메일 또는 비밀번호가 올바르지 않습니다.';
}

const ADMIN_FEATURES = ['ESG 분석 및 자동 등급 산출', 'ESG 리포트 및 대시보드', '업종 벤치마크 비교'];
const USER_FEATURES  = ['친환경 활동 참여 및 공유', 'EcoPoint 즉시 적립', '포인트 리워드 사용'];

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken } = response.data;
      login(accessToken, refreshToken);
      const decoded = jwtDecode(accessToken);
      const role = decoded.role;
      if (role === 'SYSTEM_ADMIN' || role === 'COMPANY_ADMIN') {
        navigate('/analysis/dashboard');
      } else {
        navigate('/community');
      }
    } catch (err) {
      setError(mapLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{AUTH_STYLE}</style>
      <div className="auth-wrap">
        <div className="auth-page">

          {/* ── LEFT: 브랜드 + 역할 소개 ── */}
          <div className="auth-left">
            <span className="auth-l-eyebrow">🏢 기업 ESG 관리 솔루션</span>

            <h2 className="auth-l-headline">
              ESG 진단부터 임직원 참여까지<br />
              <em>하나의 플랫폼</em>으로 관리하세요
            </h2>
            <p className="auth-l-desc">
              기업 관리자는 ESG 분석과 리포트를,<br />
              임직원은 친환경 활동 참여와 리워드를 이용합니다.
            </p>

            <div className="auth-roles">
              <div className="auth-role-card">
                <div className="auth-role-ico">🏢</div>
                <div className="auth-role-title">기업 관리자</div>
                <ul className="auth-role-list">
                  {ADMIN_FEATURES.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <div className="auth-role-card">
                <div className="auth-role-ico">👤</div>
                <div className="auth-role-title">임직원</div>
                <ul className="auth-role-list">
                  {USER_FEATURES.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            </div>

          </div>

          {/* ── RIGHT: 로그인 폼 ── */}
          <div className="auth-right">
            <div className="auth-box">
              <span className="auth-r-eyebrow">🔐 조직 계정 로그인</span>
              <h1 className="auth-title">로그인</h1>
              <p className="auth-subtitle">
                회사 이메일로 로그인하면<br />소속 역할에 맞는 서비스로 자동 연결됩니다.
              </p>

              <div className="auth-org-notice">
                <span className="auth-org-notice-ico">🏢</span>
                <span>조직 이메일 계정으로만 로그인할 수 있습니다.</span>
              </div>

              {error && (
                <div className="auth-err-banner">
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="auth-field">
                  <label className="auth-label">회사 이메일</label>
                  <input
                    className="auth-input"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label">비밀번호</label>
                  <div className="auth-iw">
                    <input
                      className="auth-input pr"
                      type={showPw ? 'text' : 'password'}
                      placeholder="비밀번호를 입력하세요"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="auth-eye" onClick={() => setShowPw(p => !p)}>
                      {showPw ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="auth-check-row">
                  <label className="auth-check-lbl">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                    로그인 유지
                  </label>
                </div>

                <button type="submit" className="auth-btn green" disabled={loading}>
                  {loading ? '로그인 중...' : '로그인 →'}
                </button>
              </form>

              <div className="auth-links" style={{ marginBottom: 12 }}>
                아직 계정이 없으신가요?
              </div>
              <div className="auth-signup-links">
                <button className="auth-signup-link-btn" onClick={() => navigate('/signup')}>
                  <div className="auth-signup-link-top">👤 직원으로 가입</div>
                  <div className="auth-signup-link-sub">친환경 활동 참여 · EcoPoint 적립</div>
                </button>
                <button className="auth-signup-link-btn" onClick={() => navigate('/signup/admin')}>
                  <div className="auth-signup-link-top">🏢 회사 관리자 가입</div>
                  <div className="auth-signup-link-sub">기업 등록 · ESG 분석 시작</div>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Login;
