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
  withdrawQuestionContribution: jest.fn(),
  beatQuestionPresence: jest.fn(),
  getQuestionPresence: jest.fn()
}));

jest.mock('../components/agent/ThoughtPartnerPanel', () => ({
  __esModule: true,
  default: (props) => (
    <aside data-testid="thought-partner-panel">
      {props.subtitle}:{props.contextType}:{props.contextId}
    </aside>
  )
}));

const {
  getPublicQuestion,
  offerQuestionContribution,
  withdrawQuestionContribution,
  beatQuestionPresence,
  getQuestionPresence
} = require('../api/questions');

describe('SharedQuestion', () => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;

  beforeEach(() => {
    getPublicQuestion.mockReset();
    offerQuestionContribution.mockReset();
    withdrawQuestionContribution.mockReset();
    beatQuestionPresence.mockReset();
    getQuestionPresence.mockReset();
    beatQuestionPresence.mockResolvedValue({ present: false });
    getQuestionPresence.mockResolvedValue({});
    window.localStorage.removeItem('token');
  });

  afterEach(() => {
    if (token == null) window.localStorage.removeItem('token');
    else window.localStorage.setItem('token', token);
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

  it('closes the public page with a brief, not a debate score', async () => {
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
        remainder: 'Who pays when the window closes?'
      }],
      brief: {
        agreement: 'The fact is shared. The horizon is not.',
        remainder: 'The window may close before compounding pays.',
        observation: 'Watch who is still in the room when the cost arrives.',
        by: 'Athan'
      }
    });

    render(<SharedQuestion />);
    expect(await screen.findByTestId('question-share-brief')).toHaveTextContent('What holds');
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('The fact is shared. The horizon is not.');
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('Athan still holds');
    expect(screen.getByTestId('question-share-readings')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByRole('button', { name: 'Save this brief' })).not.toBeInTheDocument();
  });

  it('opens a successor at the last unresolved question on the public page', async () => {
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
        remainder: 'Who pays when the window closes?'
      }],
      brief: {
        agreement: 'The fact is shared. The horizon is not.',
        remainder: 'The window may close before compounding pays.',
        observation: 'Watch who is still in the room when the cost arrives.',
        by: 'Athan'
      },
      succession: {
        unresolved: 'The window may close before compounding pays.',
        alternatives: [{
          id: 'c1',
          by: 'Mara',
          text: 'Same fact, different time horizon.',
          remainder: 'Who pays when the window closes?'
        }],
        evidenceThen: {
          text: 'What survives compounding?',
          paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
        },
        authority: 'Athan',
        review: 'Watch who is still in the room when the cost arrives.',
        held: 'The fact is shared. The horizon is not.',
        outcome: 'The window closed. The latecomer paid.',
        handedAt: '2026-09-13T18:00:00.000Z'
      }
    });

    render(<SharedQuestion />);
    expect(await screen.findByRole('heading', { level: 1, name: 'The window may close before compounding pays.' })).toBeInTheDocument();
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('The window closed. The latecomer paid.');
    expect(screen.getByTestId('question-share-archive')).toHaveTextContent('What we nearly did');
    expect(screen.getByTestId('question-share-archive')).toHaveTextContent('The other future is not in this record.');
    expect(screen.queryByRole('heading', { name: 'What survives compounding?' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-share-brief')).not.toBeInTheDocument();
  });

  it('names an agent assignment on the public page and pauses the companion when it lapses', async () => {
    window.localStorage.setItem('token', 'reader-token');
    getPublicQuestion.mockResolvedValueOnce({
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      },
      mandate: {
        owner: 'Athan',
        scope: 'This published question.',
        tools: 'Ask about this published question (the public page only).',
        budget: { asks: 3, remaining: 0, spent: 3 },
        stop: 'Stop when the successor writes what happened later.',
        review: 'Return to this door to end or renew the assignment.',
        status: 'paused',
        pause: 'This assignment ended. The agent is paused.'
      }
    });

    render(<SharedQuestion />);
    expect(await screen.findByTestId('question-share-mandate')).toHaveTextContent('Accountable owner');
    expect(screen.getByTestId('question-share-mandate')).toHaveTextContent('This published question.');
    expect(screen.getByTestId('shared-question-companion')).toHaveTextContent(
      'This assignment ended. The agent is paused.'
    );
    expect(screen.queryByRole('button', { name: 'Ask about this reading' })).not.toBeInTheDocument();
  });

  it('names who else is at the door and stays silent when nobody is', async () => {
    getPublicQuestion.mockResolvedValueOnce({
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      },
      here: [{ by: 'Mara' }]
    });
    getQuestionPresence.mockResolvedValue({ here: [{ by: 'Mara' }] });

    render(<SharedQuestion />);
    expect(await screen.findByTestId('question-share-presence')).toHaveTextContent('Mara is here.');
  });

  it('lets a signed-in reader ask about the published door, not the Library', async () => {
    window.localStorage.setItem('token', 'reader-token');
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
        text: 'Same fact, different time horizon.'
      }],
      yours: [{
        id: 'held',
        by: 'Ada',
        text: 'Still with the author.'
      }]
    });

    render(<SharedQuestion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask about this reading' }));
    expect(screen.getByTestId('thought-partner-panel')).toHaveTextContent('shared_question:qslug123');
    expect(screen.getByTestId('thought-partner-panel')).toHaveTextContent("Bound to this published question and Mara's reading.");
    expect(screen.getByTestId('shared-question-companion')).not.toHaveTextContent('Ada');
    expect(screen.getByTestId('shared-question-companion')).not.toHaveTextContent('Still with the author.');
  });

  it('keeps the companion off the page for an unsigned visitor', async () => {
    getPublicQuestion.mockResolvedValueOnce({
      ownerDisplayName: 'Athan',
      publishedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    });

    render(<SharedQuestion />);
    await screen.findByRole('heading', { level: 1, name: 'What survives compounding?' });
    expect(screen.queryByTestId('shared-question-companion')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask about this reading' })).not.toBeInTheDocument();
  });
});
