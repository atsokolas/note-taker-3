const { test, expect } = require('@playwright/test');

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const libraryArticlesFixture = [
  {
    _id: 'a1',
    title: 'Flounder Mode',
    url: 'https://example.com/flounder',
    createdAt: '2025-10-19T00:00:00.000Z',
    folder: { _id: 'f-people', name: 'People' },
    highlights: [{ _id: 'h1' }, { _id: 'h2' }]
  },
  {
    _id: 'a2',
    title: 'The Amusement Park for Engineers',
    url: 'https://example.com/amusement',
    createdAt: '2025-08-14T00:00:00.000Z',
    folder: null,
    highlights: [{ _id: 'h3' }]
  }
];

const returnQueueFixture = [
  {
    _id: 'rq-1',
    status: 'pending',
    itemType: 'notebook',
    itemId: 'n-1',
    dueAt: '2026-02-14T18:22:31.000Z',
    reason: 'Daily Reflection - 2026-01-11',
    item: {
      title: 'Daily Reflection - 2026-01-11',
      snippet: 'Which two ideas connect from what you read?',
      openPath: '/think?tab=notebook&entryId=n-1'
    }
  }
];

const conceptFixture = {
  _id: 'c1',
  name: 'Blah',
  description: '',
  count: 2,
  pinnedHighlightIds: [],
  pinnedArticleIds: [],
  pinnedNoteIds: [],
  relatedTags: []
};

const conceptWorkspaceFixture = {
  version: 1,
  groups: [
    { id: 'group-inbox', title: 'Inbox', description: '', collapsed: false, order: 0 }
  ],
  items: [],
  connections: [],
  updatedAt: '2026-03-13T19:00:00.000Z'
};

const defaultMapGraphFixture = {
  nodes: [
    { id: 'm-1', title: 'Daily Reflection', itemType: 'notebook', snippet: 'Notebook entry summary', tags: ['reflection'] },
    { id: 'm-2', title: 'Flounder Mode', itemType: 'article', snippet: 'Article summary', tags: ['article'] }
  ],
  edges: [
    { id: 'e-1', source: 'm-1', target: 'm-2', relationType: 'related' }
  ],
  page: { limit: 180, offset: 0, hasMore: false, nextOffset: 0 }
};

async function installAppMocks(page, options = {}) {
  const {
    articles = libraryArticlesFixture,
    returnQueueEntries = returnQueueFixture,
    mapGraph = defaultMapGraphFixture,
    articleHighlights = [],
    notebookEntries = []
  } = options;

  await page.route(/https:\/\/note-taker-3-unrg\.onrender\.com\/.*/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/ui-settings' && method === 'GET') {
      return json(route, {
        typographyScale: 'default',
        density: 'comfortable',
        theme: 'dark',
        accent: 'electric',
        brandEnergy: true
      });
    }

    if (path === '/folders' && method === 'GET') {
      return json(route, [
        { _id: 'f-people', name: 'People' },
        { _id: 'f-empty', name: 'Empty Folder' }
      ]);
    }

    if (path === '/get-articles' && method === 'GET') {
      return json(route, articles);
    }

    if (path === '/api/tags' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/working-memory' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/notebook' && method === 'GET') {
      return json(route, notebookEntries);
    }

    if (path === '/api/questions' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/concepts' && method === 'GET') {
      return json(route, [{ name: 'Blah', count: 2 }]);
    }

    if (path.match(/^\/api\/concepts\/[^/]+$/) && method === 'GET') {
      return json(route, conceptFixture);
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/workspace$/) && method === 'GET') {
      return json(route, { conceptId: 'c1', conceptName: 'Blah', workspace: conceptWorkspaceFixture });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/material$/) && method === 'GET') {
      return json(route, { pinnedHighlights: [], recentHighlights: [], linkedArticles: [], linkedNotes: [] });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/related$/) && method === 'GET') {
      return json(route, { highlights: [], concepts: [], notes: [], articles: [] });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/suggestions$/) && method === 'GET') {
      return json(route, []);
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/questions$/) && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/highlights' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/return-queue' && method === 'GET') {
      return json(route, returnQueueEntries);
    }

    if (path.startsWith('/api/map/graph') && method === 'GET') {
      return json(route, mapGraph);
    }

    if (path === '/api/connections/scope' && method === 'GET') {
      return json(route, { connections: [] });
    }

    if (path === '/api/connections' && method === 'GET') {
      return json(route, { outgoing: [], incoming: [] });
    }

    if (path === '/api/ai/health' && method === 'GET') {
      return json(route, { status: 'ok' });
    }

    if (path.match(/^\/articles\/[^/]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      const article = articles.find((item) => item._id === id) || articles[0] || null;
      return json(route, {
        ...(article || {}),
        content: '<p>Reading body for visual regression baseline.</p>'
      });
    }

    if (path.match(/^\/api\/articles\/[^/]+\/highlights$/) && method === 'GET') {
      return json(route, articleHighlights);
    }

    if (path.match(/^\/api\/articles\/[^/]+\/backlinks$/) && method === 'GET') {
      return json(route, { notebookBlocks: [], collections: [] });
    }

    if (path.startsWith('/api/') && method === 'GET') {
      return json(route, {});
    }

    if (path.startsWith('/api/')) {
      return json(route, { ok: true });
    }

    return route.continue();
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'test-token');
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.removeItem('library.lastArticleId');
    window.localStorage.setItem('workspace-right-open:/library', 'true');
    window.localStorage.setItem('workspace-left-open:/library', 'true');
    window.localStorage.setItem('workspace-right-open:/think', 'true');
  });
});

