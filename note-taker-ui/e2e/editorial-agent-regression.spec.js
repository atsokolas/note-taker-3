const { test, expect } = require('@playwright/test');

const buildDevJwt = () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: 'playwright-user',
    exp: Math.floor(Date.now() / 1000) + 60 * 60
  });
  return `${header}.${payload}.signature`;
};

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const articleFixture = {
  _id: 'article-1',
  title: 'World Models: Computing the Uncomputable',
  url: 'https://example.com/world-models',
  folder: null,
  content: `
    <p>World models compress experience into latent simulations.</p>
    <p>The promise is that agents can plan in imagination before acting.</p>
    <p>The risk is that abstraction can drift away from the ground truth it is supposed to explain.</p>
  `,
  highlights: []
};

async function setupLibraryAgentMocks(page) {
  await page.route(/.*(\/api\/|\/get-articles$|\/articles\/).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/get-articles' && method === 'GET') {
      return json(route, [articleFixture]);
    }

    if (path === '/articles/article-1' && method === 'GET') {
      return json(route, articleFixture);
    }

    if (path === '/api/articles/article-1/highlights' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/articles/article-1/backlinks' && method === 'GET') {
      return json(route, { notebookBlocks: [], collections: [] });
    }

    if (path === '/api/agent/protocol/skills' && method === 'GET') {
      return json(route, {
        skills: [
          {
            id: 'synth',
            title: 'Summarize',
            summary: 'Distill the current material into the key claim, supporting signals, and next moves.',
            workerRole: 'synthesizer',
            outputType: 'summary_brief',
            workflow: null
          }
        ]
      });
    }

    if (path === '/api/agent/chat' && method === 'POST') {
      return json(route, {
        reply: 'Core claim: World models compress experience into latent simulations. Best support in view: Planning in imagination before acting. Pressure to keep in view: Abstraction can drift away from the ground truth it is supposed to explain.',
        relatedItems: [
          {
            type: 'notebook',
            id: 'n-1',
            title: 'Planning in imagination before acting',
            snippet: 'Agents can simulate outcomes before they touch the world.'
          }
        ],
        thread: {
          threadId: 'thread-library-1',
          messages: [
            { role: 'user', text: 'Summarize what matters most in this article.' },
            { role: 'assistant', text: 'Core claim: World models compress experience into latent simulations. Best support in view: Planning in imagination before acting. Pressure to keep in view: Abstraction can drift away from the ground truth it is supposed to explain.' }
          ]
        }
      });
    }

    if (path === '/api/agent/artifacts/drafts' && method === 'GET') {
      return json(route, { drafts: [] });
    }

    if (path === '/api/folders' && method === 'GET') return json(route, []);
    if (path === '/api/ui-settings' && method === 'GET') return json(route, {});
    if (path === '/api/tour/state' && method === 'GET') return json(route, {});
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });

    return route.continue();
  });
}

