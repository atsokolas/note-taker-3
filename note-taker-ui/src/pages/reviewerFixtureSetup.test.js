import { createFixtureSession, createSetupClient, fixtureReceipt, verifySetupIdentity, editionFixturePayload, editionFixtureReceipt } from './reviewerFixtureSetup';
import plan from './reviewerFixturePlan.json';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

jest.mock('../api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../hooks/useAuthHeaders', () => ({ getAuthHeaders: jest.fn() }));
const owner = plan.edition.ownerId;
const id = value => String(value).padStart(24, '0');
const conceptId = '999999999999999999999999';
const identity = () => ({ userId: owner, username: 'Offline fixture reviewer', conceptId,
  ownershipVerified: true, holdsActive: true, fixtureBindingComplete: false });
const rig = ({ source1Id = id(1), highlightId = id(3) } = {}) => {
  const saved = new Map(); const articles = new Map(); const pages = []; const events = []; const writes = [];
  const profiles = []; const editions = [];
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
      const article = { _id: source.fixtureKey === 'source-1' ? source1Id : id(2), userId: owner, title: source.title, url: source.url,
        author: source.author, content: source.text, highlights: [] };
      articles.set(source.url, article); held('article', article._id, source);
      return { status: 'held', article: { _id: article._id } };
    }),
    highlight: jest.fn(async articleId => {
      writes.push('highlight'); const highlight = { _id: highlightId, text: plan.highlight.text, note: plan.highlight.note, noteRevision: 0 };
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
    }),
    editionProfiles: jest.fn(async () => ({ profiles })),
    editions: jest.fn(async () => ({ editions: editions.map(row => ({ _id: row._id, profile: row.profile })) })),
    edition: jest.fn(async editionId => editions.find(row => row._id === editionId)),
    configureEdition: jest.fn(async () => { writes.push('edition-profile'); profiles.push({ ...JSON.parse(JSON.stringify(plan.edition.profile)), configuredBy: '', configuredByRuntime: '' }); }),
    fileEdition: jest.fn(async () => {
      writes.push('edition-issue'); const payload = editionFixturePayload();
      const issue = { ...payload, _id: id(5), number: null, writtenByRuntime: '', windowStart: '2026-10-18T00:00:00.000Z', windowEnd: '2026-10-24T00:00:00.000Z',
        headline: '', throughLine: '', followUps: [], watchNext: [], items: payload.items.map(item => ({ ...item,
          plain: '', confidence: '', figures: [], readings: [], passageCheck: 'unchecked', readerStatus: 'new', savedArticleId: null,
          filedBy: payload.writtenBy, filedByRuntime: '', filedAt: '2026-10-18T00:00:00Z' })) };
      editions.push(issue); return issue;
    })
  };
  const session = () => createFixtureSession({ client, storage, locks });
  return { saved, articles, pages, events, writes, storage, locks, client, session, profiles, editions };
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
  expect(hash(`${plan.highlight.note}\n\n${plan.highlight.reviewedAppend.text}`)).toBe(plan.highlight.reviewedAppend.noteHash);
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

const editionRig = async () => { const r = rig(); await r.session().run(); r.writes.length = 0; return r; };
const editionKey = `noeis.reviewer.fixtures.v${plan.version}.${owner}.edition`;
const reviewedAppendRig = async () => {
  const append = plan.highlight.reviewedAppend;
  const r = rig({ source1Id: append.sourceId, highlightId: append.highlightId });
  await r.session().run(); r.writes.length = 0;
  Object.assign(r.articles.get(plan.sources[0].url).highlights[0], {
    note: `${plan.highlight.note}\n\n${append.text}`, noteRevision: append.noteRevision
  });
  return r;
};

test.each([0, undefined])('the original note remains the baseline with a zero or legacy missing revision (%p)', async revision => {
  const r = await editionRig(); r.articles.get(plan.sources[0].url).highlights[0].noteRevision = revision;
  const state = await r.session().inspectEdition();
  expect(state.highlight.note).toBe(plan.highlight.note);
  expect(fixtureReceipt(state)).toMatchObject({ readerNoteHash: plan.highlight.noteHash, readerNoteRevision: 0 });
  expect(r.writes).toEqual([]);
});

