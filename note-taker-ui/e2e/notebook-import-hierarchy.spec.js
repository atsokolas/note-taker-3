const { test, expect } = require('@playwright/test');
const {
  appendDevToken,
  buildDevJwt,
  buildPausedTourState,
  installDevAuth
} = require('./helpers/session');

const VALID_TOKEN = buildDevJwt({ expiresInSeconds: 60 * 60 * 24 * 365 });
const NOTE_ID = 'note-imported';
const MIRROR_ROOT_ID = 'folder-mirror-root';
const MIRROR_CHILD_ID = 'folder-mirror-child';
const USER_FOLDER_ID = 'folder-user-workbench';

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const readJsonBody = (request) => {
  try {
    return request.postDataJSON() || {};
  } catch (_error) {
    return {};
  }
};

const buildTourState = () => buildPausedTourState({
  startedAt: '2026-04-19T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-04-19T12:00:00.000Z'
});

const buildState = () => ({
  notionConnection: {
    id: 'notion-1',
    provider: 'notion',
    accountLabel: 'Product Wiki',
    status: 'connected',
    health: 'healthy',
    lastValidatedAt: '2026-04-19T12:00:00.000Z',
    lastPreviewAt: null,
    lastSyncAt: null,
    lastError: ''
  },
  tour: buildTourState(),
  activeSession: null,
  sessionCounter: 0,
  folders: [
    {
      _id: MIRROR_ROOT_ID,
      name: 'Imported notebooks',
      parentFolderId: null,
      sortOrder: 0,
      importMeta: {
        provider: 'notion',
        sourceType: 'oauth',
        sourcePath: 'Imported notebooks',
        folderOwnership: 'import_mirror',
        externalId: 'notion:imported-notebooks'
      }
    },
    {
      _id: MIRROR_CHILD_ID,
      name: 'Product specs',
      parentFolderId: MIRROR_ROOT_ID,
      sortOrder: 0,
      importMeta: {
        provider: 'notion',
        sourceType: 'oauth',
        sourcePath: 'Imported notebooks / Product specs',
        folderOwnership: 'import_mirror',
        externalId: 'notion:imported-notebooks/product-specs',
        parentExternalId: 'notion:imported-notebooks'
      }
    },
    {
      _id: USER_FOLDER_ID,
      name: 'Workbench',
      parentFolderId: null,
      sortOrder: 1,
      importMeta: {}
    }
  ],
  note: {
    _id: NOTE_ID,
    title: 'Imported Roadmap',
    content: '<p>Original imported notebook body.</p>',
    blocks: [
      { id: 'block-1', type: 'paragraph', text: 'Original imported notebook body.' }
    ],
    folder: MIRROR_CHILD_ID,
    type: 'note',
    claimId: null,
    tags: ['strategy'],
    linkedArticleId: null,
    linkedHighlightIds: [],
    importMeta: {
      provider: 'notion',
      sourceType: 'oauth',
      sourceLabel: 'Product Wiki',
      sourcePath: 'Imported notebooks / Product specs',
      folderOwnership: 'import_mirror',
      externalId: 'notion-page-123',
      importedAt: '2026-04-19T12:00:00.000Z',
      searchableAt: '2026-04-19T12:10:00.000Z'
    },
    createdAt: '2026-04-19T12:00:00.000Z',
    updatedAt: '2026-04-19T12:00:00.000Z'
  }
});

