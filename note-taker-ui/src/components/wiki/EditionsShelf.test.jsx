import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import EditionsShelf from './EditionsShelf';
import { listEditions } from '../../api/editions';

jest.mock('../../api/editions', () => ({ listEditions: jest.fn() }));

const row = (over = {}) => ({
  _id: 'e1',
  title: 'This Week in AI',
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  unfilled: ['Evaluation & counterevidence'],
  ...over
});

describe('the door on the paper', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the papers your agents filed', async () => {
    listEditions.mockResolvedValue([row()]);
    render(<EditionsShelf />);
    expect(await screen.findByRole('link', { name: /This Week in AI/ })).toHaveAttribute('href', '/editions/e1');
    expect(screen.getByText('Sep 1 – 7')).toBeInTheDocument();
    expect(screen.getByText('Nothing this week under Evaluation & counterevidence.')).toBeInTheDocument();
  });

  /* A reader who has never connected an agent is not failing at anything, and
     an empty shelf announcing itself on the morning paper is noise. */
  it('says nothing at all when no agent has filed one', async () => {
    listEditions.mockResolvedValue([]);
    const { container } = render(<EditionsShelf />);
    await waitFor(() => expect(listEditions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("stays out of the paper's way when the stand does not answer", async () => {
    listEditions.mockRejectedValue(new Error('down'));
    const { container } = render(<EditionsShelf />);
    await waitFor(() => expect(listEditions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