test('the exact verified P2 append survives checks, Edition preparation and reload without core writes', async () => {
  const r = await reviewedAppendRig(); const key = `noeis.reviewer.fixtures.v${plan.version}.${owner}`;
  const originalJournal = r.saved.get(key); const originalCorpus = JSON.stringify([...r.articles.values(), ...r.pages, ...r.events]);
  const read = await r.session().inspect(); await r.session().run(); await r.session().inspectEdition();
  const noteReceipt = { readerNoteHash: plan.highlight.reviewedAppend.noteHash, readerNoteRevision: 1 };
  expect(fixtureReceipt(read)).toMatchObject(noteReceipt); expect(r.writes).toEqual([]);
  const state = await r.session().runEdition();
  expect(r.writes).toEqual(['edition-profile', 'edition-issue']);
  expect(editionFixtureReceipt(state)).toMatchObject(noteReceipt);
  expect(editionFixtureReceipt(state).baselineItem.passage).toBe(plan.highlight.text);
  await r.session().inspect(); await r.session().inspectEdition(); await r.session().runEdition();
  expect(r.writes).toEqual(['edition-profile', 'edition-issue']);
  expect(r.saved.get(key)).toBe(originalJournal);
  expect(JSON.stringify([...r.articles.values(), ...r.pages, ...r.events])).toBe(originalCorpus);
});

test.each([
  ['changed append', (_r, row) => { row.note += ' More'; }],
  ['another append', (_r, row) => { row.note += `\n\n${plan.highlight.reviewedAppend.text}`; }],
  ['changed original', (_r, row) => { row.note = row.note.replace('bounded result', 'different result'); }],
  ['different separator', (_r, row) => { row.note = row.note.replace('\n\n', '\n'); }],
  ['missing revision', (_r, row) => { delete row.noteRevision; }],
  ['string revision', (_r, row) => { row.noteRevision = '1'; }],
  ['older revision', (_r, row) => { row.noteRevision = 0; }],
  ['later revision', (_r, row) => { row.noteRevision = 2; }],
  ['original text at P2 revision', (_r, row) => { row.note = plan.highlight.note; }],
  ['null original revision', (_r, row) => { row.note = plan.highlight.note; row.noteRevision = null; }],
  ['string original revision', (_r, row) => { row.note = plan.highlight.note; row.noteRevision = '0'; }],
  ['different highlight ID', (_r, row) => { row._id = id(88); }],
  ['changed passage', (_r, row) => { row.text += ' Changed'; }],
  ['duplicate highlight', (r, row) => { r.articles.get(plan.sources[0].url).highlights.push({ ...row }); }],
  ['different source ID', r => {
    const article = r.articles.get(plan.sources[0].url); const previous = article._id; article._id = id(88);
    r.pages[0].sourceRefs[0].objectId = article._id;
    r.events.filter(event => event.sourceObjectId === previous).forEach(event => { event.sourceObjectId = article._id; });
  }],
  ['different verified owner', r => {
    r.client.identity.mockResolvedValue({ ...identity(), userId: id(90) });
    r.articles.forEach(row => { row.userId = id(90); });
    [...r.events, ...r.pages].forEach(row => { row.userId = id(90); });
  }]
])('P2 exception rejects %s before any POST or journal change', async (_name, change) => {
  const r = await reviewedAppendRig(); change(r, r.articles.get(plan.sources[0].url).highlights[0]);
  const beforeJournal = [...r.saved.entries()]; const beforeCorpus = JSON.stringify([...r.articles.values(), ...r.pages, ...r.events]);
  for (const action of ['inspect', 'run', 'inspectEdition', 'runEdition']) await expect(r.session()[action]()).rejects.toThrow();
  expect(r.client.editionProfiles).not.toHaveBeenCalled(); expect(r.writes).toEqual([]);
  expect([...r.saved.entries()]).toEqual(beforeJournal);
  expect(JSON.stringify([...r.articles.values(), ...r.pages, ...r.events])).toBe(beforeCorpus);
});

