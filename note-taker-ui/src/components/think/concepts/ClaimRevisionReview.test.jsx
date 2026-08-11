import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getConceptInvestigation } from '../../../api/concepts';
import { disposeWikiClaimRevision } from '../../../api/wikiClaimDisposition';
import ClaimRevisionReview from './ClaimRevisionReview';

jest.mock('../../../api/concepts', () => ({
  getConceptInvestigation: jest.fn()
}));

jest.mock('../../../api/wikiClaimDisposition', () => ({
  disposeWikiClaimRevision: jest.fn()
}));

const baseReview = {
  identity: {
    conceptId: 'c1',
    wikiPageId: 'p1',
    revisionId: 'r1',
    claimId: 'claim-1'
  },
  state: 'pending',
  canAct: false,
  unavailableReason: 'Human disposition is not enabled until the transactional claim-write contract is deployed.',
  current: {
    text: 'Inference demand is durable.',
    section: 'Demand',
    support: 'partial',
    confidence: 0.61,
    epistemicStatus: 'inference',
    materiality: 'high'
  },
  proposed: {
    text: 'Enterprise inference demand is durable.',
    section: 'Enterprise demand',
    support: 'supported',
    confidence: 0.78,
    epistemicStatus: 'evidence_backed',
    materiality: 'high'
  },
  diff: {
    segments: [
      { kind: 'added', text: 'Enterprise ' },
      { kind: 'equal', text: 'inference demand is durable.' }
    ],
    changedFields: ['text', 'support', 'confidence'],
    boundedExplanation: 'Changed text, support, confidence; 1 evidence reference added and 0 removed.'
  },
  evidenceDelta: {
    added: [{ type: 'article', id: 'a1', title: 'Measured support', href: '/library?articleId=a1' }],
    removed: [],
    supporting: [{ type: 'article', id: 'a1', title: 'Measured support', href: '/library?articleId=a1' }],
    contradicting: [{ type: 'article', id: 'a2', title: 'Unsafe source', href: 'https://malicious.example' }]
  },
  affected: {
    pages: [{ type: 'wiki_page', id: 'p1', title: 'Inference economics', href: '/wiki/workspace?page=p1' }],
    concepts: [{ type: 'concept', id: 'c1', title: 'Inference', href: '//malicious.example' }]
  },
  unresolved: [{ text: 'Demand may absorb efficiency gains.', source: 'current_wiki_judgment' }],
  receipt: null,
  deferredUntil: null
};

const actionableReview = {
  ...baseReview,
  canAct: true,
  unavailableReason: '',
  allowedDispositions: ['accept', 'reject', 'defer', 'preserve']
};

const renderReview = (review = baseReview) => render(
  <MemoryRouter>
    <ClaimRevisionReview review={review} />
  </MemoryRouter>
);

const futureDateInput = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString().slice(0, 10);
};

