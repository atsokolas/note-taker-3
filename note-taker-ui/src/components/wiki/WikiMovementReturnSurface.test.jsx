import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getKnowledgeMovements } from '../../api/knowledgeMovements';
import WikiMovementReturnSurface from './WikiMovementReturnSurface';

jest.mock('../../api/knowledgeMovements', () => ({
  getKnowledgeMovements: jest.fn(),
  startKnowledgeMovementInvestigation: jest.fn()
}));

const movement = {
  id: 'movement-1',
  kind: 'contradiction',
  title: 'New evidence challenges one accepted claim',
  whyItMatters: 'The proposed evidence conflicts with the claim. The accepted view has not changed.',
  materiality: 'major',
  reviewState: 'candidate',
  subject: { id: 'claim-1', href: '/wiki/workspace?page=page-1&claimId=claim-1' },
  evidence: [],
  affected: [],
  unresolved: [],
  nextAction: { label: 'Review proposed change', href: '/wiki/workspace?page=page-1&claimId=claim-1' }
};

const renderSurface = props => render(
  <MemoryRouter><WikiMovementReturnSurface {...props} /></MemoryRouter>
);

describe('WikiMovementReturnSurface', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads one bounded page and reports whether a real movement exists', async () => {
    const onPresenceChange = jest.fn();
    getKnowledgeMovements.mockResolvedValue({ movements: [movement] });
    renderSurface({ onPresenceChange });

    expect(screen.getByRole('heading', { name: /checking what may change/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /one consequential update needs attention/i }))
      .toBeInTheDocument();
    expect(getKnowledgeMovements).toHaveBeenCalledWith({ limit: 3 });
    expect(onPresenceChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(/accepted view has not changed/i)).toBeInTheDocument();
  });

  it('renders the honest quiet state without inventing activity', async () => {
    const onPresenceChange = jest.fn();
    getKnowledgeMovements.mockResolvedValue({ movements: [] });
    renderSurface({ onPresenceChange });

    expect(await screen.findByRole('heading', { name: /nothing material changed/i })).toBeInTheDocument();
    expect(onPresenceChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the Wiki usable on failure and retries explicitly', async () => {
    getKnowledgeMovements
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ movements: [] });
    renderSurface();

    expect(await screen.findByRole('status')).toHaveTextContent(/could not check/i);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(getKnowledgeMovements).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: /nothing material changed/i })).toBeInTheDocument();
  });
});
