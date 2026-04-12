const { test, expect } = require('@playwright/test');

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

const threadFixture = {
  threadId: 'thread-1',
  title: 'Agentic reading loop',
  summary: 'Resident planner is aligning research, synthesis, and artifact staging around one article-backed thread.',
  status: 'active',
  createdAt: '2026-04-03T09:00:00.000Z',
  updatedAt: '2026-04-03T09:12:00.000Z',
  createdBy: { actorType: 'user' },
  lastActor: { actorType: 'native_agent', actorId: 'resident' },
  handoffId: 'handoff-1',
  scope: {
    type: 'article',
    id: 'article-ambient',
    title: 'Ambient context article',
    metadata: {
      relatedItems: [
        { type: 'article', id: 'article-ambient', title: 'Ambient context article', snippet: 'Working source' },
        { type: 'concept', id: 'agents', title: 'agents', snippet: 'Linked concept' }
      ]
    }
  },
  checkpoint: {
    summary: 'The thread is grounded in article highlights and is ready for a synthesis move.',
    openQuestions: ['Where is the strongest tension in the current article-backed argument?'],
    nextActions: ['Draft a synthesis doc from the saved highlights.']
  },
  plan: {
    objective: 'Turn the saved article and linked context into a reusable synthesis artifact.',
    successCriteria: ['Stay grounded in saved highlights', 'Expose a clear next move'],
    steps: [
      {
        id: 'step-1',
        title: 'Trace the strongest tension in the source material',
        status: 'in_progress',
        workerRole: 'researcher',
        notes: 'Use linked highlights before broader synthesis.',
        actor: { actorType: 'native_agent', actorId: 'resident' }
      },
      {
        id: 'step-2',
        title: 'Draft the synthesis artifact',
        status: 'pending',
        workerRole: 'synthesizer'
      }
    ]
  },
  planner: {
    activeWorkerRole: 'researcher',
    activeWorkerLabel: 'Researcher',
    routingMode: 'balanced',
    rationale: 'The thread should stay anchored in saved source material before it expands into a broader synthesis.'
  },
  messages: [
    {
      role: 'assistant',
      text: 'I linked the saved highlights to the active plan and narrowed the next move to source-backed synthesis.',
      createdAt: '2026-04-03T09:11:00.000Z',
      relatedItems: [
        { type: 'article', id: 'article-ambient', title: 'Ambient context article' }
      ],
      metadata: {
        planner: {
          activeWorkerLabel: 'Researcher'
        }
      }
    }
  ]
};

const handoffFixture = {
  handoffId: 'handoff-1',
  threadId: 'thread-1',
  title: 'Draft the synthesis doc',
  objective: 'Stage a synthesis artifact from the current thread.',
  taskType: 'synthesis',
  status: 'pending',
  priority: 'normal',
  createdAt: '2026-04-03T09:10:00.000Z',
  updatedAt: '2026-04-03T09:13:00.000Z',
  requestedActor: { actorType: 'native_agent', actorId: 'resident' },
  checkpoint: {
    summary: 'Research is grounded. The next worker should turn that into a reusable draft.',
    openQuestions: ['What should the synthesis preserve from the source article?'],
    nextActions: ['Stage the first synthesis draft.']
  },
  plan: {
    steps: [
      {
        id: 'handoff-step-1',
        title: 'Draft the synthesis artifact',
        status: 'pending',
        workerRole: 'synthesizer'
      }
    ]
  },
  planner: {
    activeWorkerRole: 'synthesizer',
    activeWorkerLabel: 'Synthesizer',
    rationale: 'The next move is synthesis, so the planner is routing this handoff to a drafting specialist.'
  },
  events: [
    {
      eventType: 'created',
      createdAt: '2026-04-03T09:10:00.000Z',
      actor: { actorType: 'user' },
      note: 'Created from the shared thread.',
      payload: {
        planner: {
          activeWorkerLabel: 'Synthesizer'
        }
      }
    }
  ]
};

const threadDrafts = [
  {
    draftId: 'draft-1',
    artifactType: 'note',
    status: 'pending',
    title: 'Agentic reading synthesis',
    summary: 'A staged synthesis artifact grounded in the active thread.',
    body: 'This draft stays anchored in the article highlights and the current planner state.',
    createdAt: '2026-04-03T09:12:00.000Z',
    updatedAt: '2026-04-03T09:12:00.000Z',
    skill: {
      title: 'Draft synthesis doc',
      outputType: 'synthesis_doc'
    }
  }
];

const threadApprovals = [
  {
    approvalId: 'approval-1',
    op: 'threads.update',
    status: 'approved',
    reason: 'Promote the checkpoint update after review.',
    createdAt: '2026-04-03T09:05:00.000Z',
    approvedAt: '2026-04-03T09:06:00.000Z',
    preview: {
      threadId: 'thread-1'
    },
    requestedBy: {
      actorType: 'native_agent'
    }
  }
];

const hookRuns = [
  {
    hookRunId: 'hook-1',
    phase: 'before_thread_update',
    op: 'threads.update',
    effect: 'observe',
    status: 'completed',
    createdAt: '2026-04-03T09:04:00.000Z',
    source: 'policy'
  }
];

