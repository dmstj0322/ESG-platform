import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

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

// Login
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await wait(400);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await wait(3000);

// Go to result page
const btn = await page.$('button:has-text("상세 결과 보기"), a:has-text("상세 결과 보기")');
if (btn) { await btn.click(); } else { await page.click('text=상세 결과 보기'); }
await wait(2000);
console.log('Result URL:', page.url());

// Measure where the tab bar is
const tabBarY = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button.border-b-2'));
  if (btns.length === 0) return null;
  return btns[0].getBoundingClientRect().top + window.scrollY;
});
console.log('Tab bar at y:', tabBarY);

const scrollTo = tabBarY != null ? tabBarY - 20 : 1280;

// Click each tab and scroll just past the tab bar into content
const tabButtons = await page.$$('button.border-b-2');
console.log('Tab count:', tabButtons.length);

for (let i = 0; i < tabButtons.length; i++) {
  const label = (await tabButtons[i].textContent())?.trim() ?? `tab${i}`;

  // Click the tab
  await tabButtons[i].scrollIntoViewIfNeeded();
  await tabButtons[i].click();
  await wait(800);

  // Scroll to show tab bar + content below it
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollTo);
  await wait(400);

  const safe = label.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 24);
  await ss(`C${i + 1}_tab_${safe}`);
  console.log(`Tab ${i}: "${label}" (scroll=${scrollTo})`);
}

await browser.close();
console.log('\n✅ Done');
