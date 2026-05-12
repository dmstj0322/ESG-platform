import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ─────────────────────────────────────────
   인라인 스타일 대신 CSS-in-JS 객체 방식 사용
   (기존 프로젝트 index.css와 충돌 방지를 위해
    랜딩 전용 스타일을 컴포넌트 상단에 <style> 태그로 주입)
───────────────────────────────────────── */
const LANDING_STYLE = `
  .eco-landing * { box-sizing: border-box; }
  .eco-landing {
    --green: #16A87A; --green-dark: #0D7A58; --green-light: #E6F7F1; --green-mid: #A8DFD0;
    --amber: #E8A020; --amber-light: #FEF3DC;
    --red: #C94040;
    --bg: #FAFAF9; --bg2: #F2F2F0; --bg3: #E8E8E5;
    --text-1: #111110; --text-2: #52524E; --text-3: #8A8A84;
    --border: #E2E2DE; --border2: #D0D0CA; --white: #FFFFFF;
    --r-sm: 8px; --r-md: 12px; --r-lg: 18px; --r-xl: 24px;
    --sh-md: 0 4px 16px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04);
    --sh-lg: 0 12px 48px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
    font-family: 'Pretendard', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text-1);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* NAV */
  .eco-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 3rem; height: 64px;
    background: rgba(250,250,249,.92); backdrop-filter: blur(18px);
    border-bottom: 1px solid var(--border);
  }
  .eco-nav-logo {
    display: flex; align-items: center; gap: 8px;
    font-size: 18px; font-weight: 700; color: var(--text-1); text-decoration: none; cursor: pointer;
  }
  .eco-logo-dot {
    width: 28px; height: 28px; border-radius: 8px; background: var(--green);
    display: flex; align-items: center; justify-content: center; font-size: 15px;
  }
  .eco-nav-links { display: flex; align-items: center; gap: 2rem; }
  .eco-nav-links a { font-size: 14px; color: var(--text-2); text-decoration: none; transition: color .15s; }
  .eco-nav-links a:hover { color: var(--text-1); }
  .eco-nav-cta {
    background: var(--text-1); color: #fff; border: none; border-radius: var(--r-sm);
    padding: 9px 20px; font-size: 14px; font-weight: 500; cursor: pointer;
    font-family: inherit; transition: opacity .15s;
  }
  .eco-nav-cta:hover { opacity: .82; }

  /* HERO */
  .eco-hero-wrap {
    max-width: 1200px; margin: 0 auto; padding: 112px 3rem 80px;
    display: flex; align-items: center; gap: 5rem;
  }
  .eco-hero-left { flex: 1; min-width: 0; }
  .eco-hero-eyebrow {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600; color: var(--green-dark);
    background: var(--green-light); border-radius: 100px; padding: 5px 14px;
    margin-bottom: 1.5rem; border: 1px solid var(--green-mid); letter-spacing: .04em;
  }
  .eco-hero-title {
    font-size: 52px; font-weight: 700; line-height: 1.15;
    letter-spacing: -.025em; margin-bottom: 1.25rem;
  }
  .eco-hero-title em { color: var(--green); font-style: normal; }
  .eco-hero-desc {
    font-size: 17px; color: var(--text-2); line-height: 1.8;
    max-width: 480px; margin-bottom: 2.5rem;
  }
  .eco-hero-btns { display: flex; gap: 12px; }
  .eco-btn-primary {
    background: var(--green); color: #fff; border: none; border-radius: var(--r-sm);
    padding: 14px 32px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: inherit; transition: background .15s; display: flex; align-items: center; gap: 8px;
  }
  .eco-btn-primary:hover { background: var(--green-dark); }
  .eco-btn-secondary {
    background: transparent; color: var(--text-1); border: 1.5px solid var(--border2);
    border-radius: var(--r-sm); padding: 14px 28px; font-size: 15px; font-weight: 500;
    cursor: pointer; font-family: inherit; transition: border-color .15s, background .15s;
  }
  .eco-btn-secondary:hover { border-color: var(--text-3); background: var(--bg2); }
  .eco-hero-stats {
    display: flex; gap: 2rem; margin-top: 2.5rem;
    padding-top: 2rem; border-top: 1px solid var(--border);
  }
  .eco-snum { font-size: 22px; font-weight: 700; color: var(--text-1); }
  .eco-snum span { color: var(--green); }
  .eco-slbl { font-size: 12px; color: var(--text-3); margin-top: 2px; }

  /* DEMO */
  .eco-hero-right { flex: 0 0 440px; }
  .eco-demo-wrap {
    background: var(--white); border-radius: var(--r-xl);
    border: 1px solid var(--border); box-shadow: var(--sh-lg); overflow: hidden;
  }
  .eco-demo-chrome {
    display: flex; align-items: center; gap: 7px; padding: 11px 14px;
    background: var(--bg2); border-bottom: 1px solid var(--border);
  }
  .eco-cdot { width: 10px; height: 10px; border-radius: 50%; }
  .eco-curl {
    flex: 1; height: 26px; background: var(--white); border-radius: 6px;
    border: 1px solid var(--border); display: flex; align-items: center;
    padding: 0 10px; font-size: 11px; color: var(--text-3); font-family: monospace;
    transition: opacity .25s;
  }
  .eco-demo-body { position: relative; height: 400px; overflow: hidden; }
  .eco-dp {
    position: absolute; inset: 0; padding: 18px;
    opacity: 0; transition: opacity .35s; pointer-events: none;
  }
  .eco-dp.active { opacity: 1; pointer-events: auto; }

  /* UI 공통 */
  .eco-uc {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--r-sm); padding: 11px 13px; margin-bottom: 9px;
  }
  .eco-ulbl { font-size: 10px; color: var(--text-3); margin-bottom: 3px; }
  .eco-uval { font-size: 16px; font-weight: 600; }
  .eco-urow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .eco-tag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 600; border-radius: 100px; padding: 3px 9px;
  }
  .eco-tg { background: var(--green-light); color: var(--green-dark); }
  .eco-ta { background: var(--amber-light); color: #7A4A00; }
  .eco-bt { height: 7px; background: var(--bg3); border-radius: 4px; overflow: hidden; margin: 5px 0; }
  .eco-bf { height: 100%; border-radius: 4px; transition: width 1.1s ease, background .5s; }
  .eco-abtn {
    width: 100%; background: var(--green); color: #fff; border: none;
    border-radius: var(--r-sm); padding: 10px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: background .2s, opacity .2s;
  }
  .eco-abtn.ghost {
    background: transparent; color: var(--text-1); border: 1.5px solid var(--border2);
  }
  .eco-av {
    width: 28px; height: 28px; border-radius: 50%; background: var(--green-mid);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--green-dark); flex-shrink: 0;
  }

  /* 마켓 */
  .eco-mgt { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-bottom: 10px; }
  .eco-mi {
    background: var(--bg); border: 1.5px solid var(--border);
    border-radius: var(--r-sm); padding: 9px 10px; cursor: pointer; transition: border-color .2s;
  }
  .eco-mi.sel { border-color: var(--green); }
  .eco-mico { font-size: 19px; margin-bottom: 3px; }
  .eco-mnm { font-size: 10px; font-weight: 600; color: var(--text-1); }
  .eco-mpt { font-size: 10px; color: var(--green); font-weight: 600; }

  /* ESG 바 */
  .eco-er { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .eco-ec { font-size: 11px; font-weight: 700; color: var(--text-2); width: 14px; }
  .eco-et { flex: 1; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
  .eco-ef { height: 100%; border-radius: 3px; transition: width 1.3s ease; }
  .eco-es { font-size: 11px; font-weight: 600; color: var(--text-1); width: 24px; text-align: right; }

  /* progress */
  .eco-ph { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .eco-ph span { font-size: 11px; color: var(--text-2); }
  .eco-ph b { font-size: 11px; color: var(--green); font-weight: 600; }

  /* 커서 */
  .eco-cur {
    width: 16px; height: 16px; background: rgba(22,168,122,.88); border-radius: 50%;
    position: absolute; z-index: 50; pointer-events: none; opacity: 0;
    box-shadow: 0 0 0 4px rgba(22,168,122,.2); transform: translate(-50%,-50%);
  }
  @keyframes ecoPopRing {
    0% { transform: translate(-50%,-50%) scale(1); opacity: .65; }
    100% { transform: translate(-50%,-50%) scale(3.2); opacity: 0; }
  }
  .eco-cur-ring {
    width: 16px; height: 16px; border: 2px solid var(--green); border-radius: 50%;
    position: absolute; z-index: 49; pointer-events: none; opacity: 0;
    transform: translate(-50%,-50%);
  }
  .eco-cur-ring.pop { animation: ecoPopRing .55s ease forwards; }

  /* 토스트 */
  .eco-toast {
    position: absolute; bottom: 14px; left: 50%;
    transform: translateX(-50%) translateY(14px);
    background: rgba(17,17,16,.93); color: #fff; border-radius: var(--r-sm);
    padding: 9px 16px; font-size: 12px; font-weight: 500; white-space: nowrap;
    z-index: 60; opacity: 0; transition: opacity .35s, transform .35s;
    display: flex; align-items: center; gap: 8px;
  }
  .eco-toast .td { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
  .eco-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* 탭 */
  .eco-demo-tabs { display: flex; background: var(--white); border-top: 1px solid var(--border); }
  .eco-dtab {
    flex: 1; padding: 10px 4px; font-size: 11px; font-weight: 500; color: var(--text-3);
    border: none; background: transparent; cursor: pointer; font-family: inherit;
    border-bottom: 2.5px solid transparent; transition: color .15s, border-color .15s;
  }
  .eco-dtab.on { color: var(--green); border-bottom-color: var(--green); font-weight: 700; }

  /* SECTIONS */
  .eco-section { padding: 96px 3rem; }
  .eco-inner { max-width: 1200px; margin: 0 auto; }
  .eco-eyebrow {
    font-size: 12px; font-weight: 700; color: var(--green);
    letter-spacing: .08em; text-transform: uppercase; margin-bottom: .75rem;
  }
  .eco-sec-title { font-size: 38px; font-weight: 700; line-height: 1.2; letter-spacing: -.02em; margin-bottom: 1rem; }
  .eco-sec-desc { font-size: 16px; color: var(--text-2); line-height: 1.75; max-width: 520px; }

  /* features */
  .eco-fgrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; margin-top: 3.5rem; }
  .eco-fcard {
    background: var(--white); border: 1px solid var(--border); border-radius: var(--r-lg);
    padding: 28px; transition: box-shadow .2s, transform .2s;
  }
  .eco-fcard:hover { box-shadow: var(--sh-md); transform: translateY(-2px); }
  .eco-ficon {
    width: 48px; height: 48px; border-radius: var(--r-sm); background: var(--green-light);
    display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 1rem;
  }
  .eco-ftitle { font-size: 17px; font-weight: 700; margin-bottom: .5rem; }
  .eco-fdesc { font-size: 14px; color: var(--text-2); line-height: 1.7; }

  /* how */
  .eco-how-bg { background: var(--text-1); }
  .eco-how-bg .eco-eyebrow { color: var(--green-mid); }
  .eco-how-bg .eco-sec-title { color: #fff; }
  .eco-how-bg .eco-sec-desc { color: rgba(255,255,255,.55); }
  .eco-sgrid { display: grid; grid-template-columns: repeat(4,1fr); gap: 24px; margin-top: 3.5rem; }
  .eco-scard {
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
    border-radius: var(--r-lg); padding: 28px;
  }
  .eco-step-num { font-size: 11px; font-weight: 700; color: var(--green); letter-spacing: .07em; margin-bottom: .75rem; }
  .eco-sicon { font-size: 26px; margin-bottom: .75rem; }
  .eco-stitle { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: .5rem; }
  .eco-sdesc { font-size: 13px; color: rgba(255,255,255,.5); line-height: 1.7; }

  /* reviews */
  .eco-rgrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
  .eco-rcard { background: var(--white); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 28px; }
  .eco-stars { font-size: 13px; color: var(--amber); margin-bottom: .75rem; }
  .eco-rquote { font-size: 15px; color: var(--text-1); line-height: 1.75; margin-bottom: 1.25rem; font-style: italic; }
  .eco-rauthor { display: flex; align-items: center; gap: 10px; }
  .eco-rav {
    width: 36px; height: 36px; border-radius: 50%; background: var(--green-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: var(--green-dark);
  }
  .eco-rname { font-size: 13px; font-weight: 600; }
  .eco-rrole { font-size: 12px; color: var(--text-3); margin-top: 1px; }

  /* CTA */
  .eco-cta-sec { background: var(--green); text-align: center; padding: 96px 3rem; }
  .eco-cta-sec h2 { font-size: 44px; font-weight: 700; color: #fff; letter-spacing: -.02em; margin-bottom: 1rem; line-height: 1.2; }
  .eco-cta-sec p { font-size: 17px; color: rgba(255,255,255,.8); margin-bottom: 2.5rem; line-height: 1.7; }
  .eco-btn-white {
    background: #fff; color: var(--green-dark); border: none; border-radius: var(--r-sm);
    padding: 16px 36px; font-size: 16px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: opacity .15s;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .eco-btn-white:hover { opacity: .9; }

  /* footer */
  .eco-footer {
    background: var(--text-1); padding: 3rem;
    display: flex; align-items: center; justify-content: space-between;
  }
  .eco-flogo { font-size: 16px; font-weight: 700; color: #fff; }
  .eco-fcopy { font-size: 13px; color: rgba(255,255,255,.3); }
  .eco-flinks { display: flex; gap: 1.5rem; }
  .eco-flinks a { font-size: 13px; color: rgba(255,255,255,.4); text-decoration: none; transition: color .15s; }
  .eco-flinks a:hover { color: rgba(255,255,255,.8); }

  /* reveal */
  .eco-reveal { opacity: 0; transform: translateY(20px); transition: opacity .6s ease, transform .6s ease; }
  .eco-reveal.visible { opacity: 1; transform: translateY(0); }
  .eco-d1 { transition-delay: .1s; }
  .eco-d2 { transition-delay: .2s; }
  .eco-d3 { transition-delay: .3s; }

  @media (max-width: 900px) {
    .eco-nav { padding: 0 1.25rem; }
    .eco-nav-links { display: none; }
    .eco-hero-wrap { flex-direction: column; padding: 90px 1.25rem 48px; gap: 2.5rem; }
    .eco-hero-right { flex: none; width: 100%; }
    .eco-hero-title { font-size: 34px; }
    .eco-section { padding: 56px 1.25rem; }
    .eco-fgrid, .eco-sgrid, .eco-rgrid { grid-template-columns: 1fr; }
    .eco-sec-title { font-size: 26px; }
    .eco-footer { flex-direction: column; gap: 1.25rem; text-align: center; }
  }
`;