async function setupConceptQuickActionMocks(page) {
  const conceptName = 'Archive Memory';
  const concept = { _id: 'concept-1', name: conceptName };
  const matchesConceptRoute = (path, suffix = '') => (
    path === `/api/concepts/${encodeURIComponent(concept.name)}${suffix}`
    || path === `/api/concepts/${concept._id}${suffix}`
  );
  let workbench = {
    version: 1,
    header: {
      label: 'Concept',
      title: conceptName,
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
    agent: { comments: [], messages: [] },
    meta: {
      lastReviewedAt: '2026-04-01T09:00:00.000Z',
      stale: true,
      staleReason: '1 newer source landed after the last review.',
      staleSignature: 'article:article-1',
      dismissedFreshnessSignature: ''
    },
    updatedAt: '2026-04-01T09:00:00.000Z'
  };

  await page.route(/.*(\/api\/|\/get-articles$|\/articles\/).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/get-articles' && method === 'GET') {
      return json(route, []);
    }

    if (path === '/api/concepts' && method === 'GET') {
      return json(route, [{
        _id: concept._id,
        name: concept.name,
        description: '',
        count: 4,
        freshness: {
          stale: true,
          statusLabel: '1 newer source',
          staleReason: '1 newer source landed after the last review.'
        }
      }]);
    }

    if (matchesConceptRoute(path) && method === 'GET') {
      return json(route, {
        _id: concept._id,
        name: concept.name,
        description: '',
        count: 4
      });
    }

    if (matchesConceptRoute(path) && method === 'PUT') {
      return json(route, { _id: concept._id, name: concept.name, description: '', count: 4 });
    }

    if (matchesConceptRoute(path, '/related') && method === 'GET') {
      return json(route, { results: [], highlights: [], concepts: [], notes: [], articles: [] });
    }

    if (matchesConceptRoute(path, '/questions') && method === 'GET') {
      return json(route, []);
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
        revision: 2,
        events: []
      });
    }

    if (matchesConceptRoute(path, '/idea-workbench/events') && method === 'POST') {
      return json(route, { conceptId: concept._id, conceptName: concept.name, events: [] });
    }

    if (matchesConceptRoute(path, '/agent/suggest') && method === 'POST') {
      return json(route, {
        ok: true,
        conceptId: concept._id,
        draftId: 'draft-1',
        drafts: [
          {
            id: 'draft-1',
            summary: 'Support pull prepared',
            cards: [
              {
                sourceKey: 'article:article-1',
                type: 'Article snippet',
                title: 'Hidden Support',
                summary: 'This shows the pattern already existed in your archive.'
              }
            ]
          }
        ]
      });
    }

    if (matchesConceptRoute(path, '/agent/suggestions') && method === 'GET') {
      return json(route, { ok: true, conceptId: concept._id, drafts: [] });
    }

    if (path === '/api/questions' && method === 'GET') return json(route, []);
    if (path === '/api/highlights/all' && method === 'GET') return json(route, []);
    if (path === '/api/notebook' && method === 'GET') return json(route, []);
    if (path === '/api/folders' && method === 'GET') return json(route, []);
    if (path === '/api/return-queue' && method === 'GET') return json(route, []);
    if (path === '/api/working-memory' && method === 'GET') return json(route, []);
    if (path === '/api/tour/state' && method === 'GET') return json(route, {});
    if (path === '/api/ui-settings' && method === 'GET') return json(route, {});
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path === '/api/connections/scope' && method === 'GET') return json(route, { connections: [] });
    if (path === '/api/semantic/related' && method === 'GET') return json(route, { results: [] });
    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });

    return route.continue();
  });
}

async function setupQuestionPartnerMocks(page) {
  const question = {
    _id: 'question-1',
    text: 'Why do world models drift from reality?',
    linkedTagName: 'World Models',
    status: 'open',
    updatedAt: '2026-04-10T12:00:00.000Z'
  };

  await page.route(/.*(\/api\/|\/get-articles$|\/articles\/).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/get-articles' && method === 'GET') return json(route, []);
    if (path === '/api/questions' && method === 'GET') return json(route, [question]);
    if (path === `/api/questions/${question._id}/related` && method === 'GET') {
      return json(route, {
        highlights: [
          {
            objectId: 'highlight-1',
            title: 'Ground truth check',
            snippet: 'Abstraction drifts when the model stops checking itself against the world.'
          }
        ],
        concepts: [
          {
            objectId: 'concept-1',
            title: 'World Models',
            metadata: { name: 'World Models' },
            snippet: 'Linked concept'
          }
        ]
      });
    }

    if (path === '/api/agent/chat' && method === 'POST') {
      return json(route, {
        reply: 'Core question: Why do world models drift from reality? Best support in view: Abstraction starts to drift when the model stops checking itself against the world. Next pressure point: Specify what evidence would count as ground truth for this question.',
        relatedItems: [
          {
            type: 'highlight',
            id: 'highlight-1',
            title: 'Ground truth check',
            snippet: 'Abstraction starts to drift when the model stops checking itself against the world.'
          }
        ],
        thread: {
          threadId: 'thread-question-1',
          messages: [
            { role: 'user', text: 'Summarize what matters most in Why do world models drift from reality?.' },
            { role: 'assistant', text: 'Core question: Why do world models drift from reality? Best support in view: Abstraction starts to drift when the model stops checking itself against the world. Next pressure point: Specify what evidence would count as ground truth for this question.' }
          ]
        }
      });
    }

    if (path === '/api/agent/artifacts/drafts' && method === 'GET') {
      return json(route, {
        drafts: [
          {
            draftId: 'question-draft-1',
            artifactType: 'note',
            status: 'pending',
            title: 'Ground truth criteria',
            summary: 'Define what real-world evidence would count as a valid answer.',
            body: 'Define what real-world evidence would count as a valid answer.',
            updatedAt: '2026-04-10T12:05:00.000Z',
            sourceContext: {
              type: 'question',
              id: question._id,
              title: question.text
            },
            skill: {
              title: 'Summarize',
              workerRole: 'synthesizer',
              outputType: 'summary_brief'
            }
          },
          {
            draftId: 'article-draft-1',
            artifactType: 'note',
            status: 'pending',
            title: 'Unrelated article brief',
            summary: 'This should stay out of the question rail.',
            body: 'This should stay out of the question rail.',
            updatedAt: '2026-04-10T12:06:00.000Z',
            sourceContext: {
              type: 'article',
              id: 'article-1',
              title: 'World Models'
            },
            skill: {
              title: 'Summarize',
              workerRole: 'synthesizer',
              outputType: 'summary_brief'
            }
          }
        ]
      });
    }

    if (path === '/api/highlights/all' && method === 'GET') return json(route, []);
    if (path === '/api/notebook' && method === 'GET') return json(route, []);
    if (path === '/api/folders' && method === 'GET') return json(route, []);
    if (path === '/api/return-queue' && method === 'GET') return json(route, []);
    if (path === '/api/working-memory' && method === 'GET') return json(route, []);
    if (path === '/api/concepts' && method === 'GET') return json(route, []);
    if (path === '/api/tour/state' && method === 'GET') return json(route, {});
    if (path === '/api/ui-settings' && method === 'GET') return json(route, {});
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });

    return route.continue();
  });
}

