import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Judgment, {
  buildJudgmentCases,
  decisionMatchesJudgmentView,
  resolveJudgmentView
} from './Judgment';
import { getDecisions } from '../api/decisions';
import { getWikiPage, listWikiPages } from '../api/wiki';

jest.mock('../api/decisions', () => ({ getDecisions: jest.fn() }));
jest.mock('../api/wiki', () => ({ getWikiPage: jest.fn(), listWikiPages: jest.fn() }));
jest.mock('../components/agent/ThoughtPartnerPanel', () => (props) => (
  <div data-testid="judgment-partner" data-context-id={props.contextId}>{props.title}</div>
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
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    listWikiPages.mockResolvedValue([page]);
    getWikiPage.mockResolvedValue(page);
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

  it('renders the living case, exact grounds, calibration memo, and five-step trace', async () => {
    render(
      <MemoryRouter initialEntries={[`/judgment?view=dossiers&page=${PAGE_ID}&decision=decision-1`]}>
        <Judgment />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Durable compounder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Judgment time comparison')).toHaveTextContent('The accepted thesis supported a staged entry.');
    expect(screen.getByRole('heading', { name: 'Current thesis' })).toBeInTheDocument();
    expect(screen.getByText('Retention weakens for two consecutive periods.')).toBeInTheDocument();
    expect(screen.getByText(`Continuity verified · accepted revision ${REVISION_ID}`)).toBeInTheDocument();
    expect(screen.getByText('Noeis has not inferred an outcome.')).toBeInTheDocument();
    expect(screen.getByLabelText('Calibration memo')).toHaveTextContent('No outcome has been inferred');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Source');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Claim');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Decision');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Outcome');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Lesson');
    expect(screen.getByRole('link', { name: /Return to Library evidence/ })).toHaveAttribute('href', '/articles/article-1');
    expect(screen.getByTestId('judgment-partner')).toHaveAttribute('data-context-id', PAGE_ID);
    await waitFor(() => expect(getWikiPage).toHaveBeenCalledWith(PAGE_ID));
    expect(getDecisions).toHaveBeenCalledWith({ filter: 'all', limit: 100, windowDays: 365 });
  });

  it('renders a reviewed outcome and lesson only when the server marks it observed', async () => {
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
    expect(screen.getByText('Separate demand evidence from margin timing.')).toBeInTheDocument();
    expect(screen.getByLabelText('Calibration memo')).toHaveTextContent('One assumption weakened');
    expect(screen.getByLabelText('Judgment trace')).toHaveTextContent('Human-confirmed');
  });
});
