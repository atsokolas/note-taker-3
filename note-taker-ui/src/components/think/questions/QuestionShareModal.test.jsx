import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionShareModal from './QuestionShareModal';
import { questionSnapshot } from '../thinkShareFixture';

jest.mock('../../../api/questions', () => ({
  getQuestionShare: jest.fn(),
  mintQuestionShare: jest.fn(),
  revokeQuestionShare: jest.fn(),
  updateQuestionShare: jest.fn()
}));

const {
  getQuestionShare,
  mintQuestionShare,
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
    mintQuestionShare.mockReset();
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
  });
});