/* ─────────────────────────────────────────
   커서 엔진 (클래스 기반, React ref 활용)
───────────────────────────────────────── */
function makeCursor(curEl, ringEl) {
  let cx = 80, cy = 380, tx = 80, ty = 380;
  let raf = null, alive = false;

  function frame() {
    if (!alive) return;
    cx += (tx - cx) * 0.13;
    cy += (ty - cy) * 0.13;
    if (curEl) { curEl.style.left = cx + 'px'; curEl.style.top = cy + 'px'; }
    raf = requestAnimationFrame(frame);
  }

  return {
    show() { alive = true; if (curEl) curEl.style.opacity = '1'; if (!raf) raf = requestAnimationFrame(frame); },
    hide() { alive = false; if (curEl) curEl.style.opacity = '0'; if (raf) { cancelAnimationFrame(raf); raf = null; } },
    reset(x, y) { cx = x; cy = y; tx = x; ty = y; if (curEl) { curEl.style.left = x + 'px'; curEl.style.top = y + 'px'; } },
    go(x, y, delay, settle, cb) { setTimeout(() => { tx = x; ty = y; if (cb) setTimeout(cb, settle || 380); }, delay); },
    click(x, y, delay) {
      setTimeout(() => {
        tx = x; ty = y;
        setTimeout(() => {
          if (!ringEl) return;
          ringEl.style.left = x + 'px'; ringEl.style.top = y + 'px';
          ringEl.classList.remove('pop'); void ringEl.offsetWidth; ringEl.classList.add('pop');
        }, 280);
      }, delay);
    },
  };
}

