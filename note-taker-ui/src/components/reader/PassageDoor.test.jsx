import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { listWikiPages } from '../../api/wiki';
import { fileJudgmentEvidence } from '../../api/judgmentResolution';
import PassageDoor from './PassageDoorView';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));
jest.mock('../../api/judgmentResolution', () => ({ fileJudgmentEvidence: jest.fn() }));

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
    fileJudgmentEvidence.mockImplementation(async ({ field }) => ({
      judgment: {
        ...openPage.judgment,
        [field]: [{
          reasonId: `${field}-saved`,
          text: 'Deliverable capacity lags demand by two years.',
          acceptedFrom: 'highlight:article-1:h1'
        }]
      }
    }));
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

  it('reuses pages already loaded by the reader', async () => {
    renderDoor({ pages: [openPage] });

    expect(await screen.findByTestId('passage-door-offer')).toHaveTextContent(HOLD);
    expect(listWikiPages).not.toHaveBeenCalled();
  });

  it('files Why and becomes the whisper', async () => {
    listWikiPages.mockResolvedValue([openPage]);
    renderDoor();

    fireEvent.click(await screen.findByRole('button', { name: 'Why' }));

    await waitFor(() => expect(fileJudgmentEvidence).toHaveBeenCalledTimes(1));
    expect(fileJudgmentEvidence).toHaveBeenCalledWith({
      pageId: 'wiki-compute',
      expectedClaim: HOLD,
      field: 'why',
      articleId: 'article-1',
      highlightId: 'h1'
    });

    const door = await screen.findByTestId('passage-door');
    expect(door).toHaveTextContent('Why');
    expect(door).toHaveAttribute('href', '/judgment/wiki-compute');
    expect(await screen.findByTestId('ariadne-thread')).toBeInTheDocument();
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();
  });

  it('files Against the same way', async () => {
    listWikiPages.mockResolvedValue([openPage]);
    renderDoor();

    fireEvent.click(await screen.findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(fileJudgmentEvidence).toHaveBeenCalledTimes(1));
    expect(fileJudgmentEvidence.mock.calls[0][0].field).toBe('against');
    expect(await screen.findByTestId('passage-door')).toHaveTextContent('Against');
  });

  it('keeps the offer visible and names a failed write', async () => {
    listWikiPages.mockResolvedValue([openPage]);
    fileJudgmentEvidence.mockRejectedValue(new Error('offline'));
    renderDoor();

    fireEvent.click(await screen.findByRole('button', { name: 'Why' }));

    expect(await screen.findByRole('status')).toHaveTextContent('did not land');
    expect(screen.getByTestId('passage-door-offer')).toBeInTheDocument();
    expect(screen.queryByTestId('ariadne-thread')).not.toBeInTheDocument();
  });
});
