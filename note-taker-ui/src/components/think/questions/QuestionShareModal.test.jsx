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
  updateQuestionShare: jest.fn()
}));

const {
  getQuestionShare,
  interpretQuestionContribution,
  mintQuestionShare,
  placeQuestionContribution,
  revokeQuestionShare,
  updateQuestionShare
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
    updateQuestionShare.mockReset();
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
      remainder: 'Who pays when the window closes?'
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
      interpretation: 'The horizon is the claim, not the fact.'
    }));
    expect(await screen.findByTestId('question-share-preview')).toHaveTextContent(
      'Athan — Not quite: The horizon is the claim, not the fact.'
    );
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('Still holds: Who pays when the window closes?');
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
  });
});
