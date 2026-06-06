export const DEFAULT_API_URL = 'https://note-taker-3-unrg.onrender.com';

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

const normalizeArticleSummary = (article = {}) => ({
  id: pickId(article),
  title: article.title || 'Untitled article',
  url: article.url || '',
  siteName: article.siteName || '',
  author: article.author || '',
  publicationDate: article.publicationDate || '',
  folder: article.folder || null,
  highlightCount: Number(article.highlightCount ?? (Array.isArray(article.highlights) ? article.highlights.length : 0)),
  createdAt: article.createdAt || null,
  updatedAt: article.updatedAt || null
});

const normalizeFullArticle = (article = {}) => ({
  ...article,
  id: pickId(article),
  title: article.title || 'Untitled article',
  url: article.url || '',
  content: article.content || '',
  highlights: Array.isArray(article.highlights) ? article.highlights : [],
  folder: article.folder || null
});

const normalizeHighlight = (highlight = {}) => ({
  ...highlight,
  id: pickId(highlight),
  articleId: pickId(highlight.articleId),
  articleTitle: highlight.articleTitle || '',
  text: highlight.text || '',
  note: highlight.note || '',
  tags: Array.isArray(highlight.tags) ? highlight.tags : [],
  color: highlight.color || '',
  type: highlight.type || 'note',
  claimId: highlight.claimId || null,
  createdAt: highlight.createdAt || null
});

const normalizeQuestion = (question = {}) => ({
  ...question,
  id: pickId(question),
  text: question.text || '',
  status: question.status || 'open',
  linkedTagName: question.linkedTagName || '',
  conceptName: question.conceptName || question.linkedTagName || '',
  linkedHighlightId: question.linkedHighlightId || null,
  linkedHighlightIds: Array.isArray(question.linkedHighlightIds) ? question.linkedHighlightIds : [],
  linkedNotebookEntryId: question.linkedNotebookEntryId || null,
  createdAt: question.createdAt || null,
  updatedAt: question.updatedAt || null
});

