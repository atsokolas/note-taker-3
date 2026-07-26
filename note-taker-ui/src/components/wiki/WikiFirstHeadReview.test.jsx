import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiFirstHeadReview from './WikiFirstHeadReview';
import {
  adoptWikiCurrentResearchHead,
  getWikiFirstHeadCandidate,
  reviewWikiFirstHeadCandidate
} from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  adoptWikiCurrentResearchHead: jest.fn(),
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

test('adopts an exact legacy head only after owner confirmation', async () => {
  const legacyPage = {
    aiState: { candidateStatus: 'idle' },
    investmentDossier: { version: 2 },
    judgment: { currentJudgment: 'The moat is real, but the price remains demanding.' },
    wordCount: 2500,
    claimCount: 30,
    sourceCount: 10
  };
  adoptWikiCurrentResearchHead.mockResolvedValue({
    page: {
      ...legacyPage,
      investmentDossier: { version: 2, firstHead: { status: 'accepted' } }
    },
    receipt: { title: 'Adopted', summary: 'No content changed.' }
  });
  const onPageUpdate = jest.fn();
  render(<WikiFirstHeadReview page={legacyPage} pageId="page-legacy" onPageUpdate={onPageUpdate} />);

  const adopt = screen.getByRole('button', { name: 'Adopt current head' });
  expect(adopt).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(adopt);

  await waitFor(() => expect(adoptWikiCurrentResearchHead).toHaveBeenCalledWith('page-legacy'));
  expect(onPageUpdate).toHaveBeenCalled();
});

test('blocks legacy adoption until the owner records a judgment', () => {
  render(<WikiFirstHeadReview
    page={{
      aiState: { candidateStatus: 'idle' },
      investmentDossier: { version: 2 },
      judgment: { currentJudgment: '' },
      wordCount: 2900,
      claimCount: 31,
      sourceCount: 9
    }}
    pageId="page-costco"
  />);

  expect(screen.getByText(/Record your actual current judgment/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Adopt current head' })).not.toBeInTheDocument();
});
