import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JudgmentResolution from './JudgmentResolution';
import { recordJudgmentVerdict, setJudgmentResolution } from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  recordJudgmentVerdict: jest.fn(),
  setJudgmentResolution: jest.fn()
}));

test('sets a human test against the exact held sentence', async () => {
  setJudgmentResolution.mockResolvedValue({ judgment: { resolutionCriteria: 'Revenue falls.' } });
  const saved = jest.fn();
  render(<JudgmentResolution pageId="page-1" claim="The claim." judgment={{ verdicts: [] }} onSaved={saved} />);
  fireEvent.click(screen.getByRole('button', { name: /what would change your mind/i }));
  fireEvent.change(screen.getByLabelText(/i would change my mind if/i), { target: { value: 'Revenue falls.' } });
  fireEvent.click(screen.getByRole('button', { name: /set the test/i }));
  await waitFor(() => expect(setJudgmentResolution).toHaveBeenCalledWith(expect.objectContaining({
    pageId: 'page-1', expectedClaim: 'The claim.', criteria: 'Revenue falls.'
  })));
  expect(saved).toHaveBeenCalled();
});

test('records one of four verdicts and shows the inked result', async () => {
  recordJudgmentVerdict.mockResolvedValue({
    artifact: { verdictId: 'verdict-1' },
    judgment: {
      resolutionCriteria: 'Revenue falls.',
      verdicts: [{ verdictId: 'verdict-1', result: 'partly', recordedAt: '2026-08-31T12:00:00Z' }]
    }
  });
  const { rerender } = render(<JudgmentResolution
    pageId="page-1"
    claim="The claim."
    judgment={{ resolutionCriteria: 'Revenue falls.', verdicts: [] }}
  />);
  fireEvent.click(screen.getByRole('button', { name: /record what happened/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Partly' }));
  fireEvent.click(screen.getByRole('button', { name: /record it/i }));
  await waitFor(() => expect(recordJudgmentVerdict).toHaveBeenCalledWith(expect.objectContaining({
    expectedClaim: 'The claim.', result: 'partly'
  })));
  rerender(<JudgmentResolution
    pageId="page-1"
    claim="The claim."
    judgment={{
      resolutionCriteria: 'Revenue falls.',
      verdicts: [{ verdictId: 'verdict-1', result: 'partly', recordedAt: '2026-08-31T12:00:00Z' }]
    }}
  />);
  expect(screen.getByText('Partly')).toBeInTheDocument();
});
