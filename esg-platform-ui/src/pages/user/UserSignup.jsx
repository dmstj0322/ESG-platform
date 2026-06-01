import React, { useState } from 'react';
import api from '../../api/api';
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
  .auth-subtitle { font-size: 13.5px; color: var(--text-2); line-height: 1.65; margin-bottom: 22px; }

  .auth-info-banner {
    background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: var(--r-sm);
    padding: 11px 14px; display: flex; align-items: flex-start; gap: 9px;
    font-size: 12.5px; color: #0369A1; line-height: 1.6; margin-bottom: 22px;
  }
  .auth-info-icon { flex-shrink: 0; margin-top: 1px; font-size: 14px; }

  .auth-err-banner {
    background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: var(--r-sm);
    padding: 11px 14px; display: flex; align-items: flex-start; gap: 8px;
    font-size: 12.5px; color: #991B1B; margin-bottom: 16px; line-height: 1.55;
  }

  .auth-field { margin-bottom: 14px; }
  .auth-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
  .auth-label-note { font-weight: 400; color: var(--text-3); font-size: 11px; margin-left: 5px; }
  .auth-iw { position: relative; }
  .auth-input {
    display: block; width: 100%; height: 50px; padding: 0 14px;
    border: 1.5px solid var(--border2); border-radius: var(--r-sm);
    font-size: 14px; color: var(--text-1); background: var(--white);
    font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .auth-input:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(22,168,122,.1); }
  .auth-input.pr { padding-right: 46px; }
  .auth-eye {
    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; color: var(--text-3); font-size: 14px; padding: 0;
  }
  .auth-hint { font-size: 11px; color: var(--text-3); margin-top: 5px; line-height: 1.5; }

  .auth-pw-bar  { height: 3px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin-top: 8px; }
  .auth-pw-fill { height: 100%; border-radius: 2px; transition: width .3s ease, background .3s ease; }
  .auth-pw-row  { display: flex; align-items: center; justify-content: space-between; margin-top: 5px; }
  .auth-pw-lbl  { font-size: 11px; font-weight: 600; }

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

  @media (max-width: 767px) {
    .auth-left { display: none; }
    .auth-right { padding: 24px 16px; align-items: flex-start; }
  }
`;

function mapSignupError(msg) {
  if (!msg) return '가입 중 오류가 발생했습니다. 다시 시도해주세요.';
  if (msg.includes('등록되지 않은 회사') || msg.includes('회사 관리자에게')) {
    return '등록되지 않은 회사 도메인입니다. 회사 관리자가 먼저 기업을 등록해야 합니다.';
  }
  if (msg.includes('이미 존재하는 이메일')) {
    return '이미 사용 중인 이메일입니다. 로그인 페이지에서 로그인해주세요.';
  }
  return msg;
}

const FEATURES = [
  { ico: '🌱', t: '친환경 활동 참여', d: '회사 ESG 캠페인 및 친환경 활동에 참여합니다' },
  { ico: '⚡', t: 'EcoPoint 즉시 적립', d: 'AI가 활동을 자동 인식하고 포인트를 즉시 지급합니다' },
  { ico: '🎁', t: '포인트 리워드 사용', d: '적립된 EcoPoint로 다양한 리워드를 사용합니다' },
];

const UserSignup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const pwLen = password.length;
  const isPasswordValid = pwLen >= 8;
  const isFormValid = isPasswordValid && email && nickname;

  let pw = { label: '', color: '', w: 0 };
  if (pwLen > 0 && pwLen < 8)        pw = { label: '취약',  color: '#C94040', w: 30 };
  else if (pwLen >= 8 && pwLen < 12) pw = { label: '보통', color: '#D97706', w: 65 };
  else if (pwLen >= 12)              pw = { label: '강함', color: '#16A87A', w: 100 };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/signup/user', { email, password, nickname });
      alert('가입이 완료됐습니다! 로그인 페이지로 이동합니다.');
      navigate('/login');
    } catch (err) {
      setError(mapSignupError(err.response?.data?.message || err.response?.data));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{AUTH_STYLE}</style>
      <div className="auth-wrap">
        <div className="auth-page">

          {/* ── LEFT: 직원 역할 소개 ── */}
          <div className="auth-left">
            <span className="auth-l-eyebrow">🌱 임직원 친환경 활동</span>

            <h2 className="auth-l-headline">
              우리 회사 친환경 활동에<br />
              <em>참여하고</em> EcoPoint를<br />
              적립하세요
            </h2>
            <p className="auth-l-desc">
              회사 이메일로 가입하면 소속 기업의<br />
              ESG 활동 캠페인에 바로 참여할 수 있습니다.
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

          {/* ── RIGHT: 직원 가입 폼 ── */}
          <div className="auth-right">
            <div className="auth-box">
              <span className="auth-r-eyebrow">👤 직원 가입</span>
              <h1 className="auth-title">직원 가입</h1>
              <p className="auth-subtitle">
                회사 이메일로 가입하면<br />소속 기업과 자동으로 연결됩니다.
              </p>

              <div className="auth-info-banner">
                <span className="auth-info-icon">ℹ️</span>
                <span>
                  <strong>회사 이메일 도메인</strong>을 기반으로 등록된 기업에 자동 연결됩니다.
                  회사가 아직 미등록이라면{' '}
                  <Link to="/signup/admin" style={{ color: '#0369A1', fontWeight: 600 }}>
                    관리자 가입
                  </Link>
                  이 먼저 필요합니다.
                </span>
              </div>

              {error && (
                <div className="auth-err-banner">
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSignup}>
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
                  <p className="auth-hint">회사 도메인이 포함된 이메일을 입력해 주세요.</p>
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
                      placeholder="비밀번호를 입력하세요"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
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
                  <label className="auth-label">
                    이름
                    <span className="auth-label-note">실명 권장</span>
                  </label>
                  <input
                    className="auth-input"
                    type="text"
                    placeholder="홍길동"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="auth-btn green"
                  disabled={!isFormValid || loading}
                  style={{ marginTop: 8, marginBottom: 24 }}
                >
                  {loading ? '가입 처리 중...' : '가입하기 →'}
                </button>
              </form>

              <div className="auth-links">
                이미 계정이 있으신가요?
                <span className="s">·</span>
                <Link to="/login">로그인</Link>
              </div>
              <div className="auth-links mt">
                회사를 새로 등록해야 하나요?
                <span className="s">·</span>
                <Link to="/signup/admin">관리자로 가입</Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default UserSignup;