const upkeepCycles = [
  {
    cycleId: 'cycle-1',
    title: 'Weekly workspace hygiene',
    summary: 'Re-run the maintenance loop across the linked article and its downstream synthesis artifacts.',
    status: 'active',
    cadence: 'recurring',
    taskType: 'restructure',
    workerRole: 'planner',
    nextDueAt: '2026-04-10T09:00:00.000Z',
    lastRunAt: '2026-04-03T09:13:00.000Z',
    lastHandoffId: 'handoff-1',
    lastThreadId: 'thread-1',
    sourceContext: {
      title: 'Ambient context article'
    },
    workflow: {
      steps: [
        'Summarize the current maintenance state.',
        'Define the next recurring upkeep pass.',
        'Schedule the follow-up cycle and its focus areas.'
      ]
    },
    linkedHandoffStatus: 'pending'
  }
];

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
          threadId: 'article-thread-1',
          title: 'Ambient article thread',
          messages: []
        }
      });
    }

    if (path === '/api/agent/threads' && method === 'GET') {
      return json(route, { threads: [threadFixture] });
    }

    if (path === '/api/agent/threads/thread-1' && method === 'GET') {
      return json(route, { thread: threadFixture });
    }

    if (path === '/api/agent/protocol/handoffs' && method === 'GET') {
      return json(route, { handoffs: [handoffFixture] });
    }

    if (path === '/api/agent/protocol/approvals' && method === 'GET') {
      const threadId = url.searchParams.get('threadId');
      const handoffId = url.searchParams.get('handoffId');
      if (threadId === 'thread-1') return json(route, { approvals: threadApprovals });
      if (handoffId === 'handoff-1') return json(route, { approvals: [] });
      return json(route, { approvals: [] });
    }

    if (path === '/api/agent/protocol/hooks' && method === 'GET') {
      const threadId = url.searchParams.get('threadId');
      const handoffId = url.searchParams.get('handoffId');
      if (threadId === 'thread-1' || handoffId === 'handoff-1') return json(route, { hookRuns });
      return json(route, { hookRuns: [] });
    }

    if (path === '/api/agent/artifacts/drafts' && method === 'GET') {
      const threadId = url.searchParams.get('threadId');
      if (threadId === 'thread-1') return json(route, { drafts: threadDrafts });
      if (threadId === 'article-thread-1') return json(route, { drafts: [] });
      return json(route, { drafts: [] });
    }

    if (path === '/api/agent/protocol/policy' && method === 'GET') {
      return json(route, emptyPolicy);
    }

    if (path === '/api/agent/protocol/upkeep-cycles' && method === 'GET') {
      return json(route, { cycles: upkeepCycles });
    }

    if (path === '/api/agent/protocol/upkeep-cycles/cycle-1/resume' && method === 'POST') {
      return json(route, {
        cycle: upkeepCycles[0],
        handoff: handoffFixture,
        thread: threadFixture
      });
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
    if (path === '/api/working-memory' && method === 'GET') return json(route, []);
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
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
      sub: 'playwright-user'
    }));
    const token = `header.${payload}.signature`;
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('authToken', token);
    window.localStorage.setItem('jwt', token);
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('workspace-right-open:/think', 'true');
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
  await expect(page.getByRole('heading', { name: 'Ambient context article' })).toBeVisible();

  await page.getByPlaceholder('Ask about this article, connected notes, or what to do next.').fill('What should I pull forward?');
  await page.getByRole('button', { name: '↗' }).click();

  await expect(page.getByText('The article context is grounded and ready for the next move.')).toBeVisible();
  expect(chatPayload).toBeTruthy();
  expect(chatPayload.context.type).toBe('article');
  expect(chatPayload.context.metadata.summary).toContain('example.com');
  expect(chatPayload.context.metadata.summary).toContain('2 highlights');
  expect(chatPayload.context.metadata.openQuestions).toContain('How should the planner expose this operating state to the user?');
  expect(chatPayload.context.metadata.nextActions).toContain('Anchor the reasoning in saved highlights from this article.');
  expect(Array.isArray(chatPayload.context.metadata.relatedItems)).toBe(true);
  expect(chatPayload.context.metadata.relatedItems.length).toBeGreaterThanOrEqual(3);
});

test('think thread and handoff surfaces render the operating loop', async ({ page }) => {
  await installAgentHarnessMocks(page);

  await page.goto('/think?tab=threads&threadId=thread-1');
  await expect(page.getByRole('heading', { name: 'Agentic reading loop' })).toBeVisible();
  await expect(page.locator('.think-planner-callout__eyebrow').first()).toHaveText('Planner');
  await expect(page.getByText('Researcher').first()).toBeVisible();
  await expect(page.getByText('Operating log').first()).toBeVisible();
  await expect(page.getByText(/Planner aligned the thread around Researcher/)).toBeVisible();
  await expect(page.getByText(/Agentic reading synthesis/).first()).toBeVisible();
  const upkeepPanel = page.getByTestId('upkeep-cycles-panel');
  if (!(await upkeepPanel.isVisible().catch(() => false))) {
    const expandRightPanel = page.getByLabel('Expand right panel');
    if (await expandRightPanel.count()) {
      await expandRightPanel.click();
    }
  }
  await expect(upkeepPanel).toBeVisible();
  await expect(page.getByText(/Weekly workspace hygiene/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume run' }).first()).toBeVisible();

  await page.goto('/think?tab=handoffs&handoffId=handoff-1');
  await expect(page.getByRole('heading', { name: 'Draft the synthesis doc' })).toBeVisible();
  await expect(page.getByText(/The next move is synthesis, so the planner is routing this handoff to a drafting specialist/).first()).toBeVisible();
  await expect(page.getByText(/Synthesizer/).first()).toBeVisible();
  await expect(page.getByText('Operating log').first()).toBeVisible();
  await expect(page.getByText(/Planner routed this handoff/)).toBeVisible();
});
