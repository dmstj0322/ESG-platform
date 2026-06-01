import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

// NOTE: /analysis/* is proxied by Vite to port 9000 (backend).
// All navigation must be via client-side clicks, NOT page.goto('/analysis/...').

const BASE_URL = 'http://211.184.227.203:9000:5173';
const EMAIL    = 'admin@c.com';
const PASSWORD = '12345678';
const OUT_DIR  = './qa_screenshots';
mkdirSync(OUT_DIR, { recursive: true });

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

// ── Login ──────────────────────────────────────────────────────────────────
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await wait(400);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await wait(3000);
console.log('After login URL:', page.url());

// ── Dashboard: header check ────────────────────────────────────────────────
await ss('A1_header');

// ── Dashboard: sparkline hover ─────────────────────────────────────────────
const trendY = await page.evaluate(() => {
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length < 15 && el.textContent?.trim() === 'ESG 변화 추이') {
      return el.getBoundingClientRect().top + window.scrollY;
    }
  }
  return null;
});
console.log('Trend section y:', trendY);

if (trendY != null) {
  await page.evaluate(y => window.scrollTo({ top: y - 70, behavior: 'instant' }), trendY);
  await wait(600);
  await ss('A2_trend_card');

  // Find SVG inside trend card
  const svgBox = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    for (const svg of svgs) {
      const r = svg.getBoundingClientRect();
      // Sparkline SVGs: moderate width (100–400px), short height
      if (r.width > 80 && r.width < 500 && r.height > 15 && r.top > 0 && r.top < window.innerHeight) {
        return { x: r.left, y: r.top, w: r.width, h: r.height, paths: svg.querySelectorAll('path,polyline,line').length };
      }
    }
    return null;
  });
  console.log('Sparkline SVG:', svgBox);

  if (svgBox) {
    await page.mouse.move(svgBox.x + svgBox.w * 0.6, svgBox.y + svgBox.h * 0.45);
    await wait(800);
    await ss('A3_sparkline_hover');
  } else {
    await ss('A3_sparkline_no_svg');
  }
}

// ── Dashboard: delta badge visible ───────────────────────────────────────
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await wait(300);
const deltaText = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  return all.filter(el => el.children.length === 0 && /▼|▲/.test(el.textContent ?? '')).map(el => el.textContent?.trim()).slice(0, 5);
});
console.log('Delta badges found:', deltaText);

// ── Navigate to result page via button ────────────────────────────────────
const viewBtn = await page.$('button:has-text("상세 결과 보기"), a:has-text("상세 결과 보기")');
if (viewBtn) {
  await viewBtn.click();
  await wait(2000);
  console.log('Result URL:', page.url());
} else {
  // Try clicking "상세 결과 보기 >" text
  await page.click('text=상세 결과 보기');
  await wait(2000);
  console.log('Result URL via text click:', page.url());
}

// ── Result page: tab bar overview ─────────────────────────────────────────
// Scroll to where tab bar is
await page.evaluate(() => window.scrollTo({ top: 460, behavior: 'instant' }));
await wait(400);
await ss('B1_result_tabs_bar');

// List all tabs
const tabButtons = await page.$$('button.border-b-2');
const tabLabels = [];
for (const btn of tabButtons) {
  tabLabels.push(await btn.textContent());
}
console.log('Tabs:', tabLabels.map(t => t?.trim()));

// ── Click each tab and screenshot ─────────────────────────────────────────
for (let i = 0; i < tabButtons.length; i++) {
  const label = (await tabButtons[i].textContent())?.trim() ?? `tab${i}`;
  await tabButtons[i].scrollIntoViewIfNeeded();
  await tabButtons[i].click();
  await wait(900);
  // Scroll to show tab bar + first content section
  await page.evaluate(() => window.scrollTo({ top: 440, behavior: 'instant' }));
  await wait(300);
  const safe = label.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 22);
  await ss(`B${i + 2}_tab_${safe}`);
  console.log(`Tab ${i}: "${label}"`);
}

await browser.close();
console.log('\n✅ QA complete → qa_screenshots/');
