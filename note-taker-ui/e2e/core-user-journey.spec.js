const path = require('path');
const { test, expect } = require('@playwright/test');

const VALID_TOKEN = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJleHAiOiA0MTAyNDQ0ODAwLCAic3ViIjogInBsYXl3cmlnaHQifQ.signature';
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar';
const POPUP_HTML_URL = `file://${path.resolve(__dirname, '..', '..', 'popup.html')}`;
const CONTENT_SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'content.js');
const SAMPLE_ARTICLE_URL = 'https://example.com/journey-article';

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const createTourState = () => ({
  status: 'paused',
  currentStepId: null,
  completedStepIds: [],
  isFirstTimeVisitor: false,
  signals: {
    extensionConnected: false,
    firstHighlightCaptured: false,
    conceptFromHighlight: false,
    workspaceOrganized: false,
    semanticSearchUsed: false
  },
  startedAt: '2026-03-15T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-03-15T12:00:00.000Z'
});

const createWorkspace = (attachedItems = []) => ({
  version: 1,
  outlineSections: [
    { id: 'inbox', title: 'Inbox', description: '', collapsed: false, order: 0 },
    { id: 'working', title: 'Working', description: '', collapsed: false, order: 1 },
    { id: 'draft', title: 'Draft', description: '', collapsed: true, order: 2 },
    { id: 'archive', title: 'Archive', description: '', collapsed: true, order: 3 }
  ],
  attachedItems,
  updatedAt: '2026-03-15T12:00:00.000Z'
});

const markTourStep = (tourState, signalKey, stepId) => {
  tourState.signals[signalKey] = true;
  if (!tourState.completedStepIds.includes(stepId)) {
    tourState.completedStepIds.push(stepId);
  }
  tourState.updatedAt = '2026-03-15T12:00:01.000Z';
};

const makeFakeChromeInit = (token) => `
  (() => {
    const storageState = { token: ${JSON.stringify(token)} };
    const listeners = [];
    const toResult = (keys) => {
      if (typeof keys === 'string') return { [keys]: storageState[keys] };
      if (Array.isArray(keys)) {
        return keys.reduce((acc, key) => {
          acc[key] = storageState[key];
          return acc;
        }, {});
      }
      if (keys && typeof keys === 'object') {
        return Object.keys(keys).reduce((acc, key) => {
          acc[key] = Object.prototype.hasOwnProperty.call(storageState, key) ? storageState[key] : keys[key];
          return acc;
        }, {});
      }
      return { ...storageState };
    };

    globalThis.chrome = {
      storage: {
        local: {
          get: async (keys) => toResult(keys),
          set: async (items) => Object.assign(storageState, items || {}),
          remove: async (keys) => {
            const list = Array.isArray(keys) ? keys : [keys];
            list.forEach((key) => delete storageState[key]);
          }
        }
      },
      runtime: {
        onMessage: {
          addListener: (listener) => listeners.push(listener)
        }
      }
    };

    globalThis.__dispatchNoteTakerMessage = async (message) => {
      let lastResponse;
      for (const listener of listeners) {
        const sendResponse = (payload) => {
          lastResponse = payload;
        };
        await listener(message, null, sendResponse);
      }
      return lastResponse;
    };
  })();
`;

