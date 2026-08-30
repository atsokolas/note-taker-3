import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { listWikiPages } from '../../api/wiki';
import PassageDoor from './PassageDoor';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));

const filedPage = {
  _id: 'wiki-compute',
  title: 'NVIDIA',
  updatedAt: '2026-08-01T00:00:00.000Z',
  judgment: {
    currentJudgment: 'Demand still outruns deliverable capacity.',
    why: [{
      reasonId: 'w1',
      text: 'Capacity still lags.',
      acceptedFrom: 'highlight:article-1:h1'
    }],
    against: []
  }
};

const renderDoor = (props = {}) => render(
  <MemoryRouter>
    <PassageDoor highlightId="h1" articleId="article-1" {...props} />
  </MemoryRouter>
);

describe('PassageDoor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    listWikiPages.mockResolvedValue([]);
  });

  it('shows Why and opens that claim when this passage was filed', async () => {
    listWikiPages.mockResolvedValue([filedPage]);
    renderDoor();

    const door = await screen.findByTestId('passage-door');
    expect(door).toHaveTextContent('Why');
    expect(door).toHaveTextContent('Demand still outruns deliverable capacity.');
    expect(door).toHaveAttribute('href', '/judgment/wiki-compute');
    expect(door).toHaveClass('passage-door');
  });

  it('is absent when the passage was never filed — silence, not an empty label', async () => {
    listWikiPages.mockResolvedValue([{
      ...filedPage,
      judgment: {
        currentJudgment: 'Demand still outruns deliverable capacity.',
        why: [],
        against: []
      },
      sourceRefs: [{ type: 'article', objectId: 'article-1' }]
    }]);
    renderDoor();

    await waitFor(() => expect(listWikiPages).toHaveBeenCalledWith({ limit: 500, summary: 1 }));
    expect(screen.queryByTestId('passage-door')).not.toBeInTheDocument();
    expect(screen.queryByText(/why/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/against/i)).not.toBeInTheDocument();
  });
});