function getBtnPos(panelEl, btnEl) {
  if (!panelEl || !btnEl) return { x: 200, y: 300 };
  const pr = panelEl.getBoundingClientRect();
  const br = btnEl.getBoundingClientRect();
  return { x: br.left - pr.left + br.width / 2, y: br.top - pr.top + br.height / 2 };
}

/* ─────────────────────────────────────────
   메인 컴포넌트
───────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const demoBodyRef = useRef(null);
  const autoTRef = useRef(null);
  const curSceneRef = useRef(0);
  const cursorsRef = useRef({});

  // 탭 상태
  const [activeTab, setActiveTab] = useState(0);
  // URL 바 텍스트
  const [urlText, setUrlText] = useState('ecoplatform.co/dashboard');

  // Scene 0 상태
  const [s0Grade, setS0Grade] = useState('B+');
  const [s0BarW, setS0BarW] = useState('62%');
  const [s0BarColor, setS0BarColor] = useState('var(--amber)');
  const [s0BtnText, setS0BtnText] = useState('✅ 성과 확정 및 반영');
  const [s0BtnOpacity, setS0BtnOpacity] = useState(1);
  const [s0BtnBg, setS0BtnBg] = useState('var(--green)');
  const [s0DoneOpacity, setS0DoneOpacity] = useState(0);
  const [s0Toast, setS0Toast] = useState(false);

  // Scene 1 상태
  const [s1ImgOpacity, setS1ImgOpacity] = useState(0.3);
  const [s1ResOpacity, setS1ResOpacity] = useState(0);
  const [s1PillClass, setS1PillClass] = useState('eco-tag eco-ta');
  const [s1PillText, setS1PillText] = useState('🤖 AI 분석 중');
  const [s1Likes, setS1Likes] = useState(0);
  const [s1Toast, setS1Toast] = useState(false);

  // Scene 2 상태
  const [s2Pts, setS2Pts] = useState(12300);
  const [s2Cost, setS2Cost] = useState(1500);
  const [s2SelIdx, setS2SelIdx] = useState(0);
  const [s2BtnText, setS2BtnText] = useState('🛒 구매하기');
  const [s2BtnOpacity, setS2BtnOpacity] = useState(1);
  const [s2BtnBg, setS2BtnBg] = useState('var(--green)');
  const [s2Toast, setS2Toast] = useState(false);

  // Scene 3 상태
  const [s3UploadBg, setS3UploadBg] = useState('transparent');
  const [s3UploadBorder, setS3UploadBorder] = useState('var(--border2)');
  const [s3Ico, setS3Ico] = useState('📄');
  const [s3Lbl, setS3Lbl] = useState('지속가능경영 보고서 PDF 업로드');
  const [s3ShowProg, setS3ShowProg] = useState(false);
  const [s3ShowResult, setS3ShowResult] = useState(false);
  const [s3Pct, setS3Pct] = useState(0);
  const [s3PLbl, setS3PLbl] = useState('AI 분석 중...');
  const [s3Bars, setS3Bars] = useState([0, 0, 0]);
  const [s3Toast, setS3Toast] = useState(false);

  const URLS = ['ecoplatform.co/dashboard', 'ecoplatform.co/community', 'ecoplatform.co/market', 'ecoplatform.co/report'];
  const DURATIONS = [7200, 6400, 7200, 9000];

  function showToast(setter) {
    setter(true);
    setTimeout(() => setter(false), 2800);
  }

  /* Scene 0 */
  function resetS0() {
    setS0Grade('B+'); setS0BarW('62%'); setS0BarColor('var(--amber)');
    setS0BtnText('✅ 성과 확정 및 반영'); setS0BtnOpacity(1); setS0BtnBg('var(--green)');
    setS0DoneOpacity(0); setS0Toast(false);
  }
  function playS0() {
    resetS0();
    const C0 = cursorsRef.current.C0;
    if (!C0) return;
    C0.show();
    requestAnimationFrame(() => {
      const pos = getBtnPos(demoBodyRef.current, document.getElementById('eco-p0-btn'));
      C0.go(pos.x, pos.y, 800, 420, () => {
        C0.click(pos.x, pos.y, 0);
        setS0BtnText('⏳ 처리 중...'); setS0BtnOpacity(0.6);
        setTimeout(() => {
          setS0BarW('84%'); setS0BarColor('var(--green)');
          setS0Grade('A');
          setS0BtnText('✅ 확정 완료'); setS0BtnOpacity(1); setS0BtnBg('var(--green-dark)');
          setS0DoneOpacity(1);
          showToast(setS0Toast);
        }, 1100);
      });
    });
  }

  /* Scene 1 */
  function resetS1() {
    setS1ImgOpacity(0.3); setS1ResOpacity(0);
    setS1PillClass('eco-tag eco-ta'); setS1PillText('🤖 AI 분석 중');
    setS1Likes(0); setS1Toast(false);
  }
  function playS1() {
    resetS1();
    setTimeout(() => setS1ImgOpacity(1), 800);
    setTimeout(() => {
      setS1PillClass('eco-tag eco-tg'); setS1PillText('🤖 AI 인식 완료');
      setS1ResOpacity(1);
      showToast(setS1Toast);
      let n = 0;
      const iv = setInterval(() => { n++; setS1Likes(n); if (n >= 24) clearInterval(iv); }, 85);
    }, 2100);
  }

  /* Scene 2 */
  const mktItems = [
    { ico: '☕', name: '사내 카페 교환권', pt: 1500 },
    { ico: '🛒', name: '편의점 교환권', pt: 3000 },
    { ico: '🛍️', name: '친환경 에코백', pt: 5000 },
    { ico: '📚', name: '도서 상품권', pt: 4000 },
  ];
  function resetS2() {
    setS2Pts(12300); setS2Cost(1500); setS2SelIdx(0);
    setS2BtnText('🛒 구매하기'); setS2BtnOpacity(1); setS2BtnBg('var(--green)');
    setS2Toast(false);
  }
  function playS2() {
    resetS2();
    const C2 = cursorsRef.current.C2;
    if (!C2) return;
    C2.show();
    C2.go(290, 115, 700, 400, () => {
      C2.click(290, 115, 0);
      setS2SelIdx(1); setS2Cost(3000);
      const pos = getBtnPos(demoBodyRef.current, document.getElementById('eco-p2-btn'));
      C2.go(pos.x, pos.y, 1200, 400, () => {
        C2.click(pos.x, pos.y, 0);
        setS2BtnText('⏳ 처리 중...'); setS2BtnOpacity(0.6);
        setTimeout(() => {
          setS2Pts(prev => prev - 3000);
          setS2BtnText('✅ 구매 완료'); setS2BtnOpacity(1); setS2BtnBg('var(--green-dark)');
          showToast(setS2Toast);
        }, 900);
      });
    });
  }

  /* Scene 3 */
  function resetS3() {
    setS3UploadBg('transparent'); setS3UploadBorder('var(--border2)');
    setS3Ico('📄'); setS3Lbl('지속가능경영 보고서 PDF 업로드');
    setS3ShowProg(false); setS3ShowResult(false);
    setS3Pct(0); setS3PLbl('AI 분석 중...'); setS3Bars([0, 0, 0]); setS3Toast(false);
  }
  function playS3() {
    resetS3();
    const C3 = cursorsRef.current.C3;
    if (!C3) return;
    C3.show();
    requestAnimationFrame(() => {
      const panel = demoBodyRef.current;
      const upEl = document.getElementById('eco-p3-upload');
      const pos = getBtnPos(panel, upEl);
      C3.go(pos.x, pos.y, 600, 380, () => {
        C3.click(pos.x, pos.y, 0);
        setS3UploadBg('var(--green-light)'); setS3UploadBorder('var(--green-mid)');
        setS3Ico('✅'); setS3Lbl('sustainability_report_2025.pdf');
        C3.go(pos.x + 60, pos.y + 40, 600, 0);
        setTimeout(() => {
          C3.hide();
          setS3ShowProg(true);
          const stgs = ['데이터 정합성 확인...', '임직원 성과 반영 중...', 'KESG 기준 평가 중...', '리포트 생성 중...'];
          let pct = 0, si = 0;
          const iv = setInterval(() => {
            pct += 2;
            setS3Pct(Math.min(pct, 100));
            if (pct > 25 && si < 1) { si = 1; setS3PLbl(stgs[1]); }
            if (pct > 55 && si < 2) { si = 2; setS3PLbl(stgs[2]); }
            if (pct > 80 && si < 3) { si = 3; setS3PLbl(stgs[3]); }
            if (pct >= 100) {
              clearInterval(iv);
              setTimeout(() => {
                setS3ShowProg(false); setS3ShowResult(true);
                setTimeout(() => setS3Bars([82, 91, 76]), 100);
                showToast(setS3Toast);
              }, 350);
            }
          }, 60);
        }, 1000);
      });
    });
  }

  const PLAYS = [playS0, playS1, playS2, playS3];

  function jumpTo(n) {
    clearTimeout(autoTRef.current);
    const { C0, C2, C3 } = cursorsRef.current;
    C0?.hide(); C2?.hide(); C3?.hide();
    curSceneRef.current = n;
    setActiveTab(n);
    setUrlText(URLS[n]);
    PLAYS[n]();
    autoTRef.current = setTimeout(() => jumpTo((n + 1) % 4), DURATIONS[n]);
  }

  /* 커서 초기화 & 데모 시작 */
  useEffect(() => {
    cursorsRef.current = {
      C0: makeCursor(document.getElementById('eco-cur0'), document.getElementById('eco-ring0')),
      C2: makeCursor(document.getElementById('eco-cur2'), document.getElementById('eco-ring2')),
      C3: makeCursor(document.getElementById('eco-cur3'), document.getElementById('eco-ring3')),
    };
    jumpTo(0);
    return () => {
      clearTimeout(autoTRef.current);
      Object.values(cursorsRef.current).forEach(c => c?.hide());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 스크롤 reveal */
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll('.eco-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  /* Pretendard 폰트 로드 (없을 경우 대비) */
  useEffect(() => {
    if (!document.querySelector('link[href*="Pretendard"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Pretendard:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const gradeColor = s0Grade === 'A' ? 'var(--green)' : 'var(--amber)';
  const gradeCircleBg = s0Grade === 'A' ? 'var(--green-light)' : 'var(--amber-light)';

  return (
    <>
      {/* 스타일 주입 */}
      <style>{LANDING_STYLE}</style>

      <div className="eco-landing">

        {/* NAV */}
        <nav className="eco-nav">
          <div className="eco-nav-logo" onClick={() => navigate('/landing')}>
            <div className="eco-logo-dot">🌿</div>EcoESG
          </div>
          <div className="eco-nav-links">
            <a href="#eco-features" style={{ cursor: 'pointer' }}>기능</a>
            <a href="#eco-how" style={{ cursor: 'pointer' }}>도입 과정</a>
            <a href="#eco-reviews" style={{ cursor: 'pointer' }}>후기</a>
          </div>
          <button className="eco-nav-cta" onClick={() => navigate('/login')}>로그인 / 시작하기</button>
        </nav>

        {/* HERO */}
        <div className="eco-hero-wrap">
          <div className="eco-hero-left">
            <div className="eco-hero-eyebrow">🌱 ESG · 에코포인트 · AI 리포트</div>
            <h1 className="eco-hero-title">
              기업 ESG 경영의<br />모든 것,<br /><em>하나로 끝냅니다</em>
            </h1>
            <p className="eco-hero-desc">
              임직원 친환경 실천부터 AI 분석 보고서까지.<br />
              이제껏 경험 못 했던 쉽고 체계적인 ESG 경영,<br />
              EcoESG와 함께라면 당신의 조직이 달라질 거예요.
            </p>
            <div className="eco-hero-btns">
              <button className="eco-btn-primary" onClick={() => navigate('/login')}>→ 무료로 시작하기</button>
            </div>
            <div className="eco-hero-stats">
              <div><div className="eco-snum"><span>2,400+</span></div><div className="eco-slbl">도입 기업</div></div>
              <div><div className="eco-snum"><span>38%</span></div><div className="eco-slbl">평균 탄소 저감률</div></div>
              <div><div className="eco-snum"><span>1.2M+</span></div><div className="eco-slbl">임직원 에코 활동</div></div>
            </div>
          </div>

          {/* DEMO */}
          <div className="eco-hero-right">
            <div className="eco-demo-wrap">
              <div className="eco-demo-chrome">
                <div className="eco-cdot" style={{ background: '#ff5f57' }} />
                <div className="eco-cdot" style={{ background: '#febc2e' }} />
                <div className="eco-cdot" style={{ background: '#28c840' }} />
                <div className="eco-curl">{urlText}</div>
              </div>

              <div className="eco-demo-body" ref={demoBodyRef}>

                {/* P0 Dashboard */}
                <div className={`eco-dp${activeTab === 0 ? ' active' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>ESG 대시보드</span>
                    <span className="eco-tag eco-tg">🟢 실시간</span>
                  </div>
                  <div style={{ background: 'var(--amber-light)', border: '1px solid #F2D08C', borderRadius: 'var(--r-sm)', padding: '10px 13px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#7A4A00' }}>⏳ 반영 예정 에코포인트</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#4A2800' }}>+50,000 pt</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                    <div className="eco-uc" style={{ padding: 8, textAlign: 'center' }}><div className="eco-ulbl">에너지절감</div><div className="eco-uval" style={{ color: 'var(--green)', fontSize: 14 }}>12.4%</div></div>
                    <div className="eco-uc" style={{ padding: 8, textAlign: 'center' }}><div className="eco-ulbl">탄소저감</div><div className="eco-uval" style={{ color: 'var(--green)', fontSize: 14 }}>38.2t</div></div>
                    <div className="eco-uc" style={{ padding: 8, textAlign: 'center' }}><div className="eco-ulbl">현재등급</div><div className="eco-uval" style={{ color: gradeColor, fontSize: 14 }}>{s0Grade}</div></div>
                  </div>
                  <div className="eco-uc" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: gradeCircleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: gradeColor, flexShrink: 0, transition: 'all .5s' }}>{s0Grade}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>전체 ESG 점수</div>
                      <div className="eco-bt"><div className="eco-bf" style={{ width: s0BarW, background: s0BarColor }} /></div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>성과 확정 시 등급 상승 가능</div>
                    </div>
                  </div>
                  <button id="eco-p0-btn" className="eco-abtn" style={{ background: s0BtnBg, opacity: s0BtnOpacity }}>{s0BtnText}</button>
                  <div style={{ opacity: s0DoneOpacity, transition: 'opacity .4s', textAlign: 'center', fontSize: 11, color: 'var(--green)', fontWeight: 600, marginTop: 8 }}>50,000pt → 사회(S) 점수 반영 완료 ✓</div>
                  <div className={`eco-toast${s0Toast ? ' show' : ''}`}><div className="td" />등급이 B+ → A 로 상승했습니다 🎉</div>
                  <div className="eco-cur" id="eco-cur0" /><div className="eco-cur-ring" id="eco-ring0" />
                </div>

                {/* P1 Community */}
                <div className={`eco-dp${activeTab === 1 ? ' active' : ''}`}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>커뮤니티 피드</div>
                  <div className="eco-uc">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div className="eco-av">A</div>
                      <div><div style={{ fontSize: 12, fontWeight: 600 }}>김에코 · 마케팅팀</div><div style={{ fontSize: 10, color: 'var(--text-3)' }}>방금 전</div></div>
                      <div style={{ marginLeft: 'auto' }}><span className={s1PillClass}>{s1PillText}</span></div>
                    </div>
                    <div style={{ height: 78, background: 'linear-gradient(135deg,var(--green-light),var(--green-mid))', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 8, opacity: s1ImgOpacity, transition: 'opacity .7s' }}>🍃</div>
                    <div style={{ opacity: s1ResOpacity, transition: 'opacity .5s' }}>
                      <div className="eco-tag eco-tg" style={{ marginBottom: 7 }}>🤖 AI 인식 완료 · 텀블러 확인됨</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>🪙 +500 에코포인트 적립</div>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>❤️ {s1Likes}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>💬 7</span>
                      </div>
                    </div>
                  </div>
                  <div className="eco-uc" style={{ opacity: .5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="eco-av" style={{ background: 'var(--amber-light)', color: '#7A4A00' }}>B</div><div style={{ fontSize: 12, fontWeight: 600 }}>이그린 · 개발팀</div></div>
                    <div style={{ marginTop: 7 }}><span className="eco-tag eco-ta">⏳ 관리자 검토 대기 (신뢰도 0.63)</span></div>
                  </div>
                  <div className={`eco-toast${s1Toast ? ' show' : ''}`}><div className="td" />🪙 +500pt 에코포인트 적립됐어요</div>
                </div>

                {/* P2 Market */}
                <div className={`eco-dp${activeTab === 2 ? ' active' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>🛍️ 에코 마켓</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>잔여 <b style={{ color: 'var(--green)' }}>{s2Pts.toLocaleString()}</b> pt</span>
                  </div>
                  <div className="eco-mgt">
                    {mktItems.map((item, i) => (
                      <div key={i} className={`eco-mi${s2SelIdx === i ? ' sel' : ''}`} onClick={() => { setS2SelIdx(i); setS2Cost(item.pt); }}>
                        <div className="eco-mico">{item.ico}</div>
                        <div className="eco-mnm">{item.name}</div>
                        <div className="eco-mpt">{item.pt.toLocaleString()} pt</div>
                      </div>
                    ))}
                  </div>
                  <div className="eco-uc">
                    <div className="eco-urow"><span style={{ fontSize: 11, color: 'var(--text-2)' }}>차감 포인트</span><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)' }}>−{s2Cost.toLocaleString()} pt</span></div>
                    <div className="eco-urow"><span style={{ fontSize: 11, color: 'var(--text-2)' }}>구매 후 잔여</span><span style={{ fontSize: 11, fontWeight: 600 }}>{(s2Pts - s2Cost).toLocaleString()} pt</span></div>
                    <button id="eco-p2-btn" className="eco-abtn" style={{ marginTop: 8, background: s2BtnBg, opacity: s2BtnOpacity }}>{s2BtnText}</button>
                  </div>
                  <div className={`eco-toast${s2Toast ? ' show' : ''}`}><div className="td" />✉️ 교환권이 이메일로 발송됐어요</div>
                  <div className="eco-cur" id="eco-cur2" /><div className="eco-cur-ring" id="eco-ring2" />
                </div>

                {/* P3 Report */}
                <div className={`eco-dp${activeTab === 3 ? ' active' : ''}`}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧠 AI 종합 분석</div>
                  <div id="eco-p3-upload" style={{ border: `1.5px dashed ${s3UploadBorder}`, borderRadius: 'var(--r-sm)', padding: 16, textAlign: 'center', marginBottom: 9, transition: 'background .4s, border-color .4s', background: s3UploadBg }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{s3Ico}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s3Lbl}</div>
                  </div>
                  {s3ShowProg && (
                    <div style={{ marginBottom: 9 }}>
                      <div className="eco-ph"><span>{s3PLbl}</span><b>{s3Pct}%</b></div>
                      <div className="eco-bt"><div className="eco-bf" style={{ width: s3Pct + '%', background: 'var(--green)', transition: 'width .22s linear' }} /></div>
                    </div>
                  )}
                  {s3ShowResult && (
                    <div>
                      <div style={{ background: 'var(--green-light)', border: '1px solid var(--green-mid)', borderRadius: 'var(--r-sm)', padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                        <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--green-dark)' }}>A</div>
                        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-dark)' }}>최종 ESG 등급 · KESG 기준</div><div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>임직원 포인트 반영 후 B+ → A 상승 🎉</div></div>
                      </div>
                      {[['E', 82], ['S', 91], ['G', 76]].map(([lbl, val], i) => (
                        <div key={lbl} className="eco-er">
                          <div className="eco-ec">{lbl}</div>
                          <div className="eco-et"><div className="eco-ef" style={{ width: s3Bars[i] + '%', background: 'var(--green)' }} /></div>
                          <div className="eco-es">{val}</div>
                        </div>
                      ))}
                      <button className="eco-abtn ghost" style={{ marginTop: 9 }}>📥 ESG 리포트 PDF 다운로드</button>
                    </div>
                  )}
                  <div className={`eco-toast${s3Toast ? ' show' : ''}`}><div className="td" />✅ 분석 완료! ESG 등급 A 달성</div>
                  <div className="eco-cur" id="eco-cur3" /><div className="eco-cur-ring" id="eco-ring3" />
                </div>

              </div>{/* /demo-body */}

              <div className="eco-demo-tabs">
                {['대시보드', '커뮤니티', '에코 마켓', 'AI 리포트'].map((label, i) => (
                  <button key={i} className={`eco-dtab${activeTab === i ? ' on' : ''}`} onClick={() => jumpTo(i)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <section id="eco-features" className="eco-section" style={{ background: 'var(--bg2)' }}>
          <div className="eco-inner">
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <div className="eco-eyebrow">핵심 기능</div>
              <h2 className="eco-sec-title eco-reveal">ESG 경영에 필요한 모든 것</h2>
              <p className="eco-sec-desc eco-reveal eco-d1" style={{ margin: '0 auto' }}>분산된 데이터 수집부터 AI 분석, 임직원 참여까지 — 기업 ESG의 전 과정을 하나의 플랫폼에서 관리하세요.</p>
            </div>
            <div className="eco-fgrid">
              {[
                { ico: '📊', title: '실시간 ESG 대시보드', desc: 'API 연동 에너지 데이터와 임직원 에코포인트가 실시간 집계돼요. 분기별 성과를 한눈에 파악하고 즉시 확정할 수 있어요.' },
                { ico: '🤝', title: 'AI 기반 커뮤니티', desc: '친환경 활동 사진을 올리면 AI Vision이 즉시 인식하고 에코포인트를 자동 지급해요. 모호한 사진은 관리자가 검토해요.' },
                { ico: '🛍️', title: '에코 마켓', desc: '쌓인 에코포인트로 사내 교환권을 구매하세요. 실시간 재고 선점으로 구매 충돌 없이 즉시 이메일로 발송돼요.' },
                { ico: '🧠', title: 'AI ESG 리포트', desc: 'KESG 기준에 따라 정량 데이터와 임직원 성과를 결합한 최종 등급과 근거 리포트를 자동 생성해요.' },
                { ico: '📎', title: 'PDF RAG 분석', desc: '지속가능경영 보고서 PDF를 업로드하면 RAG 기반 AI가 내용을 분석해 ESG 등급 산출에 반영해요.' },
                { ico: '🔔', title: '실시간 알림', desc: '포인트 적립, 분석 완료, 등급 변동까지 — WebSocket 기반 실시간 알림으로 중요한 순간을 절대 놓치지 않아요.' },
              ].map((f, i) => (
                <div key={i} className={`eco-fcard eco-reveal${i % 3 === 1 ? ' eco-d1' : i % 3 === 2 ? ' eco-d2' : ''}`}>
                  <div className="eco-ficon">{f.ico}</div>
                  <div className="eco-ftitle">{f.title}</div>
                  <div className="eco-fdesc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW */}
        <section id="eco-how" className="eco-section eco-how-bg">
          <div className="eco-inner">
            <div className="eco-eyebrow">도입 과정</div>
            <h2 className="eco-sec-title eco-reveal">시작은 간단해요</h2>
            <p className="eco-sec-desc eco-reveal eco-d1">복잡한 설정 없이 빠르게 도입하고, 즉시 ESG 경영을 시작할 수 있어요.</p>
            <div className="eco-sgrid">
              {[
                { step: 'STEP 01', ico: '🔌', title: '에너지 API 연동', desc: '기존 에너지 관리 시스템과 API를 연결해요. 데이터가 자동으로 대시보드에 집계돼요.' },
                { step: 'STEP 02', ico: '👥', title: '임직원 초대', desc: '커뮤니티에 임직원을 초대하세요. 친환경 활동을 공유하고 에코포인트를 쌓기 시작해요.' },
                { step: 'STEP 03', ico: '📈', title: '성과 확정 & 분석', desc: '관리자가 임직원 성과를 검토하고 확정하면 AI가 자동으로 ESG 점수에 반영해요.' },
                { step: 'STEP 04', ico: '📋', title: '리포트 다운로드', desc: 'AI가 생성한 KESG 기준 ESG 리포트를 PDF로 다운로드해 바로 제출하세요.' },
              ].map((s, i) => (
                <div key={i} className={`eco-scard eco-reveal${i === 1 ? ' eco-d1' : i === 2 ? ' eco-d2' : i === 3 ? ' eco-d3' : ''}`}>
                  <div className="eco-step-num">{s.step}</div>
                  <div className="eco-sicon">{s.ico}</div>
                  <div className="eco-stitle">{s.title}</div>
                  <div className="eco-sdesc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* REVIEWS */}
        <section id="eco-reviews" className="eco-section">
          <div className="eco-inner">
            <div style={{ marginBottom: '3.5rem' }}>
              <div className="eco-eyebrow">고객 후기</div>
              <h2 className="eco-sec-title eco-reveal">이미 수천 개 기업이<br />경험하고 있어요</h2>
            </div>
            <div className="eco-rgrid">
              {[
                { init: '김', name: '김지현', role: 'A기업 ESG 담당 팀장', quote: '"분기마다 ESG 보고서 때문에 일주일씩 날렸는데, 이제 AI가 자동으로 만들어줘서 담당자가 다른 업무에 집중할 수 있게 됐어요."' },
                { init: '박', name: '박세영', role: 'B그룹 지속가능경영팀 매니저', quote: '"임직원들이 텀블러 쓰고 포인트 받아서 교환권 사는 문화가 생겼어요. 참여율이 3달 만에 4배 올랐고, 실제로 ESG 등급도 올라갔어요."' },
                { init: '이', name: '이민준', role: 'C사 CFO', quote: '"처음엔 반신반의했는데, AI가 KESG 기준으로 등급 근거까지 설명해주니 이사회 보고 자료로 그대로 쓸 수 있었어요."' },
              ].map((r, i) => (
                <div key={i} className={`eco-rcard eco-reveal${i === 1 ? ' eco-d1' : i === 2 ? ' eco-d2' : ''}`}>
                  <div className="eco-stars">★★★★★</div>
                  <div className="eco-rquote">{r.quote}</div>
                  <div className="eco-rauthor">
                    <div className="eco-rav">{r.init}</div>
                    <div><div className="eco-rname">{r.name}</div><div className="eco-rrole">{r.role}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="eco-cta-sec">
          <h2>지금 바로 시작해보세요</h2>
          <p>임직원의 작은 실천이 기업의 ESG 등급을 바꿉니다.<br />EcoESG와 함께 지속가능한 경영을 시작하세요.</p>
          <button className="eco-btn-white" onClick={() => navigate('/login')}>🌿 무료 체험 시작하기</button>
        </div>

        {/* FOOTER */}
        <footer className="eco-footer">
          <div className="eco-flogo">🌿 EcoESG</div>
          <div className="eco-flinks">
            <a href="#">서비스 소개</a><a href="#">요금제</a>
            <a href="#">개인정보처리방침</a><a href="#">이용약관</a><a href="#">고객센터</a>
          </div>
          <div className="eco-fcopy">© 2025 EcoESG. All rights reserved.</div>
        </footer>

      </div>
    </>
  );
}