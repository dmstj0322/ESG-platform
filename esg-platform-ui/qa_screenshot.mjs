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

// Dashboard — full viewport (header + KPI)
await ss('01_dashboard_top');

// Scroll to ESG 변화 추이 section
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(600);
await ss('02_dashboard_bottom_scroll');

// Scroll to where trend cards are
const trendY = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*'));
  for (const el of els) {
    if (el.innerText?.trim() === 'ESG 변화 추이' && el.tagName !== 'BODY') {
      return el.getBoundingClientRect().top + window.scrollY;
    }
  }
  return null;
});
if (trendY != null) {
  await page.evaluate((y) => window.scrollTo(0, y - 80), trendY);
  await wait(500);
  await ss('03_trend_section_focus');
  console.log('ESG 변화 추이 scrolled to y:', trendY);
} else {
  console.log('Could not find ESG 변화 추이 element');
}

// Also take mid-page scroll
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
await wait(400);
await ss('04_mid_page');

await browser.close();
console.log('\n✅ Done → ./qa_screenshots/');
