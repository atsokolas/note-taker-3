import { resolveAuth } from './config.js';

export class NoeisCliError extends Error {
  constructor(message, { status = 0, exitCode = 1 } = {}) {
    super(message);
    this.name = 'NoeisCliError';
    this.status = status;
    this.exitCode = exitCode;
  }
}

const normalizeArrayPayload = (payload, key) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

const toDoc = (body) => {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'object' && !Array.isArray(body)) return body;
  const text = String(body || '').trim();
  return {
    type: 'doc',
    content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : []
  };
};

export class NoeisCliClient {
  constructor({ token, apiUrl, fetchImpl = global.fetch, env = process.env } = {}) {
    const auth = resolveAuth({ env });
    this.token = String(token || auth.token || '').trim();
    this.apiUrl = String(apiUrl || auth.apiUrl || '').replace(/\/+$/g, '');
    this.fetch = fetchImpl;
    if (typeof this.fetch !== 'function') throw new NoeisCliError('Node 18+ is required because fetch is not available.');
  }

  requireToken() {
    if (!this.token) {
      throw new NoeisCliError('No Noeis token found. Run `noeis login --token ntk_at_...` or set NOEIS_TOKEN.');
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

  async request(path, { method = 'GET', query = {}, body, expectText = false } = {}) {
    this.requireToken();
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: expectText ? 'text/markdown, text/plain;q=0.9, application/json;q=0.8' : 'application/json'
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await this.fetch(this.buildUrl(path, query), init);
    const contentType = response.headers?.get?.('content-type') || '';
    const payload = expectText
      ? await response.text()
      : (contentType.includes('application/json') ? await response.json() : await response.text());
    if (!response.ok) {
      const message = typeof payload === 'object' && payload?.error
        ? payload.error
        : `Noeis API request failed with ${response.status}`;
      throw new NoeisCliError(message, { status: response.status });
    }
    return payload;
  }

  listPages({ q, status, pageType, visibility, limit = 100 } = {}) {
    return this.request('/api/wiki/pages', { query: { q, status, pageType, visibility, limit } })
      .then(payload => normalizeArrayPayload(payload, 'pages'));
  }

  getPage(pageId) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}`);
  }

  ingestSource(source) {
    return this.request('/api/wiki/ingest', { method: 'POST', body: { source } });
  }

  draftPage(pageId) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/ai/draft`, { method: 'POST', body: {} });
  }

  askPage(pageId, question) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/ask`, { method: 'POST', body: { question } });
  }

  getSchema() {
    return this.request('/api/wiki/schema');
  }

  updateSchema(content) {
    return this.request('/api/wiki/schema', { method: 'PUT', body: { content } });
  }

  listActivity({ limit = 50, since } = {}) {
    return this.request('/api/wiki/activity', { query: { limit, since } });
  }

  createPage({ title, pageType, body, sourceScope } = {}) {
    return this.request('/api/wiki/pages', {
      method: 'POST',
      body: { title, pageType, body: toDoc(body), sourceScope }
    });
  }
}
