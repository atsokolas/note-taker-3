import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiFirstHeadReview from './WikiFirstHeadReview';
import {
  getWikiFirstHeadCandidate,
  reviewWikiFirstHeadCandidate
} from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  getWikiFirstHeadCandidate: jest.fn(),
  reviewWikiFirstHeadCandidate: jest.fn()
}));

jest.mock('../../system/SystemStatusContext', () => ({
  useSystemStatusControls: () => ({
    clearRecoverableFailure: jest.fn(),
    setBackgroundWork: jest.fn(),
    setLatestReceipt: jest.fn(),
    setRecoverableFailure: jest.fn()
  })
}));

const page = {
  aiState: {
    candidateStatus: 'awaiting_first_head_acceptance',
    firstHeadCandidateSummary: { wordCount: 800, claimCount: 12, sourceCount: 5 }
  },
  investmentDossier: { version: 2 }
};

beforeEach(() => {
  jest.clearAllMocks();
  getWikiFirstHeadCandidate.mockResolvedValue({
    kind: 'first_head',
    summary: page.aiState.firstHeadCandidateSummary,
    candidate: {
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Candidate research body.' }] }]
      }
    }
  });
});

test('requires review confirmation before accepting the exact candidate', async () => {
  reviewWikiFirstHeadCandidate.mockResolvedValue({
    page: { ...page, aiState: { candidateStatus: 'accepted' } },
    receipt: { title: 'Accepted', summary: 'Trusted head accepted.' }
  });
  const onPageUpdate = jest.fn();
  render(<WikiFirstHeadReview page={page} pageId="page-1" onPageUpdate={onPageUpdate} />);

  expect(await screen.findByText('Candidate research body.')).toBeInTheDocument();
  const accept = screen.getByRole('button', { name: 'Accept trusted head' });
  expect(accept).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(accept);

  await waitFor(() => expect(reviewWikiFirstHeadCandidate).toHaveBeenCalledWith('page-1', 'accept'));
  expect(onPageUpdate).toHaveBeenCalled();
});

test('supports rejecting a maintenance candidate without acceptance confirmation', async () => {
  const maintenancePage = {
    ...page,
    aiState: {
      candidateStatus: 'awaiting_maintenance_acceptance',
      maintenanceCandidateSummary: { wordCount: 900, claimCount: 13, sourceCount: 6 }
    }
  };
  getWikiFirstHeadCandidate.mockResolvedValue({
    kind: 'maintenance',
    summary: maintenancePage.aiState.maintenanceCandidateSummary,
    candidate: { body: { type: 'doc', content: [{ type: 'paragraph' }] } }
  });
  reviewWikiFirstHeadCandidate.mockResolvedValue({ page: maintenancePage, receipt: {} });
  render(<WikiFirstHeadReview page={maintenancePage} pageId="page-1" />);

  const reject = await screen.findByRole('button', { name: 'Reject draft' });
  fireEvent.click(reject);
  await waitFor(() => expect(reviewWikiFirstHeadCandidate).toHaveBeenCalledWith('page-1', 'reject'));
});
