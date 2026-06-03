import { buildCorpusConstellation, buildWikiGraphData, filterWikiGraphPages, summarizeWikiGraph } from './wikiGraph';

const basePage = {
  _id: 'page-a',
  title: 'Agent Memory',
  pageType: 'concept',
  plainText: 'A page about agent memory.',
  updatedAt: '2026-05-12T12:00:00.000Z',
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Links to Evidence Triage',
            marks: [{ type: 'wikiLink', attrs: { pageId: 'page-b', title: 'Evidence Triage' } }]
          }
        ]
      }
    ]
  },
  aiState: {
    health: {
      relatedPages: [{ text: 'Research Taste' }]
    }
  }
};

const pages = [
  basePage,
  {
    _id: 'page-b',
    title: 'Evidence Triage',
    pageType: 'source',
    plainText: 'Evidence intake notes.',
    updatedAt: '2026-05-10T12:00:00.000Z',
    body: { type: 'doc', content: [] }
  },
  {
    _id: 'page-c',
    title: 'Research Taste',
    pageType: 'topic',
    plainText: 'Taste in research direction.',
    updatedAt: '2026-04-01T12:00:00.000Z',
    body: { type: 'doc', content: [] }
  }
];

const makeLargeGraphFixture = ({ nodeCount = 500, edgeCount = 2000 } = {}) => {
  const largePages = Array.from({ length: nodeCount }, (_, index) => ({
    _id: `page-${index}`,
    title: `Page ${index}`,
    pageType: index % 3 === 0 ? 'concept' : 'topic',
    plainText: `Page ${index} notes.`,
    sourceRefs: index % 5 === 0 ? [{ _id: `source-${index}` }] : [],
    updatedAt: '2026-05-12T12:00:00.000Z',
    body: { type: 'doc', content: [] }
  }));
  const edges = [];
  for (let sourceIndex = 0; sourceIndex < nodeCount && edges.length < edgeCount; sourceIndex += 1) {
    for (let offset = 1; offset < nodeCount && edges.length < edgeCount; offset += 1) {
      const targetIndex = (sourceIndex + offset) % nodeCount;
      if (targetIndex === sourceIndex) continue;
      edges.push({
        id: `edge-${sourceIndex}-${targetIndex}`,
        source: `wiki_page:page-${sourceIndex}`,
        target: `wiki_page:page-${targetIndex}`,
        relationType: 'related'
      });
    }
  }
  return { pages: largePages, mapGraph: { edges } };
};