const toTipTapDoc = (body) => {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'object' && !Array.isArray(body)) return body;
  const text = cleanText(body);
  return {
    type: 'doc',
    content: text
      ? [{
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }]
      : []
  };
};

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

  searchArticles({ query = '', scope = 'all', folderId, sort = 'recent', limit = 20 } = {}) {
    return this.request('/api/articles', {
      query: { query, scope, folderId, sort, limit }
    }).then(payload => normalizeArrayPayload(payload, 'articles').map(normalizeArticleSummary));
  }

  getArticle({ articleId }) {
    return this.request(`/articles/${encodeURIComponent(articleId)}`).then(normalizeFullArticle);
  }

  listArticleHighlights({ articleId }) {
    return this.request(`/api/articles/${encodeURIComponent(articleId)}/highlights`)
      .then(payload => normalizeArrayPayload(payload, 'highlights').map(normalizeHighlight));
  }

  searchHighlights({ query = '', tag, articleId, folderId, limit = 20 } = {}) {
    return this.request('/api/highlights', {
      query: { q: query, tag, articleId, folderId, limit }
    }).then(payload => normalizeArrayPayload(payload, 'highlights').map(normalizeHighlight));
  }

  getHighlight({ highlightId }) {
    return this.request('/api/highlights/all')
      .then(payload => normalizeArrayPayload(payload, 'highlights').map(normalizeHighlight))
      .then(highlights => highlights.find(highlight => String(highlight.id) === String(highlightId)) || null);
  }

  createArticle({ title, url, content = '', folderId, author, publicationDate, siteName } = {}) {
    return this.request('/save-article', {
      method: 'POST',
      body: { title, url, content, folderId, author, publicationDate, siteName }
    }).then(normalizeFullArticle);
  }

  createHighlight({ articleId, text, note, tags, anchor, color } = {}) {
    return this.request(`/articles/${encodeURIComponent(articleId)}/highlights`, {
      method: 'POST',
      body: { text, note, tags, anchor, color }
    }).then(payload => normalizeHighlight(payload?.highlight || payload?.createdHighlight || payload));
  }

  listQuestions({ status, tag, conceptName, highlightId, notebookEntryId } = {}) {
    return this.request('/api/questions', {
      query: { status, tag, conceptName, highlightId, notebookEntryId }
    }).then(payload => normalizeArrayPayload(payload, 'questions').map(normalizeQuestion));
  }

  getQuestion({ questionId }) {
    return this.request(`/api/questions/${encodeURIComponent(questionId)}`).then(normalizeQuestion);
  }

  createQuestion({ text, status = 'open', conceptName = '', linkedTagName, blocks = [], linkedHighlightId, linkedHighlightIds = [], linkedNotebookEntryId } = {}) {
    return this.request('/api/questions', {
      method: 'POST',
      body: {
        text,
        status,
        conceptName,
        linkedTagName: linkedTagName || conceptName || '',
        blocks,
        linkedHighlightId,
        linkedHighlightIds,
        linkedNotebookEntryId
      }
    }).then(normalizeQuestion);
  }

  updateQuestion({ questionId, text, status, conceptName, linkedTagName, blocks, linkedHighlightId, linkedHighlightIds, linkedNotebookEntryId } = {}) {
    return this.request(`/api/questions/${encodeURIComponent(questionId)}`, {
      method: 'PUT',
      body: { text, status, conceptName, linkedTagName, blocks, linkedHighlightId, linkedHighlightIds, linkedNotebookEntryId }
    }).then(normalizeQuestion);
  }

  listConcepts() {
    return this.request('/api/concepts');
  }

  getConcept({ name }) {
    return this.request(`/api/concepts/${encodeURIComponent(name)}`);
  }

  updateConcept({ name, description, summary, status, pinnedHighlightIds, pinnedArticleIds, pinnedNoteIds, ideaWorkbench, ideaWorkbenchMeta } = {}) {
    return this.request(`/api/concepts/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: { description, summary, status, pinnedHighlightIds, pinnedArticleIds, pinnedNoteIds, ideaWorkbench, ideaWorkbenchMeta }
    });
  }

  pinHighlightToConcept({ name, highlightId } = {}) {
    return this.request(`/api/concepts/${encodeURIComponent(name)}/add-highlight`, {
      method: 'POST',
      body: { highlightId }
    });
  }

  createPage({ title, pageType, body, sourceScope, initialSourceRef, createdFrom } = {}) {
    return this.request('/api/wiki/pages', {
      method: 'POST',
      body: {
        title,
        pageType,
        body: toTipTapDoc(body),
        sourceScope,
        initialSourceRef,
        createdFrom
      }
    }).then(normalizeFullPage);
  }

  updatePage({ pageId, title, body, pageType, status, visibility, sourceScope } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}`, {
      method: 'PATCH',
      body: {
        title,
        body: toTipTapDoc(body),
        pageType,
        status,
        visibility,
        sourceScope
      }
    }).then(normalizeFullPage);
  }

  archivePage({ pageId }) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}`, {
      method: 'DELETE'
    }).then(normalizeFullPage);
  }

  ingestSource({ source } = {}) {
    return this.request('/api/wiki/ingest', {
      method: 'POST',
      body: { source }
    });
  }

  draftPage({ pageId } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/ai/draft`, {
      method: 'POST',
      body: {}
    }).then(normalizeFullPage);
  }

  askPage({ pageId, question } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/ask`, {
      method: 'POST',
      body: { question }
    }).then(normalizeFullPage);
  }

  promoteAnswer({ pageId, discussionId, newTitle, title } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/discussions/${encodeURIComponent(discussionId)}/promote`, {
      method: 'POST',
      body: { title: newTitle || title }
    }).then(payload => ({
      ...payload,
      page: payload?.page ? normalizeFullPage(payload.page) : null,
      sourcePage: payload?.sourcePage ? normalizeFullPage(payload.sourcePage) : null,
      pageId: pickId(payload?.page)
    }));
  }

  lintWiki({ scope, pageId } = {}) {
    return this.request('/api/wiki/lint', {
      method: 'POST',
      body: { scope, pageId }
    });
  }

  applyAutolink({ pageId, targetPageId } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/autolinks/${encodeURIComponent(targetPageId)}/apply`, {
      method: 'POST',
      body: {}
    }).then(normalizeFullPage);
  }

  addSource({ pageId, source } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/sources`, {
      method: 'POST',
      body: source
    }).then(normalizeFullPage);
  }

  removeSource({ pageId, sourceRefId } = {}) {
    return this.request(`/api/wiki/pages/${encodeURIComponent(pageId)}/sources/${encodeURIComponent(sourceRefId)}`, {
      method: 'DELETE'
    }).then(normalizeFullPage);
  }

  updateSchema({ content } = {}) {
    return this.request('/api/wiki/schema', {
      method: 'PUT',
      body: { content }
    });
  }

  acceptProposal({ proposalId } = {}) {
    return this.request(`/api/wiki/proposals/${encodeURIComponent(proposalId)}/accept`, {
      method: 'POST',
      body: {}
    }).then(payload => ({
      ...payload,
      page: payload?.page ? normalizeFullPage(payload.page) : null,
      pageId: pickId(payload?.page)
    }));
  }

  dismissProposal({ proposalId, reason } = {}) {
    return this.request(`/api/wiki/proposals/${encodeURIComponent(proposalId)}/dismiss`, {
      method: 'POST',
      body: { reason }
    });
  }

  mergeProposal({ proposalId, pageId } = {}) {
    return this.request(`/api/wiki/proposals/${encodeURIComponent(proposalId)}/merge`, {
      method: 'POST',
      body: { pageId }
    });
  }
}
