jest.mock('react-router-dom', () => ({
  Link: ({ to, children, className, ...rest }) =>
    // eslint-disable-next-line jsx-a11y/anchor-is-valid
    <a href={typeof to === 'string' ? to : '#'} className={className} {...rest}>{children}</a>,
  useParams: () => ({ slug: 'qslug123' })
}), { virtual: true });

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SharedQuestion from './SharedQuestion';

jest.mock('../api/questions', () => ({
  getPublicQuestion: jest.fn(),
  offerQuestionContribution: jest.fn()
}));

const { getPublicQuestion, offerQuestionContribution } = require('../api/questions');

describe('SharedQuestion', () => {
  beforeEach(() => {
    getPublicQuestion.mockReset();
    offerQuestionContribution.mockReset();
  });

  it('renders public question content without auth chrome', async () => {
    getPublicQuestion.mockResolvedValueOnce({
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        conceptName: 'Compounding',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    });

    render(<SharedQuestion />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'What survives compounding?' })).toBeInTheDocument());
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText(/This is the version that was published/)).toBeInTheDocument();
    expect(screen.getByTestId('shared-question-topbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offer a reading' })).toBeInTheDocument();
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
  });

  it('offers a reading and keeps it beside the question', async () => {
    const published = {
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    };
    const together = {
      ...published,
      contributions: [{
        id: 'c1',
        by: 'Mara',
        text: 'Same fact, different time horizon.',
        remainder: 'Who pays when the window closes?'
      }]
    };
    let offered = false;
    getPublicQuestion.mockImplementation(async () => (offered ? together : published));
    offerQuestionContribution.mockImplementation(async () => {
      offered = true;
      return { sent: true };
    });

    render(<SharedQuestion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Offer a reading' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mara' } });
    fireEvent.change(screen.getByLabelText('What you bring'), {
      target: { value: 'Same fact, different time horizon.' }
    });
    fireEvent.change(screen.getByLabelText('What you still hold'), {
      target: { value: 'Who pays when the window closes?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Offer this reading' }));

    await waitFor(() => expect(offerQuestionContribution).toHaveBeenCalledWith('qslug123', {
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?'
    }));
    await waitFor(() => {
      expect(screen.getByTestId('question-share-readings')).toHaveTextContent('Same fact, different time horizon.');
      expect(screen.getByText('Still holds: Who pays when the window closes?')).toBeInTheDocument();
      expect(screen.getByText('It is on this page, beside the question.')).toBeInTheDocument();
    });
  });
});
