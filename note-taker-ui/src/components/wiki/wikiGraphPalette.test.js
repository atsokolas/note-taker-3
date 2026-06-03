import {
  WIKI_GRAPH_EDGE_TOKENS,
  WIKI_GRAPH_NODE_TOKENS,
  wikiGraphEdgeColor,
  wikiGraphNodeColor
} from './wikiGraphPalette';

describe('wiki graph semantic palette', () => {
  it('uses CSS tokens for DOM graph colors and resolved fallbacks for canvas colors', () => {
    expect(WIKI_GRAPH_NODE_TOKENS.overview).toBe('--wiki-graph-node-overview');
    expect(WIKI_GRAPH_EDGE_TOKENS.shared_source).toBe('--wiki-graph-edge-shared_source');

    expect(wikiGraphNodeColor('overview', { css: true })).toBe('var(--wiki-graph-node-overview, #625d55)');
    expect(wikiGraphEdgeColor('shared_source', { css: true })).toBe('var(--wiki-graph-edge-shared_source, #8f8373)');

    expect(wikiGraphNodeColor('unknown')).toBe('#5f6468');
    expect(wikiGraphEdgeColor('unknown')).toBe('#7a8088');
  });
});
