import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Judgment, {
  buildJudgmentCases,
  decisionMatchesJudgmentView,
  evidenceDeltaFor,
  loadJudgmentDecisionIndex,
  nextJudgmentAction,
  resolveJudgmentView
} from './Judgment';
import { getDecisions } from '../api/decisions';
import { getWikiPage, listWikiPages, listWikiRevisions, updateWikiPage } from '../api/wiki';

jest.mock('../api/decisions', () => ({ getDecisions: jest.fn() }));
jest.mock('../api/wiki', () => ({
  getWikiPage: jest.fn(),
  listWikiPages: jest.fn(),
  listWikiRevisions: jest.fn(),
  updateWikiPage: jest.fn()
}));
jest.mock('../components/agent/ThoughtPartnerPanel', () => (props) => (
  <div
    data-testid="judgment-partner"
    data-context-id={props.contextId}
    data-retained-lessons={props.contextMetadata?.retainedLessons?.length || 0}
  >
    {props.title}
  </div>
));

const PAGE_ID = '64f500000000000000000010';
const REVISION_ID = '64f500000000000000000011';
const decisionItem = {
  version: 1,
  id: `${PAGE_ID}:decision-1`,
  identity: { pageId: PAGE_ID, decisionId: 'decision-1' },
  page: { title: 'Durable compounder', href: `/wiki/workspace?page=${PAGE_ID}` },
  subject: { title: 'Build the position slowly', href: `/wiki/workspace?page=${PAGE_ID}&decisionId=decision-1` },
  decision: {
    summary: 'Build the position slowly',
    rationale: 'The accepted thesis supported a staged entry.',
    expectedOutcome: 'Unit economics improve while evidence broadens.',
    status: 'taken',
    acceptedAt: '2026-07-01T12:00:00.000Z'
  },
  dueState: 'upcoming',
  outcome: { state: 'pending' },
  continuity: {
    complete: true,
    acceptedRevisionId: REVISION_ID,
    immutableSnapshotHash: 'a'.repeat(64)
  },
  links: {
    claims: {
      resolved: [{ id: 'claim-1', title: 'Margins can expand', href: `/wiki/workspace?page=${PAGE_ID}&claimId=claim-1` }],
      missingIds: []
    },
    sources: {
      resolved: [{ id: 'article-1', sourceRefId: 'source-1', title: 'Owned source', href: '/articles/article-1' }],
      missingIds: []
    }
  }
};

const page = {
  _id: PAGE_ID,
  title: 'Durable compounder',
  investmentDossier: { version: 2, company: { ticker: 'TEST' } },
  judgment: {
    kind: 'thesis',
    currentJudgment: 'The thesis remains supported, but valuation discipline matters.',
    falsifiers: [{ text: 'Retention weakens for two consecutive periods.' }],
    unknowns: [{ question: 'How durable is pricing power?' }],
    decisions: [{ decisionId: 'decision-1' }]
  }
};