describe('ClaimRevisionReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a semantic, read-only candidate comparison with safe internal links', () => {
    renderReview();

    expect(screen.getByText('Candidate · not applied')).toBeInTheDocument();
    const arc = screen.getByRole('list', { name: 'Claim review sequence' });
    expect(within(arc).getByText('Accepted judgment')).toBeInTheDocument();
    expect(within(arc).getByText('Candidate evidence')).toBeInTheDocument();
    expect(within(arc).getByText('Human disposition')).toBeInTheDocument();
    expect(within(arc).getByText('Read-only review')).toBeInTheDocument();
    expect(screen.getByText('Current accepted claim')).toBeInTheDocument();
    expect(screen.getByText('Proposed claim · not applied')).toBeInTheDocument();
    expect(screen.getByText('Enterprise demand')).toBeInTheDocument();
    expect(screen.getByText('Enterprise', { selector: 'ins' })).toBeInTheDocument();
    expect(screen.getByText('Changed text, support, confidence; 1 evidence reference added and 0 removed.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Measured support' })[0])
      .toHaveAttribute('href', '/library?articleId=a1');
    expect(screen.getByRole('link', { name: 'Inference economics' }))
      .toHaveAttribute('href', '/wiki/workspace?page=p1');
    expect(screen.getByText('Unsafe source')).not.toHaveAttribute('href');
    expect(screen.getByText('Inference')).not.toHaveAttribute('href');
    expect(screen.queryByRole('button', { name: 'Accept revision' })).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Human disposition is not enabled');
  });

  it('keeps same-text evidence-only changes legible', () => {
    const sameText = {
      ...baseReview,
      current: { ...baseReview.current, text: 'The claim text is unchanged.' },
      proposed: { ...baseReview.proposed, text: 'The claim text is unchanged.' },
      diff: {
        segments: [{ kind: 'equal', text: 'The claim text is unchanged.' }],
        changedFields: [],
        boundedExplanation: 'Claim text and judgment fields are unchanged; 1 evidence reference added and 0 removed.'
      }
    };
    renderReview(sameText);

    expect(screen.getByLabelText('Claim text changes')).toHaveTextContent('The claim text is unchanged.');
    expect(screen.getByText(/Claim text and judgment fields are unchanged/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Changed claim fields')).not.toBeInTheDocument();
  });

  it('preserves long unbroken content for wrapping and labels evidence counts', () => {
    const longToken = 'a'.repeat(500);
    renderReview({
      ...baseReview,
      proposed: { ...baseReview.proposed, text: longToken },
      diff: { ...baseReview.diff, segments: [{ kind: 'added', text: longToken }] }
    });

    expect(screen.getAllByText(longToken).length).toBeGreaterThanOrEqual(2);
    const evidence = screen.getByRole('heading', { name: 'Evidence change' }).closest('section');
    expect(within(evidence).getByLabelText('1 added sources')).toBeInTheDocument();
    expect(within(evidence).getByLabelText('0 removed sources')).toBeInTheDocument();
  });

  it('renders nothing when no claim review is supplied', () => {
    const { container } = renderReview(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the four disposition actions only when canAct is true', () => {
    renderReview(actionableReview);

    expect(screen.getByRole('button', { name: 'Accept revision' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preserve current judgment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Defer' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('requires explicit confirmation before accepting and reloads the investigation contract', async () => {
    disposeWikiClaimRevision.mockResolvedValue({ state: 'accepted' });
    getConceptInvestigation.mockResolvedValue({
      investigation: {
        claimReview: {
          ...actionableReview,
          state: 'accepted',
          canAct: false,
          unavailableReason: 'This candidate was already accepted.',
          receipt: {
            id: 'wiki-claim-disposition:v1:r1:accept',
            title: 'Accept claim revision',
            summary: 'Human owner chose to accept the proposed claim revision.',
            completedAt: '2026-07-31T12:00:00.000Z'
          }
        }
      }
    });

    renderReview(actionableReview);

    fireEvent.click(screen.getByRole('button', { name: 'Accept revision' }));
    expect(disposeWikiClaimRevision).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirm that you want to apply this proposed claim/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm accept' }));

    await waitFor(() => {
      expect(disposeWikiClaimRevision).toHaveBeenCalledWith('r1', {
        action: 'accept',
        note: ''
      });
    });
    await waitFor(() => {
      expect(getConceptInvestigation).toHaveBeenCalledWith({
        conceptId: 'c1',
        wikiPageId: 'p1',
        revisionId: 'r1',
        claimId: 'claim-1'
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Accepted · applied')).toBeInTheDocument();
      expect(screen.queryByText('Candidate · not applied')).not.toBeInTheDocument();
      expect(screen.getByText('wiki-claim-disposition:v1:r1:accept')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Accept revision' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Continue to the Wiki judgment layer' }))
        .toHaveAttribute('href', '/wiki/workspace?page=p1#wiki-stage5-decisions');
    });
  });

  it('requires confirmation before preserve and states that claim text was retained', async () => {
    disposeWikiClaimRevision.mockResolvedValue({ state: 'preserved' });
    getConceptInvestigation.mockResolvedValue({
      investigation: {
        claimReview: {
          ...actionableReview,
          state: 'preserved',
          canAct: false,
          unavailableReason: 'This candidate was already preserved.',
          receipt: {
            id: 'wiki-claim-disposition:v1:r1:preserve',
            title: 'Preserve claim revision',
            summary: 'Human owner chose to preserve the proposed claim revision.'
          }
        }
      }
    });

    renderReview(actionableReview);
    fireEvent.click(screen.getByRole('button', { name: 'Preserve current judgment' }));
    expect(disposeWikiClaimRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm preserve' }));

    await waitFor(() => {
      expect(disposeWikiClaimRevision).toHaveBeenCalledWith('r1', {
        action: 'preserve',
        note: ''
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Preserved · claim text retained')).toBeInTheDocument();
      expect(screen.getByText(/The claim text was retained/i)).toBeInTheDocument();
    });
  });

  it('rejects without applying accepted claim text until reload succeeds', async () => {
    disposeWikiClaimRevision.mockResolvedValue({ state: 'rejected' });
    getConceptInvestigation.mockResolvedValue({
      investigation: {
        claimReview: {
          ...actionableReview,
          state: 'rejected',
          canAct: false,
          unavailableReason: 'This candidate was already rejected.',
          receipt: { id: 'wiki-claim-disposition:v1:r1:reject', title: 'Reject claim revision' }
        }
      }
    });

    renderReview(actionableReview);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));

    await waitFor(() => {
      expect(disposeWikiClaimRevision).toHaveBeenCalledWith('r1', {
        action: 'reject',
        note: ''
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Rejected · not applied')).toBeInTheDocument();
    });
  });

  it('requires a future deferral date before posting defer', async () => {
    renderReview(actionableReview);
    fireEvent.click(screen.getByRole('button', { name: 'Defer' }));

    const dateInput = screen.getByLabelText(/Defer until/i);
    fireEvent.change(dateInput, { target: { value: '2000-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm defer' }));

    expect(disposeWikiClaimRevision).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Deferral requires a future date.');

    const next = futureDateInput();
    disposeWikiClaimRevision.mockResolvedValue({ state: 'deferred' });
    getConceptInvestigation.mockResolvedValue({
      investigation: {
        claimReview: {
          ...actionableReview,
          state: 'deferred',
          canAct: true,
          deferredUntil: `${next}T12:00:00.000Z`,
          receipt: { id: 'wiki-claim-disposition:v1:r1:defer', title: 'Defer claim revision' }
        }
      }
    });

    fireEvent.change(dateInput, { target: { value: next } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm defer' }));

    await waitFor(() => {
      expect(disposeWikiClaimRevision).toHaveBeenCalledWith('r1', {
        action: 'defer',
        note: '',
        deferredUntil: `${next}T12:00:00.000Z`
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Deferred · not applied')).toBeInTheDocument();
      expect(screen.getAllByText(/Deferred until/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('wiki-claim-disposition:v1:r1:defer')).toBeInTheDocument();
    });
  });

  it('keeps failures inline, allows retry, and blocks duplicate submission', async () => {
    let resolveDispose;
    disposeWikiClaimRevision.mockImplementation(() => new Promise((resolve, reject) => {
      resolveDispose = { resolve, reject };
    }));

    renderReview(actionableReview);
    fireEvent.click(screen.getByRole('button', { name: 'Accept revision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm accept' }));

    expect(screen.getByRole('status')).toHaveTextContent('Recording disposition');
    expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recording…' }));
    expect(disposeWikiClaimRevision).toHaveBeenCalledTimes(1);

    resolveDispose.reject({ response: { data: { error: 'Transactions unavailable.' } } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Transactions unavailable.');
    });
    expect(screen.queryByText('Accepted · applied')).not.toBeInTheDocument();
    expect(screen.getByText('Candidate · not applied')).toBeInTheDocument();

    disposeWikiClaimRevision.mockResolvedValue({ state: 'accepted' });
    getConceptInvestigation.mockResolvedValue({
      investigation: {
        claimReview: {
          ...actionableReview,
          state: 'accepted',
          canAct: false,
          unavailableReason: 'This candidate was already accepted.',
          receipt: { id: 'receipt-accept', title: 'Accept claim revision' }
        }
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(disposeWikiClaimRevision).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Accepted · applied')).toBeInTheDocument();
    });
  });

  it('does not claim success until the investigation reload completes', async () => {
    let resolveReload;
    disposeWikiClaimRevision.mockResolvedValue({ state: 'accepted' });
    getConceptInvestigation.mockImplementation(() => new Promise(resolve => {
      resolveReload = resolve;
    }));

    renderReview(actionableReview);
    fireEvent.click(screen.getByRole('button', { name: 'Accept revision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm accept' }));

    await waitFor(() => {
      expect(disposeWikiClaimRevision).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Candidate · not applied')).toBeInTheDocument();
    expect(screen.queryByText('Accepted · applied')).not.toBeInTheDocument();

    resolveReload({
      investigation: {
        claimReview: {
          ...actionableReview,
          state: 'accepted',
          canAct: false,
          unavailableReason: 'This candidate was already accepted.',
          receipt: { id: 'receipt-late', title: 'Accept claim revision' }
        }
      }
    });

    await waitFor(() => {
      expect(screen.getByText('Accepted · applied')).toBeInTheDocument();
      expect(screen.getByText('receipt-late')).toBeInTheDocument();
    });
  });
});
