const NODE_FALLBACKS = {
  concept: '#b1862e',
  entity: '#6f6a61',
  source: '#b1862e',
  question: '#74706a',
  comparison: '#8b8176',
  overview: '#625d55',
  project: '#7a6040',
  log: '#62707a',
  topic: '#5f6468'
};

const EDGE_FALLBACKS = {
  wikiLink: '#b1862e',
  shared_source: '#8f8373',
  related: '#7a8088',
  needs_review: '#b1862e',
  supports: '#7a756d',
  contradicts: '#9b5a46',
  extends: '#8b7652'
};

export const WIKI_GRAPH_NODE_TOKENS = Object.fromEntries(
  Object.keys(NODE_FALLBACKS).map(type => [type, `--wiki-graph-node-${type}`])
);

export const WIKI_GRAPH_EDGE_TOKENS = Object.fromEntries(
  Object.keys(EDGE_FALLBACKS).map(type => [type, `--wiki-graph-edge-${type}`])
);

export const WIKI_GRAPH_LABEL_TOKENS = {
  backdrop: '--wiki-graph-label-backdrop',
  text: '--wiki-graph-label-text',
  stroke: '--wiki-graph-node-stroke'
};

const trimValue = (value) => String(value || '').trim();

export const wikiGraphCssColor = (token, fallback) => `var(${token}, ${fallback})`;

export const resolveWikiGraphColor = (token, fallback, scope) => {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return fallback;
  }
  const target = scope || (typeof document !== 'undefined' ? document.body : null);
  if (!target) return fallback;
  const resolved = trimValue(window.getComputedStyle(target).getPropertyValue(token));
  return resolved || fallback;
};

export const wikiGraphNodeColor = (pageType, { css = false, scope } = {}) => {
  const type = WIKI_GRAPH_NODE_TOKENS[pageType] ? pageType : 'topic';
  const token = WIKI_GRAPH_NODE_TOKENS[type];
  const fallback = NODE_FALLBACKS[type];
  return css ? wikiGraphCssColor(token, fallback) : resolveWikiGraphColor(token, fallback, scope);
};

export const wikiGraphEdgeColor = (relationType, { css = false, scope } = {}) => {
  const type = WIKI_GRAPH_EDGE_TOKENS[relationType] ? relationType : 'related';
  const token = WIKI_GRAPH_EDGE_TOKENS[type];
  const fallback = EDGE_FALLBACKS[type];
  return css ? wikiGraphCssColor(token, fallback) : resolveWikiGraphColor(token, fallback, scope);
};

export const wikiGraphLabelColor = (name, fallback, { css = false, scope } = {}) => {
  const token = WIKI_GRAPH_LABEL_TOKENS[name];
  if (!token) return fallback;
  return css ? wikiGraphCssColor(token, fallback) : resolveWikiGraphColor(token, fallback, scope);
};
