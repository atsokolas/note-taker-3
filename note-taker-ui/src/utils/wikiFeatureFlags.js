const querySuffix = (suffix = '', joiner = '?') => {
  const raw = String(suffix || '').trim().replace(/^[?&]/, '');
  return raw ? `${joiner}${raw}` : '';
};

/* The workspace: the page beside the partner and the queues. Composers and QA
   flows open here. */
export const wikiPagePath = (pageId, suffix = '') => (
  `/wiki/workspace?page=${encodeURIComponent(pageId || '')}${querySuffix(suffix, '&')}`
);

/* Reading a page: a reader following a headline wants the article. */
export const wikiReadPath = (pageId, suffix = '') => (
  `/wiki/read/${encodeURIComponent(pageId || '')}${querySuffix(suffix)}`
);

export const wikiPageEditPath = (pageId) => wikiPagePath(pageId, 'mode=edit');