test('visual: library overview and reading states', async ({ page }) => {
  await installAppMocks(page, {
    articleHighlights: [
      {
        _id: 'h-1',
        text: 'A highlight used for context feed visuals.',
        tags: ['creativity'],
        createdAt: '2026-02-14T21:15:00.000Z',
        articleId: 'a1',
        articleTitle: 'Flounder Mode'
      }
    ]
  });

  await page.goto('/library?scope=all');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.locator('.three-pane__main')).toHaveScreenshot('library-overview-ready.png');

  await page.getByRole('button', { name: 'Flounder Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Flounder Mode' })).toBeVisible();
  await expect(page.locator('.three-pane__main')).toHaveScreenshot('library-reading-selected.png');
});

test('visual: library empty folder state', async ({ page }) => {
  await installAppMocks(page);

  await page.goto('/library?scope=folder&folderId=f-empty');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.getByText('No articles in Empty Folder yet.')).toBeVisible();
  await expect(page.locator('.three-pane__main')).toHaveScreenshot('library-empty-folder.png');
});

test('visual: think collapsed index state', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('think.index.groups.collapsed', JSON.stringify({
      notebook: true,
      concepts: true,
      questions: true
    }));
  });
  await installAppMocks(page);

  await page.goto('/think?tab=concepts&concept=Blah');
  await expect(page.getByRole('heading', { name: 'Blah' })).toBeVisible();
  await expect(page.locator('.three-pane__left')).toHaveScreenshot('think-index-collapsed.png');
});

test('visual: map empty graph state', async ({ page }) => {
  await installAppMocks(page, {
    mapGraph: {
      nodes: [],
      edges: [],
      page: { limit: 180, offset: 0, hasMore: false, nextOffset: 0 }
    }
  });

  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await expect(page.getByText('No graph data for this filter set.')).toBeVisible();
  await expect(page.locator('.map-canvas-grid')).toHaveScreenshot('map-empty-state.png');
});

test('visual: return queue ready and empty states', async ({ page }) => {
  await installAppMocks(page, { returnQueueEntries: returnQueueFixture });

  await page.goto('/return-queue');
  await expect(page.getByRole('heading', { name: 'Return Queue' })).toBeVisible();
  await expect(page.getByText('Daily Reflection - 2026-01-11')).toBeVisible();
  await expect(page.locator('.return-queue-page')).toHaveScreenshot('return-queue-ready.png');

  await page.unroute(/https:\/\/note-taker-3-unrg\.onrender\.com\/.*/);
  await installAppMocks(page, { returnQueueEntries: [] });
  await page.goto('/return-queue');
  await expect(page.getByText('Nothing here.').first()).toBeVisible();
  await expect(page.locator('.return-queue-page')).toHaveScreenshot('return-queue-empty.png');
});
