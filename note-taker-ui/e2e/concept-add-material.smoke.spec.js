const { test, expect } = require('@playwright/test');

const conceptFixture = {
  _id: 'c1',
  name: 'Blah',
  description: '',
  count: 0,
  pinnedHighlightIds: [],
  pinnedArticleIds: [],
  pinnedNoteIds: [],
  relatedTags: []
};

const highlightFixture = {
  _id: 'hl-1',
  text: 'Kelly rode a bicycle across the United States in his 20s.',
  articleId: 'article-1',
  articleTitle: 'Founder Mode',
  tags: ['thinking', 'creativity'],
  createdAt: '2024-01-14T00:00:00.000Z'
};

const buildWorkspace = (items = []) => ({
  version: 1,
  groups: [
    {
      id: 'group-inbox',
      title: 'Inbox',
      description: '',
      collapsed: false,
      order: 0
    }
  ],
  items,
  connections: [],
  updatedAt: '2026-02-23T20:00:00.000Z'
});

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

test('concept add-material drawer attaches a highlight into the workspace', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'test-token');
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('workspace-right-open:/think', 'true');
  });

  let workspace = buildWorkspace([]);
  let conceptMaterial = {
    pinnedHighlights: [],
    recentHighlights: [],
    linkedArticles: [],
    linkedNotes: []
  };

  await page.route(/https:\/\/note-taker-3-unrg\.onrender\.com\/.*/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/concepts' && method === 'GET') {
      return json(route, [{ name: 'Blah', count: 1 }]);
    }

    if (path === '/api/concepts/Blah' && method === 'GET') {
      return json(route, conceptFixture);
    }

    if ((path === '/api/concepts/c1/workspace' || path === '/api/concepts/Blah/workspace') && method === 'GET') {
      return json(route, { conceptId: 'c1', conceptName: 'Blah', workspace });
    }

    if ((path === '/api/concepts/c1/material' || path === '/api/concepts/Blah/material') && method === 'GET') {
      return json(route, conceptMaterial);
    }

    if ((path === '/api/concepts/c1/related' || path === '/api/concepts/Blah/related') && method === 'GET') {
      return json(route, { highlights: [], concepts: [] });
    }

    if (path === '/api/concepts/c1/suggestions' && method === 'GET') {
      return json(route, []);
    }

    if ((path === '/api/concepts/Blah/questions' || path === '/api/questions') && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/notebook' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/tags' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/highlights' && method === 'GET') {
      return json(route, [highlightFixture]);
    }

    if (path === '/get-articles' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/working-memory' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/connections/scope' && method === 'GET') {
      return json(route, { connections: [] });
    }

    if (path === '/api/connections' && method === 'GET') {
      return json(route, { outgoing: [], incoming: [] });
    }

    if (path === '/api/return-queue' && method === 'GET') {
      return json(route, []);
    }

    if ((path === '/api/concepts/c1/workspace/blocks/attach' || path === '/api/concepts/Blah/workspace/blocks/attach') && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const nextItem = {
        id: `item-${workspace.items.length + 1}`,
        type: String(payload.type || 'highlight'),
        refId: String(payload.refId || ''),
        groupId: String(payload.sectionId || 'group-inbox'),
        parentId: '',
        inlineTitle: '',
        inlineText: '',
        stage: String(payload.stage || 'inbox'),
        status: 'active',
        order: workspace.items.length
      };
      workspace = buildWorkspace([...workspace.items, nextItem]);
      conceptMaterial = {
        ...conceptMaterial,
        recentHighlights: [highlightFixture]
      };
      return json(route, {
        conceptId: 'c1',
        conceptName: 'Blah',
        block: nextItem,
        workspace
      });
    }

    if (path.startsWith('/api/') && method === 'GET') {
      return json(route, {});
    }

    if (path.startsWith('/api/')) {
      return json(route, { ok: true });
    }

    return route.continue();
  });

  await page.goto('/think?tab=concepts&concept=Blah');

  await expect(page.getByRole('heading', { name: 'Blah' })).toBeVisible();
  await expect(page.getByTestId('concept-add-material-button')).toBeVisible();

  await page.getByTestId('concept-add-material-button').click();
  await expect(page.getByTestId('concept-add-material-drawer')).toBeVisible();
  await expect(page.getByTestId('concept-add-material-row-highlight-hl-1')).toBeVisible();

  await page.getByTestId('concept-add-material-attach-highlight-hl-1').click();

  await expect(
    page.locator('[data-testid^="concept-workspace-item-title-"]').filter({ hasText: 'Founder Mode' })
  ).toHaveCount(1);
});
