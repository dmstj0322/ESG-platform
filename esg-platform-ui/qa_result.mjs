import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
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

// Login
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await wait(400);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await wait(3000);
console.log('URL after login:', page.url());

// Click 상세 결과 보기 from dashboard
const btn = await page.$('button:has-text("상세 결과 보기"), a:has-text("상세 결과 보기")');
if (btn) {
  await btn.click();
  await wait(2000);
  console.log('URL after 상세 결과 보기:', page.url());
  await ss('05_result_page_top');
} else {
  // Navigate via audit history
  console.log('Button not found on dashboard, trying Audit 기록 sidebar link');
  await page.click('text=Audit 기록');
  await wait(1500);
  console.log('History page URL:', page.url());
  await ss('05_audit_history');

  // Click first history item
  const firstLink = await page.$('a[href*="/analysis/result"], a[href*="/analysis/"], tr td a');
  if (firstLink) {
    await firstLink.click();
    await wait(2000);
    console.log('Result page URL:', page.url());
    await ss('05_result_page_top');
  } else {
    console.log('No history link found');
    await browser.close();
    process.exit(0);
  }
}

// Screenshot all tabs
const tabList = await page.$$('[role="tablist"] button, [role="tablist"] a, nav.tab-nav button, nav.tab-nav a');
console.log(`Found ${tabList.length} tabs`);

for (let i = 0; i < tabList.length; i++) {
  const text = (await tabList[i].textContent())?.trim() ?? `tab${i}`;
  await tabList[i].click();
  await wait(800);
  const safeName = text.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 20);
  await ss(`06_tab_${i}_${safeName}`);
  console.log(`Tab ${i}: "${text}"`);
}

// Also check sparkline hover on dashboard trend section
await page.goto(`${BASE_URL}/analysis/dashboard`, { waitUntil: 'domcontentloaded' });
await wait(1500);
await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*'));
  for (const el of els) {
    if (el.innerText?.trim() === 'ESG 변화 추이') {
      el.scrollIntoView({ behavior: 'instant' });
      break;
    }
  }
});
await wait(500);

// Hover over sparkline SVG
const sparklineSvg = await page.$('svg path[stroke], svg polyline, canvas');
if (sparklineSvg) {
  const box = await sparklineSvg.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await wait(600);
    await ss('07_sparkline_hover');
    console.log('Sparkline hover screenshot taken');
  }
} else {
  console.log('No sparkline SVG found for hover');
  await ss('07_sparkline_area');
}

await browser.close();
console.log('\n✅ Done → ./qa_screenshots/');
