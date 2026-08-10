import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConceptInvestigationPanel from './ConceptInvestigationPanel';
import { getConceptInvestigation } from '../../../api/concepts';

jest.mock('../../../api/concepts', () => ({ getConceptInvestigation: jest.fn() }));
jest.mock('./ClaimRevisionReview', () => ({ review }) => (
  <div data-testid="claim-revision-review">{review?.state || 'pending'}</div>
));
jest.mock('./PriorLessonsSection', () => ({ priorLessons }) => (
  <div data-testid="prior-lessons">{priorLessons?.status || 'none'}</div>
));

const context = {
  conceptId: '64f100000000000000000020',
  loadedConceptId: '64f100000000000000000020',
  wikiPageId: '64f100000000000000000030',
  revisionId: '64f100000000000000000050',
  claimId: 'claim-1'
};
const investigation = {
  concept: { id: context.conceptId, title: 'Inference economics' },
  entryContext: { reviewState: 'candidate', page: { id: context.wikiPageId, title: 'Wiki evidence', href: '/wiki/workspace?page=1' } },
  framing: { governingQuestion: { text: 'What drives inference cost?' }, workingSynthesis: { text: 'Utilization matters.' } },
  evidence: { support: [{ ref: { type: 'article', id: 'a1', title: 'Measured support', href: '/library?articleId=a1' } }], tension: [], context: [] },
  strongestCounterargument: { text: 'Demand may absorb efficiency.' },
  unknowns: [{ text: 'Utilization maturity.' }],
  whatWouldChangeMyMind: [{ text: 'Two flat quarters.' }],
  currentWiki: { acceptanceState: 'unverified' },
  claimReview: { state: 'pending', identity: { ...context } },
  priorLessons: { status: 'available', items: [{ id: 'lesson-1' }] },
  proposals: { workbenchChanges: [], agentSuggestions: [], candidateWikiRevision: { title: 'Candidate revision', summary: 'Not accepted.', ref: { href: '/wiki/workspace?page=1' } } },
  actions: {
    findContraryEvidence: { label: 'Find contrary evidence', intent: 'find_contrary_evidence', enabled: true },
    compareHistoricalCases: { label: 'Compare historical cases', intent: 'compare_historical_cases', enabled: false, unavailableReason: 'Historical-case comparison is not available in this investigation yet.' },
    traceCitationsBackward: { label: 'Trace citations backward', intent: 'trace_citations_backward', enabled: false, unavailableReason: 'Citation-chain tracing is not available in this investigation yet.' },
    draftWikiRevision: { label: 'Draft a Wiki revision', intent: 'draft_wiki_revision', enabled: false, unavailableReason: 'Claim-level candidate drafting lands in Stage 4.' }
  }
};

describe('ConceptInvestigationPanel core', () => {
  beforeEach(() => getConceptInvestigation.mockReset().mockResolvedValue({ investigation }));

  it('renders exact read-only context and keeps proposals separate', async () => {
    render(<MemoryRouter><ConceptInvestigationPanel {...context} onClose={() => {}} /></MemoryRouter>);
    expect(await screen.findByText('What drives inference cost?')).toBeInTheDocument();
    expect(getConceptInvestigation).toHaveBeenCalledWith({
      conceptId: context.conceptId,
      wikiPageId: context.wikiPageId,
      revisionId: context.revisionId,
      claimId: context.claimId
    });
    expect(screen.getByRole('link', { name: 'Measured support' })).toHaveAttribute('href', '/library?articleId=a1');
    expect(screen.getByText('Proposed, not accepted')).toBeInTheDocument();
    expect(screen.getByText(/Nothing here changes your accepted knowledge/)).toBeInTheDocument();
    expect(screen.getByTestId('claim-revision-review')).toHaveTextContent('pending');
    expect(screen.getByTestId('prior-lessons')).toHaveTextContent('available');
  });

  it('fails closed on a loaded Concept identity mismatch', async () => {
    render(<MemoryRouter><ConceptInvestigationPanel {...context} loadedConceptId="64f100000000000000000099" onClose={() => {}} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(getConceptInvestigation).not.toHaveBeenCalled();
  });

  it('survives transient loaded Concept identity churn without discarding a valid response', async () => {
    let resolveInvestigation;
    getConceptInvestigation.mockImplementationOnce(() => new Promise(resolve => {
      resolveInvestigation = resolve;
    }));
    const { rerender } = render(
      <MemoryRouter>
        <ConceptInvestigationPanel {...context} onClose={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => expect(getConceptInvestigation).toHaveBeenCalledTimes(1));
    rerender(
      <MemoryRouter>
        <ConceptInvestigationPanel {...context} loadedConceptId="" onClose={() => {}} />
      </MemoryRouter>
    );
    resolveInvestigation({ investigation });

    expect(await screen.findByText('What drives inference cost?')).toBeInTheDocument();
    expect(screen.queryByText('Loading the exact Concept identity…')).not.toBeInTheDocument();
    expect(getConceptInvestigation).toHaveBeenCalledTimes(1);
  });

  it('shows an honest identity wait before the exact Concept has loaded', async () => {
    render(
      <MemoryRouter>
        <ConceptInvestigationPanel {...context} loadedConceptId="" onClose={() => {}} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Loading the exact Concept identity…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(getConceptInvestigation).not.toHaveBeenCalled();
  });

  it('ignores an in-flight response after the loaded Concept changes to a mismatch', async () => {
    let resolveInvestigation;
    getConceptInvestigation.mockImplementationOnce(() => new Promise(resolve => {
      resolveInvestigation = resolve;
    }));
    const { rerender } = render(
      <MemoryRouter>
        <ConceptInvestigationPanel {...context} onClose={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => expect(getConceptInvestigation).toHaveBeenCalledTimes(1));
    rerender(
      <MemoryRouter>
        <ConceptInvestigationPanel
          {...context}
          loadedConceptId="64f100000000000000000099"
          onClose={() => {}}
        />
      </MemoryRouter>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');

    resolveInvestigation({ investigation });
    await waitFor(() => expect(screen.queryByText('What drives inference cost?')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('does not match');
  });

  it('retries the same exact context after a recoverable failure', async () => {
    getConceptInvestigation.mockRejectedValueOnce({ response: { data: { error: 'Revision unavailable.' } } }).mockResolvedValueOnce({ investigation });
    render(<MemoryRouter><ConceptInvestigationPanel {...context} onClose={() => {}} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getConceptInvestigation).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('What drives inference cost?')).toBeInTheDocument();
  });

  it('runs only the exact supported workbench action and explains unavailable capabilities', async () => {
    const onRunWorkbenchAction = jest.fn();
    render(
      <MemoryRouter>
        <ConceptInvestigationPanel
          {...context}
          onRunWorkbenchAction={onRunWorkbenchAction}
          onClose={() => {}}
        />
      </MemoryRouter>
    );

    await screen.findByText('What drives inference cost?');
    fireEvent.click(screen.getByRole('button', { name: 'Find contrary evidence' }));
    expect(onRunWorkbenchAction).toHaveBeenCalledWith('find_contrary_evidence');

    expect(screen.getByRole('button', { name: 'Compare historical cases' })).toBeDisabled();
    expect(screen.getByText(/Historical-case comparison is not available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trace citations backward' })).toBeDisabled();
    expect(screen.getByText(/Citation-chain tracing is not available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draft a Wiki revision' })).toBeDisabled();
    expect(onRunWorkbenchAction).toHaveBeenCalledTimes(1);
  });
});