const installMocks = async (page, state) => {
  await page.route(/.*(\/api\/|\/get-articles$|\/folders$).*/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/ui-settings' && method === 'GET') {
      return json(route, {
        typographyScale: 'default',
        density: 'comfortable',
        theme: 'light',
        accent: 'earth',
        brandEnergy: false
      });
    }

    if (path === '/api/tour/state' && method === 'GET') {
      return json(route, clone(state.tour));
    }

    if (path === '/api/tour/state' && method === 'PUT') {
      const payload = readJsonBody(request);
      state.tour = {
        ...state.tour,
        ...payload,
        signals: {
          ...state.tour.signals,
          ...(payload.signals || {})
        }
      };
      return json(route, clone(state.tour));
    }

    if (path === '/api/import/connections' && method === 'GET') {
      const provider = String(url.searchParams.get('provider') || '').trim();
      if (provider === 'notion') {
        return json(route, { connections: [clone(state.notionConnection)] });
      }
      if (provider === 'readwise') {
        return json(route, { connections: [] });
      }
      return json(route, { connections: [clone(state.notionConnection)] });
    }

    if (path === '/api/import/sessions/active' && method === 'GET') {
      return json(route, { session: state.activeSession ? clone(state.activeSession) : null });
    }

    if (path === '/api/import/sessions' && method === 'POST') {
      state.sessionCounter += 1;
      state.activeSession = {
        id: `session-notion-${state.sessionCounter}`,
        provider: 'notion',
        mode: 'oauth',
        status: 'draft',
        sourceLabel: state.notionConnection.accountLabel,
        config: {
          sourceType: 'oauth',
          importStrategy: 'oauth'
        },
        progress: {
          stage: 'draft',
          percent: 0,
          indexingState: 'not_started'
        },
        result: {},
        activation: {
          primaryAction: 'create_concept'
        },
        createdAt: '2026-04-19T12:00:00.000Z',
        updatedAt: '2026-04-19T12:00:00.000Z'
      };
      return json(route, { session: clone(state.activeSession) }, 201);
    }

    if (path.startsWith('/api/import/sessions/') && method === 'PATCH') {
      const payload = readJsonBody(request);
      if (!state.activeSession) {
        state.activeSession = {
          id: path.split('/').pop(),
          provider: 'notion',
          mode: 'oauth',
          status: 'draft',
          sourceLabel: state.notionConnection.accountLabel,
          config: {
            sourceType: 'oauth',
            importStrategy: 'oauth'
          },
          progress: {
            stage: 'draft',
            percent: 0,
            indexingState: 'not_started'
          },
          result: {},
          activation: {},
          createdAt: '2026-04-19T12:00:00.000Z'
        };
      }
      state.activeSession = {
        ...state.activeSession,
        ...payload,
        progress: {
          ...(state.activeSession.progress || {}),
          ...(payload.progress || {})
        },
        result: {
          ...(state.activeSession.result || {}),
          ...(payload.result || {})
        },
        activation: {
          ...(state.activeSession.activation || {}),
          ...(payload.activation || {})
        },
        updatedAt: '2026-04-19T15:00:00.000Z'
      };
      return json(route, { session: clone(state.activeSession) });
    }

    if (path === '/api/import/notion/sync' && method === 'POST') {
      state.notionConnection = {
        ...state.notionConnection,
        lastSyncAt: '2026-04-19T15:00:00.000Z'
      };
      state.note = {
        ...state.note,
        content: '<p>Updated from mocked Notion resync.</p>',
        blocks: [
          { id: 'block-2', type: 'paragraph', text: 'Updated from mocked Notion resync.' }
        ],
        folder: state.note.folder,
        importMeta: {
          ...state.note.importMeta,
          provider: 'notion',
          sourceType: 'oauth',
          sourceLabel: state.notionConnection.accountLabel
        },
        updatedAt: '2026-04-19T15:00:00.000Z'
      };
      if (state.activeSession) {
        state.activeSession = {
          ...state.activeSession,
          status: 'completed',
          progress: {
            ...(state.activeSession.progress || {}),
            stage: 'completed',
            percent: 100,
            indexingState: 'queued'
          },
          result: {
            importedNotes: 1,
            lastImportedEntryId: state.note._id,
            indexingQueued: 1
          },
          updatedAt: '2026-04-19T15:00:00.000Z'
        };
      }
      return json(route, {
        importedNotes: 1,
        entryId: state.note._id,
        skippedRows: 0,
        duplicateSkips: 0,
        invalidSkips: 0,
        warningCodes: [],
        warnings: [],
        indexingQueued: 1,
        indexingAttempts: 1,
        indexingFailures: 0,
        indexingState: 'queued',
        connection: clone(state.notionConnection)
      });
    }

    if (path === '/api/notebook' && method === 'GET') {
      return json(route, [clone(state.note)]);
    }

    if (path === '/api/notebook/folders' && method === 'GET') {
      return json(route, clone(state.folders));
    }

    if (path === `/api/notebook/${NOTE_ID}` && method === 'GET') {
      return json(route, clone(state.note));
    }

    if (path === `/api/notebook/${NOTE_ID}` && method === 'PUT') {
      const payload = readJsonBody(request);
      const nextFolderId = Object.prototype.hasOwnProperty.call(payload, 'folder')
        ? (payload.folder || null)
        : state.note.folder;
      state.note = {
        ...state.note,
        ...payload,
        folder: nextFolderId,
        importMeta: {
          ...state.note.importMeta,
          ...(payload.importMeta || {}),
          folderOwnership: Object.prototype.hasOwnProperty.call(payload, 'folder')
            ? (nextFolderId ? 'user_owned' : 'import_mirror')
            : state.note.importMeta.folderOwnership
        },
        updatedAt: '2026-04-19T13:00:00.000Z'
      };
      return json(route, clone(state.note));
    }

    if (path === '/api/concepts' && method === 'GET') return json(route, []);
    if (path === '/api/questions' && method === 'GET') return json(route, []);
    if (path === '/api/tags' && method === 'GET') return json(route, []);
    if (path === '/api/highlights' && method === 'GET') return json(route, []);
    if (path === '/api/highlights/all' && method === 'GET') return json(route, []);
    if (path === '/get-articles' && method === 'GET') return json(route, []);
    if (path === '/folders' && method === 'GET') return json(route, []);
    if (path === '/api/working-memory' && method === 'GET') return json(route, []);
    if (path === '/api/connections/scope' && method === 'GET') return json(route, { connections: [] });
    if (path === '/api/connections' && method === 'GET') return json(route, { outgoing: [], incoming: [] });
    if (path === '/api/return-queue' && method === 'GET') return json(route, []);
    if (path === '/api/ai/health' && method === 'GET') return json(route, { status: 'ok' });

    if (path.startsWith('/api/') && method === 'GET') return json(route, {});
    if (path.startsWith('/api/')) return json(route, { ok: true });
    return route.continue();
  });
};

