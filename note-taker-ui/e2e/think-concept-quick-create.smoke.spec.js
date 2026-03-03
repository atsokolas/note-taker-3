const { test, expect } = require('@playwright/test');

const normalizeConceptName = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const conceptKey = (value = '') => normalizeConceptName(value).toLowerCase();

const buildConceptFixture = (name, id) => ({
  _id: id,
  name,
  description: '',
  count: 0,
  pinnedHighlightIds: [],
  pinnedArticleIds: [],
  pinnedNoteIds: [],
  relatedTags: [],
  isPublic: false,
  slug: ''
});

const buildWorkspace = () => ({
  version: 1,
  outlineSections: [
    { id: 'inbox', title: 'Inbox', description: '', collapsed: false, order: 0 },
    { id: 'working', title: 'Working', description: '', collapsed: false, order: 1 },
    { id: 'draft', title: 'Draft', description: '', collapsed: true, order: 2 },
    { id: 'archive', title: 'Archive', description: '', collapsed: true, order: 3 }
  ],
  attachedItems: [],
  updatedAt: '2026-03-03T20:00:00.000Z'
});

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const setupThinkConceptMocks = async (page, { initialConceptNames = [] } = {}) => {
  const conceptsByKey = new Map();
  let idCounter = 0;
  const putCalls = new Map();

  const ensureConcept = (rawName) => {
    const cleanName = normalizeConceptName(rawName);
    const key = conceptKey(cleanName);
    if (!key) return null;
    const existing = conceptsByKey.get(key);
    if (existing) return existing;
    idCounter += 1;
    const concept = { name: cleanName, _id: `c-${idCounter}` };
    conceptsByKey.set(key, concept);
    return concept;
  };

  initialConceptNames.forEach((name) => ensureConcept(name));

  await page.route(/https:\/\/note-taker-3-unrg\.onrender\.com\/.*/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/concepts' && method === 'GET') {
      return json(route, Array.from(conceptsByKey.values()).map((item) => ({ name: item.name, count: 0 })));
    }

    if (path.match(/^\/api\/concepts\/[^/]+$/)) {
      const encoded = path.slice('/api/concepts/'.length);
      const decoded = decodeURIComponent(encoded);
      if (method === 'GET') {
        const concept = ensureConcept(decoded);
        return json(route, buildConceptFixture(concept.name, concept._id));
      }
      if (method === 'PUT') {
        const concept = ensureConcept(decoded);
        const count = putCalls.get(concept.name) || 0;
        putCalls.set(concept.name, count + 1);
        return json(route, buildConceptFixture(concept.name, concept._id));
      }
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/related$/) && method === 'GET') {
      return json(route, { results: [], highlights: [], concepts: [], notes: [], articles: [] });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/suggestions$/) && method === 'GET') {
      return json(route, { results: [] });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/questions$/) && method === 'GET') {
      return json(route, []);
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/workspace$/) && method === 'GET') {
      return json(route, { conceptId: 'mock-concept', conceptName: 'Mock concept', workspace: buildWorkspace() });
    }

    if (path.match(/^\/api\/concepts\/[^/]+\/material$/) && method === 'GET') {
      return json(route, {
        pinnedHighlights: [],
        recentHighlights: [],
        linkedArticles: [],
        linkedNotes: []
      });
    }

    if (path === '/api/notebook' && method === 'GET') return json(route, []);
    if (path === '/api/questions' && method === 'GET') return json(route, []);
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path === '/api/highlights' && method === 'GET') return json(route, []);
    if (path === '/get-articles' && method === 'GET') return json(route, []);
    if (path === '/api/working-memory' && method === 'GET') return json(route, []);
    if (path === '/api/connections/scope' && method === 'GET') return json(route, { connections: [] });
    if (path === '/api/connections' && method === 'GET') return json(route, { outgoing: [], incoming: [] });
    if (path === '/api/return-queue' && method === 'GET') return json(route, []);
    if (path === '/api/ai/health' && method === 'GET') return json(route, { status: 'ok' });

    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });
    return route.continue();
  });

  return {
    getPutCount: (name) => putCalls.get(normalizeConceptName(name)) || 0
  };
};

test('quick create works from header, sidebar, duplicate handling, and Enter in search', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'test-token');
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('workspace-right-open:/think', 'true');
  });

  const mocks = await setupThinkConceptMocks(page, {
    initialConceptNames: ['Blah', 'Know']
  });

  await page.goto('/think?tab=concepts&concept=Blah');
  await expect(page.getByRole('heading', { name: 'Blah' })).toBeVisible();

  await page.getByTestId('think-new-concept-header-button').click();
  await expect(page.getByTestId('think-concept-composer-popover')).toBeVisible();
  await page.getByTestId('think-concept-composer-input').fill('Fresh Concept');
  await page.getByTestId('think-concept-composer-submit').click();
  await expect(page).toHaveURL(/concept=Fresh%20Concept/);
  await expect(page.getByRole('heading', { name: 'Fresh Concept' })).toBeVisible();
  expect(mocks.getPutCount('Fresh Concept')).toBe(1);

  await page.getByTestId('think-new-concept-sidebar-button').click();
  await page.getByTestId('think-concept-composer-input').fill('Side Concept');
  await page.getByTestId('think-concept-composer-input').press('Enter');
  await expect(page).toHaveURL(/concept=Side%20Concept/);
  await expect(page.getByRole('heading', { name: 'Side Concept' })).toBeVisible();
  expect(mocks.getPutCount('Side Concept')).toBe(1);

  await page.getByTestId('think-new-concept-header-button').click();
  await page.getByTestId('think-concept-composer-input').fill('sIdE   CoNcEpT');
  await page.getByTestId('think-concept-composer-submit').click();
  await expect(page.getByRole('heading', { name: 'Side Concept' })).toBeVisible();
  await expect(page.getByTestId('think-concept-composer-status')).toContainText('Opened existing concept');
  expect(mocks.getPutCount('Side Concept')).toBe(1);

  await page.getByTestId('think-index-search-input').fill('Search Enter Concept');
  await page.getByTestId('think-index-search-input').press('Enter');
  await expect(page).toHaveURL(/concept=Search%20Enter%20Concept/);
  await expect(page.getByRole('heading', { name: 'Search Enter Concept' })).toBeVisible();
  expect(mocks.getPutCount('Search Enter Concept')).toBe(1);

  await page.getByTestId('think-index-search-input').fill('search enter concept');
  await page.getByTestId('think-index-search-input').press('Enter');
  await expect(page.getByRole('heading', { name: 'Search Enter Concept' })).toBeVisible();
  await expect(page.getByTestId('think-concept-composer-status')).toContainText('Opened existing concept');
  expect(mocks.getPutCount('Search Enter Concept')).toBe(1);
});

test('empty concepts state can create the first concept', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'test-token');
    window.localStorage.setItem('hasSeenLanding', 'true');
  });

  const mocks = await setupThinkConceptMocks(page, { initialConceptNames: [] });

  await page.goto('/think?tab=concepts');
  await expect(page.getByTestId('think-concepts-empty-state')).toBeVisible();
  await expect(page.getByTestId('think-concepts-empty-create-button')).toBeVisible();

  await page.getByTestId('think-concepts-empty-create-button').click();
  await page.getByTestId('think-concept-composer-input').fill('First Concept');
  await page.getByTestId('think-concept-composer-submit').click();

  await expect(page).toHaveURL(/concept=First%20Concept/);
  await expect(page.getByRole('heading', { name: 'First Concept' })).toBeVisible();
  expect(mocks.getPutCount('First Concept')).toBe(1);
});
