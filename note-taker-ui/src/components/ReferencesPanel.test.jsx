import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReferencesPanel, { canonicalGraphOpenPath } from './ReferencesPanel';
import api from '../api';
import { getConnectionsForItem } from '../api/connections';

jest.mock('../api', () => ({
  get: jest.fn()
}));
jest.mock('../api/connections', () => ({
  getConnectionsForItem: jest.fn()
}));

const renderPanel = (props = {}) => render(
  <MemoryRouter initialEntries={['/think?tab=concepts&concept=Template%20Concept']}>
    <ReferencesPanel
      targetType="concept"
      targetId="concept-1"
      tagName="Template Concept"
      label="Show backlinks"
      {...props}
    />
  </MemoryRouter>
);

describe('ReferencesPanel graph links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      data: {
        notebookBlocks: [],
        concepts: [],
        questions: [],
        collections: []
      }
    });
    getConnectionsForItem.mockResolvedValue({
      outgoing: [
        {
          _id: 'edge-out',
          relationType: 'related',
          toType: 'wiki_page',
          toId: 'wiki-1',
          target: {
            title: 'Durable investing thesis',
            snippet: 'Settled source-backed wiki page.',
            openPath: '/wiki/wiki-1'
          }
        }
      ],
      incoming: [
        {
          _id: 'edge-in',
          relationType: 'referenced_by',
          fromType: 'highlight',
          source: {
            title: 'Margin of safety',
            snippet: 'A library highlight that references the concept.',
            openPath: '/library?articleId=article-1'
          }
        }
      ]
    });
  });

  it('renders graph uses and used-by links from the shared connection store', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Show backlinks' }));

    expect(await screen.findByText('Uses')).toBeInTheDocument();
    expect(screen.getByText('Durable investing thesis')).toBeInTheDocument();
    expect(screen.getByText('Wiki · related')).toBeInTheDocument();
    expect(screen.getByText('Used by')).toBeInTheDocument();
    expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    expect(screen.getByText('Highlight · referenced_by')).toBeInTheDocument();
    expect(getConnectionsForItem).toHaveBeenCalledWith({ itemType: 'concept', itemId: 'concept-1' });
  });

  it('keeps graph rows actionable when an open path is available', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Show backlinks' }));
    const wikiRow = await screen.findByRole('button', { name: /Durable investing thesis/i });

    expect(wikiRow).toBeEnabled();
    fireEvent.click(wikiRow);
  });

  it('normalizes legacy wiki graph paths into the current workspace route', () => {
    expect(canonicalGraphOpenPath({
      itemType: 'wiki_page',
      itemId: 'wiki-1',
      openPath: '/wiki/wiki-1'
    })).toBe('/wiki/workspace?page=wiki-1');
    expect(canonicalGraphOpenPath({
      itemType: 'wiki_page',
      openPath: '/wiki/legacy-page'
    })).toBe('/wiki/workspace?page=legacy-page');
    expect(canonicalGraphOpenPath({
      itemType: 'wiki_page',
      openPath: '/wiki/workspace?page=already-current'
    })).toBe('/wiki/workspace?page=already-current');
  });

  it('can render as an always-visible inline backlink surface', async () => {
    renderPanel({ defaultOpen: true, showToggle: false, heading: 'Graph backlinks' });

    expect(screen.queryByRole('button', { name: 'Show backlinks' })).not.toBeInTheDocument();
    expect(await screen.findByText('Graph backlinks')).toBeInTheDocument();
    expect(await screen.findByText('Durable investing thesis')).toBeInTheDocument();
    expect(getConnectionsForItem).toHaveBeenCalledWith({ itemType: 'concept', itemId: 'concept-1' });
  });
});
