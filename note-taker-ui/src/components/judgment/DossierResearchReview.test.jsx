import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DossierResearchReview from './DossierResearchReview';
import {
  getJudgmentResponseThread,
  saveJudgmentResponseThread
} from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  getJudgmentResponseThread: jest.fn(),
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
