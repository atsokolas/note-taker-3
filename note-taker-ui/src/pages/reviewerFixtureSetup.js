import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import plan from './reviewerFixturePlan.json';

const idOf = row => String(row?._id || row?.id || '');
const validId = value => /^[a-f0-9]{24}$/.test(String(value || ''));
const pause = message => Object.assign(new Error(message), { reviewerSetup: true });
const bodyDoc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const bodyText = doc => (doc?.content || []).map(node => (node.content || []).map(part => part.text || '').join('')).join('\n');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

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
  const loadJournal = () => {
    let parsed;
    try { parsed = JSON.parse(storage.getItem(key) || 'null'); }
    catch (_) { throw pause('Durable setup state is unavailable; no writes are allowed.'); }
    if (parsed && (parsed.version !== plan.version || parsed.owner !== owner || !parsed.confirmed
      || typeof parsed.confirmed !== 'object' || Array.isArray(parsed.confirmed)
      || Object.entries(parsed.confirmed).some(([operation, id]) => !['source-1', 'source-2', 'highlight', 'wiki'].includes(operation) || !validId(id))
      || (parsed.intent !== null && !['source-1', 'source-2', 'highlight', 'wiki'].includes(parsed.intent)))) {
      throw pause('Saved setup state needs review; no writes are allowed.');
    }
    journal = parsed || { version: plan.version, owner, confirmed: {}, intent: null };
  };
  const saveJournal = () => {
    const value = JSON.stringify(journal);
    try { storage.setItem(key, value); if (storage.getItem(key) !== value) throw new Error(); }
    catch (_) { throw pause('Durable setup state could not be confirmed; setup is paused.'); }
  };
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
    if (!validId(idOf(page)) || String(page.userId) !== owner || page.title !== plan.wiki.title
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
    const candidates = (await client.pages()).filter(row => row.title === plan.wiki.title);
    if (candidates.length > 1) throw pause('Duplicate fixture Wiki pages need review; setup is paused.');
    const wiki = candidates.length ? checkPage(await client.page(idOf(candidates[0])), sources) : null;
    const events = await client.events();
    if (!Array.isArray(events) || events.length >= 100 || events.some(event => String(event.userId) !== owner
      || ['pending', 'processing', 'failed'].includes(event.status))) {
      throw pause('Source-event state is incomplete or unsettled; setup is paused.');
    }
    const heldEvent = (type, objectId) => {
      const related = events.filter(event => event.sourceType === type && String(event.sourceObjectId) === objectId);
      if (!related.length || related.some(event => event.status !== 'held' || event.attemptCount !== 0
        || event.metadata?.reviewerRehearsalHold?.inferenceAttemptedByHold !== false)) return null;
      return related[0];
    };
    sources.forEach(source => { if (source && !heldEvent('article', idOf(source))) throw pause('Saved source hold is unverified; setup is paused.'); });
    if (highlight && !heldEvent('highlight', idOf(highlight))) throw pause('Saved highlight hold is unverified; setup is paused.');
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
  return { inspect, run };
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