describe('wiki graph helpers', () => {
  it('builds page nodes and edges from wikiLink marks plus health related pages', () => {
    const graph = buildWikiGraphData(pages, {
      edges: [
        {
          id: 'connection-1',
          source: 'wiki_page:page-b',
          target: 'wiki_page:page-c',
          relationType: 'needs_review'
        }
      ]
    });

    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find(node => node.id === 'page-c')).toMatchObject({
      title: 'Research Taste',
      inboundCount: 2,
      degreeCount: 2,
      openPath: '/wiki/workspace?page=page-c'
    });
    expect(graph.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'page-a', target: 'page-b', relationType: 'wikiLink' }),
      expect.objectContaining({ source: 'page-a', target: 'page-c', relationType: 'related' }),
      expect.objectContaining({ source: 'page-b', target: 'page-c', relationType: 'needs_review' })
    ]));
  });

  it('filters pages by page type and modified window', () => {
    const filtered = filterWikiGraphPages(pages, {
      pageType: 'concept',
      modifiedWithin: '7d',
      now: new Date('2026-05-13T12:00:00.000Z')
    });

    expect(filtered.map(page => page._id)).toEqual(['page-a']);
  });

  it('adds evidence-overlap edges when pages share source refs', () => {
    const graph = buildWikiGraphData([
      { _id: 'page-a', title: 'A', sourceRefs: [{ _id: 'source-1', title: 'Shared memo' }], body: { type: 'doc', content: [] } },
      { _id: 'page-b', title: 'B', sourceRefs: [{ _id: 'source-1', title: 'Shared memo' }], body: { type: 'doc', content: [] } },
      { _id: 'page-c', title: 'C', sourceRefs: [{ _id: 'source-2', title: 'Other memo' }], body: { type: 'doc', content: [] } }
    ]);

    expect(graph.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'page-a',
        target: 'page-b',
        relationType: 'shared_source',
        weight: 1,
        sourceTitles: ['Shared memo']
      })
    ]));
    expect(graph.links.filter(edge => edge.relationType === 'shared_source')).toHaveLength(1);
  });

  it('uses the shared source counter for graph node source counts', () => {
    const graph = buildWikiGraphData([
      {
        _id: 'page-a',
        title: 'A',
        sourceCount: 0,
        citations: [{ sourceRefId: 'source-from-citation' }],
        body: { type: 'doc', content: [] }
      }
    ]);

    expect(graph.nodes[0]).toMatchObject({ sourceCount: 1 });
  });

  it('builds the PRD 500-node / 2000-edge graph without dropping nodes or links', () => {
    const fixture = makeLargeGraphFixture();

    const graph = buildWikiGraphData(fixture.pages, fixture.mapGraph);

    expect(graph.nodes).toHaveLength(500);
    expect(graph.links).toHaveLength(2000);
  });

  it('summarizes hubs, isolated pages, and relation counts for map interpretation', () => {
    const graph = buildWikiGraphData(pages);
    const summary = summarizeWikiGraph(graph);

    expect(summary.hubs[0]).toMatchObject({ id: 'page-a', degree: 2 });
    expect(summary.orphanCount).toBe(0);
    expect(summary.relationCounts).toMatchObject({
      wikiLink: 1,
      related: 1
    });
  });

  it('builds cross-surface traces for a selected wiki page', () => {
    const traces = buildCorpusConstellation({
      nodes: [
        { id: 'wiki_page:page-a', itemType: 'wiki_page', itemId: 'page-a', title: 'Agent Memory' },
        { id: 'article:article-1', itemType: 'article', itemId: 'article-1', title: 'Investor Letter' },
        { id: 'highlight:highlight-1', itemType: 'highlight', itemId: 'highlight-1', title: 'Cash-flow highlight' },
        { id: 'concept:memory', itemType: 'concept', itemId: 'memory', title: 'Memory' },
        { id: 'question:question-1', itemType: 'question', itemId: 'question-1', title: 'What changed?' },
        { id: 'notebook:note-1', itemType: 'notebook', itemId: 'note-1', title: 'Research note' }
      ],
      edges: [
        { id: 'edge-1', source: 'article:article-1', target: 'wiki_page:page-a', relationType: 'derived_from' },
        { id: 'edge-2', source: 'highlight:highlight-1', target: 'wiki_page:page-a', relationType: 'supports' },
        { id: 'edge-3', source: 'wiki_page:page-a', target: 'concept:memory', relationType: 'extends' },
        { id: 'edge-4', source: 'question:question-1', target: 'wiki_page:page-a', relationType: 'contradicts' },
        { id: 'edge-5', source: 'wiki_page:page-a', target: 'notebook:note-1', relationType: 'needs_review' },
        { id: 'edge-6', source: 'wiki_page:page-a', target: 'wiki_page:page-b', relationType: 'related' }
      ]
    }, 'page-a');

    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemType: 'article',
        title: 'Investor Letter',
        label: 'Source material',
        openPath: '/library?articleId=article-1'
      }),
      expect.objectContaining({
        itemType: 'highlight',
        title: 'Cash-flow highlight',
        label: 'Supports this page',
        openPath: '/library?highlightId=highlight-1'
      }),
      expect.objectContaining({
        itemType: 'concept',
        title: 'Memory',
        openPath: '/think?tab=concepts&concept=Memory'
      }),
      expect.objectContaining({
        itemType: 'question',
        title: 'What changed?',
        label: 'Creates tension',
        openPath: '/think?tab=questions&questionId=question-1'
      }),
      expect.objectContaining({
        itemType: 'notebook',
        title: 'Research note',
        label: 'Needs review',
        openPath: '/think?tab=notebook&entryId=note-1'
      })
    ]));
    expect(traces).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ itemType: 'wiki_page', itemId: 'page-b' })
    ]));
  });
});
