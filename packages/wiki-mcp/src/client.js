export const DEFAULT_API_URL = 'https://api.noeis.io';

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/g, '');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const pickId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value.id || value._id || '');
  return String(value);
};

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const snippetFromPage = (page = {}, query = '', maxLength = 240) => {
  const haystack = cleanText([
    page.title,
    page.summary,
    page.plainText,
    page.bodyMarkdown,
    page.body
  ].filter(Boolean).join(' '));
  if (!haystack) return '';
  const needle = cleanText(query).toLowerCase();
  const lower = haystack.toLowerCase();
  const hitIndex = needle ? lower.indexOf(needle) : -1;
  const start = hitIndex > 40 ? hitIndex - 40 : 0;
  const snippet = haystack.slice(start, start + maxLength);
  return `${start > 0 ? '...' : ''}${snippet}${start + maxLength < haystack.length ? '...' : ''}`;
};

const normalizePageSummary = (page = {}) => ({
  id: pickId(page),
  title: page.title || 'Untitled wiki page',
  pageType: page.pageType || page.kind || 'topic',
  slug: page.slug || '',
  updatedAt: page.updatedAt || page.lastReviewedAt || page.createdAt || null
});

const normalizeSearchHit = (page = {}, query = '') => ({
  ...normalizePageSummary(page),
  snippet: snippetFromPage(page, query)
});

const normalizeFullPage = (page = {}) => ({
  ...page,
  id: pickId(page),
  title: page.title || 'Untitled wiki page',
  pageType: page.pageType || page.kind || 'topic',
  body: page.body || page.bodyMarkdown || page.plainText || '',
  sources: Array.isArray(page.sources)
    ? page.sources
    : (Array.isArray(page.sourceRefs) ? page.sourceRefs : []),
  claims: Array.isArray(page.claims) ? page.claims : [],
  infobox: page.infobox || page.aiState?.infobox || null
});

const normalizeArrayPayload = (payload, key) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

export class NoeisApiError extends Error {
  constructor(message, { status = 0, body = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'NoeisApiError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

export class NoeisClient {
  constructor({
    token = process.env.NOEIS_TOKEN,
    apiUrl = process.env.NOEIS_API_URL || DEFAULT_API_URL,
    fetchImpl = global.fetch
  } = {}) {
    this.token = String(token || '').trim();
    this.apiUrl = trimTrailingSlash(apiUrl || DEFAULT_API_URL);
    this.fetch = fetchImpl;
    if (typeof this.fetch !== 'function') {
      throw new Error('No fetch implementation is available. Use Node 18+.');
    }
  }

  requireToken() {
    if (!this.token) {
      throw new NoeisApiError('NOEIS_TOKEN is required. Create one in Noeis Settings -> Connected agents.');
    }
  }

  buildUrl(path, query = {}) {
    const url = new URL(path, `${this.apiUrl}/`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    return url;
  }

  async request(path, {
    method = 'GET',
    query = {},
    body,
    headers = {},
    expectText = false,
    retries = 1
  } = {}) {
    this.requireToken();
    const url = this.buildUrl(path, query);
    const init = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: expectText ? 'text/markdown, text/plain;q=0.9, application/json;q=0.8' : 'application/json',
        ...headers
      }
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response = await this.fetch(url, init);
    if (response.status === 429 && retries > 0) {
      const retryAfter = Number(response.headers.get('retry-after') || 1);
      await sleep(Math.max(1, Math.min(retryAfter, 5)) * 1000);
      response = await this.fetch(url, init);
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = expectText
      ? await response.text()
      : (contentType.includes('application/json') ? await response.json() : await response.text());

    if (!response.ok) {
      const message = typeof payload === 'object' && payload?.error
        ? payload.error
        : `Noeis API request failed with ${response.status}`;
      throw new NoeisApiError(message, {
        status: response.status,
        body: payload,
        retryAfter: response.headers.get('retry-after')
      });
    }
    return payload;
  }

  listPages(args = {}) {
    return this.request('/api/wiki/pages', { query: args }).then(pages => (
      normalizeArrayPayload(pages, 'pages').map(normalizePageSummary)
    ));
  }

  getPage({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}`).then(normalizeFullPage);
  }

  getPageMarkdown({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/markdown`, { expectText: true });
  }

  searchPages({ query, limit = 20, pageType, status, visibility } = {}) {
    return this.request('/api/wiki/pages', {
      query: { q: query, limit, pageType, status, visibility }
    }).then(pages => normalizeArrayPayload(pages, 'pages').map(page => normalizeSearchHit(page, query)));
  }

  getSchema() {
    return this.request('/api/wiki/schema');
  }

  getBriefing() {
    return this.request('/api/wiki/briefing');
  }

  listSources({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}`).then(page => ({
      pageId: pickId(page) || pageId,
      sources: Array.isArray(page.sources)
        ? page.sources
        : (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
    }));
  }

  listBacklinks({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/backlinks`);
  }

  getBacklinks(args) {
    return this.listBacklinks(args);
  }

  listActivity({ limit = 50, since } = {}) {
    return this.request('/api/wiki/activity', { query: { limit, since } }).then(payload => {
      const events = normalizeArrayPayload(payload, 'events');
      if (!since) return { events };
      const sinceTime = new Date(since).getTime();
      if (Number.isNaN(sinceTime)) return { events };
      return {
        events: events.filter(event => {
          const eventTime = new Date(event.at || event.createdAt || event.updatedAt).getTime();
          return !Number.isNaN(eventTime) && eventTime >= sinceTime;
        })
      };
    });
  }

  listRevisions({ pageId, limit = 50 }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/revisions`, {
      query: { limit }
    }).then(payload => {
      const revisions = normalizeArrayPayload(payload, 'revisions').slice(0, limit);
      return { revisions };
    });
  }

  listSourceEvents({ status, limit = 50 } = {}) {
    return this.request('/api/wiki/source-events', { query: { status, limit } });
  }

  getIngestRun({ runId }) {
    return this.request(`/api/wiki/ingest/${encodeURIComponent(runId)}`);
  }

  listProposals() {
    return this.request('/api/wiki/proposals');
  }

  listAutolinks({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/autolinks`);
  }

  getAutolinks(args) {
    return this.listAutolinks(args);
  }

  getLintRun({ runId }) {
    return this.request(`/api/wiki/lint/${encodeURIComponent(runId)}`);
  }
}
