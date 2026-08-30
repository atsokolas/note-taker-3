import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { listWikiPages, updateWikiPage } from '../../api/wiki';
import PassageDoor from './PassageDoor';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => []),
  updateWikiPage: jest.fn(async (id, body) => ({ _id: id, ...body }))
}));

const HOLD = 'Demand still outruns deliverable capacity.';

const filedPage = {
  _id: 'wiki-compute',
  title: 'NVIDIA',
  updatedAt: '2026-08-01T00:00:00.000Z',
  judgment: {
    currentJudgment: HOLD,
    why: [{
      reasonId: 'w1',
      text: 'Capacity still lags.',
      acceptedFrom: 'highlight:article-1:h1'
    }],
    against: []
  }
};

const openPage = {
  ...filedPage,
  judgment: {
    currentJudgment: HOLD,
    why: [],
    against: []
  }
};

const renderDoor = (props = {}) => render(
  <MemoryRouter>
    <PassageDoor
      highlightId="h1"
      articleId="article-1"
      text="Deliverable capacity lags demand by two years."
      sourceLabel="On compute"
      {...props}
    />
  </MemoryRouter>
);

describe('PassageDoor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    listWikiPages.mockResolvedValue([]);
    updateWikiPage.mockResolvedValue({ _id: 'wiki-compute' });
  });

  it('shows Why and opens that claim when this passage was filed', async () => {
    listWikiPages.mockResolvedValue([filedPage]);
    renderDoor();

    const door = await screen.findByTestId('passage-door');
    expect(door).toHaveTextContent('Why');
    expect(door).toHaveTextContent(HOLD);
    expect(door).toHaveAttribute('href', '/judgment/wiki-compute');
    expect(door).toHaveClass('passage-door');
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();
  });

  it('is absent when the passage was never filed and does not cover a hold', async () => {
    listWikiPages.mockResolvedValue([{
      ...filedPage,
      judgment: {
        currentJudgment: HOLD,
        why: [],
        against: []
      },
      sourceRefs: [{ type: 'article', objectId: 'article-1' }]
    }]);
    renderDoor({ text: 'An unrelated sentence.' });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalledWith({ limit: 500, summary: 1 }));
    expect(screen.queryByTestId('passage-door')).not.toBeInTheDocument();
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Against' })).not.toBeInTheDocument();
  });

  it('offers Why and Against when an unfiled passage covers the hold', async () => {
    listWikiPages.mockResolvedValue([openPage]);
    renderDoor();

    const offer = await screen.findByTestId('passage-door-offer');
    expect(offer).toHaveTextContent(HOLD);
    expect(screen.getByRole('button', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Against' })).toBeInTheDocument();
    expect(screen.queryByTestId('passage-door')).not.toBeInTheDocument();
  });

  it('files Why and becomes the whisper', async () => {
    listWikiPages.mockResolvedValue([openPage]);
    updateWikiPage.mockImplementation(async (id, body) => ({
      _id: id,
      judgment: body.judgment
    }));
    renderDoor();

    fireEvent.click(await screen.findByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    const [pageId, body] = updateWikiPage.mock.calls[0];
    expect(pageId).toBe('wiki-compute');
    expect(body.judgment.why.at(-1)).toMatchObject({
      text: 'Deliverable capacity lags demand by two years.',
      sourceLabel: 'On compute',
      acceptedFrom: 'highlight:article-1:h1'
    });

    const door = await screen.findByTestId('passage-door');
    expect(door).toHaveTextContent('Why');
    expect(door).toHaveAttribute('href', '/judgment/wiki-compute');
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();
  });

  it('files Against the same way', async () => {
    listWikiPages.mockResolvedValue([openPage]);
    updateWikiPage.mockImplementation(async (id, body) => ({
      _id: id,
      judgment: body.judgment
    }));
    renderDoor();

    fireEvent.click(await screen.findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.against.at(-1)).toMatchObject({
      acceptedFrom: 'highlight:article-1:h1'
    });
    expect(await screen.findByTestId('passage-door')).toHaveTextContent('Against');
  });
});
