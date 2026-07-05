#!/usr/bin/env node
/**
 * Production QA for the repo-wiki creation loop.
 *
 * Defaults to this repository because it is public and gives fast, inspectable
 * feedback on whether Noeis can turn a real project repo into a maintained wiki.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('../note-taker-ui/node_modules/playwright');

const BASE_URL = process.env.QA_BASE_URL || 'https://www.noeis.io';
const API_URL = process.env.QA_API_URL || 'https://note-taker-3-unrg.onrender.com';
const USERNAME = process.env.QA_WIKI_USERNAME || 'qa_wiki_seed';
const PASSWORD = process.env.QA_WIKI_PASSWORD || 'QaWikiSeed1234';
const TEST_REPO = process.env.QA_REPO_URL || 'https://github.com/atsokolas/note-taker-3';
const OUT_DIR = process.env.QA_OUTPUT_DIR || path.join(
  process.cwd(),
  'output',
  `repo-wiki-live-verification-${new Date().toISOString().replace(/[:.]/g, '-')}`
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const wordCount = (text = '') => String(text || '').split(/\s+/).filter(Boolean).length;
const UNSUPPORTED_REPO_PATTERNS = [
  /published to npm/i,
  /packaged as an npm module/i,
  /npm package metadata confirms/i,
  /continuous[-\s]?integration/i,
  /fully tested/i,
  /provenance[-‑–—\s]?aware/i,
  /source[-‑–—\s]?provenance practices/i,
  /Debug Fixture/i,
  /Library highlights?/i
];

const snippet = (value, max = 600) => {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

async function withTimeout(promise, ms, fallback) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  const response = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  }, 30000);
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const data = await response.json();
  if (!data.token) throw new Error('No token in login response.');
  return data.token;
}

async function readPage(token, pageId) {
  const response = await fetchWithTimeout(`${API_URL}/api/wiki/pages/${encodeURIComponent(pageId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  }, 30000);
  const text = await response.text();
  if (!response.ok) throw new Error(`Read page failed: ${response.status} ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

async function waitForBuiltPage(token, pageId) {
  let latest = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      latest = await readPage(token, pageId);
    } catch (error) {
      console.log(`page poll ${attempt}: read failed ${error.message}`);
      await sleep(10000);
      continue;
    }
    const plainText = String(latest.plainText || '').replace(/\s+/g, ' ').trim();
    const words = wordCount(plainText);
    const stillScaffold = /Repository sources are being attached|Noeis will build this project wiki/i.test(plainText);
    console.log(`page poll ${attempt}: words=${words} watch=${latest.externalWatches?.githubRepo?.status || ''}`);
    if (words >= 300 && !stillScaffold) return latest;
    await sleep(10000);
  }
  return latest;
}

function parseBody(text = '') {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const token = await login();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((authToken) => {
    window.localStorage.setItem('token', authToken);
    window.localStorage.setItem('authToken', authToken);
    window.localStorage.setItem('jwt', authToken);
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('tour.state.v1', JSON.stringify({
      status: 'paused',
      open: false,
      isFirstTimeVisitor: false,
      completedStepIds: [],
      signals: {}
    }));
    window.localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    window.localStorage.setItem('noeis.wiki.first_visit_seen', 'true');
    window.localStorage.removeItem('noeis.wiki.frontPageSnapshot.v1');
  }, token);

  const calls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/wiki/pages')) return;
    const method = response.request().method();
    if (!['GET', 'POST'].includes(method)) return;
    let body = '';
    try {
      body = await response.text();
    } catch (_error) {}
    const maxBodyLength = url.includes('/api/wiki/pages/from-github') ? 20000 : 1200;
    calls.push({
      method,
      url,
      status: response.status(),
      body: snippet(body, maxBodyLength)
    });
  });

  try {
    await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('.wiki-repo-create input', { timeout: 30000 });
    await page.fill('.wiki-repo-create input', TEST_REPO);
    await page.screenshot({ path: path.join(OUT_DIR, 'before-submit.png'), fullPage: false });

    await page.click('.wiki-repo-create button[type="submit"]');
    await page.waitForURL(/\/wiki\/workspace\?page=/, { timeout: 120000 });
    await sleep(3000);
    const landedUrl = page.url();
    const pageId = new URL(landedUrl).searchParams.get('page');
    if (!pageId) throw new Error(`No page id in landed URL: ${landedUrl}`);

    const created = calls.find(call => call.method === 'POST' && call.url.includes('/api/wiki/pages/from-github'));
    const createBody = parseBody(created?.body || '{}');
    const draftStarted = calls.some(call => call.method === 'POST' && call.url.includes('/ai/draft/stream'));

    const builtPage = await waitForBuiltPage(token, pageId);
    const browserInspection = await withTimeout(
      page.goto(`${BASE_URL}/wiki/workspace?page=${pageId}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        .then(() => true)
        .catch(() => false),
      35000,
      false
    );
    if (browserInspection) {
      await page.waitForSelector('h1, .wiki-read, .wiki-workspace', { timeout: 15000 }).catch(() => {});
    }
    await sleep(2000);

    const rendered = browserInspection ? await page.evaluate((expectedTitle) => {
      const read = (selector) => document.querySelector(selector)?.innerText?.trim() || '';
      const body = read('.wiki-read__body, .wiki-read');
      const fallbackTitle = Array.from(document.querySelectorAll('h1, [class*="title"]'))
        .map(node => node.textContent?.trim() || '')
        .find(text => text === expectedTitle || /Repo Wiki/i.test(text)) || '';
      return {
        url: window.location.href,
        title: read('.wiki-read__header h1, .wiki-read h1, h1') || fallbackTitle,
        repoWatchText: read('[aria-label="GitHub repository watch"]').slice(0, 700),
        bodySnippet: body.slice(0, 1200),
        renderedWordCount: body.split(/\s+/).filter(Boolean).length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    }, builtPage.title) : {
      url: `${BASE_URL}/wiki/workspace?page=${pageId}`,
      title: '',
      repoWatchText: '',
      bodySnippet: '',
      renderedWordCount: 0,
      horizontalOverflow: null,
      browserInspectionTimedOut: true
    };
    if (browserInspection) {
      await page.screenshot({ path: path.join(OUT_DIR, 'workspace-complete.png'), fullPage: false });
    }

    const plainText = String(builtPage.plainText || '').replace(/\s+/g, ' ').trim();
    const checks = {
      atomicRouteUsed: Boolean(created && created.status === 201),
      watchArmed: builtPage.externalWatches?.githubRepo?.status === 'active',
      sourceEventsAttached: (
        (Array.isArray(createBody.sourceEvents) && createBody.sourceEvents.length > 0)
        || (Array.isArray(builtPage.externalWatches?.githubRepo?.lastEventIds) && builtPage.externalWatches.githubRepo.lastEventIds.length > 0)
      ),
      draftStarted: draftStarted || wordCount(plainText) >= 300,
      articleBuilt: wordCount(plainText) >= 300 && !/Repository sources are being attached/i.test(plainText),
      renderedTitle: Boolean(rendered.title),
      noHorizontalOverflow: rendered.horizontalOverflow === false || rendered.browserInspectionTimedOut === true,
      noUnsupportedRepoBoilerplate: !UNSUPPORTED_REPO_PATTERNS.some(pattern => pattern.test(plainText))
    };
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      apiUrl: API_URL,
      account: USERNAME,
      testRepo: TEST_REPO,
      pageId,
      landedUrl,
      finalUrl: rendered.url,
      createResponse: {
        status: created?.status || null,
        pageTitle: createBody?.page?.title || '',
        watchError: createBody?.watchError || null,
        snapshot: createBody?.snapshot || null,
        sourceEvents: Array.isArray(createBody?.sourceEvents) ? createBody.sourceEvents.length : null
      },
      pageState: {
        title: builtPage.title,
        watch: builtPage.externalWatches?.githubRepo || null,
        wordCount: wordCount(plainText),
        excerpt: plainText.slice(0, 1200)
      },
      rendered,
      calls,
      checks,
      pass: Object.values(checks).every(Boolean)
    };
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'report.md'), [
      '# Repo Wiki Live Verification',
      '',
      `Generated: ${report.generatedAt}`,
      `Repo: \`${TEST_REPO}\``,
      `Page: ${rendered.url}`,
      '',
      '## Checks',
      ...Object.entries(checks).map(([key, value]) => `- [${value ? 'x' : ' '}] ${key}`),
      '',
      '## Created Page',
      `- Title: ${builtPage.title}`,
      `- Words: ${report.pageState.wordCount}`,
      `- Watch: ${builtPage.externalWatches?.githubRepo?.status || 'missing'}`,
      `- Source events on create: ${report.createResponse.sourceEvents}`,
      '',
      '## Excerpt',
      '',
      report.pageState.excerpt,
      ''
    ].join('\n'));
    console.log(JSON.stringify({
      pass: report.pass,
      output: OUT_DIR,
      page: rendered.url,
      checks,
      title: builtPage.title,
      words: report.pageState.wordCount,
      watch: builtPage.externalWatches?.githubRepo?.status,
      sourceEvents: report.createResponse.sourceEvents,
      excerpt: report.pageState.excerpt.slice(0, 500)
    }, null, 2));
    if (!report.pass) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