test('Edition preparation reads before two bounded writes and reload never opens another issue window', async () => {
  const r = await editionRig(); const before = await r.session().inspectEdition();
  expect(before.edition.complete).toBe(false); expect(r.writes).toEqual([]);
  expect(r.client.editions).not.toHaveBeenCalled(); // unknown profile does not narrow the newsstand
  expect(() => editionFixtureReceipt(before)).toThrow(/complete exact readback/);
  const state = await r.session().runEdition();
  expect(r.writes).toEqual(['edition-profile', 'edition-issue']); expect(state.edition.complete).toBe(true);
  const receipt = editionFixtureReceipt(state);
  expect(receipt.ownerId).toBe(owner); expect(receipt.editionId).toBe(id(5));
  expect(receipt.baselineItem.passage).toBe(plan.highlight.text);
  expect(receipt.connectorAcceptance).toBe('not_run'); expect(receipt.passageVerification).toBe('unchecked_until_reader_save');
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
  try { await r.session().inspectEdition(); await r.session().runEdition(); } finally { jest.useRealTimers(); }
  expect(r.writes).toHaveLength(2); expect(r.editions).toHaveLength(1);
  expect(r.articles.size).toBe(2); expect(r.pages).toHaveLength(1);
  expect(JSON.parse(r.saved.get(editionKey)).intent).toBe(null);
});

test.each(['configureEdition', 'fileEdition'])('lost %s response reconciles by readback without repeating a POST', async method => {
  const r = await editionRig(); const write = r.client[method];
  r.client[method] = jest.fn(async () => { await write(); throw new Error('response lost'); });
  await expect(r.session().runEdition()).rejects.toThrow(/uncertain/);
  const postCount = r.writes.length;
  const inspected = await r.session().inspectEdition(); expect(r.writes).toHaveLength(postCount);
  expect(JSON.parse(r.saved.get(editionKey)).intent).toBe(null);
  r.client[method] = write; await r.session().runEdition();
  expect(r.writes).toEqual(['edition-profile', 'edition-issue']);
  expect(inspected.edition.profile.key).toBe(plan.edition.profile.key);
});

test.each(['configureEdition', 'fileEdition'])('unknown outcome of %s blocks retry even with no visible object', async method => {
  const r = await editionRig(); r.client[method] = jest.fn(async () => { r.writes.push('uncertain'); throw new Error('timeout'); });
  await expect(r.session().runEdition()).rejects.toThrow(/uncertain/);
  await expect(r.session().inspectEdition()).rejects.toThrow(/uncertain/);
  await expect(r.session().runEdition()).rejects.toThrow(/uncertain/);
  expect(r.client[method]).toHaveBeenCalledTimes(1);
});

test('Edition setup rejects another verified owner, incomplete fixtures, held-event attempts and activated binding', async () => {
  const foreign = await editionRig(); foreign.client.identity.mockResolvedValue({ ...identity(), userId: id(90) });
  foreign.articles.forEach(article => { article.userId = id(90); }); foreign.events.forEach(event => { event.userId = id(90); });
  foreign.pages.forEach(page => { page.userId = id(90); });
  await expect(foreign.session().runEdition()).rejects.toThrow(); expect(foreign.client.editionProfiles).not.toHaveBeenCalled();
  const incomplete = rig(); await expect(incomplete.session().runEdition()).rejects.toThrow(/complete original fixtures/);
  const attempted = await editionRig(); attempted.events[0].attemptCount = 1;
  await expect(attempted.session().runEdition()).rejects.toThrow(/hold is unverified/);
  const bound = await editionRig(); bound.client.identity.mockResolvedValue({ ...identity(), fixtureBindingComplete: true });
  await expect(bound.session().runEdition()).rejects.toThrow(/read-only/);
  expect([foreign, incomplete, attempted, bound].every(r => r.writes.length === 0)).toBe(true);
});

