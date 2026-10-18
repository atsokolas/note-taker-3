import { createFixtureSession, createSetupClient, fixtureReceipt, verifySetupIdentity } from './reviewerFixtureSetup';
import plan from './reviewerFixturePlan.json';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

jest.mock('../api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../hooks/useAuthHeaders', () => ({ getAuthHeaders: jest.fn() }));
const owner = '111111111111111111111111';
const id = value => String(value).padStart(24, '0');
const conceptId = '999999999999999999999999';
const identity = () => ({ userId: owner, username: 'Offline fixture reviewer', conceptId,
  ownershipVerified: true, holdsActive: true, fixtureBindingComplete: false });
const rig = () => {
  const saved = new Map(); const articles = new Map(); const pages = []; const events = []; const writes = [];
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  let busy = false;
  const locks = { request: async (_name, _options, callback) => {
    if (busy) return callback(null);
    busy = true; try { return await callback({}); } finally { busy = false; }
  } };
  const held = (type, objectId, source) => events.push({ userId: owner, sourceType: source ? 'external' : type,
    sourceObjectId: objectId, ...(source ? { provider: 'manual', eventType: 'imported', title: source.title, url: source.url } : {}),
    status: 'held', attemptCount: 0, metadata: {
      ...(source ? { connector: 'manual', source: 'text', importMode: 'text', sourceLabel: 'Pasted text', isNew: true } : {}),
      reviewerRehearsalHold: { reason: 'reviewer_rehearsal', inferenceAttemptedByHold: false } } });
  const client = {
    identity: jest.fn(async () => identity()),
    article: jest.fn(async url => articles.get(url) || null),
    events: jest.fn(async () => events), pages: jest.fn(async () => pages),
    page: jest.fn(async pageId => pages.find(row => row._id === pageId)),
    importSource: jest.fn(async source => {
      writes.push(source.fixtureKey);
      const article = { _id: id(articles.size + 1), userId: owner, title: source.title, url: source.url,
        author: source.author, content: source.text, highlights: [] };
      articles.set(source.url, article); held('article', article._id, source);
      return { status: 'held', article: { _id: article._id } };
    }),
    highlight: jest.fn(async articleId => {
      writes.push('highlight'); const highlight = { _id: id(3), text: plan.highlight.text, note: plan.highlight.note };
      [...articles.values()].find(row => row._id === articleId).highlights.push(highlight); held('highlight', highlight._id);
      return { highlight };
    }),
    wiki: jest.fn(async sourceIds => {
      writes.push('wiki'); const page = { _id: id(4), userId: owner, title: plan.wiki.readbackTitle, visibility: 'private',
        status: 'draft', pageType: 'topic', sourceScope: 'selected_sources', plainText: plan.wiki.body,
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: plan.wiki.body }] }] },
        sourceRefs: plan.sources.map((source, index) => ({ type: 'article', objectId: sourceIds[index],
          title: source.title, url: source.url, snippet: source.text })) };
      pages.push(page); return page;
    })
  };
  const session = () => createFixtureSession({ client, storage, locks });
  return { saved, articles, pages, events, writes, storage, locks, client, session };
};

test('fixed four writes persist exact fixtures; reload and retry only read back, preserving an unrelated empty Wiki', async () => {
  const r = rig(); r.pages.push({ _id: id(50), title: 'Untitled wiki page' });
  const initial = await r.session().inspect(); expect(initial.complete).toBe(false);
  expect(() => fixtureReceipt(initial)).toThrow(/complete exact readback/);
  const complete = await r.session().run(); expect(complete.complete).toBe(true);
  expect(r.writes).toEqual(['source-1', 'source-2', 'highlight', 'wiki']);
  const receipt = fixtureReceipt(complete); expect(receipt.sourceIds).toEqual([id(1), id(2)]);
  expect(receipt.connectorAcceptance).toBe('not_run'); expect(receipt.contentComparison).toBe('exact');
  await r.session().inspect(); await r.session().run(); expect(r.writes).toHaveLength(4);
  expect(r.pages[0].title).toBe('Untitled wiki page');
});

