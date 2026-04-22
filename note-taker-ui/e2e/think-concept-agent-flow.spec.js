const { test, expect } = require('@playwright/test');
const { buildDevJwt, installDevAuth } = require('./helpers/session');

const normalizeConceptName = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const conceptKey = (value = '') => normalizeConceptName(value).toLowerCase();

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const buildConceptFixture = (name, id, freshness) => ({
  _id: id,
  name,
  description: '',
  count: 4,
  pinnedHighlightIds: [],
  pinnedArticleIds: [],
  pinnedNoteIds: [],
  relatedTags: [],
  isPublic: false,
  slug: '',
  freshness
});

const buildIdeaWorkbenchFixture = (name) => ({
  version: 1,
  header: {
    label: 'Concept',
    title: name,
    prompt: 'What changed in the archive that matters here?',
    stage: 'Seed'
  },
  workspaceDraft: '',
  workspaceDraftType: 'Note',
  importedSourceKeys: [],
  cards: [],
  changeDrafts: [],
  hypothesis: {
    html: '<p>A starting thought worth pressure-testing.</p>',
    versions: [
      {
        id: 'v1',
        label: 'v1',
        maturity: 'Early',
        html: '<p>A starting thought worth pressure-testing.</p>',
        summary: 'Initial framing',
        createdAt: '2026-04-01T09:00:00.000Z'
      }
    ]
  },
  agent: {
    comments: [],
    messages: []
  },
  meta: {
    lastReviewedAt: '2026-04-01T09:00:00.000Z',
    stale: true,
    staleReason: '1 newer source landed after the last review.',
    staleSignature: 'article:article-1',
    dismissedFreshnessSignature: ''
  },
  updatedAt: '2026-04-01T09:00:00.000Z'
});