test.each([
  ['profile title', r => { r.profiles[0].title = 'Reader changed this'; }],
  ['profile sections', r => { r.profiles[0].sections[0].keeper = { runtime: 'codex' }; }],
  ['profile provenance', r => { r.profiles[0].configuredBy = 'Someone else'; }],
  ['duplicate profiles', r => { r.profiles.push({ ...r.profiles[0] }); }],
  ['duplicate issues', r => { r.editions.push({ ...r.editions[0], _id: id(8) }); }],
  ['issue title', r => { r.editions[0].title = 'Reader changed this'; }],
  ['issue window', r => { r.editions[0].windowEnd = '2026-10-25T00:00:00.000Z'; }],
  ['passage', r => { r.editions[0].items[0].passage = 'Changed quotation'; }],
  ['source date', r => { r.editions[0].items[0].sourceDate = '2020-01-01'; }],
  ['item signer', r => { r.editions[0].items[0].filedBy = 'Someone else'; }],
  ['item runtime', r => { r.editions[0].items[0].filedByRuntime = 'codex'; }],
  ['issue runtime', r => { r.editions[0].writtenByRuntime = 'codex'; }],
  ['reader save', r => { r.editions[0].items[0].savedArticleId = id(8); }],
  ['reader state', r => { r.editions[0].items[0].readerStatus = 'later'; }],
  ['additional filing', r => { r.editions[0].items.push({ ...r.editions[0].items[0], itemId: 'new' }); }]
])('Edition mismatch (%s) preserves the stored object and journal without repair', async (_name, change) => {
  const r = await editionRig(); await r.session().runEdition(); r.writes.length = 0;
  const journal = r.saved.get(editionKey); change(r);
  await expect(r.session().inspectEdition()).rejects.toThrow();
  await expect(r.session().runEdition()).rejects.toThrow();
  expect(r.writes).toEqual([]); expect(r.saved.get(editionKey)).toBe(journal);
});

test('an issue listed without full detail never establishes absence or permits filing', async () => {
  const r = await editionRig(); await r.session().runEdition(); r.writes.length = 0; r.saved.delete(editionKey);
  r.client.edition.mockResolvedValue(null);
  await expect(r.session().inspectEdition()).rejects.toThrow(/detail readback is incomplete/);
  await expect(r.session().runEdition()).rejects.toThrow(/detail readback is incomplete/);
  expect(r.writes).toEqual([]); expect(r.saved.has(editionKey)).toBe(false);
});

test('Edition intent storage and shared browser lock fail closed before POST', async () => {
  const r = await editionRig(); const save = r.storage.setItem;
  r.storage.setItem = (key, value) => { if (key === editionKey && JSON.parse(value).intent) throw new Error('storage blocked'); return save(key, value); };
  await expect(r.session().runEdition()).rejects.toThrow(/Durable/); expect(r.writes).toEqual([]);
  const locked = await editionRig(); let release; let started;
  const barrier = new Promise(resolve => { release = resolve; }); const start = new Promise(resolve => { started = resolve; });
  const configure = locked.client.configureEdition;
  locked.client.configureEdition = async () => { started(); await barrier; return configure(); };
  const running = locked.session().runEdition(); await start;
  await expect(locked.session().runEdition()).rejects.toThrow(/Another setup/);
  await expect(locked.session().inspect()).rejects.toThrow(/Another setup/);
  release(); await running; expect(locked.writes).toEqual(['edition-profile', 'edition-issue']);
});

test.each([false, 0, '', { version: plan.version, owner, profile: false, issueId: null, intent: 'issue' }])(
  'malformed Edition journal %p is preserved and never becomes a new session', async value => {
    const r = await editionRig(); const serialized = JSON.stringify(value); r.saved.set(editionKey, serialized);
    await expect(r.session().runEdition()).rejects.toThrow(/state needs review/);
    expect(r.writes).toEqual([]); expect(r.saved.get(editionKey)).toBe(serialized);
  }
);

test('Edition transport uses the same captured browser session and only existing profile/file/read routes', async () => {
  jest.clearAllMocks(); getAuthHeaders.mockReturnValue({ headers: { Authorization: 'Bearer OFFLINE_SYNTHETIC_SESSION' } });
  api.get.mockResolvedValue({ data: {} }); api.post.mockResolvedValue({ data: {} });
  const client = createSetupClient(undefined, { origin: 'https://www.noeis.io', conceptId });
  await client.editionProfiles(); await client.editions(); await client.edition(id(5));
  await client.configureEdition(); await client.fileEdition();
  expect(api.post.mock.calls.map(call => call[0])).toEqual(['/api/edition-profiles', '/api/editions/file']);
  expect(api.post.mock.calls[1][1]).toEqual(editionFixturePayload());
  expect(api.get.mock.calls[1][1].params).toEqual({ profile: plan.edition.profile.key, limit: 100 });
  expect(getAuthHeaders).toHaveBeenCalledTimes(1);
  expect([...api.get.mock.calls, ...api.post.mock.calls].every(call => call.at(-1).headers.Authorization === 'Bearer OFFLINE_SYNTHETIC_SESSION')).toBe(true);
});