describe('Judgment room', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    listWikiPages.mockResolvedValue([page]);
    getWikiPage.mockResolvedValue(page);
    listWikiRevisions.mockResolvedValue([]);
    updateWikiPage.mockResolvedValue(page);
    getDecisions.mockResolvedValue({
      items: [decisionItem],
      counts: { upcoming_review: 1, awaiting_outcome: 1, reviewed: 0 },
      nextCursor: null
    });
  });

  it('defaults to dossiers and maps only honest decision states into each view', () => {
    expect(resolveJudgmentView('')).toMatchObject({ id: 'dossiers' });
    expect(resolveJudgmentView('?view=outcomes')).toMatchObject({ id: 'outcomes' });
    expect(resolveJudgmentView('?view=unknown')).toMatchObject({ id: 'dossiers' });
    expect(decisionMatchesJudgmentView(decisionItem, 'reviews')).toBe(true);
    expect(decisionMatchesJudgmentView(decisionItem, 'outcomes')).toBe(true);
    expect(decisionMatchesJudgmentView(decisionItem, 'lessons')).toBe(false);
    expect(decisionMatchesJudgmentView({
      ...decisionItem,
      outcome: { state: 'review_incomplete', lesson: 'Do not render me as retained.' }
    }, 'lessons')).toBe(false);
  });

  it('builds cases from grounded pages and receipt-verified decision envelopes', () => {
    expect(buildJudgmentCases([page], [decisionItem])).toEqual([
      expect.objectContaining({
        pageId: PAGE_ID,
        title: 'Durable compounder',
        decisions: [decisionItem]
      })
    ]);
    expect(buildJudgmentCases([], [decisionItem])).toEqual([
      expect.objectContaining({ pageId: PAGE_ID, title: 'Durable compounder' })
    ]);
  });

  it('loads every decision page before building the casebook', async () => {
    getDecisions
      .mockResolvedValueOnce({ items: [decisionItem], counts: {}, nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({
        items: [{ ...decisionItem, id: `${PAGE_ID}:decision-2`, identity: { ...decisionItem.identity, decisionId: 'decision-2' } }],
        counts: {},
        nextCursor: null
      });

    const result = await loadJudgmentDecisionIndex();

    expect(result.items).toHaveLength(2);
    expect(getDecisions).toHaveBeenNthCalledWith(1, { filter: 'all', limit: 100, windowDays: 365 });
    expect(getDecisions).toHaveBeenNthCalledWith(2, {
      filter: 'all', limit: 100, windowDays: 365, cursor: 'cursor-2'
    });
  });

  it('fails closed when the backend cannot scan the complete decision history', async () => {
    getDecisions.mockResolvedValue({
      items: [decisionItem], counts: {}, nextCursor: null,
      coverage: { scannedPages: 250, pageLimit: 250, truncated: true }
    });

    await expect(loadJudgmentDecisionIndex()).rejects.toThrow('coverage is truncated');
  });

  it('shows decision-index failure instead of inferring that no decisions exist', async () => {
    getDecisions.mockRejectedValue(new Error('decision index unavailable'));
    render(
      <MemoryRouter initialEntries={['/judgment?view=dossiers&mode=case']}>
        <Judgment />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Decision history is temporarily unavailable');
    expect(screen.queryByText('No accepted decision is attached to this case.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Next judgment action' })).not.toBeInTheDocument();
    expect(screen.getByText('Decision-grounded agent context will return when the history can be read.')).toBeInTheDocument();
    expect(screen.getByText('Decision, outcome, and lesson continuity is unavailable. No absence has been inferred.')).toBeInTheDocument();
    expect(screen.queryByText(/judgments? remain connected/i)).not.toBeInTheDocument();
    expect(screen.queryByText('No accepted decision')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Case actions' })).not.toBeInTheDocument();
  });

  it('derives the next human action and exact current-source delta without inferring chronology', () => {
    expect(nextJudgmentAction(null)).toMatchObject({ id: 'record' });
    expect(nextJudgmentAction(decisionItem)).toMatchObject({ id: 'outcome' });
    expect(nextJudgmentAction({ ...decisionItem, decision: { ...decisionItem.decision, status: 'planned' } }))
      .toMatchObject({ id: 'decide' });
    expect(nextJudgmentAction({ ...decisionItem, decision: { ...decisionItem.decision, status: 'reviewed' } }))
      .toMatchObject({ id: 'compound' });

    expect(evidenceDeltaFor({
      sourceRefs: [
        { _id: 'source-1', title: 'Frozen source' },
        { _id: 'source-2', title: 'Current unbound source' }
      ]
    }, decisionItem)).toEqual([
      expect.objectContaining({ id: 'source-2', title: 'Current unbound source' })
    ]);
  });

  it('renders the living case, exact grounds, calibration memo, and five-step trace', async () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: `?view=dossiers&page=${PAGE_ID}&decision=decision-1&mode=case`, hash: '', state: null, key: 'case'
    });
    render(
      <MemoryRouter initialEntries={[`/judgment?view=dossiers&page=${PAGE_ID}&decision=decision-1&mode=case`]}>
        <Judgment />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Durable compounder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Judgment time comparison')).toHaveTextContent('The accepted thesis supported a staged entry.');
    expect(screen.getByRole('heading', { name: 'Current thesis' })).toBeInTheDocument();
    expect(screen.getByText('Retention weakens for two consecutive periods.')).toBeInTheDocument();
    expect(screen.getByText(`Continuity verified · accepted revision ${REVISION_ID}`)).toBeInTheDocument();
    expect(screen.getByText('Noeis has not inferred an outcome.')).toBeInTheDocument();
    expect(screen.getByLabelText('Calibration memo')).toHaveTextContent('1 judgment remains connected');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Source');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Claim');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Decision');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Outcome');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Lesson');
    expect(screen.getByRole('link', { name: /Return to Library evidence/ })).toHaveAttribute('href', '/articles/article-1');
    expect(screen.getByTestId('judgment-partner')).toHaveAttribute('data-context-id', PAGE_ID);
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Outcome & lesson' }));
    expect(await screen.findByRole('heading', { name: 'Record observed outcome' })).toBeInTheDocument();
    await waitFor(() => expect(getWikiPage).toHaveBeenCalledWith(PAGE_ID));
    expect(getDecisions).toHaveBeenCalledWith({ filter: 'all', limit: 100, windowDays: 365 });
  });

  it('opens every real dossier in the account-backed board by default', async () => {
    render(
      <MemoryRouter initialEntries={[`/judgment?view=dossiers&page=${PAGE_ID}&decision=decision-1`]}>
        <Judgment />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Durable compounder' })).toBeInTheDocument();
    expect(screen.getByText('Living board · account-backed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What it suggests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What could break it' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decision & lesson' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Owned source/i })).toBeInTheDocument();
    expect(screen.getByText('Margins can expand')).toBeInTheDocument();
    expect(screen.getByText('Retention weakens for two consecutive periods.')).toBeInTheDocument();
    expect(screen.getByText('Build the position slowly')).toBeInTheDocument();
    expect(screen.getByTestId('judgment-partner')).toHaveAttribute('data-context-id', PAGE_ID);
    expect(screen.queryByText(/Synthetic/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Case' })).toHaveAttribute(
      'href',
      `/judgment?view=dossiers&page=${PAGE_ID}&decision=decision-1&mode=case`
    );
  });

  it('opens the canonical decision form for a case with no decision and fails closed without an accepted basis', async () => {
    const undecidedPage = {
      ...page,
      judgment: { ...page.judgment, decisions: [] }
    };
    listWikiPages.mockResolvedValue([undecidedPage]);
    getWikiPage.mockResolvedValue(undecidedPage);
    getDecisions.mockResolvedValue({
      items: [],
      counts: { upcoming_review: 0, awaiting_outcome: 0, reviewed: 0 },
      nextCursor: null
    });
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: `?view=dossiers&page=${PAGE_ID}&mode=case`, hash: '', state: null, key: 'undecided-case'
    });

    render(
      <MemoryRouter initialEntries={[`/judgment?page=${PAGE_ID}&mode=case`]}>
        <Judgment />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Record the first judgment' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Decision record' }));
    expect(screen.getByRole('heading', { name: /Accept a decision against a retained claim revision/i })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('no accepted or preserved claim revision');
    expect(listWikiRevisions).toHaveBeenCalledWith(PAGE_ID);
  });

  it('accepts thesis and falsifier revisions from their native chapters without rewriting the decision basis', async () => {
    updateWikiPage.mockImplementation(async (_pageId, updates) => ({
      ...page,
      judgment: updates.judgment
    }));
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: `?view=dossiers&page=${PAGE_ID}&decision=decision-1&mode=case`, hash: '', state: null, key: 'edit-case'
    });

    render(
      <MemoryRouter initialEntries={[`/judgment?view=dossiers&page=${PAGE_ID}&decision=decision-1&mode=case`]}>
        <Judgment />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Durable compounder' });
    fireEvent.click(screen.getByRole('button', { name: 'Revise thesis' }));
    fireEvent.change(screen.getByLabelText('Revised current thesis'), {
      target: { value: 'The thesis remains supported only if retention and pricing power hold together.' }
    });
    expect(screen.getByLabelText('Proposed knowledge change')).toHaveTextContent('Before');
    expect(screen.getByLabelText('Proposed knowledge change')).toHaveTextContent('Proposed');
    fireEvent.click(screen.getByRole('button', { name: 'Accept thesis revision' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith(PAGE_ID, {
      judgment: expect.objectContaining({
        currentJudgment: 'The thesis remains supported only if retention and pricing power hold together.'
      })
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Thesis revision accepted');
    expect(screen.getByLabelText('Judgment time comparison')).toHaveTextContent('The accepted thesis supported a staged entry.');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update conditions' }));
    fireEvent.change(screen.getByLabelText('Falsifier 1'), {
      target: { value: 'Retention or pricing power weakens for two consecutive periods.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    fireEvent.change(screen.getByLabelText('Falsifier 2'), {
      target: { value: 'Incremental returns fall below the hurdle rate.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept ledger revision' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenLastCalledWith(PAGE_ID, {
      judgment: expect.objectContaining({
        falsifiers: expect.arrayContaining([
          expect.objectContaining({ text: 'Retention or pricing power weakens for two consecutive periods.' }),
          expect.objectContaining({ text: 'Incremental returns fall below the hurdle rate.' })
        ])
      })
    }));
    expect(screen.getByText('Falsifier ledger revision accepted.')).toBeInTheDocument();
  });

  it('keeps artificial chapter revisions local and unsaved', async () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: '?preview=artificial&view=dossiers', hash: '', state: null, key: 'preview-edit'
    });
    render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers']}>
        <Judgment />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Northstar Compute — capacity before conviction' });
    fireEvent.click(screen.getByRole('button', { name: 'Revise thesis' }));
    fireEvent.change(screen.getByLabelText('Revised current thesis'), {
      target: { value: 'Contract conversion, not announced capacity, now governs position size.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept thesis revision' }));

    expect(await screen.findByText('Preview thesis revised locally. Nothing was saved.')).toBeInTheDocument();
    expect(screen.getAllByText('Contract conversion, not announced capacity, now governs position size.').length).toBeGreaterThanOrEqual(1);
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('renders a reviewed outcome and lesson only when the server marks it observed', async () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: `?view=lessons&page=${PAGE_ID}`, hash: '', state: null, key: 'lessons'
    });
    getDecisions.mockResolvedValue({
      items: [{
        ...decisionItem,
        decision: { ...decisionItem.decision, status: 'reviewed' },
        outcome: {
          state: 'observed',
          result: 'mixed',
          observedAt: '2026-08-01T12:00:00.000Z',
          summary: 'Retention held while margins lagged.',
          calibrationNote: 'One assumption weakened; two remain supported.',
          lesson: 'Separate demand evidence from margin timing.'
        }
      }],
      counts: { upcoming_review: 0, awaiting_outcome: 0, reviewed: 1 },
      nextCursor: null
    });

    render(
      <MemoryRouter initialEntries={[`/judgment?view=lessons&page=${PAGE_ID}`]}>
        <Judgment />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Retention held while margins lagged.')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Separate demand evidence from margin timing.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Calibration memo')).toHaveTextContent('One assumption weakened');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Human-confirmed');
    expect(screen.getByTestId('judgment-partner')).toHaveAttribute('data-retained-lessons', '1');
  });

  it('renders the artificial case without reading or writing account data', async () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: '?preview=artificial', hash: '', state: null, key: 'preview'
    });
    render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial']}>
        <Judgment />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Northstar Compute — capacity before conviction' })).toBeInTheDocument();
    expect(screen.getByText('Fictional · local · unsaved')).toBeInTheDocument();
    expect(screen.getByText('Partially right, poorly timed')).toBeInTheDocument();
    expect(screen.getAllByText(/size the position to verified contract conversion/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Artificial judgment partner preview')).toBeInTheDocument();
    const sourceLedger = screen.getByText('Grounding ledger').closest('details');
    expect(sourceLedger).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Grounding ledger'));
    expect(sourceLedger).toHaveAttribute('open');

    const previewComposer = screen.getByLabelText('Preview agent question');
    expect(previewComposer).toBeEnabled();
    fireEvent.change(previewComposer, { target: { value: 'What evidence grounds this case?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask preview' }));
    expect(screen.getByText(/Five synthetic receipts ground this case/i)).toBeInTheDocument();
    expect(previewComposer).toHaveValue('');

    expect(screen.getByRole('heading', { name: 'Carry the lesson into the next judgment' })).toBeInTheDocument();
    expect(screen.getAllByText('Not bound to this decision-time snapshot')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Decision record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Freeze preview judgment' }));
    expect(screen.getByRole('status')).toHaveTextContent('Preview judgment frozen locally');
    expect(listWikiPages).not.toHaveBeenCalled();
    expect(getWikiPage).not.toHaveBeenCalled();
    expect(getDecisions).not.toHaveBeenCalled();
  });

  it('turns one artificial judgment into a movable board without rewriting accepted knowledge', () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: '?preview=artificial&view=dossiers&mode=board', hash: '', state: null, key: 'board'
    });
    render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers&mode=board']}>
        <Judgment />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Northstar Compute' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What it suggests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What could break it' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decision & lesson' })).toBeInTheDocument();
    expect(screen.getByText('Accepted claim')).toBeInTheDocument();
    expect(screen.getAllByText('Agent proposal · Review')).toHaveLength(1);
    expect(screen.getByText('Frozen decision · Nov 14, 2025')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Case' })).toHaveAttribute(
      'href',
      '/judgment?preview=artificial&view=dossiers&mode=case'
    );

    fireEvent.click(screen.getByRole('button', { name: /Synthetic financing scenario/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect to claim' }));

    expect(screen.getAllByText('Agent proposal · Review')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('accepted claim was not changed');
    expect(screen.getAllByText('Accepted claim')).toHaveLength(1);
    expect(listWikiPages).not.toHaveBeenCalled();
    expect(getWikiPage).not.toHaveBeenCalled();
    expect(getDecisions).not.toHaveBeenCalled();
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('prepares dropped evidence for a later judgment while the frozen decision remains immutable', () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: '?preview=artificial&view=dossiers&mode=board', hash: '', state: null, key: 'board-drop'
    });
    render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers&mode=board']}>
        <Judgment />
      </MemoryRouter>
    );

    const evidence = screen.getByRole('button', { name: /Synthetic customer concentration review/i });
    const lane = screen.getByRole('heading', { name: 'Decision & lesson' }).closest('section');
    fireEvent.dragStart(evidence, { dataTransfer: { setData: jest.fn() } });
    fireEvent.dragOver(lane);
    fireEvent.drop(lane);

    expect(screen.getByRole('status')).toHaveTextContent('prepared as grounds for the next judgment');
    expect(screen.getByRole('status')).toHaveTextContent('frozen decision remains unchanged');
    expect(screen.getByText('Open a 1.5% starter position and require contract conversion before adding.')).toBeInTheDocument();
  });

  it('supports a persistent living sandbox with evidence creation, proposal review, and reset', () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: '?preview=artificial&view=dossiers&mode=board', hash: '', state: null, key: 'living-board'
    });
    const rendered = render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers&mode=board']}>
        <Judgment />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add evidence' }));
    fireEvent.change(screen.getByPlaceholderText('Article, memo, conversation…'), {
      target: { value: 'My channel check' }
    });
    fireEvent.change(screen.getByPlaceholderText('Record one observable fact…'), {
      target: { value: 'Two customers delayed expansion until the next capacity milestone.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to board' }));

    expect(screen.getByRole('button', { name: /My channel check/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('added to this local sandbox');
    fireEvent.click(screen.getByRole('button', { name: 'Connect to claim' }));
    expect(screen.getAllByText('Agent proposal · Review')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[1]);
    expect(screen.getAllByText('Accepted claim')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('accepted inside the sandbox');
    expect(localStorage.getItem('noeis.judgment.artificialBoard.v1')).toContain('My channel check');

    rendered.unmount();
    render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers&mode=board']}>
        <Judgment />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /My channel check/i })).toBeInTheDocument();
    expect(screen.getAllByText('Accepted claim')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Reset artificial case' }));
    expect(screen.queryByRole('button', { name: /My channel check/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Accepted claim')).toHaveLength(1);
  });

  it('retrieves Library passages in place and preserves provenance when placing them on the board', () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/judgment', search: '?preview=artificial&view=dossiers&mode=board', hash: '', state: null, key: 'retrieval-board'
    });
    render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers&mode=board']}>
        <Judgment />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('Find in my Library…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Financing risk' }));
    expect(screen.getByText('Synthetic lender covenant note')).toBeInTheDocument();
    expect(screen.getByText(/Challenges the assumption that capacity can be financed/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Test thesis' })[0]);
    expect(screen.getByText('Counter-signal to examine')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('placed on the Board as counter-evidence');
    expect(localStorage.getItem('noeis.judgment.artificialBoard.v1')).toContain('Synthetic lender covenant note');

    fireEvent.click(screen.getByRole('button', { name: /Frozen decision · Nov 14, 2025/i }));
    expect(screen.getByPlaceholderText('What has changed since this decision?')).toHaveValue('what changed since the decision');
    fireEvent.submit(screen.getByPlaceholderText('What has changed since this decision?').closest('form'));
    expect(screen.getByText('Synthetic capacity commissioning ledger')).toBeInTheDocument();
  });

  it('changes the center composition and judgment partner across every preview rail view', async () => {
    let search = '?preview=artificial&view=dossiers';
    jest.spyOn(router, 'useLocation').mockImplementation(() => ({
      pathname: '/judgment', search, hash: '', state: null, key: search
    }));
    const rendered = render(
      <MemoryRouter initialEntries={['/judgment?preview=artificial&view=dossiers']}>
        <Judgment />
      </MemoryRouter>
    );
    const showView = (view) => {
      search = `?preview=artificial&view=${view}`;
      rendered.rerender(
        <MemoryRouter initialEntries={[`/judgment${search}`]}>
          <Judgment />
        </MemoryRouter>
      );
    };

    expect(screen.getByRole('heading', { name: 'Case curator' })).toBeInTheDocument();
    expect(screen.getByText(/3 recorded judgments connect this living case/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current thesis' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decision record' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /^Decisions/ })).toHaveAttribute('href', '/judgment?preview=artificial&view=decisions');
    showView('decisions');
    expect(await screen.findByRole('heading', { name: 'Decision historian' })).toBeInTheDocument();
    expect(screen.getAllByText('Open a 1.5% starter position and require contract conversion before adding.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Current thesis' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decision record' })).toBeInTheDocument();

    showView('reviews');
    expect(await screen.findByRole('heading', { name: 'Review partner' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Take or cancel the planned judgment' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }));
    expect(screen.getByRole('button', { name: 'Mark taken' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Outcome & lesson' })).not.toBeInTheDocument();

    showView('outcomes');
    expect(await screen.findByRole('heading', { name: 'Outcome recorder' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Record what actually happened' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }));
    expect(screen.getByRole('button', { name: 'Record preview outcome' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Current thesis' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outcome & lesson' })).toBeInTheDocument();

    showView('lessons');
    expect(await screen.findByRole('heading', { name: 'Learning partner' })).toBeInTheDocument();
    expect(screen.getAllByText(/size the position to verified contract conversion/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: 'Current thesis' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Decision record' })).not.toBeInTheDocument();
  });
});
