import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LANDING_STYLE = `
  .eco-landing * { box-sizing: border-box; }
  .eco-landing {
    --green: #16A87A; --green-dark: #0D7A58; --green-light: #E6F7F1; --green-mid: #A8DFD0;
    --amber: #D97706; --amber-light: #FEF3DC;
    --red: #C94040; --red-light: #FEF2F2;
    --indigo: #4F46E5; --indigo-light: #EEF2FF;
    --blue: #2563EB; --blue-light: #EFF6FF;
    --bg: #FAFAFA; --bg2: #F4F4F2; --bg3: #E8E8E5;
    --text-1: #0F0F0E; --text-2: #4A4A46; --text-3: #898983;
    --border: #E2E2DE; --border2: #CCCCC6; --white: #FFFFFF;
    --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 22px;
    --sh-sm: 0 1px 4px rgba(0,0,0,.06), 0 0 1px rgba(0,0,0,.04);
    --sh-md: 0 4px 16px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04);
    --sh-lg: 0 12px 48px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
    font-family: 'Pretendard', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text-1);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ── NAV ── */
  .eco-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 3rem; height: 60px;
    background: rgba(250,250,250,.95); backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
  }
  .eco-nav-logo {
    display: flex; align-items: center; gap: 8px;
    font-size: 17px; font-weight: 700; color: var(--text-1); text-decoration: none; cursor: pointer;
  }
  .eco-logo-dot {
    width: 28px; height: 28px; border-radius: 8px; background: var(--green);
    display: flex; align-items: center; justify-content: center; font-size: 14px;
  }
  .eco-nav-badge {
    font-size: 10px; font-weight: 700; color: var(--indigo);
    background: var(--indigo-light); border-radius: 4px; padding: 2px 7px;
    letter-spacing: .03em;
  }
  .eco-nav-links { display: flex; align-items: center; gap: 2rem; }
  .eco-nav-links a { font-size: 13.5px; color: var(--text-2); text-decoration: none; transition: color .15s; }
  .eco-nav-links a:hover { color: var(--text-1); }
  .eco-nav-cta {
    background: var(--text-1); color: #fff; border: none; border-radius: var(--r-sm);
    padding: 8px 18px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    font-family: inherit; transition: opacity .15s;
  }
  .eco-nav-cta:hover { opacity: .82; }

  /* ── HERO ── */
  .eco-hero-wrap {
    max-width: 1200px; margin: 0 auto; padding: 104px 3rem 72px;
    display: flex; align-items: center; gap: 5rem;
  }
  .eco-hero-left { flex: 1; min-width: 0; }
  .eco-hero-eyebrow {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; font-weight: 700; color: var(--green-dark);
    background: var(--green-light); border-radius: 100px; padding: 5px 14px;
    margin-bottom: 1.5rem; border: 1px solid var(--green-mid); letter-spacing: .05em;
  }
  .eco-hero-title {
    font-size: 50px; font-weight: 800; line-height: 1.15;
    letter-spacing: -.03em; margin-bottom: 1.25rem;
  }
  .eco-hero-title em { color: var(--green); font-style: normal; }
  .eco-hero-title strong { color: var(--text-1); }
  .eco-hero-desc {
    font-size: 16px; color: var(--text-2); line-height: 1.85;
    max-width: 480px; margin-bottom: 2rem;
  }
  .eco-hero-flow {
    display: flex; align-items: center; gap: 8px; margin-bottom: 2rem; flex-wrap: wrap;
  }
  .eco-flow-step {
    font-size: 12px; font-weight: 600; color: var(--text-2);
    background: var(--bg3); border-radius: 6px; padding: 5px 11px; border: 1px solid var(--border2);
  }
  .eco-flow-arr { font-size: 12px; color: var(--text-3); }
  .eco-hero-btns { display: flex; gap: 12px; margin-bottom: 2.5rem; }
  .eco-btn-primary {
    background: var(--green); color: #fff; border: none; border-radius: var(--r-sm);
    padding: 13px 28px; font-size: 14.5px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: background .15s; display: flex; align-items: center; gap: 8px;
  }
  .eco-btn-primary:hover { background: var(--green-dark); }
  .eco-btn-secondary {
    background: transparent; color: var(--text-1); border: 1.5px solid var(--border2);
    border-radius: var(--r-sm); padding: 13px 24px; font-size: 14.5px; font-weight: 500;
    cursor: pointer; font-family: inherit; transition: border-color .15s, background .15s;
  }
  .eco-btn-secondary:hover { border-color: var(--text-3); background: var(--bg2); }

  /* ── HERO KPI PILLS ── */
  .eco-hero-kpis {
    display: flex; gap: 10px; padding-top: 1.75rem;
    border-top: 1px solid var(--border); flex-wrap: wrap;
  }
  .eco-kpi-pill {
    display: flex; align-items: center; gap: 7px;
    background: var(--white); border: 1px solid var(--border); border-radius: var(--r-sm);
    padding: 8px 14px;
  }
  .eco-kpi-icon { font-size: 15px; }
  .eco-kpi-text { font-size: 12px; font-weight: 600; color: var(--text-2); }

  /* ── DEMO ── */
  .eco-hero-right { flex: 0 0 448px; }
  .eco-demo-wrap {
    background: var(--white); border-radius: var(--r-xl);
    border: 1px solid var(--border); box-shadow: var(--sh-lg); overflow: hidden;
  }
  .eco-demo-chrome {
    display: flex; align-items: center; gap: 7px; padding: 10px 14px;
    background: var(--bg2); border-bottom: 1px solid var(--border);
  }
  .eco-cdot { width: 10px; height: 10px; border-radius: 50%; }
  .eco-curl {
    flex: 1; height: 24px; background: var(--white); border-radius: 5px;
    border: 1px solid var(--border); display: flex; align-items: center;
    padding: 0 10px; font-size: 11px; color: var(--text-3); font-family: monospace;
  }
  .eco-demo-body { position: relative; height: 410px; overflow: hidden; }
  .eco-dp {
    position: absolute; inset: 0; padding: 16px;
    opacity: 0; transition: opacity .35s; pointer-events: none;
  }
  .eco-dp.active { opacity: 1; pointer-events: auto; }

  /* ── UI 공통 ── */
  .eco-uc {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--r-sm); padding: 10px 12px; margin-bottom: 8px;
  }
  .eco-ulbl { font-size: 10px; color: var(--text-3); margin-bottom: 3px; font-weight: 500; }
  .eco-uval { font-size: 15px; font-weight: 700; }
  .eco-urow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .eco-tag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 700; border-radius: 4px; padding: 3px 8px;
    letter-spacing: .02em;
  }
  .eco-tg { background: var(--green-light); color: var(--green-dark); }
  .eco-ta { background: var(--amber-light); color: #92400E; }
  .eco-ti { background: var(--indigo-light); color: #4338CA; }
  .eco-tr { background: var(--red-light); color: #991B1B; }
  .eco-bt { height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden; margin: 5px 0; }
  .eco-bf { height: 100%; border-radius: 3px; transition: width 1.1s ease, background .5s; }
  .eco-abtn {
    width: 100%; background: var(--green); color: #fff; border: none;
    border-radius: var(--r-sm); padding: 10px; font-size: 12.5px; font-weight: 700;
    cursor: pointer; font-family: inherit;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: background .2s, opacity .2s;
  }
  .eco-abtn.ghost {
    background: transparent; color: var(--text-1); border: 1.5px solid var(--border2);
  }
  .eco-av {
    width: 27px; height: 27px; border-radius: 50%; background: var(--green-mid);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: var(--green-dark); flex-shrink: 0;
  }

  /* ── 신뢰도 바 ── */
  .eco-conf-wrap { margin-bottom: 8px; }
  .eco-conf-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .eco-conf-lbl { font-size: 10px; color: var(--text-3); font-weight: 500; }
  .eco-conf-val { font-size: 11px; font-weight: 700; color: var(--green-dark); }
  .eco-conf-bar { height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
  .eco-conf-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--green), #34D399); transition: width 1s ease; }

  /* ── Delta badge ── */
  .eco-delta {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px;
  }
  .eco-delta-up { background: var(--green-light); color: var(--green-dark); }
  .eco-delta-down { background: var(--red-light); color: #991B1B; }

  /* ── 마켓 ── */
  .eco-mgt { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 9px; }
  .eco-mi {
    background: var(--bg); border: 1.5px solid var(--border);
    border-radius: var(--r-sm); padding: 9px 10px; cursor: pointer; transition: border-color .2s;
  }
  .eco-mi.sel { border-color: var(--green); background: var(--green-light); }
  .eco-mico { font-size: 18px; margin-bottom: 3px; }
  .eco-mnm { font-size: 10px; font-weight: 600; color: var(--text-1); }
  .eco-mpt { font-size: 10px; color: var(--green); font-weight: 700; }

  /* ── ESG 바 ── */
  .eco-er { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .eco-ec { font-size: 11px; font-weight: 800; color: var(--text-2); width: 14px; }
  .eco-et { flex: 1; height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
  .eco-ef { height: 100%; border-radius: 3px; transition: width 1.3s ease; }
  .eco-es { font-size: 11px; font-weight: 700; color: var(--text-1); width: 24px; text-align: right; }

  /* ── progress ── */
  .eco-ph { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .eco-ph span { font-size: 10.5px; color: var(--text-2); }
  .eco-ph b { font-size: 10.5px; color: var(--green); font-weight: 700; }

  /* ── Audit Alert ── */
  .eco-audit-alert {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--amber-light); border: 1px solid #FDE68A;
    border-radius: var(--r-sm); padding: 8px 10px; margin-bottom: 8px; font-size: 10px; color: #78350F;
  }
  .eco-audit-ok {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--green-light); border: 1px solid var(--green-mid);
    border-radius: var(--r-sm); padding: 8px 10px; margin-bottom: 8px; font-size: 10px; color: var(--green-dark);
  }

  /* ── Pulse animation ── */
  @keyframes ecoPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .45; }
  }
  .eco-pulse { animation: ecoPulse 1.4s ease-in-out infinite; }

  /* ── 커서 ── */
  .eco-cur {
    width: 14px; height: 14px; background: rgba(22,168,122,.9); border-radius: 50%;
    position: absolute; z-index: 50; pointer-events: none; opacity: 0;
    box-shadow: 0 0 0 4px rgba(22,168,122,.2); transform: translate(-50%,-50%);
  }
  @keyframes ecoPopRing {
    0% { transform: translate(-50%,-50%) scale(1); opacity: .65; }
    100% { transform: translate(-50%,-50%) scale(3.2); opacity: 0; }
  }
  .eco-cur-ring {
    width: 14px; height: 14px; border: 2px solid var(--green); border-radius: 50%;
    position: absolute; z-index: 49; pointer-events: none; opacity: 0;
    transform: translate(-50%,-50%);
  }
  .eco-cur-ring.pop { animation: ecoPopRing .55s ease forwards; }

  /* ── 토스트 ── */
  .eco-toast {
    position: absolute; bottom: 12px; left: 50%;
    transform: translateX(-50%) translateY(14px);
    background: rgba(15,15,14,.93); color: #fff; border-radius: var(--r-sm);
    padding: 8px 15px; font-size: 12px; font-weight: 500; white-space: nowrap;
    z-index: 60; opacity: 0; transition: opacity .35s, transform .35s;
    display: flex; align-items: center; gap: 7px;
  }
  .eco-toast .td { width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
  .eco-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* ── 탭 ── */
  .eco-demo-tabs { display: flex; background: var(--bg2); border-top: 1px solid var(--border); }
  .eco-dtab {
    flex: 1; padding: 9px 4px; font-size: 11px; font-weight: 500; color: var(--text-3);
    border: none; background: transparent; cursor: pointer; font-family: inherit;
    border-bottom: 2.5px solid transparent; transition: color .15s, border-color .15s;
  }
  .eco-dtab.on { color: var(--green); border-bottom-color: var(--green); font-weight: 700; }

  /* ── SECTIONS ── */
  .eco-section { padding: 88px 3rem; }
  .eco-inner { max-width: 1200px; margin: 0 auto; }
  .eco-eyebrow {
    font-size: 11px; font-weight: 800; color: var(--green);
    letter-spacing: .1em; text-transform: uppercase; margin-bottom: .75rem;
  }
  .eco-sec-title { font-size: 36px; font-weight: 800; line-height: 1.2; letter-spacing: -.025em; margin-bottom: 1rem; }
  .eco-sec-desc { font-size: 15.5px; color: var(--text-2); line-height: 1.8; max-width: 520px; }

  /* ── Features ── */
  .eco-fgrid { display: grid; grid-template-columns: repeat(2,1fr); gap: 24px; margin-top: 3.5rem; }
  .eco-fcard {
    background: var(--white); border: 1px solid var(--border); border-radius: var(--r-lg);
    padding: 28px; transition: box-shadow .2s, transform .2s, border-color .2s;
  }
  .eco-fcard:hover { box-shadow: var(--sh-md); transform: translateY(-2px); border-color: var(--border2); }
  .eco-fcard.primary { border-color: var(--green-mid); background: var(--green-light); }
  .eco-fcard.primary:hover { box-shadow: 0 8px 24px rgba(22,168,122,.15); }
  .eco-ficon {
    width: 44px; height: 44px; border-radius: var(--r-sm); background: var(--green-light);
    display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 1rem;
  }
  .eco-fcard.primary .eco-ficon { background: var(--white); }
  .eco-ftitle { font-size: 17px; font-weight: 800; margin-bottom: .4rem; }
  .eco-fdesc { font-size: 13.5px; color: var(--text-2); line-height: 1.7; margin-bottom: 1rem; }
  .eco-fbullets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .eco-fbullets li {
    font-size: 12.5px; color: var(--text-2); display: flex; align-items: center; gap: 8px;
  }
  .eco-fbullets li::before {
    content: ''; width: 5px; height: 5px; border-radius: 50%;
    background: var(--green); flex-shrink: 0;
  }
  .eco-fcard.primary .eco-fdesc { color: var(--green-dark); }
  .eco-fcard.primary .eco-fbullets li { color: var(--green-dark); }
  .eco-fcard.primary .eco-ftitle { color: var(--green-dark); }

  /* ── Steps ── */
  .eco-how-bg { background: var(--text-1); }
  .eco-how-bg .eco-eyebrow { color: var(--green-mid); }
  .eco-how-bg .eco-sec-title { color: #fff; }
  .eco-how-bg .eco-sec-desc { color: rgba(255,255,255,.5); }
  .eco-sgrid { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; margin-top: 3.5rem; }
  .eco-scard {
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
    border-radius: var(--r-lg); padding: 26px; transition: background .2s;
  }
  .eco-scard:hover { background: rgba(255,255,255,.08); }
  .eco-step-num {
    font-size: 10px; font-weight: 800; color: var(--green); letter-spacing: .1em;
    margin-bottom: .75rem; font-family: monospace;
  }
  .eco-sicon { font-size: 24px; margin-bottom: .75rem; }
  .eco-stitle { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: .5rem; }
  .eco-sdesc { font-size: 12.5px; color: rgba(255,255,255,.48); line-height: 1.75; }
  .eco-step-connector {
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,.2); font-size: 18px; margin-top: 3.5rem;
  }

  /* ── Supplementary badge ── */
  .eco-supp-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 700; color: rgba(255,255,255,.4);
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
    border-radius: 4px; padding: 3px 9px; margin-top: .5rem; letter-spacing: .04em;
  }

  /* ── Reviews ── */
  .eco-rgrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
  .eco-rcard {
    background: var(--white); border: 1px solid var(--border); border-radius: var(--r-lg);
    padding: 26px; transition: box-shadow .2s;
  }
  .eco-rcard:hover { box-shadow: var(--sh-md); }
  .eco-stars { font-size: 12px; color: var(--amber); margin-bottom: .75rem; letter-spacing: 1px; }
  .eco-rquote { font-size: 14px; color: var(--text-1); line-height: 1.8; margin-bottom: 1.25rem; }
  .eco-rauthor { display: flex; align-items: center; gap: 10px; }
  .eco-rav {
    width: 34px; height: 34px; border-radius: 50%; background: var(--green-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: var(--green-dark);
  }
  .eco-rname { font-size: 13px; font-weight: 700; }
  .eco-rrole { font-size: 11.5px; color: var(--text-3); margin-top: 1px; }

  /* ── CTA ── */
  .eco-cta-sec { background: var(--text-1); text-align: center; padding: 88px 3rem; }
  .eco-cta-sec h2 { font-size: 40px; font-weight: 800; color: #fff; letter-spacing: -.025em; margin-bottom: 1rem; line-height: 1.2; }
  .eco-cta-sec p { font-size: 16px; color: rgba(255,255,255,.55); margin-bottom: 2rem; line-height: 1.75; }
  .eco-cta-flow { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 2.5rem; flex-wrap: wrap; }
  .eco-cta-step {
    font-size: 12px; font-weight: 600; color: rgba(255,255,255,.55);
    background: rgba(255,255,255,.08); border-radius: 6px; padding: 5px 12px;
    border: 1px solid rgba(255,255,255,.12);
  }
  .eco-cta-arr { color: rgba(255,255,255,.25); font-size: 13px; }
  .eco-btn-green {
    background: var(--green); color: #fff; border: none; border-radius: var(--r-sm);
    padding: 15px 32px; font-size: 15px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: background .15s;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .eco-btn-green:hover { background: var(--green-dark); }

  /* ── Footer ── */
  .eco-footer {
    background: var(--text-1); padding: 2.5rem 3rem;
    display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid rgba(255,255,255,.07);
  }
  .eco-flogo { font-size: 15px; font-weight: 700; color: #fff; }
  .eco-fcopy { font-size: 12px; color: rgba(255,255,255,.25); }
  .eco-flinks { display: flex; gap: 1.5rem; }
  .eco-flinks a { font-size: 12.5px; color: rgba(255,255,255,.38); text-decoration: none; transition: color .15s; }
  .eco-flinks a:hover { color: rgba(255,255,255,.75); }

  /* ── Reveal animation ── */
  .eco-reveal { opacity: 0; transform: translateY(18px); transition: opacity .55s ease, transform .55s ease; }
  .eco-reveal.visible { opacity: 1; transform: translateY(0); }
  .eco-d1 { transition-delay: .1s; }
  .eco-d2 { transition-delay: .2s; }
  .eco-d3 { transition-delay: .3s; }

  @media (max-width: 900px) {
    .eco-nav { padding: 0 1.25rem; }
    .eco-nav-links { display: none; }
    .eco-hero-wrap { flex-direction: column; padding: 86px 1.25rem 48px; gap: 2.5rem; }
    .eco-hero-right { flex: none; width: 100%; }
    .eco-hero-title { font-size: 32px; }
    .eco-section { padding: 56px 1.25rem; }
    .eco-fgrid, .eco-sgrid, .eco-rgrid { grid-template-columns: 1fr; }
    .eco-sec-title { font-size: 26px; }
    .eco-footer { flex-direction: column; gap: 1.25rem; text-align: center; }
  }
`;