test('the paused first-source journal reconciles read-only and continuation never repeats that import', async () => {
  const r = rig(); await r.client.importSource(plan.sources[0]);
  const originalId = r.articles.get(plan.sources[0].url)._id;
  const key = `noeis.reviewer.fixtures.v${plan.version}.${owner}`;
  r.saved.set(key, JSON.stringify({ version: plan.version, owner, confirmed: {}, intent: 'source-1' }));
  r.writes.length = 0; r.client.importSource.mockClear();
  const partial = await r.session().inspect();
  expect(partial.sources[0]._id).toBe(originalId); expect(partial.complete).toBe(false);
  expect(JSON.parse(r.saved.get(key))).toEqual({ version: plan.version, owner,
    confirmed: { 'source-1': originalId }, intent: null });
  await r.session().inspect(); expect(r.writes).toEqual([]);
  expect(r.client.importSource).not.toHaveBeenCalled();
  await r.session().run();
  expect(r.writes).toEqual(['source-2', 'highlight', 'wiki']);
  expect(r.client.importSource).toHaveBeenCalledTimes(1);
  expect(r.client.importSource).toHaveBeenCalledWith(plan.sources[1]);
  expect(r.articles.get(plan.sources[0].url)._id).toBe(originalId);
});

test.each([
  ['owner', event => { event.userId = id(90); }],
  ['object', event => { event.sourceObjectId = id(90); }],
  ['provider', event => { event.provider = 'other'; }],
  ['connector', event => { event.metadata.connector = 'other'; }],
  ['source', event => { event.metadata.source = 'url'; }],
  ['import mode', event => { event.metadata.importMode = 'url'; }],
  ['source label', event => { event.metadata.sourceLabel = 'Other source'; }],
  ['URL', event => { event.url = 'https://example.com/different'; }],
  ['title', event => { event.title = 'Different title'; }],
  ['event type', event => { event.eventType = 'created'; }],
  ['newness', event => { delete event.metadata.isNew; }],
  ['hold reason', event => { event.metadata.reviewerRehearsalHold.reason = 'other'; }],
  ['hold proof', event => { delete event.metadata.reviewerRehearsalHold.inferenceAttemptedByHold; }],
  ['attempt count', event => { event.attemptCount = 1; }],
  ['status', event => { event.status = 'processed'; }]
])('external manual-text provenance mismatch (%s) preserves the partial journal and never writes', async (_name, change) => {
  const r = rig(); await r.client.importSource(plan.sources[0]); r.writes.length = 0;
  const key = `noeis.reviewer.fixtures.v${plan.version}.${owner}`;
  const uncertain = JSON.stringify({ version: plan.version, owner, confirmed: {}, intent: 'source-1' });
  r.saved.set(key, uncertain); change(r.events[0]);
  await expect(r.session().inspect()).rejects.toThrow(/setup is paused/);
  await expect(r.session().run()).rejects.toThrow(/setup is paused/);
  expect(r.writes).toEqual([]); expect(r.saved.get(key)).toBe(uncertain);
});

test('every event for the source is checked and external events never stand in for highlight holds', async () => {
  const r = rig(); await r.client.importSource(plan.sources[0]); r.writes.length = 0;
  r.events.push({ ...r.events[0], sourceType: 'article', status: 'processed', attemptCount: 1 });
  await expect(r.session().inspect()).rejects.toThrow(/source hold is unverified/);
  expect(r.writes).toEqual([]);
  const h = rig(); await h.session().run(); h.writes.length = 0;
  h.events.find(event => event.sourceType === 'highlight').sourceType = 'external';
  await expect(h.session().inspect()).rejects.toThrow(/highlight hold is unverified/);
  expect(h.writes).toEqual([]);
});

test('valid owned article holds and the consistent manual-text update contract remain readable', async () => {
  for (const update of [false, true]) {
    const r = rig(); await r.client.importSource(plan.sources[0]); r.writes.length = 0;
    if (update) { r.events[0].metadata.isNew = false; r.events[0].eventType = 'updated'; }
    else r.events[0].sourceType = 'article';
    expect((await r.session().inspect()).sources[0]._id).toBe(id(1));
    expect(r.writes).toEqual([]);
  }
});

