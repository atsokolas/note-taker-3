import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DecisionReviewPanel from './DecisionReviewPanel';
import {
  getDecisions,
  recordWikiDecisionOutcome,
  transitionWikiDecision
} from '../../../api/decisions';

jest.mock('../../../api/decisions', () => ({
  getDecisions: jest.fn(),
  recordWikiDecisionOutcome: jest.fn(),
  transitionWikiDecision: jest.fn()
}));

const plannedItem = {
  id: 'decision:page:d1',
  identity: { pageId: '64f500000000000000000010', decisionId: 'd1' },
  page: { title: 'Page', href: '/wiki/workspace?page=64f500000000000000000010' },
  decision: {
    summary: 'Hold',
    rationale: 'Original rationale stays visible.',
    expectedOutcome: 'Stability',
    status: 'planned',
    decidedAt: '2026-07-20T12:00:00.000Z',
    reviewAt: '2026-08-01T12:00:00.000Z'
  },
  continuity: {
    acceptedRevisionId: '64f500000000000000000070',
    immutableSnapshotHash: 'hash-abc',
    complete: true,
    missing: []
  },
  links: {
    claims: { resolved: [], missingIds: [] },
    sources: {
      resolved: [{
        id: 'article-a1',
        sourceRefId: '64f500000000000000000020',
        title: 'Source one',
        href: '/library?articleId=article-a1'
      }],
      missingIds: []
    }
  },
  outcome: { state: 'awaiting_observation', result: 'unknown' }
};

const takenItem = {
  ...plannedItem,
  decision: { ...plannedItem.decision, status: 'taken' }
};