test.beforeEach(async ({ page }) => {
  const token = buildDevJwt();
  await page.addInitScript((bootToken) => {
    window.localStorage.setItem('token', bootToken);
    window.localStorage.setItem('authToken', bootToken);
    window.localStorage.setItem('jwt', bootToken);
    window.localStorage.setItem('hasSeenLanding', 'true');
    window.localStorage.setItem('workspace-right-open:/library', 'true');
    window.localStorage.setItem('workspace-right-open:/think', 'true');
  }, token);
});

test('library partner renders a single hydrated reply after a quick prompt', async ({ page }) => {
  await setupLibraryAgentMocks(page);

  await page.goto('/library?scope=all&articleId=article-1');
  await expect(page.getByText(articleFixture.title).first()).toBeVisible();

  await page.getByRole('button', { name: 'Summarize what matters most in this article.' }).click();

  const reply = 'Core claim: World models compress experience into latent simulations. Best support in view: Planning in imagination before acting. Pressure to keep in view: Abstraction can drift away from the ground truth it is supposed to explain.';
  await expect(page.getByText(reply, { exact: true })).toHaveCount(1);
});

test('concept editorial rail stays expanded and a support quick action surfaces a queued result', async ({ page }) => {
  await setupConceptQuickActionMocks(page);

  await page.goto('/think?tab=concepts&concept=Archive%20Memory');

  await expect(page.getByRole('heading', { name: 'Archive Memory' })).toBeVisible();
  await expect(page.getByText('Concept map')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pull support' })).toBeVisible();

  await page.getByRole('button', { name: 'Pull support' }).click();

  await expect(page.getByText('Support pull prepared')).toBeVisible();
  await expect(page.getByText('I prepared 1 support point from your archive. The clearest footing is This shows the pattern already existed in your archive. Review the draft before anything lands in the concept.')).toBeVisible();
  await expect(page.getByText('Fresh material waiting').first()).toBeVisible();
});

test('question surface renders the active question and question-specific agent dock', async ({ page }) => {
  await setupQuestionPartnerMocks(page);

  await page.goto('/think?tab=questions&questionId=question-1');

  await expect(page.locator('.question-editorial-shell')).toBeVisible();
  await expect(page.getByText('Question refinement')).toBeVisible();
  await expect(page.getByText('Why do world models drift from reality?').first()).toBeVisible();
  await expect(page.getByText('Agent moves', { exact: true })).toBeVisible();
  await expect(page.getByText('Use a draft-first move to clarify what this question should prove or unlock.')).toBeVisible();
  await expect(page.getByText('Draft queue')).toBeVisible();
  await expect(page.getByText('Ground truth criteria')).toBeVisible();
  await expect(page.getByText('Unrelated article brief')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Think' })).toHaveCount(0);
});