/* ─── 커서 엔진 (원본 유지) ─── */
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

/* ─── 메인 컴포넌트 ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  const demoBodyRef = useRef(null);
  const autoTRef = useRef(null);
  const curSceneRef = useRef(0);
  const cursorsRef = useRef({});

  const [activeTab, setActiveTab] = useState(0);
  const [urlText, setUrlText] = useState('esgaudit.app/audit');

  // Scene 0 — AI Audit Dashboard
  const [s0Grade, setS0Grade] = useState('B+');
  const [s0BarW, setS0BarW] = useState('62%');
  const [s0BarColor, setS0BarColor] = useState('var(--amber)');
  const [s0BtnText, setS0BtnText] = useState('🔍 AI ESG Audit 실행');
  const [s0BtnOpacity, setS0BtnOpacity] = useState(1);
  const [s0BtnBg, setS0BtnBg] = useState('var(--green)');
  const [s0DoneOpacity, setS0DoneOpacity] = useState(0);
  const [s0Toast, setS0Toast] = useState(false);
  const [s0Conf, setS0Conf] = useState(67);
  const [s0EvidCnt, setS0EvidCnt] = useState('8 / 12');

  // Scene 1 — ESG Community
  const [s1ImgOpacity, setS1ImgOpacity] = useState(0.3);
  const [s1ResOpacity, setS1ResOpacity] = useState(0);
  const [s1PillClass, setS1PillClass] = useState('eco-tag eco-ta');
  const [s1PillText, setS1PillText] = useState('🤖 AI 분석 중');
  const [s1Likes, setS1Likes] = useState(0);
  const [s1Toast, setS1Toast] = useState(false);

  // Scene 2 — Eco Market
  const [s2Pts, setS2Pts] = useState(12300);
  const [s2Cost, setS2Cost] = useState(1500);
  const [s2SelIdx, setS2SelIdx] = useState(0);
  const [s2BtnText, setS2BtnText] = useState('🛒 포인트로 교환하기');
  const [s2BtnOpacity, setS2BtnOpacity] = useState(1);
  const [s2BtnBg, setS2BtnBg] = useState('var(--green)');
  const [s2Toast, setS2Toast] = useState(false);

  // Scene 3 — AI Report
  const [s3UploadBg, setS3UploadBg] = useState('transparent');
  const [s3UploadBorder, setS3UploadBorder] = useState('var(--border2)');
  const [s3Ico, setS3Ico] = useState('📄');
  const [s3Lbl, setS3Lbl] = useState('지속가능경영 보고서 PDF 업로드');
  const [s3ShowProg, setS3ShowProg] = useState(false);
  const [s3ShowResult, setS3ShowResult] = useState(false);
  const [s3Pct, setS3Pct] = useState(0);
  const [s3PLbl, setS3PLbl] = useState('PDF 파싱 및 텍스트 추출 중...');
  const [s3Bars, setS3Bars] = useState([0, 0, 0]);
  const [s3Toast, setS3Toast] = useState(false);

  // Tab order: AI Audit(0) → AI 리포트(1) → ESG 참여(2) → 에코 마켓(3)
  // Internal scene: S0=Audit, S3=Report, S1=Community, S2=Market
  const URLS = [
    'esgaudit.app/audit',
    'esgaudit.app/report',
    'esgaudit.app/community',
    'esgaudit.app/market',
  ];
  const DURATIONS = [7200, 9000, 6400, 7200];

  function showToast(setter) {
    setter(true);
    setTimeout(() => setter(false), 2800);
  }

  /* Scene 0 — AI Audit Dashboard */
  function resetS0() {
    setS0Grade('B+'); setS0BarW('62%'); setS0BarColor('var(--amber)');
    setS0BtnText('🔍 AI ESG Audit 실행'); setS0BtnOpacity(1); setS0BtnBg('var(--green)');
    setS0DoneOpacity(0); setS0Toast(false); setS0Conf(67); setS0EvidCnt('8 / 12');
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
        setS0BtnText('⏳ AI 분석 중...'); setS0BtnOpacity(0.6);
        setTimeout(() => {
          setS0Conf(76); setS0EvidCnt('8 / 12');
          setS0BarW('81%'); setS0BarColor('var(--green)');
          setS0Grade('A-');
          setS0BtnText('✅ AI Audit 완료'); setS0BtnOpacity(1); setS0BtnBg('var(--green-dark)');
          setS0DoneOpacity(1);
          showToast(setS0Toast);
        }, 1100);
      });
    });
  }

  /* Scene 1 — ESG Community */
  function resetS1() {
    setS1ImgOpacity(0.3); setS1ResOpacity(0);
    setS1PillClass('eco-tag eco-ta'); setS1PillText('🤖 AI 분석 중');
    setS1Likes(0); setS1Toast(false);
  }
  function playS1() {
    resetS1();
    setTimeout(() => setS1ImgOpacity(1), 800);
    setTimeout(() => {
      setS1PillClass('eco-tag eco-tg'); setS1PillText('✅ AI 인식 완료');
      setS1ResOpacity(1);
      showToast(setS1Toast);
      let n = 0;
      const iv = setInterval(() => { n++; setS1Likes(n); if (n >= 24) clearInterval(iv); }, 85);
    }, 2100);
  }

  /* Scene 2 — Eco Market */
  const mktItems = [
    { ico: '☕', name: '사내 카페 교환권', pt: 1500 },
    { ico: '🌿', name: '친환경 에코백', pt: 3000 },
    { ico: '📚', name: '도서 상품권', pt: 4000 },
    { ico: '🎟️', name: '문화생활 교환권', pt: 5000 },
  ];
  function resetS2() {
    setS2Pts(12300); setS2Cost(1500); setS2SelIdx(0);
    setS2BtnText('🛒 포인트로 교환하기'); setS2BtnOpacity(1); setS2BtnBg('var(--green)');
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
          setS2BtnText('✅ 교환 완료'); setS2BtnOpacity(1); setS2BtnBg('var(--green-dark)');
          showToast(setS2Toast);
        }, 900);
      });
    });
  }

  /* Scene 3 — AI Report */
  function resetS3() {
    setS3UploadBg('transparent'); setS3UploadBorder('var(--border2)');
    setS3Ico('📄'); setS3Lbl('지속가능경영 보고서 PDF 업로드');
    setS3ShowProg(false); setS3ShowResult(false);
    setS3Pct(0); setS3PLbl('PDF 파싱 및 텍스트 추출 중...'); setS3Bars([0, 0, 0]); setS3Toast(false);
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
          const stgs = [
            'PDF 파싱 및 텍스트 추출 중...',
            'K-ESG 핵심 지표 매핑 중...',
            'RAG 기반 AI 심층 분석 중...',
            'Audit 리포트 생성 중...',
          ];
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

  // Tab order: AI Audit(0) → AI 리포트(1) → ESG 참여(2) → 에코 마켓(3)
  const PLAYS = [playS0, playS3, playS1, playS2];

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

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll('.eco-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!document.querySelector('link[href*="Pretendard"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Pretendard:wght@300;400;500;600;700;800&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const isGoodGrade = s0Grade === 'A' || s0Grade === 'A-';
  const gradeColor = isGoodGrade ? 'var(--green)' : 'var(--amber)';
  const gradeCircleBg = isGoodGrade ? 'var(--green-light)' : 'var(--amber-light)';

  return (
    <>
      <style>{LANDING_STYLE}</style>
      <div className="eco-landing">

        {/* ── NAV ── */}
        <nav className="eco-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="eco-nav-logo" onClick={() => navigate('/landing')}>
              <div className="eco-logo-dot">🌿</div>EcoESG
            </div>
            <span className="eco-nav-badge">AI Audit</span>
          </div>
          <div className="eco-nav-links">
            <a href="#eco-features">기능 소개</a>
            <a href="#eco-how">분석 흐름</a>
            <a href="#eco-reviews">도입 사례</a>
          </div>
          <button className="eco-nav-cta" onClick={() => navigate('/login')}>무료 Audit 시작 →</button>
        </nav>

        {/* ── HERO ── */}
        <div className="eco-hero-wrap">
          <div className="eco-hero-left">
            <div className="eco-hero-eyebrow">🤖 AI ESG Audit · RAG 기반 검증 · Audit 리포트 생성</div>
            <h1 className="eco-hero-title">
              기업 ESG Audit을<br />
              AI로 <em>자동화</em>하세요
            </h1>
            <p className="eco-hero-desc">
              PDF·CSV 업로드만으로 K-ESG 기준 분석부터<br />
              검증 근거 추적·Audit 리포트 생성까지 자동 처리합니다.
            </p>

            {/* 실제 기능 흐름 표시 */}
            <div className="eco-hero-flow">
              <span className="eco-flow-step">📄 PDF·CSV 업로드</span>
              <span className="eco-flow-arr">→</span>
              <span className="eco-flow-step">🤖 AI Audit 분석</span>
              <span className="eco-flow-arr">→</span>
              <span className="eco-flow-step">🔍 검증 근거 생성</span>
              <span className="eco-flow-arr">→</span>
              <span className="eco-flow-step">📥 리포트 다운로드</span>
            </div>

            <div className="eco-hero-btns">
              <button className="eco-btn-primary" onClick={() => navigate('/login')}>무료 Audit 분석 시작</button>
            </div>

            {/* 기능 기반 KPI 필 */}
            <div className="eco-hero-kpis">
              <div className="eco-kpi-pill">
                <span className="eco-kpi-icon">📊</span>
                <span className="eco-kpi-text">K-ESG 핵심 지표 기반 분석</span>
              </div>
              <div className="eco-kpi-pill">
                <span className="eco-kpi-icon">🔍</span>
                <span className="eco-kpi-text">AI 검증 근거 자동 추적</span>
              </div>
              <div className="eco-kpi-pill">
                <span className="eco-kpi-icon">📥</span>
                <span className="eco-kpi-text">Audit 리포트 즉시 생성</span>
              </div>
            </div>
          </div>

          {/* ── INTERACTIVE DEMO ── */}
          <div className="eco-hero-right">
            <div className="eco-demo-wrap">
              <div className="eco-demo-chrome">
                <div className="eco-cdot" style={{ background: '#ff5f57' }} />
                <div className="eco-cdot" style={{ background: '#febc2e' }} />
                <div className="eco-cdot" style={{ background: '#28c840' }} />
                <div className="eco-curl">{urlText}</div>
              </div>

              <div className="eco-demo-body" ref={demoBodyRef}>

                {/* ── P0 AI Audit Dashboard ── */}
                <div className={`eco-dp${activeTab === 0 ? ' active' : ''}`}>
                  {/* 헤더 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>AI ESG Audit</span>
                    <span className="eco-tag eco-ti">🤖 RAG 분석</span>
                  </div>

                  {/* KPI 3개 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 9 }}>
                    <div className="eco-uc" style={{ padding: '7px 9px', textAlign: 'center' }}>
                      <div className="eco-ulbl">검증 근거</div>
                      <div className="eco-uval" style={{ color: 'var(--green)', fontSize: 13 }}>{s0EvidCnt}건</div>
                    </div>
                    <div className="eco-uc" style={{ padding: '7px 9px', textAlign: 'center' }}>
                      <div className="eco-ulbl">분석 신뢰도</div>
                      <div className="eco-uval" style={{ color: s0Conf >= 75 ? 'var(--green)' : 'var(--amber)', fontSize: 13 }}>{s0Conf}%</div>
                    </div>
                    <div className="eco-uc" style={{ padding: '7px 9px', textAlign: 'center' }}>
                      <div className="eco-ulbl">K-ESG 등급</div>
                      <div className="eco-uval" style={{ color: gradeColor, fontSize: 13 }}>{s0Grade}</div>
                    </div>
                  </div>

                  {/* 등급 + 점수 바 + 신뢰도 바 */}
                  <div className="eco-uc" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', background: gradeCircleBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 800, color: gradeColor, flexShrink: 0, transition: 'all .5s',
                      }}>{s0Grade}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>K-ESG 종합 점수</span>
                          <span className="eco-delta eco-delta-up">↑ 업종 평균 이상</span>
                        </div>
                        <div className="eco-bt"><div className="eco-bf" style={{ width: s0BarW, background: s0BarColor }} /></div>
                      </div>
                    </div>
                    {/* 신뢰도 바 */}
                    <div className="eco-conf-wrap" style={{ marginBottom: 0 }}>
                      <div className="eco-conf-header">
                        <span className="eco-conf-lbl">AI 분석 신뢰도 (Confidence)</span>
                        <span className="eco-conf-val">{s0Conf}%</span>
                      </div>
                      <div className="eco-conf-bar">
                        <div className="eco-conf-fill" style={{ width: s0Conf + '%' }} />
                      </div>
                    </div>
                  </div>

                  {/* Audit Alert */}
                  {!isGoodGrade ? (
                    <div className="eco-audit-alert">
                      <span>⚠️</span>
                      <span><b>Audit 권고</b> — 사회(S) 지표 증빙 보강 시 등급 상승 가능</span>
                    </div>
                  ) : (
                    <div className="eco-audit-ok" style={{ opacity: s0DoneOpacity, transition: 'opacity .4s' }}>
                      <span>✅</span>
                      <span><b>Benchmark 비교</b> — 업종 평균 대비 우수 수준 확인됨</span>
                    </div>
                  )}

                  <button id="eco-p0-btn" className="eco-abtn" style={{ background: s0BtnBg, opacity: s0BtnOpacity }}>{s0BtnText}</button>

                  {s0DoneOpacity > 0 && (
                    <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--green)', fontWeight: 700, marginTop: 6, transition: 'opacity .4s', opacity: s0DoneOpacity }}>
                      AI Audit 완료 · 검증 근거 8건 확인 ✓
                    </div>
                  )}

                  <div className={`eco-toast${s0Toast ? ' show' : ''}`}><div className="td" />등급 B+ → A- 상승 · Audit 리포트 준비됨</div>
                  <div className="eco-cur" id="eco-cur0" /><div className="eco-cur-ring" id="eco-ring0" />
                </div>

                {/* ── P3 K-ESG AI 분석 리포트 (tab 1) ── */}
                <div className={`eco-dp${activeTab === 1 ? ' active' : ''}`}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 9 }}>🤖 K-ESG AI 분석 리포트</div>
                  <div id="eco-p3-upload" style={{ border: `1.5px dashed ${s3UploadBorder}`, borderRadius: 'var(--r-sm)', padding: 14, textAlign: 'center', marginBottom: 8, transition: 'background .4s, border-color .4s', background: s3UploadBg, cursor: 'pointer' }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{s3Ico}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500 }}>{s3Lbl}</div>
                  </div>

                  {s3ShowProg && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="eco-ph"><span className={s3Pct < 100 ? 'eco-pulse' : ''}>{s3PLbl}</span><b>{s3Pct}%</b></div>
                      <div className="eco-bt"><div className="eco-bf" style={{ width: s3Pct + '%', background: 'var(--green)', transition: 'width .22s linear' }} /></div>
                    </div>
                  )}

                  {s3ShowResult && (
                    <div>
                      <div style={{ background: 'var(--green-light)', border: '1px solid var(--green-mid)', borderRadius: 'var(--r-sm)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--green-dark)' }}>A-</div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--green-dark)' }}>K-ESG 기준 종합 등급 · AI 자동 산출</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                            <span className="eco-delta eco-delta-up">↑ 업종 평균 대비 우수</span>
                            <span style={{ fontSize: 9.5, color: 'var(--green)', fontWeight: 600 }}>신뢰도 76%</span>
                          </div>
                        </div>
                      </div>
                      {[['E', 82, '#16A87A'], ['S', 91, '#3b82f6'], ['G', 76, '#D97706']].map(([lbl, val, col], i) => (
                        <div key={lbl} className="eco-er">
                          <div className="eco-ec" style={{ color: col }}>{lbl}</div>
                          <div className="eco-et"><div className="eco-ef" style={{ width: s3Bars[i] + '%', background: col }} /></div>
                          <div className="eco-es">{val}</div>
                        </div>
                      ))}
                      <button className="eco-abtn ghost" style={{ marginTop: 8, fontSize: 11.5 }}>📥 Audit 리포트 PDF 다운로드</button>
                    </div>
                  )}
                  <div className={`eco-toast${s3Toast ? ' show' : ''}`}><div className="td" />✅ Audit 완료 · 검증 근거 8건 확인됨</div>
                  <div className="eco-cur" id="eco-cur3" /><div className="eco-cur-ring" id="eco-ring3" />
                </div>

                {/* ── P1 ESG 참여 커뮤니티 (tab 2) ── */}
                <div className={`eco-dp${activeTab === 2 ? ' active' : ''}`}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 9 }}>임직원 ESG 참여 피드</div>
                  <div className="eco-uc">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div className="eco-av">A</div>
                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700 }}>김에코 · 마케팅팀</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>방금 전</div>
                      </div>
                      <div style={{ marginLeft: 'auto' }}><span className={s1PillClass}>{s1PillText}</span></div>
                    </div>
                    <div style={{ height: 74, background: 'linear-gradient(135deg,var(--green-light),var(--green-mid))', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 8, opacity: s1ImgOpacity, transition: 'opacity .7s' }}>🌱</div>
                    <div style={{ opacity: s1ResOpacity, transition: 'opacity .5s' }}>
                      <div className="eco-tag eco-tg" style={{ marginBottom: 7 }}>✅ AI 인식 완료 · 친환경 실천 확인됨</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>🪙 +500 에코포인트 적립</div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>❤️ {s1Likes}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>💬 7</span>
                      </div>
                    </div>
                  </div>
                  <div className="eco-uc" style={{ opacity: .5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="eco-av" style={{ background: 'var(--amber-light)', color: '#92400E' }}>B</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600 }}>이그린 · 개발팀</div>
                    </div>
                    <div style={{ marginTop: 6 }}><span className="eco-tag eco-ta">⏳ AI 검토 대기 (신뢰도 0.63)</span></div>
                  </div>
                  <div className={`eco-toast${s1Toast ? ' show' : ''}`}><div className="td" />🪙 +500pt 에코포인트 적립됐어요</div>
                </div>

                {/* ── P2 에코 마켓 (tab 3) ── */}
                <div className={`eco-dp${activeTab === 3 ? ' active' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>🎁 ESG 리워드 마켓</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>잔여 <b style={{ color: 'var(--green)' }}>{s2Pts.toLocaleString()}</b> pt</span>
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
                    <div className="eco-urow">
                      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>차감 포인트</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>−{s2Cost.toLocaleString()} pt</span>
                    </div>
                    <div className="eco-urow">
                      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>교환 후 잔여</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{(s2Pts - s2Cost).toLocaleString()} pt</span>
                    </div>
                    <button id="eco-p2-btn" className="eco-abtn" style={{ marginTop: 8, background: s2BtnBg, opacity: s2BtnOpacity }}>{s2BtnText}</button>
                  </div>
                  <div className={`eco-toast${s2Toast ? ' show' : ''}`}><div className="td" />✉️ 교환권이 이메일로 발송됐어요</div>
                  <div className="eco-cur" id="eco-cur2" /><div className="eco-cur-ring" id="eco-ring2" />
                </div>

              </div>{/* /demo-body */}

              <div className="eco-demo-tabs">
                {['AI Audit', 'AI 리포트', 'ESG 참여', '에코 마켓'].map((label, i) => (
                  <button key={i} className={`eco-dtab${activeTab === i ? ' on' : ''}`} onClick={() => jumpTo(i)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── FEATURES ── */}
        <section id="eco-features" className="eco-section" style={{ background: 'var(--bg2)' }}>
          <div className="eco-inner">
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <div className="eco-eyebrow">핵심 기능</div>
              <h2 className="eco-sec-title eco-reveal">AI 기반 ESG Audit 시스템</h2>
              <p className="eco-sec-desc eco-reveal eco-d1" style={{ margin: '0 auto' }}>
                PDF·CSV 업로드부터 K-ESG 자동 평가, 검증 근거 추적, Audit 리포트 생성까지
                기업 ESG 검증에 필요한 기능을 하나의 플랫폼에서 제공합니다.
              </p>
            </div>
            <div className="eco-fgrid">
              {[
                {
                  ico: '🤖',
                  title: 'AI ESG Audit 엔진',
                  desc: 'PDF·CSV 기반 ESG 데이터를 RAG 분석으로 자동 검증하고, K-ESG 기준 등급과 신뢰도를 산출합니다.',
                  bullets: [
                    'PDF/CSV 업로드 + OCR 자동 파싱',
                    'K-ESG 핵심 지표 자동 평가',
                    'RAG 기반 검증 근거 추적',
                    'AI 분석 신뢰도 (Confidence) 제공',
                    'Benchmark 비교 + 등급 Data 시각화',
                  ],
                  primary: true,
                },
                {
                  ico: '📊',
                  title: 'ESG Audit Dashboard',
                  desc: '기업 ESG 성과를 실시간으로 시각화하고, 업종 Benchmark와 비교해 개선 방향을 제시합니다.',
                  bullets: [
                    'E/S/G 카테고리별 실시간 추적',
                    '업종 Benchmark 비교 시각화',
                    'Audit 이력 및 등급 변화 추이',
                    '즉시조치 권고 및 개선 알림',
                  ],
                },
                {
                  ico: '🤝',
                  title: 'ESG 참여 커뮤니티',
                  desc: '임직원이 친환경 활동을 공유하면 AI가 자동 인식하고 에코포인트를 지급해 ESG 문화를 내재화합니다.',
                  bullets: [
                    '임직원 친환경 활동 사진 공유',
                    'AI 자동 인식 · 포인트 즉시 적립',
                    '팀별 참여율 및 활동 통계 관리',
                    'S 지표 개선 데이터로 자동 연동',
                  ],
                },
                {
                  ico: '🎁',
                  title: 'ESG 리워드 마켓',
                  desc: '에코포인트를 다양한 리워드로 교환해 임직원의 ESG 참여를 지속적으로 장려하는 인센티브 시스템입니다.',
                  bullets: [
                    '에코포인트 기반 리워드 교환',
                    '친환경 상품 · 문화생활 교환권',
                    '기업 맞춤 리워드 카탈로그 운영',
                    '즉시 발송 · 실시간 재고 관리',
                  ],
                },
              ].map((f, i) => (
                <div key={i} className={`eco-fcard eco-reveal${f.primary ? ' primary' : ''}${i % 2 === 1 ? ' eco-d1' : ''}`}>
                  <div className="eco-ficon">{f.ico}</div>
                  <div className="eco-ftitle">{f.title}</div>
                  <div className="eco-fdesc">{f.desc}</div>
                  <ul className="eco-fbullets">
                    {f.bullets.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW ── */}
        <section id="eco-how" className="eco-section eco-how-bg">
          <div className="eco-inner">
            <div className="eco-eyebrow">분석 흐름</div>
            <h2 className="eco-sec-title eco-reveal">데이터 업로드부터 Audit 리포트까지</h2>
            <p className="eco-sec-desc eco-reveal eco-d1">
              4단계 자동화 파이프라인으로 기업 ESG Audit을 완성하세요.<br />
              커뮤니티·리워드는 임직원 참여 지표(S)를 실질적으로 개선하는 부가 서비스입니다.
            </p>

            {/* Core 4-step flow */}
            <div className="eco-sgrid">
              {[
                {
                  step: 'STEP 01',
                  ico: '📂',
                  title: 'ESG 데이터 업로드',
                  desc: 'PDF 지속가능경영 보고서, CSV 수치 데이터를 업로드하세요. OCR 기반 자동 파싱이 즉시 시작됩니다.',
                },
                {
                  step: 'STEP 02',
                  ico: '🤖',
                  title: 'AI Audit 분석',
                  desc: 'K-ESG 핵심 지표 기반 RAG 분석, 수치 교차 검증, AI 심층 분석이 자동으로 수행됩니다.',
                },
                {
                  step: 'STEP 03',
                  ico: '🔍',
                  title: 'ESG 결과 검증',
                  desc: '검증 근거(Evidence) 목록, 분석 신뢰도, Benchmark 비교 결과를 확인하고 등급을 검토합니다.',
                },
                {
                  step: 'STEP 04',
                  ico: '📋',
                  title: 'Audit 리포트 다운로드',
                  desc: 'K-ESG 등급, 검증 근거, 개선 권고가 포함된 Audit 리포트를 PDF로 즉시 다운로드합니다.',
                },
              ].map((s, i) => (
                <div key={i} className={`eco-scard eco-reveal${i === 1 ? ' eco-d1' : i === 2 ? ' eco-d2' : i === 3 ? ' eco-d3' : ''}`}>
                  <div className="eco-step-num">{s.step}</div>
                  <div className="eco-sicon">{s.ico}</div>
                  <div className="eco-stitle">{s.title}</div>
                  <div className="eco-sdesc">{s.desc}</div>
                </div>
              ))}
            </div>

            {/* 부가 서비스 안내 */}
            <div style={{ marginTop: 40, padding: '20px 28px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 22 }}>🤝</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,.8)', marginBottom: 4 }}>추가 서비스 — ESG 참여 커뮤니티 · 에코 마켓</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)', lineHeight: 1.7 }}>임직원의 친환경 활동을 공유하고 에코포인트로 리워드를 받는 구조로, S(사회) 지표를 실질적으로 개선합니다. AI Audit 결과와 자동 연동됩니다.</div>
              </div>
              <span className="eco-supp-badge">추가 서비스</span>
            </div>
          </div>
        </section>

        {/* ── REVIEWS ── */}
        <section id="eco-reviews" className="eco-section">
          <div className="eco-inner">
            <div style={{ marginBottom: '3.5rem' }}>
              <div className="eco-eyebrow">도입 사례 예시</div>
              <h2 className="eco-sec-title eco-reveal">기업 ESG 담당자들의<br />실제 Audit 경험</h2>
            </div>
            <div className="eco-rgrid">
              {[
                {
                  init: '김',
                  name: '김지현',
                  role: 'A기업 ESG 담당 팀장',
                  quote: '"분기마다 보고서 작업에 일주일씩 소모했는데, AI가 K-ESG 기준 분석과 검증 근거를 자동으로 생성해 실질적인 ESG 개선 업무에 집중할 수 있게 됐습니다."',
                },
                {
                  init: '박',
                  name: '박세영',
                  role: 'B그룹 지속가능경영팀 매니저',
                  quote: '"RAG 기반 검증 근거 추적 덕분에 이사회에 AI 분석 결과를 근거 중심으로 설명할 수 있었습니다. 단순 숫자보다 Evidence 기반 Audit 리포트가 훨씬 설득력 있었어요."',
                },
                {
                  init: '이',
                  name: '이민준',
                  role: 'C사 ESG 담당 이사',
                  quote: '"AI가 K-ESG 등급 산출 근거까지 함께 제공해 ESG 보고 자료 준비가 간소화됐습니다. Benchmark 비교 결과를 바로 확인할 수 있어 개선 방향 설정에 도움이 됐어요."',
                },
              ].map((r, i) => (
                <div key={i} className={`eco-rcard eco-reveal${i === 1 ? ' eco-d1' : i === 2 ? ' eco-d2' : ''}`}>
                  <div className="eco-stars">★★★★★</div>
                  <div className="eco-rquote">{r.quote}</div>
                  <div className="eco-rauthor">
                    <div className="eco-rav">{r.init}</div>
                    <div>
                      <div className="eco-rname">{r.name}</div>
                      <div className="eco-rrole">{r.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <div className="eco-cta-sec">
          <h2>AI ESG Audit,<br />지금 바로 시작하세요</h2>
          <p>PDF·CSV 업로드만으로<br />K-ESG Audit 리포트를 자동 생성합니다.</p>
          <div className="eco-cta-flow">
            <span className="eco-cta-step">데이터 업로드</span>
            <span className="eco-cta-arr">→</span>
            <span className="eco-cta-step">AI Audit</span>
            <span className="eco-cta-arr">→</span>
            <span className="eco-cta-step">검증 근거</span>
            <span className="eco-cta-arr">→</span>
            <span className="eco-cta-step">리포트 다운로드</span>
          </div>
          <button className="eco-btn-green" onClick={() => navigate('/login')}>무료 Audit 분석 시작</button>
        </div>

        {/* ── FOOTER ── */}
        <footer className="eco-footer">
          <div>
            <div className="eco-flogo">🌿 EcoESG</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>AI 기반 ESG Audit Platform for K-ESG Verification</div>
          </div>
          <div className="eco-flinks">
            <a href="#">서비스 소개</a>
            <a href="#">요금제</a>
            <a href="#">개인정보처리방침</a>
            <a href="#">이용약관</a>
            <a href="#">고객센터</a>
          </div>
          <div className="eco-fcopy">© 2025 EcoESG. All rights reserved.</div>
        </footer>

      </div>
    </>
  );
}
