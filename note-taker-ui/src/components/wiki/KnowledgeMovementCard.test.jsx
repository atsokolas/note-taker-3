import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import KnowledgeMovementCard, {
  KnowledgeMovementLead,
  normalizeKnowledgeMovement
} from './KnowledgeMovementCard';
import { startKnowledgeMovementInvestigation } from '../../api/knowledgeMovements';

jest.mock('../../api/knowledgeMovements', () => ({
  startKnowledgeMovementInvestigation: jest.fn()
}));

const mockNavigate = jest.fn();

const movement = {
  id: 'movement_fixture',
  kind: 'contradiction',
  title: 'New evidence challenges a claim in Inference economics',
  whyItMatters: 'A proposed analysis found conflicting evidence. Your accepted view has not changed.',
  materiality: 'major',
  reviewState: 'candidate',
  subject: {
    type: 'wiki_claim',
    id: 'claim-1',
    href: '/wiki/workspace?page=page-1&claimId=claim-1'
  },
  evidence: [{
    type: 'article',
    id: 'source-1',
    title: 'Source one',
    href: '/library?articleId=source-1'
  }],
  affected: [
    { id: 'page-1', title: 'Inference economics', href: '/wiki/workspace?page=page-1' },
    { id: 'concept-1', title: 'Inference economics', href: '/think?tab=concepts&concept=Inference%20economics' }
  ],
  unresolved: [{ id: 'claim-1', title: 'Claim one', href: '/wiki/workspace?page=page-1&claimId=claim-1' }],
  nextAction: {
    label: 'Review proposed change',
    href: '/think?tab=concepts&concept=Inference%20economics'
  },
  provenance: {
    deterministicFacts: ['Revision state: candidate', 'Support: partial → conflicted']
  }
};

