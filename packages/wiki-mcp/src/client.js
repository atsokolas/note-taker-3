export const DEFAULT_API_URL = 'https://api.noeis.io';

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/g, '');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    return this.request('/api/wiki/pages', { query: args });
  }

  getPage({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}`);
  }

  getPageMarkdown({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/markdown`, { expectText: true });
  }

  searchPages({ query, limit = 20, pageType, status, visibility } = {}) {
    return this.listPages({ q: query, limit, pageType, status, visibility });
  }

  getSchema() {
    return this.request('/api/wiki/schema');
  }

  getBriefing() {
    return this.request('/api/wiki/briefing');
  }

  getBacklinks({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/backlinks`);
  }

  listActivity({ limit = 50 } = {}) {
    return this.request('/api/wiki/activity', { query: { limit } });
  }

  listRevisions({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/revisions`);
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

  getAutolinks({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/autolinks`);
  }

  getLintRun({ runId }) {
    return this.request(`/api/wiki/lint/${encodeURIComponent(runId)}`);
  }
}
