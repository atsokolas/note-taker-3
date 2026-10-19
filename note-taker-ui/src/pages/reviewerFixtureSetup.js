import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import plan from './reviewerFixturePlan.json';
import { heldFixtureEvent } from './reviewerFixtureEvents';

const idOf = row => String(row?._id || row?.id || '');
const validId = value => /^[a-f0-9]{24}$/.test(String(value || ''));
const pause = message => Object.assign(new Error(message), { reviewerSetup: true });
const bodyDoc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const bodyText = doc => (doc?.content || []).map(node => (node.content || []).map(part => part.text || '').join('')).join('\n');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

export const editionFixturePayload = () => ({
  ...plan.edition.issue, profile: plan.edition.profile.key,
  items: [{ ...plan.edition.item, title: plan.sources[0].title, url: plan.sources[0].url,
    sourceLabel: plan.sources[0].author, passage: plan.highlight.text }]
});

export const verifySetupIdentity = identity => {
  if (!identity?.ownershipVerified || typeof identity.username !== 'string' || !identity.username.trim()
    || !validId(identity.conceptId) || !validId(identity.userId) || identity.holdsActive !== true
    || typeof identity.fixtureBindingComplete !== 'boolean') {
    throw pause('Verified reviewer ownership and active holds are required.');
  }
  return identity;
};

// Normal application requests keep one explicit session in memory. Headers are
// never journaled, logged, rendered or exported; a later account cannot replace it.
export const createSetupClient = (signal, { origin = window.location.origin, conceptId } = {}) => {
  if (origin !== 'https://www.noeis.io') throw pause('Open setup at https://www.noeis.io/reviewer-fixtures in the existing reviewer browser.');
  if (!validId(conceptId)) throw pause('Enter the private concept ID from the verified reviewer page.');
  const config = { ...getAuthHeaders(), signal };
  const auth = config.headers?.Authorization;
  if (typeof auth !== 'string' || !/^Bearer \S+$/.test(auth) || /^Bearer (null|undefined)$/.test(auth)) {
    throw pause('Sign in to the isolated reviewer account first.');
  }
  const get = (path, params) => api.get(path, { ...config, params }).then(response => response.data);
  const post = (path, payload) => api.post(path, payload, config).then(response => response.data);
  return {
    identity: () => get(`/api/concepts/${conceptId}/idea-workbench`).then(row => {
      if (row.reviewerIdentity?.conceptId !== conceptId) throw pause('The private concept did not verify this reviewer.');
      return row.reviewerIdentity;
    }),
    article: url => get('/api/articles/by-url', { url }),
    events: () => get('/api/wiki/source-events', { limit: 100 }).then(row => row.events),
    pages: async () => {
      const groups = await Promise.all(['draft', 'published', 'archived'].map(status => get('/api/wiki/pages', {
        q: plan.wiki.title, status, includeLowQuality: true, limit: 500
      })));
      if (groups.some(rows => !Array.isArray(rows) || rows.length >= 500)) throw pause('Wiki lookup is incomplete; setup is paused.');
      return groups.flat();
    },
    page: id => get(`/api/wiki/pages/${id}`),
    editionProfiles: () => get('/api/edition-profiles'),
    editions: () => get('/api/editions', { profile: plan.edition.profile.key, limit: 100 }),
    edition: id => get(`/api/editions/${id}`),
    configureEdition: () => post('/api/edition-profiles', plan.edition.profile),
    fileEdition: () => post('/api/editions/file', editionFixturePayload()),
    importSource: source => post('/api/import/text', { title: source.title, text: source.text, url: source.url, author: source.author }),
    highlight: articleId => post(`/articles/${articleId}/highlights`, { text: plan.highlight.text, note: plan.highlight.note }),
    wiki: sourceIds => post('/api/wiki/pages', {
      title: plan.wiki.title, visibility: 'private', pageType: 'topic', sourceScope: 'selected_sources',
      createdFrom: { type: 'paste', text: plan.wiki.body }, body: bodyDoc(plan.wiki.body),
      initialSourceRefs: plan.sources.map((source, index) => ({
        type: 'article', objectId: sourceIds[index], title: source.title, url: source.url, snippet: source.text
      }))
    })
  };
};

