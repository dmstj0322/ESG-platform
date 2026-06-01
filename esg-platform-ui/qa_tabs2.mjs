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
  await page.screenshot({ path: file, fullPage: false });
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

// Navigate to result page
await page.goto(`${BASE_URL}/analysis/result/285?tab=summary`, { waitUntil: 'domcontentloaded' });
await wait(2000);
console.log('Result page URL:', page.url());

// Find all tab buttons
const allTabs = await page.$$('button.border-b-2');
console.log('Tab count:', allTabs.length);
for (let i = 0; i < allTabs.length; i++) {
  const txt = await allTabs[i].textContent();
  console.log(`  [${i}] "${txt?.trim()}"`);
}

// Screenshot each tab — scroll tab bar into view first
for (let i = 0; i < allTabs.length; i++) {
  await allTabs[i].scrollIntoViewIfNeeded();
  await wait(100);
  const txt = (await allTabs[i].textContent())?.trim() ?? `tab${i}`;

  await allTabs[i].click();
  await wait(800);

  // Scroll to top of content area (just past the tab bar)
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await wait(300);

  const safeName = txt.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 24);
  await ss(`10_tab_${i}_${safeName}`);
  console.log(`Tab ${i} "${txt}" — screenshot taken`);
}

// Scroll back to top for a tab-bar overview screenshot
await page.goto(`${BASE_URL}/analysis/result/285?tab=summary`, { waitUntil: 'domcontentloaded' });
await wait(1500);
// Scroll to where tabs are visible (~450px from top)
await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }));
await wait(400);
await ss('11_result_tabs_overview');

// Sparkline hover on dashboard
await page.goto(`${BASE_URL}/analysis/dashboard`, { waitUntil: 'domcontentloaded' });
await wait(1500);

// Scroll to ESG 변화 추이 card
const trendY = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*'));
  for (const el of els) {
    if (el.children.length < 10 && el.textContent?.trim() === 'ESG 변화 추이') {
      return el.getBoundingClientRect().top + window.scrollY;
    }
  }
  return null;
});
if (trendY != null) {
  await page.evaluate(y => window.scrollTo({ top: y - 60, behavior: 'instant' }), trendY);
  await wait(600);
  await ss('12_trend_card');
  console.log('Trend card y:', trendY);

  // Find sparkline SVG inside the trend card section
  const svgInfo = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    let trendEl = null;
    for (const el of els) {
      if (el.children.length < 10 && el.textContent?.trim() === 'ESG 변화 추이') {
        trendEl = el;
        break;
      }
    }
    if (!trendEl) return null;
    // Walk up to find the card container
    let card = trendEl.parentElement;
    for (let i = 0; i < 10 && card; i++) {
      const svgs = card.querySelectorAll('svg');
      if (svgs.length > 0) {
        const svg = svgs[0];
        const r = svg.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }
      card = card.parentElement;
    }
    return null;
  });

  if (svgInfo && svgInfo.w > 30) {
    console.log('SVG found:', svgInfo);
    await page.mouse.move(svgInfo.x + svgInfo.w * 0.55, svgInfo.y + svgInfo.h * 0.4);
    await wait(700);
    await ss('13_sparkline_hover');
  } else {
    console.log('No SVG in trend card, trying canvas or recharts');
    // Recharts renders SVG — try broader search
    const allSvg = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('svg')).map(svg => {
        const r = svg.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, paths: svg.querySelectorAll('path').length };
      }).filter(s => s.w > 50 && s.h > 20);
    });
    console.log('All SVGs on page:', allSvg);
    await ss('13_sparkline_debug');
  }
} else {
  console.log('Trend card not found');
  await ss('12_no_trend');
}

await browser.close();
console.log('\n✅ Done');