test('uncertain Wiki intent reconciles the exact canonical title with zero new writes', async () => {
  const r = rig(); const complete = await r.session().run(); r.writes.length = 0;
  const key = `noeis.reviewer.fixtures.v${plan.version}.${owner}`;
  const journal = JSON.parse(r.saved.get(key)); delete journal.confirmed.wiki; journal.intent = 'wiki';
  r.saved.set(key, JSON.stringify(journal));
  const checked = await r.session().inspect();
  expect(checked.wiki._id).toBe(complete.wiki._id); expect(checked.complete).toBe(true);
  expect(JSON.parse(r.saved.get(key)).intent).toBe(null); expect(r.writes).toEqual([]);
});

test.each([plan.wiki.title, plan.wiki.readbackTitle.toLowerCase(), `${plan.wiki.readbackTitle}!`])(
  'other title variants (%s) cannot resolve the uncertain Wiki intent', async title => {
    const r = rig(); await r.session().run(); r.writes.length = 0;
    const key = `noeis.reviewer.fixtures.v${plan.version}.${owner}`;
    const journal = JSON.parse(r.saved.get(key)); delete journal.confirmed.wiki; journal.intent = 'wiki';
    const uncertain = JSON.stringify(journal); r.saved.set(key, uncertain); r.pages[0].title = title;
    await expect(r.session().inspect()).rejects.toThrow(/uncertain outcome/);
    expect(r.saved.get(key)).toBe(uncertain); expect(r.writes).toEqual([]);
  }
);

test('a canonical list entry cannot authorize a different full-page title', async () => {
  const r = rig(); await r.session().run(); r.writes.length = 0;
  r.client.page = async () => ({ ...r.pages[0], title: plan.wiki.title });
  await expect(r.session().inspect()).rejects.toThrow(/Wiki differs/);
  expect(r.writes).toEqual([]);
});

test('lost import response is reconciled from exact persisted records without repeating the POST', async () => {
  const r = rig(); const save = r.client.importSource;
  r.client.importSource = jest.fn(async source => { await save(source); throw new Error('lost synthetic response'); });
  await expect(r.session().run()).rejects.toThrow(/uncertain outcome/);
  expect(JSON.parse([...r.saved.values()][0]).intent).toBe('source-1');
  r.client.importSource = save; await r.session().inspect(); await r.session().run();
  expect(r.writes).toEqual(['source-1', 'source-2', 'highlight', 'wiki']);
});

test('unknown outcome with no observed record stays held across reload and never repeats a write', async () => {
  const r = rig(); r.client.importSource = jest.fn(async () => { throw new Error('uncertain synthetic request'); });
  await expect(r.session().run()).rejects.toThrow(/uncertain/);
  await expect(r.session().inspect()).rejects.toThrow(/uncertain outcome/);
  await expect(r.session().run()).rejects.toThrow(/uncertain outcome/);
  expect(r.client.importSource).toHaveBeenCalledTimes(1);
});

test('lost highlight response produces exactly one highlight after read-only reconciliation', async () => {
  const r = rig(); const save = r.client.highlight;
  r.client.highlight = jest.fn(async articleId => { await save(articleId); throw new Error('lost response'); });
  await expect(r.session().run()).rejects.toThrow(/uncertain/);
  await r.session().inspect(); r.client.highlight = save; await r.session().run();
  expect(r.writes.filter(write => write === 'highlight')).toHaveLength(1);
});

