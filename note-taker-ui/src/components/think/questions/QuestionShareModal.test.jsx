import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionShareModal from './QuestionShareModal';

jest.mock('../../../api/questions', () => ({
  getQuestionShare: jest.fn(),
  mintQuestionShare: jest.fn(),
  revokeQuestionShare: jest.fn()
}));

const { getQuestionShare, mintQuestionShare, revokeQuestionShare } = require('../../../api/questions');

describe('QuestionShareModal', () => {
  beforeEach(() => {
    getQuestionShare.mockReset();
    mintQuestionShare.mockReset();
    revokeQuestionShare.mockReset();
    window.confirm = jest.fn(() => true);
  });

  it('shows the public share receipt when a link is active', async () => {
    getQuestionShare.mockResolvedValueOnce({ shared: true, slug: 'abc123' });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Public page ready: citations included, private source notes withheld\./)).toBeInTheDocument());
  });

  it('mints a share link', async () => {
    getQuestionShare.mockResolvedValueOnce({ shared: false });
    mintQuestionShare.mockResolvedValueOnce({ slug: 'newslug' });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    await waitFor(() => expect(getQuestionShare).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create public link' }));
    await waitFor(() => expect(mintQuestionShare).toHaveBeenCalledWith('q1'));
  });
});
