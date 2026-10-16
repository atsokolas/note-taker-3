#!/usr/bin/env node
/* Loads the packed extension in Chromium and walks a reader through it,
 * against a stubbed Noeis API:
 *
 *   signed out -> noeis.io signs the toolbar in and hands it the theme
 *   -> save an article -> mark a passage that runs through an italic
 *   -> the margin offers a notebook entry, the Partner, a view to hold,
 *      the view it bears on (due), and an earlier passage
 *   -> file it -> reopen the page and the mark is drawn again
 *   -> a fresh save hears that the piece argues with a view.
 *
 * The packed copy gets one test-only grant, host access to the local
 * article server, because a test cannot press the toolbar button that gives
 * activeTab. Screenshots land in SMOKE_SHOTS when it is set. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

// The margin reaches the API through the extension's service worker; this is
// what lets the stubbed API answer it too.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const { pack } = require('./pack_extension');

const API = 'https://note-taker-3-unrg.onrender.com';
const SHOTS = process.env.SMOKE_SHOTS || '';
const TOKEN = `x.${Buffer.from(JSON.stringify({ id: 'u1', username: 'reader' })).toString('base64url')}.y`;
const ARTICLE = `<!doctype html><html><head><title>Why reading compounds</title>
<meta property="article:published_time" content="2026-10-01"></head>
<body style="font: 19px/1.6 Georgia; max-width: 640px; margin: 64px auto; padding: 0 16px">
<article><h1>Why reading compounds</h1><p class="byline">By Jane Writer</p>
<p id="lead">Reading compounds when you mark the passages that matter. <em>Most of what you read</em> is forgotten within a week, and the rest becomes how you think.</p>
<p>${'A second paragraph carries the argument further so the page reads as an article. '.repeat(6)}</p>
<p>Membership models hold up in downturns because the fee arrives before the shopping does.</p>
</article></body></html>`;
const THEME = process.env.SMOKE_THEME || 'light';
const NOEIS = `<!doctype html><html data-ui-theme="${THEME}"><head><link rel="stylesheet" href="/theme.css">
<script>localStorage.setItem('token', '${TOKEN}')</script></head><body>Noeis</body></html>`;
const THEME_CSS = fs.readFileSync(path.join(__dirname, '..', 'note-taker-ui/src/styles/semantic-theme.css'), 'utf8');

const calls = [];
const state = { saved: null, pushback: false };
const answer = ({ method, url, body }) => {
  const { pathname, searchParams } = new URL(url);
  calls.push(`${method} ${pathname}`);
  if (pathname === '/api/articles/by-url') return state.saved;
  if (pathname === '/api/folders') return method === 'POST' ? { _id: 'f9', name: body.name } : [{ _id: 'f1', name: 'Investing' }];
  if (pathname === '/save-article') {
    assert.ok(body.content.includes('Reading compounds'), 'the article body is read off the page');
    assert.strictEqual(body.author, 'Jane Writer');
    return { _id: 'a1', title: body.title };
  }
  if (pathname === '/articles/a1/highlights') {
    state.saved = { _id: 'a1', title: 'Why reading compounds', createdAt: '2026-10-16T00:00:00Z', highlights: [{ _id: 'h1', text: body.text }] };
    return { highlight: { _id: 'h1', text: body.text } };
  }
  if (pathname === '/api/notebook') return [{ _id: 'n1', title: 'On memory' }, { _id: 'n2', title: 'Old', board: { archivedAt: '2026-01-01' } }];
  if (pathname === '/api/judgment/margin') {
    return {
      view: { pageId: 'v1', view: 'Most reading is wasted.', dueBy: '2026-10-12T12:00:00Z' },
      before: { articleId: 'a0', highlightId: 'h0', title: 'On notes', text: 'What you mark, you keep.', savedAt: '2026-03-03' }
    };
  }
  if (pathname.startsWith('/api/judgment/pages/v1/evidence')) return { idempotent: false, body };
  if (pathname === '/api/judgment/pushes-against') {
    assert.strictEqual(searchParams.get('articleId'), 'a1');
    return { reading: state.pushback ? { pageId: 'v2', view: 'Membership models are fragile.', proposal: { id: 'p1', provenance: { after: 'Membership models hold up in downturns because the fee arrives before the shopping does.' } } } : null };
  }
  return {};
};

/* The margin's shadow root is closed, so the page cannot read a reader's
   views out of it; the test reads and presses it through the DevTools
   protocol, which can. */