const setupThinkConceptAgentFlowMocks = async (page) => {
  const conceptName = 'Archive Memory';
  const concept = {
    _id: 'concept-1',
    name: conceptName
  };
  const conceptRouteKeys = [
    encodeURIComponent(concept.name),
    encodeURIComponent(concept._id)
  ];
  const matchesConceptRoute = (path, suffix = '') => (
    conceptRouteKeys.some((key) => path === `/api/concepts/${key}${suffix}`)
  );
  const freshness = {
    stale: true,
    lastReviewedAt: '2026-04-01T09:00:00.000Z',
    staleReason: '1 newer source landed after the last review.',
    staleSignature: 'article:article-1',
    pendingDraftCount: 0,
    freshSourceCount: 1,
    statusLabel: '1 newer source'
  };

  let workbench = buildIdeaWorkbenchFixture(conceptName);
  const notebooks = [];
  let notebookId = 0;

  await page.route(/.*(\/api\/|\/get-articles$).*/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/concepts' && method === 'GET') {
      return json(route, [buildConceptFixture(conceptName, concept._id, freshness)]);
    }

    if (path === `/api/concepts/${encodeURIComponent(concept.name)}` && method === 'GET') {
      return json(route, buildConceptFixture(conceptName, concept._id, freshness));
    }

    if (path === `/api/concepts/${encodeURIComponent(concept.name)}` && method === 'PUT') {
      return json(route, buildConceptFixture(conceptName, concept._id, freshness));
    }

    if (path === `/api/concepts/${encodeURIComponent(concept.name)}/related` && method === 'GET') {
      return json(route, { results: [], highlights: [], concepts: [], notes: [], articles: [] });
    }

    if (path === `/api/concepts/${encodeURIComponent(concept.name)}/questions` && method === 'GET') {
      return json(route, []);
    }

    if (path === `/api/concepts/${encodeURIComponent(concept.name)}/suggestions` && method === 'GET') {
      return json(route, { results: [] });
    }

    if (matchesConceptRoute(path, '/workspace') && method === 'GET') {
      return json(route, { conceptId: concept._id, conceptName: concept.name, workspace: null });
    }

    if (matchesConceptRoute(path, '/material') && method === 'GET') {
      return json(route, {
        pinnedHighlights: [],
        recentHighlights: [],
        linkedArticles: [
          {
            _id: 'article-1',
            title: 'Hidden Support',
            summary: 'This shows the pattern already existed in your archive.',
            createdAt: '2026-04-09T12:00:00.000Z'
          }
        ],
        linkedNotes: []
      });
    }

    if (matchesConceptRoute(path, '/idea-workbench') && method === 'GET') {
      return json(route, {
        conceptId: concept._id,
        conceptName: concept.name,
        ideaWorkbench: workbench,
        revision: 1,
        events: []
      });
    }

    if (matchesConceptRoute(path, '/idea-workbench') && method === 'PUT') {
      const payload = request.postDataJSON();
      workbench = payload.ideaWorkbench;
      return json(route, {
        conceptId: concept._id,
        conceptName: concept.name,
        ideaWorkbench: workbench,
        revision: 1,
        events: []
      });
    }

    if (matchesConceptRoute(path, '/idea-workbench/events') && method === 'POST') {
      return json(route, { conceptId: concept._id, conceptName: concept.name, events: [] });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/idea-workbench\/change-drafts\/[^/]+\/apply$/) && method === 'POST') {
      const draftId = decodeURIComponent(path.split('/').slice(-2, -1)[0]);
      const nextDraft = (workbench.changeDrafts || []).find((draft) => draft.id === draftId) || null;
      workbench = {
        ...workbench,
        changeDrafts: (workbench.changeDrafts || []).filter((draft) => draft.id !== draftId),
        importedSourceKeys: [
          ...new Set([
            ...(workbench.importedSourceKeys || []),
            ...((nextDraft?.sourceKeys) || [])
          ])
        ]
      };
      return json(route, {
        conceptId: concept._id,
        conceptName: concept.name,
        ideaWorkbench: workbench,
        ideaWorkbenchMeta: {
          stale: false,
          freshSourceCount: 0,
          pendingDraftCount: workbench.changeDrafts.length,
          statusLabel: '',
          lastReviewedAt: '2026-04-10T15:30:00.000Z'
        },
        revision: 2,
        events: []
      });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/idea-workbench\/mark-reviewed$/) && method === 'POST') {
      return json(route, { conceptId: concept._id, conceptName: concept.name, events: [] });
    }

    if (path === '/api/notebook' && method === 'GET') {
      return json(route, notebooks);
    }

    if (path === '/api/notebook' && method === 'POST') {
      const payload = request.postDataJSON();
      notebookId += 1;
      const created = {
        _id: `notebook-${notebookId}`,
        title: payload.title,
        content: payload.content || '',
        blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        importMeta: payload.importMeta || {},
        updatedAt: '2026-04-10T15:30:00.000Z'
      };
      notebooks.unshift(created);
      return json(route, created);
    }

    if (path.match(/^\/api\/notebook\/[^/]+$/) && method === 'GET') {
      const entryId = decodeURIComponent(path.slice('/api/notebook/'.length));
      const entry = notebooks.find((item) => item._id === entryId) || null;
      return json(route, entry || {}, entry ? 200 : 404);
    }

    if (path.match(/^\/api\/notebook\/[^/]+$/) && method === 'PUT') {
      const entryId = decodeURIComponent(path.slice('/api/notebook/'.length));
      const payload = request.postDataJSON();
      const index = notebooks.findIndex((item) => item._id === entryId);
      if (index >= 0) {
        notebooks[index] = { ...notebooks[index], ...payload };
        return json(route, notebooks[index]);
      }
      return json(route, { error: 'Not found' }, 404);
    }

    if (path === '/api/questions' && method === 'GET') return json(route, []);
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path === '/api/highlights' && method === 'GET') return json(route, []);
    if (path === '/api/highlights/all' && method === 'GET') return json(route, []);
    if (path === '/get-articles' && method === 'GET') return json(route, []);
    if (path === '/api/working-memory' && method === 'GET') return json(route, []);
    if (path === '/api/ui-settings' && method === 'GET') return json(route, {});
    if (path === '/api/ui-settings' && method === 'PUT') return json(route, request.postDataJSON() || {});
    if (path === '/api/connections/scope' && method === 'GET') return json(route, { connections: [] });
    if (path === '/api/connections' && method === 'GET') return json(route, { outgoing: [], incoming: [] });
    if (path === '/api/return-queue' && method === 'GET') return json(route, []);
    if (path === '/api/ai/health' && method === 'GET') return json(route, { status: 'ok' });
    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });

    return route.continue();
  });
};

test('stale concept can surface freshness, apply a related-source draft, and open a notebook draft', async ({ page }) => {
  const token = buildDevJwt();
  await installDevAuth(page, {
    token,
    workspacePanels: ['/think']
  });

  await setupThinkConceptAgentFlowMocks(page);

  await page.goto('/think?tab=concepts');

  await expect(page.getByTestId('think-concept-status-Archive%20Memory')).toBeVisible();
  await page.locator('.think-concepts-index-card').filter({ hasText: 'Archive Memory' }).click();

  await expect(page.getByRole('heading', { name: 'Archive Memory' })).toBeVisible();
  await expect(page.getByText('Fresh material waiting')).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'Hidden Support' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Related sources' }).click();
  await page.getByRole('button', { name: 'Attach sources' }).click();

  await page.getByRole('button', { name: /Essay draft/i }).click();

  await expect(page).toHaveURL(/tab=notebook/);
  await expect(page.getByText('Derived from concept')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue from Archive Memory' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open concept' })).toBeVisible();
});
