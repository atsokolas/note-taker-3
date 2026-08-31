import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JudgmentMirror from './JudgmentMirror';
import { getJudgmentMirror } from '../api/judgmentResolution';

jest.mock('../api/judgmentResolution', () => ({ getJudgmentMirror: jest.fn() }));

test('renders a calm, honest mirror without gamification or invented response time', async () => {
  getJudgmentMirror.mockResolvedValue({
    metrics: {
      claimsHeld: 3,
      averageHoldDays: 42,
      revisionRate: 0.33,
      verdictRecord: { held_up: 1, broke: 0, partly: 0, unresolvable: 0 },
      counterevidenceResponseDays: null
    },
    coverage: { storedBirthDates: 2, totalClaims: 3, responseTimeClaims: 0 },
    due: [],
    verdicts: []
  });
  render(<MemoryRouter><JudgmentMirror /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'The Mirror' })).toBeInTheDocument();
  expect(screen.getByText('42 days')).toBeInTheDocument();
  expect(screen.getByText('No verdicts yet. The Mirror is allowed to be empty.')).toBeInTheDocument();
  expect(screen.getByText(/counterevidence response time stays blank/i)).toBeInTheDocument();
});
