import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DossierResearchReview from './DossierResearchReview';
import {
  getJudgmentResponseThread,
  reviewObservationLineage,
  saveJudgmentResponseThread
} from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  getJudgmentResponseThread: jest.fn(),
  reviewObservationLineage: jest.fn(),
  saveJudgmentResponseThread: jest.fn()
}));

const review = {
  id: 'review-1',
  status: 'awaiting_review',
  title: 'Review what changed for COST',
  provenance: {
    judgmentAtAcceptance: 'Margins can keep compounding.',
    comparison: {
      headline: 'The 10-Q changed two decision-relevant claims.',
      summary: 'Margins now bear more directly on the owner return hurdle.',
      claimChanges: [{ title: 'Margin conclusion revised', detail: 'The accepted margin claim changed.' }]
    }
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  getJudgmentResponseThread.mockResolvedValue({
    observation: {
      baseClaim: 'Margins can keep compounding.',
      criterionSnapshot: { text: 'Membership income stops growing.' }
    },
    draft: null
  });
  saveJudgmentResponseThread.mockImplementation(async payload => ({
    draft: { ...payload, version: (payload.expectedVersion || 0) + 1 },
    observation: { baseClaim: 'Margins can keep compounding.' }
  }));
  reviewObservationLineage.mockResolvedValue({ family: { status: 'accepted' } });
});

it('previews a response without mutating the judgment, then records keep explicitly', async () => {
  const onKeep = jest.fn().mockResolvedValue({ status: 'completed' });
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} onKeep={onKeep} />
    </MemoryRouter>
  );

  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close response' })).toHaveFocus();
  expect(screen.getByText('Membership income stops growing.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview response' }));
  expect(screen.getByText('Nothing has changed yet')).toBeInTheDocument();
  expect(onKeep).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Record this response' }));

  await waitFor(() => expect(onKeep).toHaveBeenCalledTimes(1));
  expect(saveJudgmentResponseThread).toHaveBeenCalled();
});

it('closes the response with Escape', async () => {
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /the 10-q changed/i })).toHaveFocus());
});

it('does not offer an unresolved response while its historical context is still loading', async () => {
  let finishLoading;
  getJudgmentResponseThread.mockImplementationOnce(() => new Promise(resolve => { finishLoading = resolve; }));
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = screen.getByRole('button', { name: /the 10-q changed/i });
  expect(cue).toBeDisabled();
  await act(async () => finishLoading({ observation: { baseClaim: 'Margins can keep compounding.', criterionSnapshot: {} }, draft: null }));
  await waitFor(() => expect(cue).toBeEnabled());
});

it('keeps a source failure visible without changing the case', async () => {
  getJudgmentResponseThread.mockRejectedValueOnce(new Error('offline'));
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);
  expect(screen.getByRole('alert')).toHaveTextContent('Your response thread could not be opened.');
  expect(screen.getByText('Margins can keep compounding.')).toBeInTheDocument();
});

it('makes the surrounding mobile case inert while the focused response is open', async () => {
  const originalMatchMedia = window.matchMedia;
  try {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    render(
      <MemoryRouter>
        <header data-testid="case-header">Case header</header>
        <main>
          <aside data-testid="case-context">Case context</aside>
          <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
        </main>
      </MemoryRouter>
    );

    const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
    await waitFor(() => expect(cue).toBeEnabled());
    fireEvent.click(cue);
    expect(screen.getByTestId('case-context')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('case-context').inert).toBe(true);
    expect(screen.getByTestId('case-header')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close response' }));
    expect(screen.getByTestId('case-context')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByTestId('case-context').inert).not.toBe(true);
    expect(screen.getByTestId('case-header')).not.toHaveAttribute('aria-hidden');
  } finally {
    window.matchMedia = originalMatchMedia;
  }
});

it('restores the exact private return question', async () => {
  getJudgmentResponseThread.mockResolvedValue({
    observation: { baseClaim: 'Margins can keep compounding.', criterionSnapshot: {} },
    draft: { ...review, version: 2, response: 'uncertain', returnQuestion: 'Did renewal rates hold?' }
  });
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  expect(await screen.findByText('Pick up: Did renewal rates hold?')).toBeInTheDocument();
});

it('returns a paused response to its valid last field and caret', async () => {
  getJudgmentResponseThread.mockResolvedValue({
    observation: { baseClaim: 'Margins can keep compounding.', criterionSnapshot: {} },
    draft: {
      version: 2,
      response: 'uncertain',
      reason: 'Check renewal cohorts',
      returnQuestion: 'Did renewal rates hold?',
      activeField: 'reason',
      caretOffset: 5
    }
  });
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /pick up: did renewal rates hold/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);

  const reason = screen.getByLabelText('Why?');
  expect(reason).toHaveFocus();
  expect(reason.selectionStart).toBe(5);
  expect(reason).toHaveValue('Check renewal cohorts');
});