export const createFixtureSession = ({ client, storage, locks }) => {
  let owner = ''; let key = ''; let journal;
  const readSaved = storageKey => {
    try { return JSON.parse(storage.getItem(storageKey) || 'null'); }
    catch (_) { throw pause('Durable setup state is unavailable; no writes are allowed.'); }
  };
  const persist = (storageKey, value) => {
    const serialized = JSON.stringify(value);
    try { storage.setItem(storageKey, serialized); if (storage.getItem(storageKey) !== serialized) throw new Error(); }
    catch (_) { throw pause('Durable setup state could not be confirmed; setup is paused.'); }
  };
  const loadJournal = () => {
    const parsed = readSaved(key);
    if (parsed && (parsed.version !== plan.version || parsed.owner !== owner || !parsed.confirmed
      || typeof parsed.confirmed !== 'object' || Array.isArray(parsed.confirmed)
      || Object.entries(parsed.confirmed).some(([operation, id]) => !['source-1', 'source-2', 'highlight', 'wiki'].includes(operation) || !validId(id))
      || (parsed.intent !== null && !['source-1', 'source-2', 'highlight', 'wiki'].includes(parsed.intent)))) {
      throw pause('Saved setup state needs review; no writes are allowed.');
    }
    journal = parsed || { version: plan.version, owner, confirmed: {}, intent: null };
  };
  const saveJournal = () => persist(key, journal);
  const identity = async () => {
    const result = verifySetupIdentity(await client.identity());
    if (owner && owner !== result.userId) throw pause('The reviewer session changed; setup is paused.');
    owner = result.userId; key = `noeis.reviewer.fixtures.v${plan.version}.${owner}`;
    return result;
  };
  const checkArticle = (article, source) => {
    if (!validId(idOf(article)) || String(article.userId) !== owner || article.url !== source.url
      || article.title !== source.title || article.content !== source.text || article.author !== source.author) {
      throw pause('An existing source differs from the fixed fixture. It was preserved.');
    }
    return article;
  };
  const checkPage = (page, sources) => {
    if (!validId(idOf(page)) || String(page.userId) !== owner || page.title !== plan.wiki.readbackTitle
      || page.visibility !== 'private' || page.status !== 'draft' || page.pageType !== 'topic'
      || page.sourceScope !== 'selected_sources' || page.plainText !== plan.wiki.body || bodyText(page.body) !== plan.wiki.body
      || canonical(page.body) !== canonical(bodyDoc(plan.wiki.body))
      || !Array.isArray(page.sourceRefs) || page.sourceRefs.length !== 2
      || page.sourceRefs.some(ref => {
        const index = sources.findIndex(source => idOf(source) === String(ref.objectId));
        return index < 0 || ref.type !== 'article' || ref.title !== plan.sources[index].title
          || ref.url !== plan.sources[index].url || ref.snippet !== plan.sources[index].text;
      }) || new Set(page.sourceRefs.map(ref => String(ref.objectId))).size !== 2) {
      throw pause('An existing Wiki differs from the fixed fixture. It was preserved.');
    }
    return page;
  };
  const snapshot = async () => {
    const activeIdentity = await identity();
    const sources = await Promise.all(plan.sources.map(async source => {
      const article = await client.article(source.url);
      return article ? checkArticle(article, source) : null;
    }));
    const matchingHighlights = (sources[0]?.highlights || []).filter(row => row.text === plan.highlight.text);
    if ((sources[0]?.highlights || []).length !== matchingHighlights.length || (sources[1]?.highlights || []).length) {
      throw pause('An existing fixture source has unexpected highlights. They were preserved.');
    }
    if (matchingHighlights.length > 1 || matchingHighlights.some(row => row.note !== plan.highlight.note || !validId(idOf(row)))) {
      throw pause('The saved highlight differs or is duplicated. It was preserved.');
    }
    const highlight = matchingHighlights[0] || null;
    const candidates = (await client.pages()).filter(row => row.title === plan.wiki.readbackTitle);
    if (candidates.length > 1) throw pause('Duplicate fixture Wiki pages need review; setup is paused.');
    const wiki = candidates.length ? checkPage(await client.page(idOf(candidates[0])), sources) : null;
    const events = await client.events();
    if (!Array.isArray(events) || events.length >= 100 || events.some(event => String(event.userId) !== owner
      || ['pending', 'processing', 'failed'].includes(event.status))) {
      throw pause('Source-event state is incomplete or unsettled; setup is paused.');
    }
    sources.forEach((source, index) => {
      if (source && !heldFixtureEvent(events, { owner, type: 'article', objectId: idOf(source), source: plan.sources[index] })) {
        throw pause('Saved source hold is unverified; setup is paused.');
      }
    });
    if (highlight && !heldFixtureEvent(events, { owner, type: 'highlight', objectId: idOf(highlight) })) {
      throw pause('Saved highlight hold is unverified; setup is paused.');
    }
    return { identity: activeIdentity, sources, highlight, wiki, verifiedAt: new Date().toISOString(),
      complete: sources.every(Boolean) && Boolean(highlight) && Boolean(wiki) };
  };
  const recordFor = (state, operation) => operation === 'wiki' ? state.wiki : operation === 'highlight' ? state.highlight
    : state.sources[operation === 'source-1' ? 0 : 1];
  const reconcile = state => {
    for (const operation of ['source-1', 'source-2', 'highlight', 'wiki']) {
      const record = recordFor(state, operation);
      if (journal.confirmed[operation] && journal.confirmed[operation] !== idOf(record)) {
        throw pause('A previously confirmed record is absent or changed; setup is paused.');
      }
      if (record) journal.confirmed[operation] = idOf(record);
    }
    if (journal.intent) {
      if (!recordFor(state, journal.intent)) throw pause('An earlier write has an uncertain outcome. Check saved state; do not repeat it.');
      journal.intent = null;
    }
    saveJournal();
  };
  const withLock = async action => {
    await identity();
    if (!locks?.request) throw pause('Browser lock support is required; no writes are allowed.');
    return locks.request(`noeis.reviewer.fixtures.${owner}`, { ifAvailable: true }, async lock => {
      if (!lock) throw pause('Another setup is running. Check saved state when it finishes.');
      return action();
    });
  };
  const inspect = () => withLock(async () => {
    const state = await snapshot(); loadJournal(); reconcile(state);
    return state;
  });
  const run = async () => {
    return withLock(async () => {
      let state = await snapshot(); loadJournal(); reconcile(state);
      for (const operation of ['source-1', 'source-2', 'highlight', 'wiki']) {
        if (recordFor(state, operation)) continue;
        const activeIdentity = await identity();
        if (activeIdentity.fixtureBindingComplete) throw pause('Fixtures are already bound. Setup is read-only.');
        journal.intent = operation; saveJournal();
        try {
          if (operation === 'wiki') await client.wiki(state.sources.map(idOf));
          else if (operation === 'highlight') await client.highlight(idOf(state.sources[0]));
          else {
            const result = await client.importSource(plan.sources[operation === 'source-1' ? 0 : 1]);
            if (result.status !== 'held') throw pause('The import hold was not confirmed. Check saved state; do not repeat the write.');
          }
          state = await snapshot();
          if (!recordFor(state, operation)) throw pause('The write could not be verified. Check saved state; do not repeat it.');
          reconcile(state);
        } catch (error) {
          if (error.reviewerSetup) throw error;
          throw pause('A write or its readback has an uncertain outcome. Check saved state; do not repeat it.');
        }
      }
      return state;
    });
  };
  const editionSnapshot = async () => {
    const state = await snapshot();
    if (owner !== plan.edition.ownerId || !state.complete) {
      throw pause('Edition setup requires the exact reviewer and complete original fixtures.');
    }
    loadJournal(); reconcile(state);
    const result = await client.editionProfiles();
    if (!Array.isArray(result?.profiles)) throw pause('Edition profile lookup is incomplete; setup is paused.');
    const profiles = result.profiles.filter(row => row.key === plan.edition.profile.key);
    if (profiles.length > 1) throw pause('Duplicate fixture profiles need review; they were preserved.');
    const profile = profiles[0] || null;
    if (profile && (profile.configuredBy !== '' || profile.configuredByRuntime !== ''
      || Object.entries(plan.edition.profile).some(([field, value]) => canonical(profile[field]) !== canonical(value)))) {
      throw pause('The existing Edition profile differs from the fixture. It was preserved.');
    }
    // An unknown profile does not narrow the API's newsstand query. Never ask
    // for issues until this exact owned custom profile has been read back.
    const listed = profile ? await client.editions() : { editions: [] };
    if (!Array.isArray(listed?.editions) || listed.editions.length > 1
      || listed.editions.some(row => row.profile !== plan.edition.profile.key || !validId(idOf(row)))) {
      throw pause('Edition issue lookup is incomplete or duplicated; setup is paused.');
    }
    const issue = listed.editions.length ? await client.edition(idOf(listed.editions[0])) : null;
    if (listed.editions.length && !issue) throw pause('Edition detail readback is incomplete; setup is paused.');
    const payload = editionFixturePayload();
    const item = issue?.items?.[0];
    const start = new Date(issue?.windowStart); const end = new Date(issue?.windowEnd);
    if (issue && (idOf(issue) !== idOf(listed.editions[0]) || issue.profile !== payload.profile
      || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getUTCDay() !== 0
      || start.toISOString().slice(11) !== '00:00:00.000Z' || end.getTime() - start.getTime() !== 6 * 86400000
      || issue.title !== payload.title || issue.standfirst !== payload.standfirst
      || issue.writtenBy !== payload.writtenBy || issue.writtenByRuntime !== '' || issue.number !== null
      || !Array.isArray(issue.items) || issue.items.length !== 1
      || Object.entries(payload.items[0]).some(([field, value]) => canonical(item?.[field]) !== canonical(value))
      || item.filedBy !== payload.writtenBy || item.filedByRuntime !== '' || !Number.isFinite(Date.parse(item.filedAt))
      || item.savedArticleId || item.readerStatus !== 'new' || item.passageCheck !== 'unchecked'
      || item.plain !== '' || item.confidence !== '' || !Array.isArray(item.figures) || item.figures.length
      || !Array.isArray(item.readings) || item.readings.length || issue.headline !== ''
      || issue.throughLine !== '' || !Array.isArray(issue.followUps) || issue.followUps.length
      || !Array.isArray(issue.watchNext) || issue.watchNext.length)) {
      throw pause('The existing Edition issue differs from the fixture. It was preserved.');
    }
    return { ...state, edition: { profile, issue, complete: Boolean(profile && issue) }, verifiedAt: new Date().toISOString() };
  };
  const editionJournal = state => {
    const storageKey = `${key}.edition`;
    const parsed = readSaved(storageKey);
    const saved = parsed === null ? { version: plan.version, owner, profile: false, issueId: null, intent: null } : parsed;
    if (saved.version !== plan.version || saved.owner !== owner || typeof saved.profile !== 'boolean'
      || (saved.issueId !== null && !validId(saved.issueId)) || ![null, 'profile', 'issue'].includes(saved.intent)
      || ((saved.issueId || saved.intent === 'issue') && !saved.profile)) {
      throw pause('Saved Edition setup state needs review; no writes are allowed.');
    }
    if ((saved.profile && !state.edition.profile) || (saved.issueId && saved.issueId !== idOf(state.edition.issue))) {
      throw pause('A confirmed Edition fixture is absent or changed; setup is paused.');
    }
    if (saved.intent && !state.edition[saved.intent]) {
      throw pause('An earlier Edition write has an uncertain outcome. Check saved state; do not repeat it.');
    }
    saved.profile = Boolean(state.edition.profile); saved.issueId = state.edition.issue ? idOf(state.edition.issue) : null;
    saved.intent = null; persist(storageKey, saved);
    return { saved, storageKey };
  };
  const inspectEdition = () => withLock(async () => {
    const state = await editionSnapshot(); editionJournal(state); return state;
  });
  const runEdition = () => withLock(async () => {
    let state = await editionSnapshot(); let durable = editionJournal(state);
    for (const operation of ['profile', 'issue']) {
      if (state.edition[operation]) continue;
      const activeIdentity = await identity();
      if (owner !== plan.edition.ownerId || activeIdentity.fixtureBindingComplete) throw pause('Edition setup is read-only.');
      durable.saved.intent = operation; persist(durable.storageKey, durable.saved);
      try {
        if (operation === 'profile') await client.configureEdition();
        else await client.fileEdition();
        state = await editionSnapshot();
        if (!state.edition[operation]) throw pause('The Edition write could not be verified. Check saved state; do not repeat it.');
        durable = editionJournal(state);
      } catch (error) {
        if (error.reviewerSetup) throw error;
        throw pause('An Edition write or readback has an uncertain outcome. Check saved state; do not repeat it.');
      }
    }
    return state;
  });
  return { inspect, run, inspectEdition, runEdition };
};