test('failed confirmation storage after a POST leaves the intent and blocks further writes', async () => {
  const r = rig(); const store = r.storage.setItem; const save = r.client.importSource;
  r.client.importSource = async source => {
    const result = await save(source); r.storage.setItem = () => { throw new Error('confirmation storage failed'); }; return result;
  };
  await expect(r.session().run()).rejects.toThrow(/Durable/);
  expect(JSON.parse([...r.saved.values()][0]).intent).toBe('source-1');
  await expect(r.session().run()).rejects.toThrow(/Durable/); expect(r.writes).toHaveLength(1);
  r.storage.setItem = store; r.client.importSource = save;
  await r.session().inspect(); await r.session().run(); expect(r.writes).toHaveLength(4);
});

test('cross-tab run or check cannot overwrite another in-flight journal; unsupported locks never write', async () => {
  const r = rig(); let release; let started;
  const barrier = new Promise(resolve => { release = resolve; }); const start = new Promise(resolve => { started = resolve; });
  const save = r.client.importSource;
  r.client.importSource = async source => { started(); await barrier; return save(source); };
  const run = r.session().run(); await start;
  await expect(r.session().run()).rejects.toThrow(/Another setup/);
  await expect(r.session().inspect()).rejects.toThrow(/Another setup/);
  expect(JSON.parse([...r.saved.values()][0]).intent).toBe('source-1');
  release(); await run;
  const fresh = rig(); await expect(createFixtureSession({ ...fresh, locks: null }).run()).rejects.toThrow(/lock support/);
  expect(fresh.writes).toHaveLength(0);
});

test('storage, ownership, disabled holds, late account switch and complete binding fail before new writes', async () => {
  for (const change of [{ ownershipVerified: false }, { holdsActive: false }, { username: '' }, { fixtureBindingComplete: undefined }]) {
    const r = rig(); r.client.identity.mockResolvedValue({ ...identity(), ...change });
    await expect(r.session().run()).rejects.toThrow(/ownership and active holds/); expect(r.writes).toHaveLength(0);
  }
  const unavailable = rig(); unavailable.storage.setItem = () => { throw new Error('blocked storage'); };
  await expect(unavailable.session().run()).rejects.toThrow(/Durable/); expect(unavailable.writes).toHaveLength(0);
  const changed = rig(); changed.client.identity.mockResolvedValueOnce(identity()).mockResolvedValueOnce(identity())
    .mockResolvedValue({ ...identity(), userId: id(90) });
  await expect(changed.session().run()).rejects.toThrow(/session changed/); expect(changed.writes).toHaveLength(0);
  const bound = rig(); bound.client.identity.mockResolvedValue({ ...identity(), fixtureBindingComplete: true });
  await expect(bound.session().run()).rejects.toThrow(/read-only/); expect(bound.writes).toHaveLength(0);
});

test('mismatched content, unheld events, incomplete list and canonical Wiki reuse are preserved without repair', async () => {
  const mismatch = rig(); await mismatch.client.importSource(plan.sources[0]); mismatch.writes.length = 0;
  mismatch.articles.get(plan.sources[0].url).content = 'Different existing wording';
  await expect(mismatch.session().run()).rejects.toThrow(/preserved/); expect(mismatch.writes).toHaveLength(0);
  const event = rig(); await event.client.importSource(plan.sources[0]); event.writes.length = 0; event.events[0].status = 'processing';
  await expect(event.session().run()).rejects.toThrow(/unsettled/); expect(event.writes).toHaveLength(0);
  const reuse = rig(); reuse.client.wiki = async () => { reuse.writes.push('wiki'); return { _id: id(70), reusedExisting: true }; };
  await expect(reuse.session().run()).rejects.toThrow(/could not be verified/);
  await expect(reuse.session().run()).rejects.toThrow(/uncertain outcome/); expect(reuse.writes.filter(write => write === 'wiki')).toHaveLength(1);
});

