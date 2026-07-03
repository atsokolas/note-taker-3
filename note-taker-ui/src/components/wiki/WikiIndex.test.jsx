import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiIndex from './WikiIndex';
import { createWikiPage, getWikiBriefing, ingestWikiSource, listWikiActivity, listWikiPages, rebuildWikiGraph, streamMaintainWikiPage } from '../../api/wiki';
import { fetchGraphData } from '../../api/map';

jest.mock('../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  deleteWikiPage: jest.fn(),
  getWikiBriefing: jest.fn(),
  ingestWikiSource: jest.fn(),
  listWikiActivity: jest.fn(),
  listWikiPages: jest.fn(),
  rebuildWikiGraph: jest.fn(),
  listWikiSourceEvents: jest.fn(() => Promise.resolve([])),
  processPendingWikiSourceEvents: jest.fn(),
  processWikiSourceEvent: jest.fn(),
  streamMaintainWikiPage: jest.fn()
}));

jest.mock('../../api/map', () => ({
  fetchGraphData: jest.fn()
}));

jest.mock('../../utils/wikiAnalytics', () => ({
  trackWikiIngestResult: jest.fn(),
  trackWikiIngestSubmitted: jest.fn()
}));

jest.mock('react-force-graph-2d', () => function MockForceGraph2D({
  graphData,
  linkLabel,
  onLinkHover,
  onNodeClick,
  nodeRelSize,
  cooldownTicks,
  d3VelocityDecay,
  enableZoomInteraction,
  nodeCanvasObject,
  width,
  height
}) {
  const regularWheelZoom = typeof enableZoomInteraction === 'function'
    ? enableZoomInteraction({ type: 'wheel', metaKey: false, ctrlKey: false })
    : enableZoomInteraction;
  const modifiedWheelZoom = typeof enableZoomInteraction === 'function'
    ? enableZoomInteraction({ type: 'wheel', metaKey: true, ctrlKey: false })
    : enableZoomInteraction;
  return (
    <div
      data-testid="wiki-force-graph"
      role="img"
      aria-label={`${graphData.nodes.length} wiki pages and ${graphData.links.length} links`}
      data-node-rel-size={nodeRelSize}
      data-cooldown-ticks={cooldownTicks}
      data-d3-velocity-decay={d3VelocityDecay}
      data-regular-wheel-zoom={regularWheelZoom ? 'true' : 'false'}
      data-modified-wheel-zoom={modifiedWheelZoom ? 'true' : 'false'}
      data-has-custom-node-renderer={nodeCanvasObject ? 'true' : 'false'}
      data-width={width || ''}
      data-height={height || ''}
    >
      {(graphData.nodes || []).map(node => (
        <button key={node.id} type="button" onClick={() => onNodeClick?.(node)}>
          {node.title}
        </button>
      ))}
      {(graphData.links || []).map(link => (
        <button
          key={link.id}
          type="button"
          onMouseEnter={() => onLinkHover?.(link)}
        >
          {linkLabel?.(link)}
        </button>
      ))}
    </div>
  );
});

const pages = [
  {
    _id: 'wiki-1',
    title: 'Enterprise AI Memory',
    pageType: 'overview',
    plainText: 'A source-backed page about memory.',
    sourceRefs: [],
    updatedAt: '2026-05-03T12:00:00.000Z',
    body: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Investing',
          marks: [{ type: 'wikiLink', attrs: { pageId: 'wiki-2', title: 'Investing' } }]
        }]
      }]
    }
  },
  {
    _id: 'wiki-2',
    title: 'Investing',
    pageType: 'source',
    plainText: 'A source-backed page about investing.',
    sourceRefs: [{ _id: 'source-1' }],
    updatedAt: '2026-05-02T12:00:00.000Z',
    aiState: {
      health: {
        staleSections: [{ section: 'Evidence' }]
      }
    }
  }
];

const graphPages = [
  ...pages,
  ...Array.from({ length: 8 }, (_, index) => ({
    _id: `wiki-extra-${index + 1}`,
    title: `Extra Wiki Page ${index + 1}`,
    pageType: 'topic',
    plainText: 'Additional page used to cross the sparse graph threshold.',
    sourceRefs: [],
    updatedAt: '2026-05-01T12:00:00.000Z'
  }))
];

const setViewportWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width
  });
  window.dispatchEvent(new Event('resize'));
};