it('keeps the original test beside a newer current test', async () => {
  getJudgmentResponseThread.mockResolvedValue({
    observation: {
      baseClaim: 'Margins can keep compounding.',
      criterionSnapshot: { text: 'Membership income stops growing.' },
      currentCriterion: { text: 'Renewal falls below 88%.' },
      sourceEventId: 'event-1',
      sourceLabel: 'COST 10-Q'
    },
    draft: null
  });
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);

  expect(screen.getByText('Membership income stops growing.')).toBeInTheDocument();
  expect(screen.getByText('Renewal falls below 88%.')).toBeInTheDocument();
  expect(screen.getByText('This observation remains tied to the earlier test.')).toBeInTheDocument();
  expect(screen.getByText(/exact accepted source event is retained/i)).toBeInTheDocument();
});

it('walks recorded common origin to an exact account and back one level at a time', async () => {
  getJudgmentResponseThread.mockResolvedValue({
    observation: {
      baseClaim: 'Margins can keep compounding.',
      criterionSnapshot: { text: 'Membership income stops growing.' },
      sourceEventId: 'event-origin',
      sourceLabel: 'Session notes',
      lineage: {
        state: 'accepted',
        proposals: [],
        families: [{
          familyId: 'family-1',
          label: 'the same eight sessions',
          documentCount: 2,
          partial: false,
          unavailableCount: 0,
          accounts: [{
            sourceEventId: 'event-origin',
            role: 'origin',
            title: 'Original session notes',
            excerpt: 'Eight readers attempted the return path.',
            observedAt: '2026-09-01T09:00:00.000Z'
          }, {
            sourceEventId: 'event-summary',
            role: 'derivative',
            title: 'Edited research summary',
            summary: 'A second account of the sessions.'
          }]
        }]
      }
    },
    draft: null
  });
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);
  fireEvent.click(await screen.findByRole('button', { name: '2 documents · the same eight sessions' }));

  expect(await screen.findByRole('heading', { name: 'The accounts of this observation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Original session notes/ }));
  expect(await screen.findByText('Eight readers attempted the return path.')).toBeInTheDocument();
  expect(screen.getByText('Observed')).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(await screen.findByRole('heading', { name: 'The accounts of this observation' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(await screen.findByText('What do you make of it?')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('keeps proposed lineage distinct until the owner accepts it', async () => {
  const proposed = {
    observation: {
      baseClaim: 'Margins can keep compounding.',
      criterionSnapshot: {},
      sourceEventId: 'event-origin',
      sourceLabel: 'Session notes',
      lineage: {
        state: 'proposed',
        families: [],
        proposals: [{ familyId: 'proposal-1', version: 0, label: 'possibly the same interview', documentCount: 2, accounts: [] }]
      }
    },
    draft: null
  };
  getJudgmentResponseThread
    .mockResolvedValueOnce(proposed)
    .mockResolvedValueOnce({
      ...proposed,
      observation: {
        ...proposed.observation,
        lineage: { state: 'accepted', proposals: [], families: [{ ...proposed.observation.lineage.proposals[0], status: 'accepted' }] }
      }
    });
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);
  expect(await screen.findByRole('button', { name: 'A common origin has been proposed' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /2 documents/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'A common origin has been proposed' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Keep common origin' }));
  await waitFor(() => expect(reviewObservationLineage).toHaveBeenCalledWith({
    familyId: 'proposal-1', expectedVersion: 0, action: 'accept'
  }));
  expect(await screen.findByRole('heading', { name: 'The accounts of this observation' })).toBeInTheDocument();
});

it('keeps typing that happens while an autosave is in flight', async () => {
  let finishFirstSave;
  saveJudgmentResponseThread
    .mockImplementationOnce(() => new Promise(resolve => { finishFirstSave = resolve; }))
    .mockImplementation(async payload => ({
      draft: { ...payload, version: (payload.expectedVersion || 0) + 1 },
      observation: { baseClaim: 'Margins can keep compounding.' }
    }));
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={review} />
    </MemoryRouter>
  );
  const cue = await screen.findByRole('button', { name: /the 10-q changed/i });
  await waitFor(() => expect(cue).toBeEnabled());
  fireEvent.click(cue);
  const reason = screen.getByLabelText('Why?');
  fireEvent.change(reason, { target: { value: 'First thought' } });
  await waitFor(() => expect(saveJudgmentResponseThread).toHaveBeenCalledTimes(1), { timeout: 1500 });
  fireEvent.change(reason, { target: { value: 'A better thought' } });
  finishFirstSave({
    draft: { reason: 'First thought', version: 1 },
    observation: { baseClaim: 'Margins can keep compounding.' }
  });
  await waitFor(() => expect(reason).toHaveValue('A better thought'));
  await waitFor(() => expect(saveJudgmentResponseThread).toHaveBeenCalledTimes(2), { timeout: 1500 });
  expect(saveJudgmentResponseThread.mock.calls[1][0]).toEqual(expect.objectContaining({
    reason: 'A better thought',
    expectedVersion: 1
  }));
});

it('renders nothing after the review is resolved', () => {
  const { container } = render(
    <MemoryRouter>
      <DossierResearchReview pageId="507f1f77bcf86cd799439011" review={{ ...review, status: 'completed' }} />
    </MemoryRouter>
  );
  expect(container).toBeEmptyDOMElement();
});