const folderNode = (page, label) => page.locator('.notebook-folder-tree__node').filter({
  has: page.locator('.library-folder-name', { hasText: label })
});

test('import-backed notebook tree survives moves and mocked notion resync', async ({ page }) => {
  const state = buildState();

  await installDevAuth(page, {
    token: VALID_TOKEN,
    workspacePanels: ['/think'],
    pausedTourState: state.tour
  });

  await installMocks(page, state);

  await page.goto(appendDevToken(`/think?tab=notebook&entryId=${encodeURIComponent(NOTE_ID)}`, VALID_TOKEN));

  await expect(page.getByText('Imported notebooks')).toBeVisible();
  await expect(page.getByText('Product specs')).toBeVisible();
  await expect(folderNode(page, 'Product specs').getByTestId(`notebook-entry-select-${NOTE_ID}`)).toHaveCount(1);

  await page.getByRole('button', { name: 'Move Imported Roadmap' }).click();
  const moveDialog = page.getByRole('dialog');
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByRole('button', { name: 'Workbench' }).click();
  await moveDialog.getByRole('button', { name: /^Move$/ }).click();
  await expect(moveDialog).toBeHidden();

  await expect(folderNode(page, 'Product specs').getByTestId(`notebook-entry-select-${NOTE_ID}`)).toHaveCount(0);
  await expect(folderNode(page, 'Workbench').getByTestId(`notebook-entry-select-${NOTE_ID}`)).toHaveCount(1);

  await page.goto(appendDevToken('/data-integrations', VALID_TOKEN));
  await page.getByRole('button', { name: /Notion/i }).click();
  await expect(page.getByText('Label: Product Wiki')).toBeVisible();
  await page.getByRole('button', { name: 'Sync from Notion' }).click();
  await expect(page.getByText('Notion sync complete.')).toBeVisible();

  await page.goto(appendDevToken(`/think?tab=notebook&entryId=${encodeURIComponent(NOTE_ID)}`, VALID_TOKEN));

  await expect(page.getByText('Updated from mocked Notion resync.')).toBeVisible();
  await expect(folderNode(page, 'Product specs').getByTestId(`notebook-entry-select-${NOTE_ID}`)).toHaveCount(0);
  await expect(folderNode(page, 'Workbench').getByTestId(`notebook-entry-select-${NOTE_ID}`)).toHaveCount(1);
});