async function installJourneyMocks(context, state) {
  await context.route(SAMPLE_ARTICLE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html>
          <head>
            <title>Journey Article</title>
          </head>
          <body>
            <article>
              <h1>Journey Article</h1>
              <p id="capture-text">
                The first deliberate insight beats raw information when a reader can save, retrieve,
                and organize it without friction.
              </p>
            </article>
          </body>
        </html>
      `
    });
  });

  await context.route(/https:\/\/note-taker-3-unrg\.onrender\.com\/.*/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathName = url.pathname;

    if (pathName === '/api/ui-settings' && method === 'GET') {
      return json(route, {
        typographyScale: 'default',
        density: 'comfortable',
        theme: 'light',
        accent: 'earth',
        brandEnergy: false
      });
    }

    if (pathName === '/api/tour/state' && method === 'GET') {
      return json(route, state.tour);
    }

    if (pathName === '/api/tour/state' && method === 'PUT') {
      const payload = request.postDataJSON() || {};
      if (payload.reset) {
        state.tour = createTourState();
      } else {
        state.tour = {
          ...state.tour,
          ...payload,
          signals: {
            ...state.tour.signals,
            ...(payload.signals || {})
          }
        };
      }
      return json(route, state.tour);
    }

    if (pathName === '/api/tour/events' && method === 'POST') {
      const payload = request.postDataJSON() || {};
      const eventType = String(payload.eventType || '').trim();
      if (eventType === 'extension_connected') {
        markTourStep(state.tour, 'extensionConnected', 'install_extension');
      }
      if (eventType === 'highlight_captured') {
        markTourStep(state.tour, 'firstHighlightCaptured', 'capture_first_highlight');
      }
      return json(route, { ok: true, state: state.tour });
    }

    if (pathName === '/folders' && method === 'GET') {
      return json(route, [{ _id: 'folder-1', name: 'Inbox' }]);
    }

    if (pathName === '/api/articles/by-url' && method === 'GET') {
      return json(route, null);
    }

    if (pathName === '/articles/article-journey/highlights' && method === 'POST') {
      const payload = request.postDataJSON() || {};
      const highlight = {
        _id: 'highlight-journey',
        text: String(payload.text || '').trim(),
        note: String(payload.note || '').trim(),
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        articleId: 'article-journey',
        articleTitle: state.article.title,
        createdAt: '2026-03-15T12:00:02.000Z'
      };
      state.highlights = [highlight];
      return json(route, { highlight }, 201);
    }

    if (pathName === '/api/search/semantic' && method === 'POST') {
      const payload = request.postDataJSON() || {};
      state.semanticQueries.push(String(payload.query || '').trim());
      markTourStep(state.tour, 'semanticSearchUsed', 'semantic_search');
      const highlight = state.highlights[0];
      const results = highlight
        ? [{
            objectType: 'highlight',
            objectId: highlight._id,
            title: state.article.title,
            snippet: highlight.text,
            metadata: {
              articleId: state.article._id,
              articleTitle: state.article.title
            }
          }]
        : [];
      return json(route, { results });
    }

    if (pathName === '/api/concepts' && method === 'GET') {
      return json(route, [{ name: state.concept.name, count: 1 }]);
    }

    if (pathName === `/api/concepts/${encodeURIComponent(state.concept.name)}` && method === 'GET') {
      return json(route, state.concept);
    }

    if ((pathName === `/api/concepts/${state.concept._id}/workspace`
      || pathName === `/api/concepts/${encodeURIComponent(state.concept.name)}/workspace`) && method === 'GET') {
      return json(route, {
        conceptId: state.concept._id,
        conceptName: state.concept.name,
        workspace: state.workspace
      });
    }

    if ((pathName === `/api/concepts/${state.concept._id}/material`
      || pathName === `/api/concepts/${encodeURIComponent(state.concept.name)}/material`) && method === 'GET') {
      return json(route, {
        pinnedHighlights: [],
        recentHighlights: state.highlights,
        linkedArticles: [],
        linkedNotes: []
      });
    }

    if ((pathName === `/api/concepts/${state.concept._id}/related`
      || pathName === `/api/concepts/${encodeURIComponent(state.concept.name)}/related`) && method === 'GET') {
      return json(route, { highlights: [], concepts: [], notes: [], articles: [] });
    }

    if (pathName === `/api/concepts/${state.concept._id}/suggestions` && method === 'GET') {
      return json(route, []);
    }

    if ((pathName === `/api/concepts/${state.concept._id}/questions`
      || pathName === `/api/concepts/${encodeURIComponent(state.concept.name)}/questions`) && method === 'GET') {
      return json(route, []);
    }

    if (pathName === '/api/highlights' && method === 'GET') {
      const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const filtered = state.highlights.filter((highlight) => {
        if (!query) return true;
        return [
          highlight.text,
          highlight.articleTitle,
          ...(highlight.tags || [])
        ].join(' ').toLowerCase().includes(query);
      });
      return json(route, filtered);
    }

    if ((pathName === `/api/concepts/${state.concept._id}/workspace/blocks/attach`
      || pathName === `/api/concepts/${encodeURIComponent(state.concept.name)}/workspace/blocks/attach`) && method === 'POST') {
      const payload = request.postDataJSON() || {};
      const nextItem = {
        id: `item-${state.workspace.attachedItems.length + 1}`,
        type: String(payload.type || 'highlight'),
        refId: String(payload.refId || ''),
        sectionId: String(payload.sectionId || 'inbox'),
        groupId: String(payload.sectionId || 'inbox'),
        parentId: '',
        inlineTitle: '',
        inlineText: '',
        stage: String(payload.stage || 'inbox'),
        status: 'active',
        order: state.workspace.attachedItems.length
      };
      state.workspace = createWorkspace([...state.workspace.attachedItems, nextItem]);
      markTourStep(state.tour, 'workspaceOrganized', 'organize_workspace');
      return json(route, {
        conceptId: state.concept._id,
        conceptName: state.concept.name,
        block: nextItem,
        workspace: state.workspace
      }, 201);
    }

    if (pathName === '/api/notebook' && method === 'GET') return json(route, []);
    if (pathName === '/api/questions' && method === 'GET') return json(route, []);
    if (pathName === '/api/tags' && method === 'GET') return json(route, []);
    if (pathName === '/get-articles' && method === 'GET') return json(route, []);
    if (pathName === '/api/working-memory' && method === 'GET') return json(route, []);
    if (pathName === '/api/connections/scope' && method === 'GET') return json(route, { connections: [] });
    if (pathName === '/api/connections' && method === 'GET') return json(route, { outgoing: [], incoming: [] });
    if (pathName === '/api/return-queue' && method === 'GET') return json(route, []);
    if (pathName === '/api/ai/health' && method === 'GET') return json(route, { status: 'ok' });

    if (pathName.startsWith('/api/') && method === 'GET') return json(route, {});
    if (pathName.startsWith('/api/')) return json(route, { ok: true });

    return route.continue();
  });
}

test('core journey covers extension setup, first highlight capture, semantic retrieval, and workspace attach', async ({ context, page }) => {
  const state = {
    article: {
      _id: 'article-journey',
      title: 'Journey Article',
      url: SAMPLE_ARTICLE_URL
    },
    concept: {
      _id: 'concept-journey',
      name: 'Capture Journey',
      description: '',
      count: 0,
      pinnedHighlightIds: [],
      pinnedArticleIds: [],
      pinnedNoteIds: [],
      relatedTags: []
    },
    highlights: [],
    semanticQueries: [],
    workspace: createWorkspace(),
    tour: createTourState()
  };

  await installJourneyMocks(context, state);

  await page.addInitScript(({ token }) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('workspace-right-open:/think', 'true');
  }, { token: VALID_TOKEN });

  await page.goto('/think?tab=concepts&concept=Capture%20Journey');
  await expect(page.getByRole('heading', { name: 'Capture Journey' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chrome Extension (Optional)' })).toHaveAttribute('href', CHROME_STORE_URL);

  const popupPage = await context.newPage();
  await popupPage.addInitScript(makeFakeChromeInit(VALID_TOKEN));
  await popupPage.goto(POPUP_HTML_URL);
  await expect(popupPage.getByRole('heading', { name: 'Save Article' })).toBeVisible();
  await expect.poll(() => state.tour.signals.extensionConnected).toBe(true);

  const capturePage = await context.newPage();
  await capturePage.addInitScript(makeFakeChromeInit(VALID_TOKEN));
  await capturePage.goto(SAMPLE_ARTICLE_URL);
  await capturePage.addScriptTag({ path: CONTENT_SCRIPT_PATH });
  await capturePage.evaluate(async () => {
    await window.__dispatchNoteTakerMessage({ action: 'activateHighlighting' });
    await window.__dispatchNoteTakerMessage({ action: 'articleSaved', article: { id: 'article-journey' } });
  });
  await capturePage.evaluate(() => {
    const paragraph = document.getElementById('capture-text');
    const textNode = paragraph.firstChild;
    const content = textNode.textContent;
    const target = 'deliberate insight beats raw information';
    const start = content.indexOf(target);
    const end = start + target.length;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120, clientY: 80 }));
  });
  await expect(capturePage.locator('#nt-save-highlight-button')).toBeVisible();
  await capturePage.fill('#nt-note-input', 'First capture');
  await capturePage.fill('#nt-tags-input', 'journey, core');
  await capturePage.click('#nt-save-highlight-button');
  await expect(capturePage.locator('mark')).toContainText('deliberate insight beats raw information');
  await expect.poll(() => state.highlights.length).toBe(1);
  await expect.poll(() => state.tour.signals.firstHighlightCaptured).toBe(true);

  await page.goto('/search');
  await page.getByRole('button', { name: 'Meaning' }).click();
  await page.getByPlaceholder('Search everything...').fill('retrieving the saved insight later');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: /Journey Article/i })).toBeVisible();
  await expect(page.locator('.semantic-row').first()).toContainText('deliberate insight beats raw information');
  await expect.poll(() => state.tour.signals.semanticSearchUsed).toBe(true);

  await page.goto('/think?tab=concepts&concept=Capture%20Journey');
  await page.getByTestId('concept-add-material-button').click();
  await expect(page.getByTestId('concept-add-material-drawer')).toBeVisible();
  await page.getByTestId('concept-add-material-search').fill('deliberate insight');
  await expect(page.getByTestId('concept-add-material-row-highlight-highlight-journey')).toBeVisible();
  await page.getByTestId('concept-add-material-attach-highlight-highlight-journey').click();
  await expect(
    page.locator('[data-testid^="concept-workspace-item-title-"]').filter({ hasText: 'Journey Article' })
  ).toHaveCount(1);
  await expect.poll(() => state.tour.signals.workspaceOrganized).toBe(true);

  expect(state.tour.signals).toEqual(expect.objectContaining({
    extensionConnected: true,
    firstHighlightCaptured: true,
    semanticSearchUsed: true,
    workspaceOrganized: true
  }));
});