const inMargin = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const find = (node, test) => (test(node) ? node : [...(node.children || []), ...(node.shadowRoots || [])]
    .reduce((found, child) => found || find(child, test), null));
  const shadow = find(root, node => node.nodeName === 'NOEIS-MARGIN')?.shadowRoots?.[0];
  const textOf = node => (node.nodeType === 3 ? node.nodeValue : (node.nodeName === 'STYLE' ? '' : (node.children || []).map(textOf).join('')));
  return {
    text: shadow ? textOf(shadow) : '',
    press: async (label) => {
      const button = find(shadow, node => node.nodeName === 'BUTTON' && textOf(node).trim() === label);
      assert.ok(button, `the margin offers “${label}”`);
      const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: button.backendNodeId });
      const [x1, y1, , , x3, y3] = model.content;
      await page.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
    }
  };
};

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

(async () => {
  const { out } = pack();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-extension-'));
  fs.cpSync(out, dir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('http://127.0.0.1/*');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  const server = http.createServer((_req, res) => res.end(ARTICLE)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const articleUrl = `http://127.0.0.1:${server.address().port}/why-reading-compounds`;

  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-profile-')), {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`]
  });
  const errors = [];
  context.on('weberror', error => errors.push(error.error().message));
  await context.route(`${API}/**`, async (route) => {
    const request = route.request();
    try {
      await route.fulfill({ json: answer({ method: request.method(), url: request.url(), body: request.postDataJSON?.() || null }) });
    } catch (error) {
      errors.push(error.message);
      await route.fulfill({ status: 500, json: { error: error.message } });
    }
  });
  await context.route('https://www.noeis.io/**', route => route.fulfill(route.request().url().endsWith('/theme.css')
    ? { contentType: 'text/css', body: THEME_CSS }
    : { contentType: 'text/html', body: NOEIS }));

  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;

  const reader = await context.newPage();
  await reader.setViewportSize({ width: 1440, height: 900 });
  await reader.goto(articleUrl);

  /* The popup, opened the way the toolbar opens it: on the reader's tab. */
  const popup = async () => {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 360, height: 560 });
    await page.addInitScript((url) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async options => (options?.active
        ? (await query({})).filter(tab => tab.url === url)
        : query(options));
    }, articleUrl);
    await page.goto(`chrome-extension://${id}/popup.html`);
    return page;
  };

  try {
    let card = await popup();
    await card.waitForSelector('body[data-view="signin"]');
    await shot(card, 'popup-signin');
    await card.close();

    /* noeis.io signs the toolbar in, says the extension is here, and lends its theme. */
    const noeis = await context.newPage();
    await noeis.goto('https://www.noeis.io/library');
    await noeis.waitForFunction(() => document.documentElement.dataset.noeisExtensionAuth === 'connected');
    const stored = await worker.evaluate(() => chrome.storage.local.get(['token', 'palette']));
    assert.ok(stored.token, 'signing in on noeis.io signs the toolbar in');
    assert.ok(stored.palette['--noeis-paper'] && stored.palette['--noeis-ink'], 'the reader’s theme travels');
    await noeis.close();

    card = await popup();
    await card.waitForSelector('body[data-view="page"]');
    await card.waitForSelector('#folder option[value="f1"]', { state: 'attached' });
    assert.strictEqual(await card.textContent('#pageTitle'), 'Why reading compounds');
    assert.strictEqual(await card.textContent('#who'), 'Signed in as reader');
    await shot(card, 'popup-save');
    await card.selectOption('#folder', 'f1');
    await card.click('#save');
    await card.waitForSelector('#receipt:has-text("Saved to Investing")');
    await shot(card, 'popup-saved');
    await card.close();

    /* A passage through an italic: one mark per text node it touches. */
    await reader.bringToFront();
    await reader.evaluate(() => {
      const lead = document.getElementById('lead');
      const range = document.createRange();
      range.setStart(lead.firstChild, 0);
      range.setEnd(lead.querySelector('em').firstChild, 10);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await reader.waitForTimeout(100);
    await shot(reader, 'margin-pill');
    await (await inMargin(reader)).press('Mark');
    await reader.waitForFunction(() => document.querySelectorAll('noeis-mark').length === 2);
    assert.strictEqual(await reader.evaluate(() => [...document.querySelectorAll('noeis-mark')].map(m => m.textContent).join('')),
      'Reading compounds when you mark the passages that matter. Most of wh');
    await reader.waitForFunction(() => getComputedStyle(document.querySelector('noeis-mark')).backgroundColor !== 'rgba(0, 0, 0, 0)');
    await reader.waitForTimeout(400);
    await shot(reader, 'margin-card-1440');
    assert.ok(calls.includes('POST /api/judgment/margin'), 'the margin reads the passage against what you hold');
    const margin = await inMargin(reader);
    ['Add to “On memory”', 'Ask the Partner about this', 'I think this is right',
      'This bears on your view that Most reading is wasted.', 'Did it hold up?',
      'You marked something like this in On notes'].forEach(words => assert.ok(margin.text.includes(words), `the margin says “${words}”`));
    assert.ok(!margin.text.includes('Old'), 'an archived notebook entry is not offered');
    await margin.press('File for');
    await reader.waitForTimeout(200);
    assert.ok((await inMargin(reader)).text.includes('Filed for your view.'));
    await (await inMargin(reader)).press('Add to “On memory”');
    await reader.waitForTimeout(200);
    assert.ok(calls.includes('POST /api/notebook/n1/append-highlight'));

    for (const width of [1320, 430]) {
      await reader.setViewportSize({ width, height: 900 });
      await reader.mouse.click(10, 10);
      await reader.evaluate(() => document.querySelector('noeis-mark').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
      await reader.waitForTimeout(500);
      await shot(reader, `margin-card-${width}`);
    }
    await reader.setViewportSize({ width: 1440, height: 900 });

    /* Reopening the page draws what was marked. */
    await reader.reload();
    card = await popup();
    await card.waitForSelector('#receipt:has-text("with 1 mark")');
    await shot(card, 'popup-already-saved');
    await card.close();
    await reader.waitForFunction(() => document.querySelectorAll('noeis-mark').length === 2);

    /* A fresh save listens for the view the piece argues with. */
    state.saved = null;
    state.pushback = true;
    await reader.reload();
    card = await popup();
    await card.waitForSelector('#folder option[value="f1"]', { state: 'attached' });
    await card.click('#save');
    await card.waitForSelector('#receipt:has-text("Saved to your Library")');
    await card.close();
    await reader.waitForFunction(() => document.querySelector('noeis-margin'));
    await reader.waitForTimeout(3600);
    await shot(reader, 'margin-pushback');
    assert.ok((await inMargin(reader)).text.includes('This piece argues against your view that Membership models are fragile'));

    assert.deepStrictEqual(errors, [], 'no script errors in the popup or the worker');
    console.log(`Extension smoke passed (${calls.length} API calls).`);
  } catch (error) {
    console.error(error);
    console.error('API calls:', calls.join('\n'));
    process.exitCode = 1;
  } finally {
    await context.close();
    server.close();
  }
})();
