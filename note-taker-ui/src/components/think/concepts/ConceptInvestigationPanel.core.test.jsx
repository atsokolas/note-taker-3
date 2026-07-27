import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConceptInvestigationPanel from './ConceptInvestigationPanel';
import { getConceptInvestigation } from '../../../api/concepts';

jest.mock('../../../api/concepts', () => ({ getConceptInvestigation: jest.fn() }));

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
  proposals: { workbenchChanges: [], agentSuggestions: [], candidateWikiRevision: { title: 'Candidate revision', summary: 'Not accepted.', ref: { href: '/wiki/workspace?page=1' } } }
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
  });

  it('fails closed on a loaded Concept identity mismatch', async () => {
    render(<MemoryRouter><ConceptInvestigationPanel {...context} loadedConceptId="64f100000000000000000099" onClose={() => {}} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(getConceptInvestigation).not.toHaveBeenCalled();
  });

  it('retries the same exact context after a recoverable failure', async () => {
    getConceptInvestigation.mockRejectedValueOnce({ response: { data: { error: 'Revision unavailable.' } } }).mockResolvedValueOnce({ investigation });
    render(<MemoryRouter><ConceptInvestigationPanel {...context} onClose={() => {}} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getConceptInvestigation).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('What drives inference cost?')).toBeInTheDocument();
  });
});
