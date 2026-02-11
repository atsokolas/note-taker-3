import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import HighlightCard from './HighlightCard';

jest.mock('../../api/organize', () => ({
  organizeHighlightItem: jest.fn().mockResolvedValue({}),
  searchHighlightClaims: jest.fn().mockResolvedValue([]),
  getHighlightClaimEvidence: jest.fn().mockResolvedValue({ evidence: [] })
}));

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
  it('defaults to collapsed and does not render full body text', () => {
    renderCard();
    expect(screen.getByText('Expand')).toBeInTheDocument();
    expect(screen.queryByText(/TAIL_MARKER_FULL_TEXT/i)).not.toBeInTheDocument();
  });

  it('expands and collapses per card', () => {
    renderCard();
    fireEvent.click(screen.getByText('Expand'));
    expect(screen.getByText(/TAIL_MARKER_FULL_TEXT/i)).toBeInTheDocument();
    expect(screen.getByText('Edit / Tag / Link')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Collapse'));
    expect(screen.queryByText(/TAIL_MARKER_FULL_TEXT/i)).not.toBeInTheDocument();
  });
});
