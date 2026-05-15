import { buildWikiGraphData, filterWikiGraphPages } from './wikiGraph';

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
      inboundCount: 2
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

  it('builds the PRD 500-node / 2000-edge graph without dropping nodes or links', () => {
    const fixture = makeLargeGraphFixture();

    const graph = buildWikiGraphData(fixture.pages, fixture.mapGraph);

    expect(graph.nodes).toHaveLength(500);
    expect(graph.links).toHaveLength(2000);
  });
});
