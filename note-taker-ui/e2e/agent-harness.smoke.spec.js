/* eslint-disable testing-library/prefer-screen-queries */
const { test, expect } = require('@playwright/test');
const {
  installDevAuth,
  buildPausedTourState
} = require('./helpers/session');

const pausedTourState = buildPausedTourState();

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const agentSkills = [
  {
    id: 'draft-synthesis-doc',
    title: 'Draft synthesis doc',
    summary: 'Turn the current context into a synthesis draft.',
    workerRole: 'synthesizer',
    outputType: 'synthesis_doc',
    workflow: {
      steps: ['Scan the active context', 'Draft the synthesis', 'Stage a notebook artifact']
    }
  }
];

const articleFixture = {
  _id: 'article-ambient',
  title: 'Ambient context article',
  url: 'https://example.com/agentic-systems',
  folder: null,
  pdfs: [],
  highlights: [
    {
      _id: 'highlight-1',
      text: 'A shared protocol keeps thread, handoff, and draft state coherent.',
      note: 'How should the planner expose this operating state to the user?',
      tags: ['agents', 'protocol']
    },
    {
      _id: 'highlight-2',
      text: 'Ambient context should stay grounded in linked material, not only retrieved snippets.',
      note: 'Connected workspace context matters.',
      tags: ['context']
    }
  ],
  content: `
    <p>Agentic systems become usable when the operator can see the current plan, the active worker, and the draft outputs.</p>
    <p>Ambient context should stay grounded in saved material rather than floating free of the workspace.</p>
  `
};

const emptyPolicy = {
  policy: {
    approvals: {},
    hooks: {},
    preferByoSpecialists: false
  }
};

async function installAgentHarnessMocks(page, { onChatRequest = null } = {}) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/agent/protocol/skills' && method === 'GET') {
      return json(route, { skills: agentSkills });
    }

    if (path === '/api/agent/chat' && method === 'POST') {
      const payload = request.postDataJSON() || {};
      if (typeof onChatRequest === 'function') onChatRequest(payload);
      return json(route, {
        reply: 'The article context is grounded and ready for the next move.',
        relatedItems: [{ type: 'article', id: 'article-ambient', title: 'Ambient context article' }],
        planner: {
          activeWorkerRole: 'researcher',
          activeWorkerLabel: 'Researcher',
          rationale: 'The article is still in evidence-gathering mode.'
        },
        thread: {
          threadId: payload.threadId || 'article-thread-1',
          title: 'Ambient article thread',
          messages: []
        }
      });
    }

    if (path === '/api/agent/protocol/policy' && method === 'GET') {
      return json(route, emptyPolicy);
    }

    if (path === '/api/folders' && method === 'GET') return json(route, []);
    if (path === '/api/highlights/all' && method === 'GET') {
      return json(route, articleFixture.highlights.map((highlight) => ({
        ...highlight,
        articleId: articleFixture._id,
        articleTitle: articleFixture.title
      })));
    }
    if (path === '/api/agents/personal' && method === 'GET') return json(route, []);
    if (path === '/api/concepts' && method === 'GET') return json(route, []);
    if (path === '/api/notebook' && method === 'GET') return json(route, []);
    if (path === '/api/questions' && method === 'GET') return json(route, []);
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path === '/api/highlights' && method === 'GET') return json(route, []);
    if (path === '/api/return-queue' && method === 'GET') return json(route, []);
    if (path === '/api/ai/health' && method === 'GET') return json(route, { status: 'ok' });
    if (path === '/api/connections/scope' && method === 'GET') return json(route, { connections: [] });
    if (path === '/api/connections' && method === 'GET') return json(route, { outgoing: [], incoming: [] });
    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });
    return route.continue();
  });

  await page.route('**/get-articles', async (route) => json(route, [articleFixture]));
  await page.route('**/folders', async (route) => json(route, []));
  await page.route('**/articles/article-ambient', async (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return json(route, articleFixture);
  });
}

test.beforeEach(async ({ page }) => {
  await installDevAuth(page, {
    workspacePanels: ['/think'],
    pausedTourState
  });
});

test('article thought partner posts enriched ambient context', async ({ page }) => {
  let chatPayload = null;
  await installAgentHarnessMocks(page, {
    onChatRequest: (payload) => {
      chatPayload = payload;
    }
  });

  await page.goto('/articles/article-ambient');
  await expect(page.getByText('Ambient context article').first()).toBeVisible();

  await page.getByPlaceholder('Ask about this article, connected notes, or what to do next.').fill('What should I pull forward?');
  await page.getByRole('button', { name: '↗' }).click();

  await expect(page.getByText('The article context is grounded and ready for the next move.')).toBeVisible();
  expect(chatPayload).toBeTruthy();
  expect(chatPayload.context.type).toBe('article');
  expect(chatPayload.context.metadata.summary).toContain('example.com');
  expect(chatPayload.context.metadata.summary).toMatch(/2 .*highlights/i);
  expect(chatPayload.context.metadata.openQuestions).toContain('How should the planner expose this operating state to the user?');
  expect(chatPayload.context.metadata.nextActions).toContain('Anchor the reasoning in saved highlights from this article.');
  expect(Array.isArray(chatPayload.context.metadata.relatedItems)).toBe(true);
  expect(chatPayload.context.metadata.relatedItems.length).toBeGreaterThanOrEqual(3);
});