export const editionFixtureReceipt = state => {
  if (state?.identity?.userId !== plan.edition.ownerId || !state.complete || !state.edition?.complete) {
    throw pause('An Edition receipt requires complete exact readback.');
  }
  return { version: plan.version, ownerId: state.identity.userId, verifiedAt: state.verifiedAt,
    status: 'persisted_and_read_back', profile: state.edition.profile, editionId: idOf(state.edition.issue),
    windowStart: state.edition.issue.windowStart, windowEnd: state.edition.issue.windowEnd,
    baselineItem: state.edition.issue.items[0], existingSourceId: idOf(state.sources[0]),
    sourceContentHash: plan.sources[0].contentHash, passageHash: plan.highlight.textHash,
    setupInference: 'no_inference_route_called', schedule: 'not_created', sharing: 'not_requested',
    passageVerification: 'unchecked_until_reader_save', connectorAcceptance: 'not_run' };
};

export const fixtureReceipt = state => {
  if (!state.complete) throw pause('A receipt requires complete exact readback.');
  return ({
  version: plan.version, ownerId: state.identity.userId, verifiedAt: state.verifiedAt,
  status: state.complete ? 'persisted_and_read_back' : 'incomplete',
  sourceIds: state.sources.map(source => source ? idOf(source) : null),
  highlightId: state.highlight ? idOf(state.highlight) : null, wikiPageId: state.wiki ? idOf(state.wiki) : null,
  contentHashes: plan.sources.map(source => source.contentHash), highlightHash: plan.highlight.textHash,
  readerNoteHash: plan.highlight.noteHash, wikiBodyHash: plan.wiki.bodyHash,
  wikiBodyFormat: 'exact_tiptap_doc',
  contentComparison: 'exact', sourceEvents: 'held_with_zero_attempts',
  setupInference: 'no_inference_route_called', connectorAcceptance: 'not_run'
  });
};
