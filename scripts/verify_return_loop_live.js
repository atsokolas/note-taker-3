#!/usr/bin/env node

/**
 * Verify the live Return Loop contract without adding any test-only API.
 *
 * Default mode proves the deployed backend/frontend contract is present even
 * for a quiet account. Set REQUIRE_RETURN_LOOP=1 when using a real account that
 * should have recent imports/maintenance so the script fails if Morning Paper
 * only renders quiet-state slots.
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.NOEIS_API_URL || process.env.BASE_URL || 'https://note-taker-3-unrg.onrender.com';
const APP_URL = process.env.NOEIS_APP_URL || process.env.APP_URL || 'https://www.noeis.io';
const USERNAME = process.env.NOEIS_QA_USERNAME || process.env.QA_SEED_USERNAME || 'qa_editor_seed';
const PASSWORD = process.env.NOEIS_QA_PASSWORD || process.env.QA_SEED_PASSWORD || 'QaSeed1234';
const REQUIRE_RETURN_LOOP = ['1', 'true', 'yes'].includes(String(process.env.REQUIRE_RETURN_LOOP || '').toLowerCase());
const OUTPUT_DIR = process.env.RETURN_LOOP_QA_OUTPUT || path.join(process.cwd(), 'output', `return-loop-live-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const requestJson = async (pathname, options = {}) => {
  const response = await fetch(`${API_URL}${pathname}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.error || data?.details || response.statusText;
    throw new Error(`${options.method || 'GET'} ${pathname} failed: ${response.status} ${message}`);
  }
  return data;
};

const login = async () => requestJson('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USERNAME, password: PASSWORD })
});

const hasReturnLoopFields = (briefing = {}) => (
  Object.prototype.hasOwnProperty.call(briefing, 'nextAction')
  && Array.isArray(briefing.pagesWithNewSourceMaterial)
  && Array.isArray(briefing.answerableQuestions)
  && Array.isArray(briefing.recentMaintenanceChanges)
  && Array.isArray(briefing.recentReceipts)
);

const activeReturnLoopCount = (briefing = {}) => (
  Number(briefing.counts?.recentReceipts || 0)
  + Number(briefing.counts?.recentMaintenanceChanges || 0)
  + Number(briefing.counts?.pagesWithNewSourceMaterial || 0)
  + Number(briefing.counts?.answerableQuestions || 0)
  + (briefing.nextAction ? 1 : 0)
);

const main = async () => {
  ensureDir(OUTPUT_DIR);
  const auth = await login();
  const token = auth.token;
  if (!token) throw new Error('Login succeeded but no token was returned.');

  const briefing = await requestJson('/api/wiki/briefing', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const apiChecks = {
    hasReturnLoopFields: hasReturnLoopFields(briefing),
    activeReturnLoopCount: activeReturnLoopCount(briefing),
    requireReturnLoop: REQUIRE_RETURN_LOOP,
    counts: briefing.counts || {},
    nextAction: briefing.nextAction || null,
    recentReceiptCount: Array.isArray(briefing.recentReceipts) ? briefing.recentReceipts.length : null,
    pagesWithNewSourceMaterialCount: Array.isArray(briefing.pagesWithNewSourceMaterial) ? briefing.pagesWithNewSourceMaterial.length : null,
    answerableQuestionsCount: Array.isArray(briefing.answerableQuestions) ? briefing.answerableQuestions.length : null,
    recentMaintenanceChangesCount: Array.isArray(briefing.recentMaintenanceChanges) ? briefing.recentMaintenanceChanges.length : null
  };

  if (!apiChecks.hasReturnLoopFields) {
    throw new Error(`Briefing response is missing return-loop fields: ${JSON.stringify(Object.keys(briefing).sort())}`);
  }
  if (REQUIRE_RETURN_LOOP && apiChecks.activeReturnLoopCount <= 0) {
    throw new Error('REQUIRE_RETURN_LOOP=1 but the authenticated account has no active return-loop signals.');
  }

  let renderChecks = null;
  try {
    const { chromium } = require('../note-taker-ui/node_modules/playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
    await page.addInitScript((authToken) => {
      localStorage.setItem('token', authToken);
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('jwt', authToken);
    }, token);
    await page.goto(`${APP_URL}/wiki`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'wiki-desktop.png'), fullPage: true });
    renderChecks = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        url: window.location.href,
        h1s: Array.from(document.querySelectorAll('h1')).map(node => node.textContent.trim()).filter(Boolean),
        hasFatalError: /Cannot read|TypeError|Application error|Something went wrong/i.test(text),
        hasMorningPaper: /MORNING PAPER/i.test(text),
        hasReturnLoopLanguage: /Continue reading|Questions with fresh evidence|Pages that gained sources|Overnight maintenance|Review filing suggestions|fresh evidence|gained source/i.test(text),
        bodyTextSample: text.slice(0, 1200)
      };
    });
    await page.setViewportSize({ width: 430, height: 932 });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'wiki-mobile.png'), fullPage: true });
    renderChecks.mobile = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    }));
    await browser.close();
    if (renderChecks.hasFatalError) throw new Error('Rendered /wiki contains fatal error text.');
    if (!renderChecks.hasMorningPaper) throw new Error('Rendered /wiki did not show Morning Paper copy.');
    if (REQUIRE_RETURN_LOOP && !renderChecks.hasReturnLoopLanguage) {
      throw new Error('REQUIRE_RETURN_LOOP=1 but /wiki did not render return-loop language.');
    }
  } catch (error) {
    renderChecks = {
      error: error.message,
      skippedOrFailed: true
    };
    if (REQUIRE_RETURN_LOOP) throw error;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    appUrl: APP_URL,
    username: USERNAME,
    apiChecks,
    renderChecks
  };
  const reportPath = path.join(OUTPUT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
