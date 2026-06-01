import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = 'http://211.184.227.203:9000:5173';
const EMAIL    = 'admin@c.com';
const PASSWORD = '12345678';
const OUT_DIR  = './qa_screenshots';
mkdirSync(OUT_DIR, { recursive: true });

const TABS = ['summary', 'evidence', 'action', 'industry', 'audit-log'];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
page.on('dialog', async d => { await d.accept(); });

const ss = async (name) => {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[IMG] ${file}`);
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Login
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await wait(400);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await wait(3000);

// Go to result page via 상세 결과 보기 button
const btn = await page.$('button:has-text("상세 결과 보기"), a:has-text("상세 결과 보기")');
if (btn) {
  await btn.click();
  await wait(2000);
} else {
  // Fallback: click 상세 결과 보기 from ESG 점수 Snapshot card
  await page.goto(`${BASE_URL}/analysis/result/285?tab=summary`, { waitUntil: 'domcontentloaded' });
  await wait(2000);
}
console.log('Result page URL:', page.url());

// Find all tab buttons (plain buttons inside border-b div)
const tabText = await page.$$eval('button.border-b-2', els => els.map(e => e.textContent?.trim()));
console.log('Tab buttons found:', tabText);

// Click each tab via ?tab= URL parameter
for (const tabId of TABS) {
  await page.evaluate((id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.pushState({}, '', url.toString());
    // trigger React state update by clicking the matching button
    const btns = Array.from(document.querySelectorAll('button.border-b-2'));
    const btn = btns.find(b => b.textContent);
    // Find tab button containing the tab label
    return btns.map(b => b.textContent?.trim());
  }, tabId);

  // Click the button that has the right tab
  const clicked = await page.evaluate((id) => {
    const btns = Array.from(document.querySelectorAll('button.border-b-2'));
    // Map known IDs to Korean labels
    const labelMap = {
      'summary':   ['종합 요약', '요약', 'Summary'],
      'evidence':  ['Evidence', 'Evidence Trace', '증빙'],
      'action':    ['AI 권고사항', '권고사항', 'Action'],
      'industry':  ['Industry', '업계 비교', 'Industry Benchmark', '업계'],
      'audit-log': ['Audit Log', '감사 로그', 'Audit'],
    };
    const candidates = labelMap[id] ?? [id];
    for (const btn of btns) {
      const txt = btn.textContent?.trim() ?? '';
      if (candidates.some(c => txt.startsWith(c) || txt.includes(c))) {
        btn.click();
        return txt;
      }
    }
    // fallback: click by position
    if (btns.length > 0) {
      const idx = { summary: 0, evidence: 1, action: 2, industry: 3, 'audit-log': 4 }[id] ?? 0;
      if (btns[idx]) { btns[idx].click(); return btns[idx].textContent?.trim(); }
    }
    return null;
  }, tabId);

  await wait(900);
  await ss(`08_tab_${tabId}`);
  console.log(`Tab "${tabId}" clicked as: "${clicked}"`);
}

// Sparkline hover — go back to dashboard
await page.goto(`${BASE_URL}/analysis/dashboard`, { waitUntil: 'domcontentloaded' });
await wait(1500);

// Scroll to ESG 변화 추이
await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  for (const el of all) {
    if (el.children.length < 5 && el.textContent?.trim() === 'ESG 변화 추이') {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      break;
    }
  }
});
await wait(600);
await ss('09_trend_card_before_hover');

// Find sparkline SVG paths and hover midpoint
const sparkBox = await page.evaluate(() => {
  const svgs = Array.from(document.querySelectorAll('svg'));
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 80 && rect.height > 20 && rect.width < 400) {
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    }
  }
  return null;
});

if (sparkBox) {
  await page.mouse.move(sparkBox.x + sparkBox.w * 0.5, sparkBox.y + sparkBox.h * 0.5);
  await wait(700);
  await ss('10_sparkline_hover');
  console.log('Sparkline hover at box:', sparkBox);
} else {
  console.log('No sparkline SVG box found');
  await ss('10_sparkline_nohover');
}

await browser.close();
console.log('\n✅ Done');
