import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiIndex from './WikiIndex';
import { createWikiPage, getWikiBriefing, ingestWikiSource, listWikiActivity, listWikiPages, streamMaintainWikiPage } from '../../api/wiki';
import { fetchGraphData } from '../../api/map';

jest.mock('../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  deleteWikiPage: jest.fn(),
  getWikiBriefing: jest.fn(),
  ingestWikiSource: jest.fn(),
  listWikiActivity: jest.fn(),
  listWikiPages: jest.fn(),
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
    ingestWikiSource.mockResolvedValue({
      runId: 'run-1',
      sourceRef: { title: 'Research memo' },
      affectedPageIds: ['wiki-1'],
      status: 'processed'
    });
    listWikiActivity.mockResolvedValue([{
      id: 'activity-1',
      type: 'ingest',
      status: 'processed',
      title: 'Research memo',
      summary: 'Updated one page.',
      runId: 'run-1',
      at: '2026-05-04T12:00:00.000Z'
    }]);
    listWikiPages.mockResolvedValue(pages);
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
    expect(screen.getByText('2 pages · 1 link')).toBeInTheDocument();
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('Hubs');
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('Enterprise AI Memory, Investing');
    expect(screen.getByLabelText('Wiki map signals')).toHaveTextContent('Evidence overlap');
    expect(screen.getByRole('button', { name: /^Inline links\s*1$/ })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('href', '/wiki/list');
    expect(screen.getByLabelText('Ask the wiki agent to build a page')).toBeInTheDocument();
    expect(await screen.findByText('Research memo')).toBeInTheDocument();
    expect(fetchGraphData).toHaveBeenCalledWith(expect.objectContaining({
      itemTypes: ['wiki_page']
    }));
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 500 });

    fireEvent.change(screen.getByLabelText('Page type'), { target: { value: 'source' } });
    expect(screen.getByText('1 page · 0 links')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Drift status'), { target: { value: 'stable' } });
    expect(screen.getByText('0 pages · 0 links')).toBeInTheDocument();
  });

  it('still renders the inline-link graph if persisted map edges fail to load', async () => {
    fetchGraphData.mockRejectedValueOnce(new Error('map down'));

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('wiki-force-graph')).toBeInTheDocument();
    expect(screen.getByText('2 pages · 1 link')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
      expect(screen.getByText('2 pages · 1 link')).toBeInTheDocument();
    });
  });

  it('feeds a pasted URL into the wiki and exposes ingest details', async () => {
    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByText('Knowledge map');
    fireEvent.change(screen.getByLabelText('Source to feed to wiki'), {
      target: { value: 'https://example.com/memo' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));

    await waitFor(() => {
      expect(ingestWikiSource).toHaveBeenCalledWith({ type: 'url', url: 'https://example.com/memo' });
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Reading Research memo');
    expect(status).toHaveTextContent('1 page updated so far.');
    expect(within(status).getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/wiki/activity/run-1');
  });

  it('shows a no-match ingest status when no pages were affected', async () => {
    ingestWikiSource.mockResolvedValueOnce({
      runId: 'run-empty',
      sourceRef: { title: 'Unmatched source' },
      affectedPageIds: [],
      status: 'ignored',
      suggestedCreatePage: {
        title: 'Unmatched source',
        source: { type: 'external', title: 'Unmatched source' }
      }
    });

    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    await screen.findByText('Knowledge map');
    fireEvent.change(screen.getByLabelText('Source to feed to wiki'), {
      target: { value: 'https://example.com/unknown' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('No matching pages yet. Create "Unmatched source" from this source?');
    expect(within(status).getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/wiki/activity/run-empty');
  });
});