test('transport captures explicit session once, uses only fixed approved routes and preserves full snippets', async () => {
  jest.clearAllMocks(); getAuthHeaders.mockReturnValue({ headers: { Authorization: 'Bearer OFFLINE_SYNTHETIC_SESSION' } });
  api.get.mockImplementation(async path => ({ data: path.includes('idea-workbench') ? { reviewerIdentity: identity() }
    : path.includes('source-events') ? { events: [] } : [] }));
  api.post.mockResolvedValue({ data: {} }); const client = createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId });
  await client.identity(); await client.article(plan.sources[0].url); await client.pages(); await client.events();
  await client.importSource(plan.sources[0]); await client.highlight(id(1)); await client.wiki([id(1), id(2)]);
  expect(getAuthHeaders).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls.map(call => call[0])).toEqual(['/api/import/text', `/articles/${id(1)}/highlights`, '/api/wiki/pages']);
  expect(api.post.mock.calls[2][1].initialSourceRefs.map(ref => ref.snippet)).toEqual(plan.sources.map(source => source.text));
  expect(api.post.mock.calls[2][1].evidencePreflight).toBeUndefined();
  expect(api.post.mock.calls[2][1].preset).toBeUndefined();
  expect(api.post.mock.calls[2][1].title).toBe(plan.wiki.title);
  expect(api.post.mock.calls.every(call => call[2].headers.Authorization === 'Bearer OFFLINE_SYNTHETIC_SESSION')).toBe(true);
  getAuthHeaders.mockReturnValue({ headers: {} }); expect(() => createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId })).toThrow(/Sign in/);
  expect(() => verifySetupIdentity({})).toThrow();
});

test('saturated Wiki result lists cannot prove absence or permit creation', async () => {
  jest.clearAllMocks(); getAuthHeaders.mockReturnValue({ headers: { Authorization: 'Bearer OFFLINE_SYNTHETIC_SESSION' } });
  api.get.mockResolvedValue({ data: Array.from({ length: 500 }, (_, index) => ({ _id: id(index + 1) })) });
  await expect(createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId }).pages()).rejects.toThrow(/lookup is incomplete/);
  expect(api.post).not.toHaveBeenCalled();
});

test('same Wiki text with different structured body is preserved and cannot receive an exact receipt', async () => {
  const r = rig(); await r.session().run(); r.writes.length = 0;
  r.pages[0].body.content[0].content[0].marks = [{ type: 'bold' }];
  await expect(r.session().inspect()).rejects.toThrow(/Wiki differs/);
  await expect(r.session().run()).rejects.toThrow(/Wiki differs/);
  expect(r.writes).toHaveLength(0);
});

test('bundled fictional text hashes match the pinned values reported after exact readback', () => {
  const { createHash } = require('node:crypto');
  const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
  plan.sources.forEach(source => expect(hash(source.text)).toBe(source.contentHash));
  expect(hash(plan.highlight.text)).toBe(plan.highlight.textHash);
  expect(hash(plan.highlight.note)).toBe(plan.highlight.noteHash);
  expect(hash(plan.wiki.body)).toBe(plan.wiki.bodyHash);
});

test('historical attempted work cannot be hidden by a newer held event for the same source', async () => {
  const r = rig(); await r.client.importSource(plan.sources[0]); r.writes.length = 0;
  r.events.push({ ...r.events[0], status: 'processed', attemptCount: 1 });
  await expect(r.session().run()).rejects.toThrow(/hold is unverified/);
  expect(r.writes).toHaveLength(0);
});

test('preview aliases and other origins cannot perform fixture setup', () => {
  jest.clearAllMocks();
  expect(() => createSetupClient(undefined, { origin: 'https://preview.example.com' })).toThrow(/existing reviewer browser/);
  expect(getAuthHeaders).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});

test('missing concept stops before authentication and a different returned concept never verifies', async () => {
  jest.clearAllMocks();
  expect(() => createSetupClient(undefined, { origin: 'https://www.noeis.io' })).toThrow(/private concept ID/);
  expect(getAuthHeaders).not.toHaveBeenCalled();
  getAuthHeaders.mockReturnValue({ headers: { Authorization: 'Bearer OFFLINE_SYNTHETIC_SESSION' } });
  api.get.mockResolvedValue({ data: { reviewerIdentity: { ...identity(), conceptId: id(92) } } });
  await expect(createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId }).identity()).rejects.toThrow(/did not verify/);
  expect(api.post).not.toHaveBeenCalled();
});
