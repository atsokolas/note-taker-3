import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiIndex from './WikiIndex';
import { createWikiPage, getWikiBriefing, listWikiActivity, listWikiPages, rebuildWikiGraph, streamMaintainWikiPage } from '../../api/wiki';
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

jest.mock('react-force-graph-2d', () => function MockForceGraph2D({ graphData, linkLabel, onLinkHover, onNodeClick }) {
  return (
    <div
      data-testid="wiki-force-graph"
      role="img"
      aria-label={`${graphData.nodes.length} wiki pages and ${graphData.links.length} links`}
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
    setViewportWidth(1024);
    getWikiBriefing.mockRejectedValue(new Error('not relevant in WikiIndex tests'));
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    streamMaintainWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    listWikiActivity.mockResolvedValue([{
      id: 'activity-1',
      type: 'ingest',
      status: 'processed',
      title: 'Research memo',
      summary: 'Updated one page.',
      runId: 'run-1',
      at: '2026-05-04T12:00:00.000Z'
    }]);
    listWikiPages.mockResolvedValue(graphPages);
    rebuildWikiGraph.mockResolvedValue({ edgesCreated: 1, edgesDeleted: 0 });
    fetchGraphData.mockResolvedValue({ nodes: [], edges: [] });
  });

  it('renders the graph index with links, filters, and activity', async () => {
    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('wiki-force-graph')).toBeInTheDocument();
    expect(screen.getByText('Knowledge map')).toBeInTheDocument();
    expect(screen.getByText('10 pages · 1 link')).toBeInTheDocument();
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('Brightest');
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('8 standalone pages');
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('0 evidence overlaps');
    expect(screen.getByLabelText('Wiki map signals')).not.toHaveTextContent('Review latest connections');
    expect(screen.getByLabelText('Knowledge map refresh')).toHaveTextContent('Connections need review');
    expect(screen.getByRole('button', { name: 'Review connections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Inline links\s*1$/ })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('href', '/wiki/list');
    expect(await screen.findByText('Research memo')).toBeInTheDocument();
    expect(fetchGraphData).toHaveBeenCalledWith(expect.objectContaining({
      itemTypes: ['wiki_page']
    }));
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 500 });

    fireEvent.change(screen.getByLabelText('Page type'), { target: { value: 'source' } });
    expect(screen.getByText('1 source-backed page')).toBeInTheDocument();
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

  it('opens an explanatory node panel before navigating to a page', async () => {
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
    fireEvent.click(within(panel).getByRole('button', { name: 'Open page' }));
    expect(onOpenPage).toHaveBeenCalledWith('wiki-2');
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
    expect(screen.getByRole('button', { name: /Enterprise AI Memory/ })).toBeInTheDocument();
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
