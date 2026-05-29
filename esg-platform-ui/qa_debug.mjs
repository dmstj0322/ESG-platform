import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL    = 'admin@c.com';
const PASSWORD = '12345678';

const browser = await chromium.launch({ headless: false, slowMo: 200 });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Capture all console messages
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push('PAGE ERROR: ' + err.message));

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ── Login ─────────────────────────────────────────────────────────────
page.on('dialog', async d => { console.log('Dialog:', d.message()); await d.accept(); });
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await wait(500);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await wait(3000);
console.log('Post-login URL:', page.url());

// ── Dashboard ─────────────────────────────────────────────────────────
await page.goto(`${BASE_URL}/analysis/dashboard`, { waitUntil: 'networkidle' });
await wait(3000);

// DOM inspection
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('\n── Body innerText (first 500 chars):\n', bodyText || '(empty)');

const rootHtml = await page.evaluate(() => {
  const root = document.getElementById('root');
  return root ? root.innerHTML.slice(0, 800) : '(no root)';
});
console.log('\n── Root HTML (first 800 chars):\n', rootHtml);

console.log('\n── Console errors:', consoleErrors.length ? consoleErrors : 'none');

// Network check
const networkReqs = [];
page.on('response', r => networkReqs.push({ url: r.url(), status: r.status() }));
await page.reload({ waitUntil: 'networkidle' });
await wait(3000);

const failed = networkReqs.filter(r => r.status >= 400);
console.log('\n── Failed network requests:', failed.length ? failed : 'none');
console.log('── All XHR/fetch requests:');
networkReqs.filter(r => r.url.includes('localhost') && !r.url.includes('vite')).forEach(r => {
  console.log(`  ${r.status} ${r.url}`);
});

await browser.close();
