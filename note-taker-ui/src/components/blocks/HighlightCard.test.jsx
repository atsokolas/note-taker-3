import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { listWikiPages } from '../../api/wiki';
import HighlightCard from './HighlightCard';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));

jest.mock('../../api/organize', () => ({
  organizeHighlightItem: jest.fn().mockResolvedValue({}),
  searchHighlightClaims: jest.fn().mockResolvedValue([]),
  getHighlightClaimEvidence: jest.fn().mockResolvedValue({ evidence: [] })
}));

jest.mock('../return-queue/ReturnLaterControl', () => () => null);
jest.mock('../connections/ConnectionBuilder', () => () => null);
jest.mock('../retrieval/RelatedSuggestions', () => () => null);

jest.mock('../../api/connections', () => ({
  createConnection: jest.fn().mockResolvedValue({}),
  deleteConnection: jest.fn().mockResolvedValue({}),
  getConnectionsForItem: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] }),
  searchConnectableItems: jest.fn().mockResolvedValue([])
}));

const renderCard = (props = {}) => {
  const longText = [
    'A concise first sentence for collapsed preview.',
    'Additional detail that should be hidden when collapsed.',
    'This contains TAIL_MARKER_FULL_TEXT for expansion assertions.'
  ].join(' ');
  return render(
    <MemoryRouter>
      <HighlightCard
        highlight={{
          _id: 'h-1',
          text: longText,
          articleTitle: 'Test Article',
          createdAt: '2026-01-01T00:00:00.000Z',
          tags: ['alpha', 'beta', 'gamma'],
          type: 'claim'
        }}
        organizable
        {...props}
      />
    </MemoryRouter>
  );
};

describe('HighlightCard progressive disclosure', () => {
  beforeEach(() => {
    listWikiPages.mockResolvedValue([]);
  });

  it('defaults to collapsed and keeps the edit panel hidden', () => {
    renderCard();
    expect(screen.getByText('Expand')).toBeInTheDocument();
    expect(screen.queryByText('Edit / Tag / Link')).not.toBeInTheDocument();
  });

  it('expands and collapses per card', () => {
    renderCard();
    fireEvent.click(screen.getByText('Expand'));
    expect(screen.getByText('Edit / Tag / Link')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Collapse'));
    expect(screen.queryByText('Edit / Tag / Link')).not.toBeInTheDocument();
  });
});

describe('the reverse door on a highlight card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listWikiPages.mockResolvedValue([]);
  });

  it('whispers Why and opens that claim when this passage was filed', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'wiki-compute',
      judgment: {
        currentJudgment: 'Demand still outruns deliverable capacity.',
        why: [{
          acceptedFrom: 'highlight:article-1:h-1',
          text: 'Capacity still lags.'
        }]
      }
    }]);
    renderCard({
      highlight: {
        _id: 'h-1',
        articleId: 'article-1',
        text: 'Capacity still lags demand.',
        articleTitle: 'On compute'
      }
    });

    const door = await screen.findByTestId('passage-door');
    expect(door).toHaveTextContent('Why');
    expect(door).toHaveTextContent('Demand still outruns deliverable capacity.');
    expect(door).toHaveAttribute('href', '/judgment/wiki-compute');
  });

  it('stays silent when this passage was never filed', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'wiki-compute',
      sourceRefs: [{ type: 'article', objectId: 'article-1' }],
      judgment: { currentJudgment: 'Demand still outruns deliverable capacity.', why: [] }
    }]);
    renderCard({
      highlight: {
        _id: 'h-1',
        articleId: 'article-1',
        text: 'An unrelated sentence.',
        articleTitle: 'On compute'
      }
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(screen.queryByTestId('passage-door')).not.toBeInTheDocument();
  });
});
