const { fetchNotionPagesForAgent } = require('../notionFetchTool');

const buildSavingDoc = (importMeta = {}) => {
  const doc = {
    title: '',
    content: '',
    blocks: [],
    tags: [],
    importMeta,
    save: jest.fn().mockResolvedValue()
  };
  return doc;
};

// Mongoose query-shaped: thenable AND .select-able. Both call sites in the
// tool resolve to the same value (null = no existing entry, by default).
const queryReturning = (value) => ({
  select: () => Promise.resolve(value),
  then: (resolve) => resolve(value)
});

describe('fetchNotionPagesForAgent', () => {
  let deps;
  let savedDocs;
  beforeEach(() => {
    savedDocs = [];
    deps = {
      notionClient: {
        searchNotionItems: jest.fn(),
        fetchNotionBlockChildren: jest.fn().mockResolvedValue(['Hello world.', 'Second paragraph.'])
      },
      notionTransform: {
        extractNotionTitle: (page) => page?.properties?.title?.title?.[0]?.plain_text || 'Untitled',
        blockToPlainText: jest.fn()
      },
      IntegrationConnection: {
        findOne: jest.fn()
      },
      NotebookEntry: jest.fn().mockImplementation((data) => {
        const doc = { ...data, save: jest.fn().mockResolvedValue() };
        savedDocs.push(doc);
        return doc;
      }),
      decryptSecret: () => 'plain-token'
    };
    deps.IntegrationConnection.findOne = jest.fn().mockReturnValue({
      sort: () => Promise.resolve({ encryptedAccessToken: 'enc' })
    });
    deps.NotebookEntry.findOne = jest.fn().mockReturnValue(queryReturning(null));
  });

  it('returns no_connection when the user has no Notion connection', async () => {
    deps.IntegrationConnection.findOne = jest.fn().mockReturnValue({
      sort: () => Promise.resolve(null)
    });
    const result = await fetchNotionPagesForAgent({ userId: 'u1', deps });
    expect(result.status).toBe('no_connection');
    expect(result.fetched).toBe(0);
  });

  it('creates new entries for pages that have not been imported before', async () => {
    deps.notionClient.searchNotionItems.mockResolvedValueOnce([
      { id: 'page-1', last_edited_time: '2026-04-01T00:00:00Z', properties: { title: { title: [{ plain_text: 'A' }] } } }
    ]);
    const result = await fetchNotionPagesForAgent({ userId: 'u1', deps });
    expect(result.status).toBe('success');
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(savedDocs[0].importMeta.provider).toBe('notion');
    expect(savedDocs[0].importMeta.externalId).toBe('page-1');
    expect(savedDocs[0].tags).toContain('notion');
  });

  it('auto-applies wiki maintenance when wiki deps are available', async () => {
    const savedEvents = [];
    deps.WikiSourceEvent = jest.fn().mockImplementation((data) => {
      const event = {
        ...data,
        _id: 'event-1',
        status: data.status || 'pending',
        save: jest.fn().mockResolvedValue()
      };
      savedEvents.push(event);
      return event;
    });
    deps.WikiPage = {
      findOne: jest.fn().mockReturnValue({
        then: (resolve) => resolve(null)
      }),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          limit: () => Promise.resolve([])
        }),
        limit: () => Promise.resolve([])
      })
    };
    deps.notionClient.searchNotionItems.mockResolvedValueOnce([
      { id: 'page-1', last_edited_time: '2026-04-01T00:00:00Z', properties: { title: { title: [{ plain_text: 'A' }] } } }
    ]);
    await fetchNotionPagesForAgent({ userId: 'u1', deps });
    expect(savedEvents[0].status).toBe('ignored');
    expect(savedEvents[0].processedAt).toBeTruthy();
  });

  it('skips pages whose last_edited_time matches the cached value', async () => {
    deps.notionClient.searchNotionItems.mockResolvedValueOnce([
      { id: 'page-1', last_edited_time: '2026-04-01T00:00:00Z', properties: { title: { title: [{ plain_text: 'A' }] } } }
    ]);
    deps.NotebookEntry.findOne = jest.fn().mockReturnValue(queryReturning({
      importMeta: { provider: 'notion', externalId: 'page-1', lastNotionEditedAt: '2026-04-01T00:00:00Z' }
    }));
    const result = await fetchNotionPagesForAgent({ userId: 'u1', deps });
    expect(result.status).toBe('success');
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    // No body fetch should have happened.
    expect(deps.notionClient.fetchNotionBlockChildren).not.toHaveBeenCalled();
  });

  it('reports partial_failure when individual pages throw but others succeed', async () => {
    deps.notionClient.searchNotionItems.mockResolvedValueOnce([
      { id: 'page-1', last_edited_time: '2026-04-01', properties: { title: { title: [{ plain_text: 'A' }] } } },
      { id: 'page-2', last_edited_time: '2026-04-02', properties: { title: { title: [{ plain_text: 'B' }] } } }
    ]);
    deps.notionClient.fetchNotionBlockChildren = jest.fn()
      .mockResolvedValueOnce(['ok body'])
      .mockRejectedValueOnce(new Error('boom'));
    const result = await fetchNotionPagesForAgent({ userId: 'u1', deps });
    expect(result.status).toBe('partial_failure');
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].pageId).toBe('page-2');
  });

  it('returns search_failed if Notion list call rejects', async () => {
    deps.notionClient.searchNotionItems.mockRejectedValueOnce(new Error('401'));
    const result = await fetchNotionPagesForAgent({ userId: 'u1', deps });
    expect(result.status).toBe('search_failed');
    expect(result.fetched).toBe(0);
  });
});

// Schema-boundary regression: the importMetaSchema has to define
// lastNotionEditedAt or Mongoose's strict mode silently drops it on save,
// which would defeat skip-if-unchanged on the next run. This test loads the
// real schema (no mocks) and confirms the field round-trips. If someone
// removes the field from the schema, this test fails.
describe('importMetaSchema lastNotionEditedAt persistence', () => {
  it('round-trips lastNotionEditedAt through the real Mongoose schema', () => {
    const mongoose = require('mongoose');
    const path = require('path');
    // Load the model once, isolated. mongoose caches models by name so
    // subsequent imports in the same process are fine.
    const modelsPath = path.resolve(__dirname, '../../../models/index.js');
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { NotebookEntry } = require(modelsPath);
    const doc = new NotebookEntry({
      title: 'X',
      content: '',
      blocks: [],
      userId: new mongoose.Types.ObjectId(),
      importMeta: {
        provider: 'notion',
        externalId: 'page-1',
        lastNotionEditedAt: '2026-04-01T00:00:00Z'
      }
    });
    // .toObject() reflects what mongoose persists — strict mode would have
    // dropped the field by now if the schema didn't define it.
    const serialized = doc.toObject();
    expect(serialized.importMeta.lastNotionEditedAt).toBe('2026-04-01T00:00:00Z');
  });
});
