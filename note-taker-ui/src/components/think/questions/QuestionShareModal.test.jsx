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
  saveQuestionShareMandate: jest.fn(),
  saveQuestionShareSuccession: jest.fn(),
  importQuestionShareRecords: jest.fn(),
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
  saveQuestionShareMandate,
  saveQuestionShareSuccession,
  importQuestionShareRecords,
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
    saveQuestionShareMandate.mockReset();
    saveQuestionShareSuccession.mockReset();
    importQuestionShareRecords.mockReset();
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

  it('hands the closed brief to a successor and opens the preview at the unresolved question', async () => {
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
    const succession = {
      unresolved: 'The window may close before compounding pays.',
      alternatives: [reading],
      evidenceThen: {
        text: 'What survives compounding?',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'Time plus reinvestment beats picking once.' }]
      },
      authority: 'Athan',
      review: 'Watch who is still in the room when the cost arrives.',
      held: 'The fact is shared. The horizon is not.',
      handedAt: '2026-09-13T18:00:00.000Z'
    };
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [reading],
      brief
    });
    saveQuestionShareSuccession.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      contributions: [reading],
      brief,
      succession: {
        ...succession,
        outcome: 'The window closed. The latecomer paid.'
      }
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-succession-form')).toBeInTheDocument();
    expect(screen.queryByTestId('question-share-succession')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What happened later'), {
      target: { value: 'The window closed. The latecomer paid.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hand this on' }));
    await waitFor(() => expect(saveQuestionShareSuccession).toHaveBeenCalledWith('q1', {
      outcome: 'The window closed. The latecomer paid.'
    }));
    expect(await screen.findByTestId('question-share-succession')).toHaveTextContent(
      'The window may close before compounding pays.'
    );
    expect(screen.getByTestId('question-share-preview')).toHaveTextContent('The window closed. The latecomer paid.');
    expect(screen.getByRole('button', { name: 'Save what happened later' })).toBeInTheDocument();
  });

  it('names an agent assignment and can end it', async () => {
    const named = {
      owner: 'Athan',
      scope: 'This published question.',
      tools: 'Ask about this published question (the public page only).',
      budget: { asks: 3, remaining: 3, spent: 0 },
      stop: 'Stop when the successor writes what happened later.',
      review: 'Return to this door to end or renew the assignment.',
      status: 'live'
    };
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      ownerDisplayName: 'Athan'
    });
    saveQuestionShareMandate
      .mockResolvedValueOnce({
        shared: true,
        slug: 'abc123',
        snapshot: frozen,
        preview: frozen,
        ownerDisplayName: 'Athan',
        mandate: named
      })
      .mockResolvedValueOnce({
        shared: true,
        slug: 'abc123',
        snapshot: frozen,
        preview: frozen,
        ownerDisplayName: 'Athan',
        mandate: {
          ...named,
          status: 'paused',
          pause: 'This assignment ended. The agent is paused.'
        }
      });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-mandate-form')).toBeInTheDocument();
    expect(screen.queryByTestId('question-share-mandate')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Stop when'), {
      target: { value: 'Stop when the successor writes what happened later.' }
    });
    fireEvent.change(screen.getByLabelText('Review route'), {
      target: { value: 'Return to this door to end or renew the assignment.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Name this assignment' }));
    await waitFor(() => expect(saveQuestionShareMandate).toHaveBeenCalledWith('q1', {
      owner: 'Athan',
      scope: 'This published question.',
      tools: 'Ask about this published question (the public page only).',
      budget: 3,
      stop: 'Stop when the successor writes what happened later.',
      review: 'Return to this door to end or renew the assignment.'
    }));
    expect(await screen.findByTestId('question-share-mandate')).toHaveTextContent('This published question.');
    fireEvent.click(screen.getByRole('button', { name: 'End this assignment' }));
    await waitFor(() => expect(saveQuestionShareMandate).toHaveBeenCalledWith('q1', { end: true }));
    expect(await screen.findByTestId('question-share-mandate')).toHaveTextContent(
      'This assignment ended. The agent is paused.'
    );
  });

  it('returns a portable record to a published door and names what cannot transfer', async () => {
    const succession = {
      unresolved: 'The window may close before compounding pays.',
      alternatives: [{
        id: 'c1',
        by: 'Mara',
        text: 'Same fact, different time horizon.'
      }],
      evidenceThen: { text: 'What survives compounding?' },
      authority: 'Athan'
    };
    getQuestionShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen
    });
    importQuestionShareRecords.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      succession,
      records: {
        retained: ['successor'],
        restored: ['succession'],
        sameDoor: false,
        cannotTransfer: ['The public address of that door'],
        collisions: []
      }
    });
    render(<QuestionShareModal open questionId="q1" questionText="What next?" onClose={() => {}} />);
    expect(await screen.findByTestId('question-share-records-form')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take these records' })).not.toBeInTheDocument();
    const markdown = '```json\n{"kind":"question-share-records","version":1}\n```\n';
    const file = new File([markdown], 'records.md', { type: 'text/markdown' });
    file.text = async () => markdown;
    fireEvent.change(screen.getByLabelText('Bring records in'), { target: { files: [file] } });
    await waitFor(() => expect(importQuestionShareRecords).toHaveBeenCalled());
    expect(importQuestionShareRecords.mock.calls[0][0]).toBe('q1');
    expect(importQuestionShareRecords.mock.calls[0][1].markdown).toContain('question-share-records');
    expect(await screen.findByText(/The successor record can sit here/)).toBeInTheDocument();
    expect(await screen.findByTestId('question-share-succession')).toHaveTextContent(
      'The window may close before compounding pays.'
    );
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
