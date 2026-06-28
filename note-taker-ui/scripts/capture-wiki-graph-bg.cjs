const { chromium } = require('@playwright/test');
const path = require('path');

const baseUrl = process.argv[2] || 'http://localhost:3000';
const outDir = process.argv[3] || path.join(__dirname, '..', 'output', 'push5-wiki-graph-bg-2026-06-25', 'after');
const apiUrl = process.argv[4] || 'https://note-taker-3-unrg.onrender.com';
const username = process.env.QA_SEED_USERNAME || 'qa_wiki_seed';
const password = process.env.QA_SEED_PASSWORD || 'QaWikiSeed1234';

const shots = [
  { name: 'light-desktop', width: 1728, height: 1080, theme: 'light' },
  { name: 'dark-desktop', width: 1728, height: 1080, theme: 'dark' },
  { name: 'light-mobile', width: 430, height: 932, theme: 'light' },
  { name: 'dark-mobile', width: 430, height: 932, theme: 'dark' },
];

async function login() {
  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error('No token in login response');
  return data.token;
}

(async () => {
  const token = await login();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript((authToken) => {
    window.localStorage.setItem('token', authToken);
    window.localStorage.setItem('authToken', authToken);
    window.localStorage.setItem('jwt', authToken);
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
  }, token);
  const page = await context.newPage();

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${baseUrl}/wiki`, { waitUntil: 'networkidle' });
    await page.evaluate((theme) => {
      document.documentElement.setAttribute('data-ui-theme', theme);
    }, shot.theme);
    await page.waitForSelector('.wiki-front-page', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(outDir, `wiki-${shot.name}.png`),
      fullPage: false,
    });
    console.log(`saved wiki-${shot.name}.png from ${baseUrl}`);
  }

  await browser.close();
})();