describe('DecisionReviewPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('preserves original rationale and transitions planned → taken', async () => {
    getDecisions
      .mockResolvedValueOnce({ items: [plannedItem] })
      .mockResolvedValueOnce({ items: [takenItem] });
    transitionWikiDecision.mockResolvedValue({
      status: 'taken',
      idempotent: false,
      receipt: { id: 'transition-receipt' }
    });

    render(
      <MemoryRouter>
        <DecisionReviewPanel
          pageId="64f500000000000000000010"
          decisionId="d1"
          page={{
            sourceRefs: [{ _id: '64f500000000000000000020', title: 'Source one' }]
          }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Original rationale stays visible/i)).toBeInTheDocument();
    expect(screen.getByText(/Noeis has not inferred an outcome/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mark taken/i }));
    await waitFor(() => expect(transitionWikiDecision).toHaveBeenCalledWith(
      '64f500000000000000000010',
      'd1',
      { action: 'take' }
    ));
    expect(await screen.findByText(/Transitioned to taken/i)).toBeInTheDocument();
  });

  it('records an outcome with expectedDecisionHash and evidence sourceRefId', async () => {
    getDecisions
      .mockResolvedValueOnce({ items: [takenItem] })
      .mockResolvedValueOnce({
        items: [{
          ...takenItem,
          decision: { ...takenItem.decision, status: 'reviewed' },
          outcome: {
            state: 'observed',
            result: 'positive',
            observedAt: '2026-07-20T12:00:00.000Z',
            lesson: 'Keep the bar high.',
            receiptId: 'outcome-receipt'
          }
        }]
      });
    recordWikiDecisionOutcome.mockResolvedValue({
      status: 'reviewed',
      idempotent: false,
      receipt: { id: 'outcome-receipt' }
    });

    render(
      <MemoryRouter>
        <DecisionReviewPanel
          pageId="64f500000000000000000010"
          decisionId="d1"
          page={{
            sourceRefs: [{ _id: '64f500000000000000000020', title: 'Source one' }]
          }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Record observed outcome/i })).toBeInTheDocument();
    const observedAt = screen.getByLabelText(/Observed at/i);
    expect(observedAt).toHaveAttribute('type', 'datetime-local');
    fireEvent.change(observedAt, { target: { value: '2026-07-20T16:45:30' } });
    fireEvent.change(screen.getByLabelText(/Observation summary/i), { target: { value: 'Held as expected' } });
    fireEvent.change(screen.getByLabelText(/Calibration note/i), { target: { value: 'Process was calm' } });
    fireEvent.change(screen.getByLabelText(/^Lesson$/i), { target: { value: 'Keep the bar high.' } });
    fireEvent.click(screen.getByLabelText(/Source one/i));
    fireEvent.click(screen.getByRole('button', { name: /Record outcome/i }));

    await waitFor(() => expect(recordWikiDecisionOutcome).toHaveBeenCalled());
    const [, , body] = recordWikiDecisionOutcome.mock.calls[0];
    expect(body.outcome).toEqual(expect.objectContaining({
      expectedDecisionHash: 'hash-abc',
      observedAt: new Date('2026-07-20T16:45:30').toISOString(),
      result: 'mixed',
      processScore: 0.7,
      calibrationNote: 'Process was calm',
      lesson: 'Keep the bar high.',
      evidenceSourceRefIds: ['64f500000000000000000020']
    }));
    expect(await screen.findByText(/Observed result/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep the bar high/i)).toBeInTheDocument();
    expect(screen.getByText(/outcome-receipt/i)).toBeInTheDocument();
  });

  it('keeps millisecond precision in the default observation clock', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T16:14:55.789Z'));
    getDecisions.mockResolvedValue({ items: [takenItem] });

    render(
      <MemoryRouter>
        <DecisionReviewPanel
          pageId="64f500000000000000000010"
          decisionId="d1"
          page={{ sourceRefs: [{ _id: '64f500000000000000000020', title: 'Source one' }] }}
        />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: /Record observed outcome/i });
    const observedAt = screen.getByLabelText(/Observed at/i);
    expect(observedAt.value).toMatch(/\.\d{3}$/);
    expect(new Date(observedAt.value).getMilliseconds()).not.toBe(0);
    expect(observedAt).toHaveAttribute('step', '0.001');
  });

  it('surfaces stale-decision failures as retryable errors', async () => {
    getDecisions.mockResolvedValue({ items: [takenItem] });
    recordWikiDecisionOutcome.mockRejectedValue({
      response: { data: { error: 'Decision changed after this outcome form was opened.', code: 'stale_decision' } }
    });

    render(
      <MemoryRouter>
        <DecisionReviewPanel
          pageId="64f500000000000000000010"
          decisionId="d1"
          page={{ sourceRefs: [{ _id: '64f500000000000000000020', title: 'Source one' }] }}
        />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: /Record observed outcome/i });
    fireEvent.change(screen.getByLabelText(/Observation summary/i), { target: { value: 'Held' } });
    fireEvent.change(screen.getByLabelText(/Calibration note/i), { target: { value: 'ok' } });
    fireEvent.change(screen.getByLabelText(/^Lesson$/i), { target: { value: 'lesson' } });
    fireEvent.click(screen.getByLabelText(/Source one/i));
    fireEvent.click(screen.getByRole('button', { name: /Record outcome/i }));

    expect(await screen.findByText(/Stale decision/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('explains when the observation timestamp precedes the decision', async () => {
    getDecisions.mockResolvedValue({ items: [takenItem] });
    recordWikiDecisionOutcome.mockRejectedValue({
      response: {
        data: {
          error: 'outcome.observedAt cannot precede the decision.',
          code: 'observation_precedes_decision'
        }
      }
    });

    render(
      <MemoryRouter>
        <DecisionReviewPanel
          pageId="64f500000000000000000010"
          decisionId="d1"
          page={{ sourceRefs: [{ _id: '64f500000000000000000020', title: 'Source one' }] }}
        />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: /Record observed outcome/i });
    fireEvent.change(screen.getByLabelText(/Observed at/i), { target: { value: '2026-07-20T11:00:00' } });
    fireEvent.change(screen.getByLabelText(/Observation summary/i), { target: { value: 'Held' } });
    fireEvent.change(screen.getByLabelText(/Calibration note/i), { target: { value: 'Process reviewed' } });
    fireEvent.change(screen.getByLabelText(/^Lesson$/i), { target: { value: 'Keep monitoring' } });
    fireEvent.click(screen.getByLabelText(/Source one/i));
    fireEvent.click(screen.getByRole('button', { name: /Record outcome/i }));

    expect(await screen.findByText(/Observation precedes decision/i)).toBeInTheDocument();
  });
});
