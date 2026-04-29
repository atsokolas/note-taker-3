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