describe('KnowledgeMovementCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders an honest candidate contradiction with inspectable facts', () => {
    render(<MemoryRouter><KnowledgeMovementCard movement={movement} dominant /></MemoryRouter>);

    expect(screen.getByText('Contradiction')).toBeInTheDocument();
    expect(screen.getByText('Review required')).toBeInTheDocument();
    expect(screen.getByText(/accepted view has not changed/i)).toBeInTheDocument();
    expect(screen.getByText('1 evidence source')).toBeInTheDocument();
    // Affected objects are named under "What it affects" now, not counted.
    expect(screen.getByText('What it affects')).toBeInTheDocument();
    const affects = screen.getByText('What it affects').closest('.knowledge-movement__affects');
    expect(within(affects).getAllByRole('link', { name: 'Inference economics' })).toHaveLength(2);
    expect(screen.getByText('1 unresolved item')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review proposed change/i }))
      .toHaveAttribute('href', '/think?tab=concepts&concept=Inference%20economics');

    const details = screen.getByText('Sources and provenance').closest('details');
    expect(within(details).getByText('Revision state: candidate')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Source one' }))
      .toHaveAttribute('href', '/library?articleId=source-1');
    // Affected objects are consequence, not provenance — they are named in
    // the delta above the fold and no longer repeated in here.
    expect(within(details).queryByRole('link', { name: 'Inference economics' })).toBeNull();
    expect(within(details).getByRole('link', { name: 'Claim one' }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-1');
  });

  it('drops malformed or unsafely-routed movement objects', () => {
    expect(normalizeKnowledgeMovement({ ...movement, subject: { href: 'javascript:alert(1)' } })).toBeNull();
    const { container } = render(
      <MemoryRouter>
        <KnowledgeMovementCard movement={{ id: 'bad', kind: 'contradiction' }} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('preserves payload-supplied HTTPS references and drops unsafe destinations', () => {
    const normalized = normalizeKnowledgeMovement({
      ...movement,
      evidence: [
        { id: 'external-source', title: 'External source', href: 'https://example.com/evidence' },
        { id: 'bad-source', title: 'Bad source', href: 'javascript:alert(1)' }
      ],
      affected: [{ id: 'bad-page', title: 'Bad page', href: 'https://user:secret@example.com/private' }]
    });
    expect(normalized.evidence).toHaveLength(1);
    expect(normalized.evidence[0]).toMatchObject({
      href: 'https://example.com/evidence',
      external: true
    });
    expect(normalized.affected).toEqual([]);

    render(<MemoryRouter><KnowledgeMovementCard movement={{ ...movement, evidence: normalized.evidence }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'External source' })).toHaveAttribute('target', '_blank');
  });

  it('renders active, quiet, loading, and failed lead states without inventing activity', () => {
    const { rerender } = render(
      <MemoryRouter><KnowledgeMovementLead movements={[movement]} /></MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /one consequential update needs attention/i })).toBeInTheDocument();

    rerender(<MemoryRouter><KnowledgeMovementLead movements={[]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /nothing material changed/i })).toBeInTheDocument();
    expect(screen.getByText(/no accepted claim/i)).toBeInTheDocument();

    rerender(<MemoryRouter><KnowledgeMovementLead loading /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /checking what may change/i })).toBeInTheDocument();

    rerender(<MemoryRouter><KnowledgeMovementLead error="down" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent(/could not check/i);
  });

  it('renders one episode with every affected claim and avoids urgency for supporting evidence', () => {
    const episode = {
      ...movement,
      id: 'episode-1',
      episodeId: 'episode-1',
      kind: 'new_evidence',
      materiality: 'supporting',
      reviewState: 'current',
      title: 'One evidence update affected 2 claims in Inference economics',
      subjects: [
        { type: 'wiki_claim', id: 'claim-1', title: 'First claim', href: '/wiki/workspace?page=page-1&claimId=claim-1' },
        { type: 'wiki_claim', id: 'claim-2', title: 'Second claim', href: '/wiki/workspace?page=page-1&claimId=claim-2' }
      ]
    };
    render(<MemoryRouter><KnowledgeMovementLead movements={[episode]} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /recent evidence was connected/i })).toBeInTheDocument();
    // Named above the fold under "What it affects" rather than buried in the
    // provenance disclosure, and named once.
    expect(screen.getByText('What it affects')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'First claim' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Second claim' })).toBeInTheDocument();
  });

  it('starts an investigation only after an explicit click and follows the returned Concept href', async () => {
    startKnowledgeMovementInvestigation.mockResolvedValue({
      concept: { href: '/think?tab=concepts&conceptId=64f100000000000000000020' }
    });
    const startMovement = {
      ...movement,
      nextAction: {
        intent: 'start_investigation',
        label: 'Start investigation',
        href: '/wiki/workspace?page=64f100000000000000000030',
        wikiPageId: '64f100000000000000000030',
        revisionId: '64f100000000000000000050',
        claimId: 'claim-1'
      }
    };
    render(
      <MemoryRouter><KnowledgeMovementCard movement={startMovement} /></MemoryRouter>
    );

    expect(startKnowledgeMovementInvestigation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: /start investigation/i }));
    expect(screen.getByRole('link', { name: /starting investigation/i })).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(startKnowledgeMovementInvestigation).toHaveBeenCalledWith({
      wikiPageId: '64f100000000000000000030',
      revisionId: '64f100000000000000000050',
      claimId: 'claim-1'
    }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/think?tab=concepts&conceptId=64f100000000000000000020'
    ));
  });

  it('keeps the fallback link and exposes a recoverable error when investigation creation fails', async () => {
    startKnowledgeMovementInvestigation
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ concept: { href: '/think?tab=concepts&conceptId=concept-1' } });
    const startMovement = {
      ...movement,
      nextAction: {
        intent: 'start_investigation',
        label: 'Start investigation',
        href: '/wiki/workspace?page=page-1',
        wikiPageId: '64f100000000000000000030',
        revisionId: '64f100000000000000000050'
      }
    };
    render(
      <MemoryRouter><KnowledgeMovementCard movement={startMovement} /></MemoryRouter>
    );

    const action = screen.getByRole('link', { name: /start investigation/i });
    expect(action).toHaveAttribute('href', '/wiki/workspace?page=page-1');
    fireEvent.click(action);
    expect(await screen.findByText(/could not start this investigation/i)).toHaveAttribute('role', 'status');

    fireEvent.click(action);
    await waitFor(() => expect(startKnowledgeMovementInvestigation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/think?tab=concepts&conceptId=concept-1'
    ));
  });

  it('preserves opaque claim identity exactly and disables malformed investigation identity', () => {
    const opaqueClaimId = 'claim/path with spaces + unicode-α';
    const normalized = normalizeKnowledgeMovement({
      ...movement,
      nextAction: {
        intent: 'start_investigation',
        label: 'Start investigation',
        href: '/wiki/workspace?page=64f100000000000000000030',
        wikiPageId: '64f100000000000000000030',
        revisionId: '64f100000000000000000050',
        claimId: opaqueClaimId
      }
    });
    expect(normalized.nextAction).toMatchObject({
      intent: 'start_investigation',
      claimId: opaqueClaimId
    });

    const malformed = normalizeKnowledgeMovement({
      ...movement,
      nextAction: {
        intent: 'start_investigation',
        label: 'Start investigation',
        href: '/wiki/workspace?page=not-an-object-id',
        wikiPageId: 'not-an-object-id',
        revisionId: '64f100000000000000000050',
        claimId: opaqueClaimId
      }
    });
    expect(malformed.nextAction.intent).toBe('');
    expect(malformed.nextAction.claimId).toBe('');
  });

  it('renders decision_due with a Review decision action and never starts investigation', () => {
    const due = {
      id: 'movement_decision_due',
      kind: 'decision_due',
      title: 'Review due: Hold the position',
      whyItMatters: 'The review date explicitly set by the human owner has arrived. Noeis has not inferred an outcome.',
      materiality: 'major',
      reviewState: 'current',
      subject: {
        type: 'decision',
        id: 'd1',
        title: 'Hold the position',
        href: '/wiki/workspace?page=page-1&decisionId=d1'
      },
      evidence: [{
        type: 'article',
        id: 'source-1',
        title: 'Source one',
        href: '/library?articleId=source-1'
      }],
      affected: [{ id: 'page-1', title: 'Inference economics', href: '/wiki/workspace?page=page-1' }],
      unresolved: [],
      nextAction: {
        label: 'Review decision',
        href: '/wiki/workspace?page=page-1&decisionId=d1',
        intent: 'review_decision',
        wikiPageId: 'page-1',
        decisionId: 'd1'
      },
      provenance: {
        deterministicFacts: ['Human-set review date: 2026-07-31T12:00:00.000Z', 'Decision status: taken']
      }
    };

    render(<MemoryRouter><KnowledgeMovementCard movement={due} dominant /></MemoryRouter>);

    expect(screen.getByText('Decision review')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/has not inferred an outcome/i);
    const action = screen.getByRole('link', { name: /review decision/i });
    expect(action).toHaveAttribute('href', '/wiki/workspace?page=page-1&decisionId=d1');
    fireEvent.click(action);
    expect(startKnowledgeMovementInvestigation).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders outcome_due as a human-clock return with a Record outcome action', () => {
    const due = {
      id: 'movement_outcome_due',
      kind: 'outcome_due',
      title: 'Outcome due: Hold the position',
      whyItMatters: 'The outcome date explicitly set by the human owner has arrived. Noeis has not inferred a result.',
      materiality: 'major',
      reviewState: 'current',
      subject: {
        type: 'decision',
        id: 'd1',
        title: 'Hold the position',
        href: '/wiki/workspace?page=page-1&decisionId=d1'
      },
      evidence: [],
      affected: [{ id: 'page-1', title: 'Inference economics', href: '/wiki/workspace?page=page-1' }],
      unresolved: [],
      nextAction: {
        label: 'Record outcome',
        href: '/wiki/workspace?page=page-1&decisionId=d1',
        intent: 'review_decision',
        wikiPageId: 'page-1',
        decisionId: 'd1'
      },
      provenance: {
        deterministicFacts: ['Human-set outcome date: 2026-07-31T15:30:00.000Z']
      }
    };

    render(<MemoryRouter><KnowledgeMovementCard movement={due} dominant /></MemoryRouter>);

    expect(screen.getByText('Outcome review')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/has not inferred an outcome/i);
    expect(screen.getByRole('link', { name: /record outcome/i }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&decisionId=d1');
    expect(startKnowledgeMovementInvestigation).not.toHaveBeenCalled();
  });

  it('renders a verified reviewed outcome without the due-state inference warning', () => {
    const reviewed = {
      id: 'movement_outcome_reviewed',
      kind: 'outcome_reviewed',
      title: 'Outcome reviewed: Hold the position',
      whyItMatters: 'The human owner recorded the observed result, calibration, and retained lesson. Noeis did not infer the outcome.',
      materiality: 'supporting',
      reviewState: 'current',
      subject: {
        type: 'decision', id: 'd1', title: 'Hold the position',
        href: '/wiki/workspace?page=page-1&decisionId=d1'
      },
      evidence: [{
        type: 'article', id: 'source-1', title: 'Observed evidence',
        href: '/library?articleId=source-1'
      }],
      affected: [{ id: 'page-1', title: 'Inference economics', href: '/wiki/workspace?page=page-1' }],
      unresolved: [],
      nextAction: {
        label: 'Open reviewed outcome',
        href: '/wiki/workspace?page=page-1&decisionId=d1',
        intent: 'open_reviewed_outcome',
        wikiPageId: 'page-1',
        decisionId: 'd1'
      },
      provenance: {
        deterministicFacts: ['Human-recorded result: positive', 'Outcome receipt: outcome-receipt']
      },
      reviewedOutcome: {
        result: 'positive',
        summary: 'Inference cost declined inside the review window.',
        processScore: 0.8,
        calibrationNote: 'Software gains mattered more than expected.',
        lesson: 'Track software and hardware contributions separately.',
        observedAt: '2026-07-30T14:00:00.000Z',
        reviewedAt: '2026-07-31T14:00:00.000Z'
      }
    };

    render(<MemoryRouter><KnowledgeMovementCard movement={reviewed} /></MemoryRouter>);

    expect(screen.getByText('Outcome retained')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Reviewed outcome' })).toHaveTextContent('Did the judgment hold?');
    expect(screen.getByRole('region', { name: 'Reviewed outcome' })).toHaveTextContent('Software gains mattered more than expected.');
    expect(screen.getByRole('region', { name: 'Reviewed outcome' })).toHaveTextContent('Track software and hardware contributions separately.');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open reviewed outcome/i }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&decisionId=d1');
    expect(screen.getByText('Human-recorded result: positive')).toBeInTheDocument();
    expect(startKnowledgeMovementInvestigation).not.toHaveBeenCalled();
  });

  it('promotes a receipt-verified reviewed outcome above unresolved supporting movements', () => {
    const reviewed = {
      id: 'reviewed-lead',
      kind: 'outcome_reviewed',
      title: 'Outcome reviewed: Hold the position',
      whyItMatters: 'The human owner recorded the result.',
      materiality: 'supporting',
      reviewState: 'current',
      subject: { id: 'd1', title: 'Hold', href: '/wiki/workspace?page=page-1&decisionId=d1' },
      evidence: [], affected: [], unresolved: [],
      nextAction: { label: 'Open reviewed outcome', href: '/wiki/workspace?page=page-1&decisionId=d1' },
      reviewedOutcome: {
        result: 'positive',
        calibrationNote: 'The mechanism held with a narrower contribution.',
        lesson: 'Separate the two drivers next time.'
      }
    };
    const { container } = render(
      <MemoryRouter><KnowledgeMovementLead movements={[movement, reviewed]} /></MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'A judgment returned with evidence.' })).toBeInTheDocument();
    const first = container.querySelector('.knowledge-movements__list > li:first-child');
    expect(within(first).getByRole('heading', { name: /outcome reviewed/i })).toBeInTheDocument();
    expect(first.querySelector('.knowledge-movement')).toHaveClass('knowledge-movement--dominant');
  });

  it('renders accepted question evidence without claiming the question is answered', () => {
    const questionMovement = {
      id: 'movement_question_answerable',
      kind: 'question_answerable',
      title: 'New accepted evidence is ready to review for an open question',
      whyItMatters: 'You accepted this source as relevant. Noeis has not inferred that the question is answered.',
      materiality: 'supporting',
      reviewState: 'current',
      subject: {
        type: 'question', id: 'question-1', title: 'Open question',
        href: '/think?tab=questions&questionId=question-1'
      },
      evidence: [{
        type: 'article', id: 'source-1', title: 'Accepted source',
        href: '/library?articleId=source-1'
      }],
      affected: [],
      unresolved: [{
        type: 'question', id: 'question-1', title: 'Open question',
        href: '/think?tab=questions&questionId=question-1'
      }],
      nextAction: {
        label: 'Review question',
        href: '/think?tab=questions&questionId=question-1',
        intent: 'review_question'
      },
      provenance: { deterministicFacts: ['Question status: open'] }
    };
    render(<MemoryRouter><KnowledgeMovementCard movement={questionMovement} /></MemoryRouter>);
    expect(screen.getByText('Question evidence')).toBeInTheDocument();
    expect(screen.getByText(/has not inferred that the question is answered/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review question/i }))
      .toHaveAttribute('href', '/think?tab=questions&questionId=question-1');
    expect(startKnowledgeMovementInvestigation).not.toHaveBeenCalled();
  });

  it('renders only receipt-backed connection movement copy supplied by the API', () => {
    render(<MemoryRouter><KnowledgeMovementCard movement={{
      id: 'movement_connection_formed',
      kind: 'connection_formed',
      title: 'Source was connected to Open question',
      whyItMatters: 'You explicitly connected these objects as supports.',
      materiality: 'supporting',
      reviewState: 'current',
      subject: { type: 'article', id: 'source-1', title: 'Source', href: '/library?articleId=source-1' },
      evidence: [{ type: 'article', id: 'source-1', title: 'Source', href: '/library?articleId=source-1' }],
      affected: [{ type: 'question', id: 'question-1', title: 'Open question', href: '/think?tab=questions&questionId=question-1' }],
      unresolved: [],
      nextAction: { label: 'Open connected object', href: '/think?tab=questions&questionId=question-1', intent: 'open_connection' },
      provenance: { deterministicFacts: ['Relation: supports'] }
    }} /></MemoryRouter>);
    expect(screen.getByText('Connection formed')).toBeInTheDocument();
    expect(screen.getByText(/explicitly connected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open connected object/i }))
      .toHaveAttribute('href', '/think?tab=questions&questionId=question-1');
  });

  it('does not post when a start action carries unsafe identifiers', () => {
    const unsafe = normalizeKnowledgeMovement({
      ...movement,
      nextAction: {
        intent: 'start_investigation',
        label: 'Open Wiki review',
        href: '/wiki/workspace?page=page-1',
        wikiPageId: '../outside',
        revisionId: 'revision-1'
      }
    });
    expect(unsafe.nextAction.intent).toBe('');
    render(<MemoryRouter><KnowledgeMovementCard movement={unsafe} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: /open wiki review/i }));
    expect(startKnowledgeMovementInvestigation).not.toHaveBeenCalled();
  });
});
