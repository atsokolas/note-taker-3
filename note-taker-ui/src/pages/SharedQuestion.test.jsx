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
  offerQuestionContribution: jest.fn(),
  withdrawQuestionContribution: jest.fn()
}));

const { getPublicQuestion, offerQuestionContribution, withdrawQuestionContribution } = require('../api/questions');

describe('SharedQuestion', () => {
  beforeEach(() => {
    getPublicQuestion.mockReset();
    offerQuestionContribution.mockReset();
    withdrawQuestionContribution.mockReset();
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

  it('offers a reading that stays off the page until the author places it', async () => {
    const published = {
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    };
    getPublicQuestion.mockResolvedValue(published);
    offerQuestionContribution.mockResolvedValue({ sent: true });

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
      expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
      expect(screen.getByText('It is with the author. It is not on the page yet.')).toBeInTheDocument();
    });
  });

  it('shows how the owner takes a reading without inviting a take on the public page', async () => {
    getPublicQuestion.mockResolvedValueOnce({
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      },
      contributions: [{
        id: 'c1',
        by: 'Mara',
        text: 'Same fact, different time horizon.',
        remainder: 'Who pays when the window closes?',
        interpretation: 'The horizon is the claim, not the fact.',
        interpretedBy: 'Athan'
      }]
    });

    render(<SharedQuestion />);
    expect(await screen.findByText('Same fact, different time horizon.')).toBeInTheDocument();
    expect(screen.getByText('Athan — Not quite: The horizon is the claim, not the fact.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offer a reading' })).toBeInTheDocument();
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
  });

  it('lets a signed-in offerer see their held reading without publishing it', async () => {
    const published = {
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    };
    getPublicQuestion
      .mockResolvedValueOnce(published)
      .mockResolvedValueOnce({
        ...published,
        yours: [{
          id: 'c1',
          by: 'Mara',
          text: 'Same fact, different time horizon.',
          remainder: 'Who pays when the window closes?'
        }]
      });
    offerQuestionContribution.mockResolvedValue({ sent: true });

    render(<SharedQuestion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Offer a reading' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mara' } });
    fireEvent.change(screen.getByLabelText('What you bring'), {
      target: { value: 'Same fact, different time horizon.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Offer this reading' }));

    expect(await screen.findByTestId('question-share-yours')).toHaveTextContent('With the author');
    expect(screen.getByTestId('question-share-yours')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
    expect(screen.getByText('It is with the author. It is not on the page yet.')).toBeInTheDocument();
  });

  it('lets a signed-in offerer take a held reading back while the door stays open', async () => {
    const published = {
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    };
    getPublicQuestion
      .mockResolvedValueOnce({
        ...published,
        yours: [{
          id: 'c1',
          by: 'Mara',
          text: 'Same fact, different time horizon.',
          remainder: 'Who pays when the window closes?'
        }]
      })
      .mockResolvedValueOnce(published);
    withdrawQuestionContribution.mockResolvedValue({ withdrawn: true });

    render(<SharedQuestion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Take this back' }));
    await waitFor(() => expect(withdrawQuestionContribution).toHaveBeenCalledWith('qslug123', 'c1'));
    await waitFor(() => expect(screen.queryByTestId('question-share-yours')).not.toBeInTheDocument());
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offer a reading' })).toBeInTheDocument();
  });
});
