import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionShareModal from './QuestionShareModal';
import { questionSnapshot } from '../thinkShareFixture';

jest.mock('../../../api/questions', () => ({
  getQuestionShare: jest.fn(),
  interpretQuestionContribution: jest.fn(),
  mintQuestionShare: jest.fn(),
  placeQuestionContribution: jest.fn(),
  revokeQuestionShare: jest.fn(),
  saveQuestionShareBrief: jest.fn(),
  updateQuestionShare: jest.fn(),
  beatQuestionPresence: jest.fn(),
  getQuestionPresence: jest.fn()
}));

const {
  getQuestionShare,
  interpretQuestionContribution,
  mintQuestionShare,
  placeQuestionContribution,
  revokeQuestionShare,
  saveQuestionShareBrief,
  updateQuestionShare,
  beatQuestionPresence,
  getQuestionPresence
} = require('../../../api/questions');

const frozen = questionSnapshot();
const pending = questionSnapshot({
  publishedAt: undefined,
  question: {
    ...questionSnapshot().question,
    text: 'What survives the rewrite?',
    paragraphs: [{ id: 'p1', type: 'paragraph', text: 'Rewritten in the workshop.' }]
  }
});

describe('QuestionShareModal', () => {
  beforeEach(() => {
    getQuestionShare.mockReset();
    interpretQuestionContribution.mockReset();
    mintQuestionShare.mockReset();
    placeQuestionContribution.mockReset();
    revokeQuestionShare.mockReset();
    saveQuestionShareBrief.mockReset();
    updateQuestionShare.mockReset();
    beatQuestionPresence.mockReset();
    getQuestionPresence.mockReset();
    beatQuestionPresence.mockResolvedValue({ present: true });
    getQuestionPresence.mockResolvedValue({});
    window.confirm = jest.fn(() => true);
  });

  it('mints a share link with the preview hash', async () => {
    getQuestionShare.mockResolvedValueOnce({
      shared: false,
      publishable: true,
      currentHash: 'hash-1',
      preview: pending
    });
    mintQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'newslug',
      snapshot: frozen,
      preview: pending,
      currentHash: 'hash-1'
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    await waitFor(() => expect(getQuestionShare).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create public link' }));
    await waitFor(() => expect(mintQuestionShare).toHaveBeenCalledWith('q1', { previewHash: 'hash-1' }));
    expect(await screen.findByTestId('question-share-preview')).toHaveTextContent('What survives compounding?');
  });

  it('names the frozen snapshot as what a reader will see when the workshop moved', async () => {
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      stale: true,
      snapshot: frozen,
      preview: pending,
      currentHash: 'hash-2'
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-preview')).toHaveTextContent('What survives compounding?');
    expect(screen.getByTestId('question-share-pending')).toHaveTextContent('Rewritten in the workshop.');
    expect(screen.getByTestId('question-update-share')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
  });

  it('shows a later reading in the compact preview, not as a private letter', async () => {
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [{
        id: 'c1',
        by: 'Mara',
        text: 'Same fact, different time horizon.',
        remainder: 'Who pays when the window closes?'
      }]
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-preview')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('Still holds: Who pays when the window closes?');
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('How you take this')).toBeInTheDocument();
    expect(screen.getByText('The reading stays. This sits beside it.')).toBeInTheDocument();
  });

  it('keeps a contributor held reading off the compact preview', async () => {
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: {
        ...frozen,
        yours: [{
          id: 'c9',
          by: 'Mara',
          text: 'Same fact, different time horizon.'
        }]
      },
      preview: frozen,
      contributions: []
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-preview')).toBeInTheDocument();
    expect(screen.getByTestId('question-share-preview')).not.toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByText('With the author')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take this back' })).not.toBeInTheDocument();
  });

  it('keeps a waiting reading off the compact preview until the owner places it', async () => {
    const reading = {
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?'
    };
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [],
      waiting: [reading]
    });
    placeQuestionContribution.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [reading]
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-waiting')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByTestId('question-share-preview')).not.toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
    expect(screen.getByText('It is not on the page yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('What holds')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Let this sit beside the question' }));
    await waitFor(() => expect(placeQuestionContribution).toHaveBeenCalledWith('q1', 'c1'));
    expect(await screen.findByTestId('question-share-preview')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByTestId('question-share-waiting')).not.toBeInTheDocument();
    expect(screen.getByLabelText('How you take this')).toBeInTheDocument();
  });

  it('saves how the owner takes a reading without replacing it', async () => {
    const reading = {
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      updatedAt: '2026-09-13T17:00:00.000Z'
    };
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [reading]
    });
    interpretQuestionContribution.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [{
        ...reading,
        interpretation: 'The horizon is the claim, not the fact.',
        interpretedBy: 'Athan'
      }]
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByLabelText('How you take this')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('How you take this'), {
      target: { value: 'The horizon is the claim, not the fact.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save how you take it' }));
    await waitFor(() => expect(interpretQuestionContribution).toHaveBeenCalledWith('q1', 'c1', {
      interpretation: 'The horizon is the claim, not the fact.',
      updatedAt: '2026-09-13T17:00:00.000Z'
    }));
    expect(await screen.findByTestId('question-share-preview')).toHaveTextContent(
      'Athan — Not quite: The horizon is the claim, not the fact.'
    );
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('Still holds: Who pays when the window closes?');
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
  });

  it('names a withdrawn reading instead of pretending the place failed', async () => {
    const reading = {
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.'
    };
    getQuestionShare
      .mockResolvedValueOnce({
        shared: true,
        slug: 'abc123',
        snapshot: frozen,
        preview: frozen,
        contributions: [],
        waiting: [reading]
      })
      .mockResolvedValueOnce({
        shared: true,
        slug: 'abc123',
        snapshot: frozen,
        preview: frozen,
        contributions: [],
        waiting: []
      });
    placeQuestionContribution.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'They took this back.', field: 'withdrawn' }
      }
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-waiting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Let this sit beside the question' }));
    expect(await screen.findByTestId('question-share-conflict')).toHaveTextContent('They took this back.');
    expect(screen.queryByTestId('question-share-waiting')).not.toBeInTheDocument();
    expect(screen.getByTestId('question-share-preview')).not.toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByText('That reading did not sit beside the question.')).not.toBeInTheDocument();
    expect(getQuestionShare).toHaveBeenCalledTimes(2);
  });

  it('keeps the original take when a later save arrives stale', async () => {
    const reading = {
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      interpretation: 'The horizon is the claim, not the fact.',
      interpretedBy: 'Athan',
      updatedAt: '2026-09-13T17:00:00.000Z'
    };
    getQuestionShare
      .mockResolvedValueOnce({
        shared: true,
        slug: 'abc123',
        snapshot: frozen,
        preview: frozen,
        contributions: [reading]
      })
      .mockResolvedValueOnce({
        shared: true,
        slug: 'abc123',
        snapshot: frozen,
        preview: frozen,
        contributions: [{
          ...reading,
          interpretation: 'The horizon is still the claim.',
          updatedAt: '2026-09-13T17:05:00.000Z'
        }]
      });
    interpretQuestionContribution.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'This take was already changed.', field: 'updatedAt' }
      }
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByLabelText('How you take this')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('How you take this'), {
      target: { value: 'A later overwrite.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save how you take it' }));
    expect(await screen.findByTestId('question-share-conflict')).toHaveTextContent('This take was already changed.');
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent(
      'Athan — Not quite: The horizon is still the claim.'
    );
    expect(screen.queryByText('That take did not save.')).not.toBeInTheDocument();
    expect(getQuestionShare).toHaveBeenCalledTimes(2);
  });

  it('saves a brief beside placed readings without inventing consensus', async () => {
    const reading = {
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?'
    };
    const brief = {
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'The window may close before compounding pays.',
      observation: 'Watch who is still in the room when the cost arrives.',
      by: 'Athan'
    };
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [reading],
      brief: { agreement: '', remainder: '', observation: '', by: 'Athan' }
    });
    saveQuestionShareBrief.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [reading],
      brief
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-brief-form')).toBeInTheDocument();
    expect(screen.queryByTestId('question-share-brief')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What holds'), {
      target: { value: 'The fact is shared. The horizon is not.' }
    });
    fireEvent.change(screen.getByLabelText('What you still hold'), {
      target: { value: 'The window may close before compounding pays.' }
    });
    fireEvent.change(screen.getByLabelText('What could move this'), {
      target: { value: 'Watch who is still in the room when the cost arrives.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save this brief' }));
    await waitFor(() => expect(saveQuestionShareBrief).toHaveBeenCalledWith('q1', {
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'The window may close before compounding pays.',
      observation: 'Watch who is still in the room when the cost arrives.'
    }));
    expect(await screen.findByTestId('question-share-brief')).toHaveTextContent('The fact is shared. The horizon is not.');
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByText('Consensus is optional. Empty stays off the page.')).toBeInTheDocument();
  });

  it('names who else is at the door outside the compact preview', async () => {
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [{
        id: 'c1',
        by: 'Mara',
        text: 'Same fact, different time horizon.'
      }],
      here: [{ by: 'Mara' }]
    });
    beatQuestionPresence.mockResolvedValue({ present: true, here: [{ by: 'Mara' }] });
    getQuestionPresence.mockResolvedValue({ here: [{ by: 'Mara' }] });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-presence')).toHaveTextContent('Mara is here.');
    expect(screen.getByTestId('question-share-preview')).not.toHaveTextContent('Mara is here.');
  });
});