describe('WikiIndex graph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, '', '/');
    setViewportWidth(1024);
    getWikiBriefing.mockRejectedValue(new Error('not relevant in WikiIndex tests'));
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    ingestWikiSource.mockResolvedValue({ runId: 'ingest-1', suggestedCreatePage: false });
    streamMaintainWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    listWikiActivity.mockImplementation(() => new Promise(() => {}));
    listWikiPages.mockResolvedValue(graphPages);
    rebuildWikiGraph.mockResolvedValue({ edgesCreated: 1, edgesDeleted: 0 });
    fetchGraphData.mockResolvedValue({
      nodes: [
        { id: 'wiki_page:wiki-1', itemType: 'wiki_page', itemId: 'wiki-1', title: 'Enterprise AI Memory' },
        { id: 'concept:concept-1', itemType: 'concept', itemId: 'concept-1', title: 'Memory' },
        { id: 'question:question-1', itemType: 'question', itemId: 'question-1', title: 'Question' },
        { id: 'article:article-1', itemType: 'article', itemId: 'article-1', title: 'Article' },
        { id: 'highlight:highlight-1', itemType: 'highlight', itemId: 'highlight-1', title: 'Highlight' }
      ],
      edges: []
    });
  });

  it('renders the graph index with links, filters, and activity', async () => {
    getWikiBriefing.mockResolvedValueOnce({
      generatedAt: '2026-05-04T12:00:00.000Z',
      summary: 'Two wiki pages changed today.',
      counts: {
        newSources: 1,
        recentlyUpdatedPages: 2,
        driftingPages: 1
      },
      recentlyUpdatedPages: [],
      driftingPages: []
    });
    listWikiActivity.mockResolvedValueOnce([{
      id: 'activity-1',
      type: 'ingest',
      status: 'processed',
      title: 'Research memo',
      summary: 'Updated one page.',
      runId: 'run-1',
      at: '2026-05-04T12:00:00.000Z'
    }]);

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('wiki-force-graph')).toBeInTheDocument();
    const graphSurface = screen.getByTestId('wiki-force-graph');
    expect(graphSurface).toHaveAttribute('data-node-rel-size', '4');
    expect(graphSurface).toHaveAttribute('data-cooldown-ticks', '90');
    expect(graphSurface).toHaveAttribute('data-d3-velocity-decay', '0.42');
    expect(graphSurface).toHaveAttribute('data-regular-wheel-zoom', 'false');
    expect(graphSurface).toHaveAttribute('data-modified-wheel-zoom', 'true');
    expect(graphSurface).toHaveAttribute('data-has-custom-node-renderer', 'true');
    expect(graphSurface).toHaveAttribute('data-width');
    expect(graphSurface).toHaveAttribute('data-height');
    expect(screen.getByText('Knowledge map')).toBeInTheDocument();
    expect(await screen.findByTestId('wiki-briefing')).toHaveTextContent('Two wiki pages changed today.');
    expect(screen.getByText('10 pages · 1 link')).toBeInTheDocument();
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('Brightest');
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('8 standalone pages');
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('0 evidence overlaps');
    expect(screen.getByLabelText('Wiki map signals')).not.toHaveTextContent('Review latest connections');
    expect(screen.getByLabelText('Knowledge map next moves')).toHaveTextContent('Review connection model');
    expect(screen.getByLabelText('Knowledge map next moves')).toHaveTextContent('Open hub: Enterprise AI Memory');
    expect(screen.getByLabelText('Knowledge map next moves')).toHaveTextContent('8 standalone pages');
    expect(screen.getByRole('button', { name: 'Open hub' })).toBeInTheDocument();
    expect(screen.getByLabelText('Knowledge map refresh')).toHaveTextContent('Connections need review');
    expect(screen.getByRole('button', { name: 'Review connections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Inline links\s*1$/ })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('href', '/wiki/list');
    expect(await screen.findByText('Research memo')).toBeInTheDocument();
    expect(fetchGraphData).toHaveBeenCalledWith(expect.objectContaining({
      itemTypes: ['wiki_page', 'wiki_claim', 'concept', 'question', 'notebook', 'article', 'highlight']
    }));
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 500 });
    expect(screen.getByLabelText('Corpus shape')).toHaveTextContent('1 wiki · 2 working thoughts · 2 library atoms · 0 live edges');
    expect(screen.getByLabelText('Corpus shape')).toHaveTextContent('5 graph objects');

    fireEvent.change(screen.getByLabelText('Page type'), { target: { value: 'source' } });
    expect(screen.getByText('1 page · 0 links')).toBeInTheDocument();
  });

  it('hydrates the graph search from the route query and lets the user clear it', async () => {
    window.history.pushState({}, '', '/wiki/workspace?view=graph&query=Investing');
    render(
      <MemoryRouter initialEntries={[{ pathname: '/wiki/workspace', search: '?view=graph&query=Investing' }]}>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('wiki-force-graph')).toBeInTheDocument();
    expect(screen.getByLabelText('Search knowledge map')).toHaveValue('Investing');
    expect(screen.getByText('1 page · 0 links')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Search knowledge map')).toHaveValue('');
    expect(screen.getByText('10 pages · 1 link')).toBeInTheDocument();
  });

  it('drops a source into the wiki from the graph index', async () => {
    ingestWikiSource.mockResolvedValueOnce({ runId: 'ingest-1', suggestedCreatePage: false });
    listWikiActivity.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByTestId('wiki-force-graph');
    fireEvent.change(screen.getByLabelText('Source URL'), {
      target: { value: 'https://example.com/source' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }));

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith({ type: 'url', url: 'https://example.com/source' }));
    expect(await screen.findByText('Source dropped into the wiki')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review details' })).toHaveAttribute('href', '/wiki/activity/ingest-1');
    expect(listWikiPages).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(listWikiActivity).toHaveBeenCalledTimes(2));
  });

  it('drops pasted text into the wiki from the graph index', async () => {
    ingestWikiSource.mockResolvedValueOnce({ runId: 'ingest-text-1', suggestedCreatePage: false });
    listWikiActivity.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByTestId('wiki-force-graph');
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.change(screen.getByLabelText('Source text'), {
      target: { value: 'This note explains a new contradiction in the investing thesis.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }));

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith({
      type: 'text',
      text: 'This note explains a new contradiction in the investing thesis.'
    }));
    expect(await screen.findByText('Source dropped into the wiki')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review details' })).toHaveAttribute('href', '/wiki/activity/ingest-text-1');
    await waitFor(() => expect(listWikiActivity).toHaveBeenCalledTimes(2));
  });

  it('still renders the inline-link graph if persisted map edges fail to load', async () => {
    fetchGraphData.mockRejectedValueOnce(new Error('map down'));

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('wiki-force-graph')).toBeInTheDocument();
    expect(screen.getByText('10 pages · 1 link')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('selects the clicked graph node without leaving the map', async () => {
    const onOpenPage = jest.fn();

    render(
      <MemoryRouter>
        <WikiIndex onOpenPage={onOpenPage} />
      </MemoryRouter>
    );

    await screen.findByTestId('wiki-force-graph');
    fireEvent.click(screen.getByRole('button', { name: 'Investing' }));

    const panel = screen.getByLabelText('Selected map page');
    expect(panel).toHaveTextContent('Investing');
    expect(panel).toHaveTextContent('Referenced page');
    expect(panel).toHaveTextContent('No source or thinking objects are attached to this map node yet.');
    expect(onOpenPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open page' }));
    expect(onOpenPage).toHaveBeenCalledWith('wiki-2');
  });

  it('surfaces connected source and thought objects from the map inspector', async () => {
    fetchGraphData.mockResolvedValueOnce({
      nodes: [
        { id: 'wiki_page:wiki-1', itemType: 'wiki_page', itemId: 'wiki-1', title: 'Enterprise AI Memory' },
        { id: 'article:article-1', itemType: 'article', itemId: 'article-1', title: 'Investor Letter' },
        { id: 'concept:memory', itemType: 'concept', itemId: 'memory', title: 'Memory' },
        { id: 'question:question-1', itemType: 'question', itemId: 'question-1', title: 'What changed?' }
      ],
      edges: [
        { id: 'edge-1', source: 'article:article-1', target: 'wiki_page:wiki-1', relationType: 'derived_from' },
        { id: 'edge-2', source: 'wiki_page:wiki-1', target: 'concept:memory', relationType: 'extends' },
        { id: 'edge-3', source: 'question:question-1', target: 'wiki_page:wiki-1', relationType: 'contradicts' }
      ]
    });

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByTestId('wiki-force-graph');
    fireEvent.click(screen.getByRole('button', { name: 'Enterprise AI Memory' }));

    const connectedObjects = screen.getByLabelText('Connected source and thought objects');
    expect(connectedObjects).toHaveTextContent('Investor Letter');
    expect(connectedObjects).toHaveTextContent('Source material');
    expect(connectedObjects).toHaveTextContent('Memory');
    expect(connectedObjects).toHaveTextContent('Extends the synthesis');
    expect(connectedObjects).toHaveTextContent('What changed?');
    expect(connectedObjects).toHaveTextContent('Creates tension');
    expect(screen.getByRole('link', { name: 'Open library source' })).toHaveAttribute('href', '/library?articleId=article-1');
    expect(screen.getByRole('link', { name: 'Open concept' })).toHaveAttribute('href', '/think?tab=concepts&concept=Memory');
    expect(screen.getByRole('link', { name: 'Open question' })).toHaveAttribute('href', '/think?tab=questions&questionId=question-1');
  });

  it('uses reader-facing map language in the graph details and refresh controls', async () => {
    fetchGraphData.mockResolvedValueOnce({
      nodes: [],
      edges: [{ id: 'edge-1', source: 'wiki-1', target: 'wiki-2', relationType: 'related' }]
    });

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByTestId('wiki-force-graph');
    expect(screen.getByLabelText('Knowledge map refresh')).toHaveTextContent(/reviewed connection/i);
    expect(screen.getByRole('button', { name: 'Update map' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Investing' }));

    const panel = screen.getByLabelText('Selected map page');
    expect(panel).toHaveTextContent('referenced by');
    expect(panel).toHaveTextContent('shown relationship');
    expect(panel).not.toHaveTextContent('inbound');
    expect(panel).not.toHaveTextContent('visible relation');
  });

  it('syncs the persisted graph from the index when stale', async () => {
    fetchGraphData
      .mockResolvedValueOnce({ nodes: [], edges: [] })
      .mockResolvedValueOnce({
        nodes: [],
        edges: [{ id: 'edge-1', source: 'wiki_page:wiki-1', target: 'wiki_page:wiki-2', relationType: 'related' }]
      });

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByTestId('wiki-force-graph');
    fireEvent.click(screen.getByRole('button', { name: 'Review connections' }));

    await waitFor(() => {
      expect(rebuildWikiGraph).toHaveBeenCalledWith({ limit: 500 });
    });
    expect(await screen.findByText('Knowledge map refreshed')).toBeInTheDocument();
    expect(screen.getByLabelText('Knowledge map refresh')).toHaveTextContent('Connections reviewed');
  });

  it('degrades to the mobile page list instead of the force graph under 720px', async () => {
    setViewportWidth(719);

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Wiki pages mobile list')).toBeInTheDocument();
    expect(screen.queryByTestId('wiki-force-graph')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('10 pages · 1 link')).toBeInTheDocument();
    });
  });

  it('replaces the graph surface for wikis with fewer than three pages', async () => {
    listWikiPages.mockResolvedValueOnce(pages);

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByText('2 source-backed pages')).toBeInTheDocument();
    expect(screen.queryByText('Knowledge map')).not.toBeInTheDocument();
    expect(screen.queryByText('2 pages · 1 link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wiki-force-graph')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Build wiki pages')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add source' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enterprise AI Memory/ })).toBeInTheDocument();
  });

  it('lets the empty map state route to source metabolizing', async () => {
    const onOpenSources = jest.fn();
    listWikiPages.mockResolvedValueOnce(pages);

    render(
      <MemoryRouter>
        <WikiIndex onOpenSources={onOpenSources} />
      </MemoryRouter>
    );

    await screen.findByText('2 source-backed pages');
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    expect(onOpenSources).toHaveBeenCalledTimes(1);
  });

  it('renders an early constellation with a sparse hint once the wiki has at least three pages', async () => {
    listWikiPages.mockResolvedValueOnce([
      ...pages,
      {
        _id: 'wiki-3',
        title: 'Third Wiki Page',
        pageType: 'topic',
        plainText: 'Enough material to leave the sparse empty state.',
        sourceRefs: [],
        updatedAt: '2026-05-01T12:00:00.000Z'
      }
    ]);

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('wiki-force-graph')).toBeInTheDocument();
    expect(screen.getByText('3 pages · 1 link')).toBeInTheDocument();
    expect(screen.getByLabelText('Sparse wiki note')).toHaveTextContent('Early map');
    expect(screen.getByRole('button', { name: 'Build bridge page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add source' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review pages' })).toBeInTheDocument();
    expect(screen.queryByText('3 source-backed pages')).not.toBeInTheDocument();
  });
});
