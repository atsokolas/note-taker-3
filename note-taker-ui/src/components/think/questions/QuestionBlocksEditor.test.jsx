import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionBlocksEditor, { getChallengeEvidenceBalance } from './QuestionBlocksEditor';

jest.mock('../../../hooks/useHighlights', () => () => ({
  highlightMap: new Map()
}));

describe('QuestionBlocksEditor', () => {
  it('calculates support/counter balance for challenged claims', () => {
    expect(getChallengeEvidenceBalance({
      challenge: {
        evidence: [
          { stance: 'support' },
          { relationType: 'supports' },
          { stance: 'counter' },
          { relationType: 'contradicts' }
        ],
        support: [{ title: 'Extra support' }]
      }
    })).toMatchObject({
      support: 3,
      counter: 2,
      total: 5,
      supportLean: 60,
      counterLean: 40,
      label: '3 support / 2 counter'
    });

    expect(getChallengeEvidenceBalance({ challenge: { enabled: true } })).toMatchObject({
      support: 0,
      counter: 0,
      total: 0,
      supportLean: 50,
      counterLean: 50,
      label: 'waiting for support and counter evidence'
    });
  });

  it('exposes stable block anchors for dialectical evidence docking', () => {
    const onChange = jest.fn();
    render(
      <QuestionBlocksEditor
        blocks={[{ id: 'block-1', type: 'paragraph', text: 'What would change this?' }]}
        onChange={onChange}
        onInsertHighlight={jest.fn()}
      />
    );

    const block = screen.getByRole('group', { name: 'Question block 1' });
    expect(block).toBeInTheDocument();
    expect(block).toHaveAttribute('id', 'question-block-block-1');
    expect(block).toHaveAttribute('data-question-block-type', 'paragraph');
    expect(block).toHaveAttribute('data-challenge-active', 'false');
    expect(screen.getByDisplayValue('What would change this?')).toBeInTheDocument();
  });

  it('marks a block as the challenged claim for dialectical docking', () => {
    const onChange = jest.fn();
    render(
      <QuestionBlocksEditor
        blocks={[{ id: 'block-1', type: 'paragraph', text: 'The central claim to test.' }]}
        onChange={onChange}
        onInsertHighlight={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Challenge this' }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'block-1',
        challenge: expect.objectContaining({
          enabled: true,
          createdAt: expect.any(String),
          note: 'Challenge this claim with support and counter-evidence.'
        })
      })
    ]);
  });

  it('renders a persisted challenged block with an active marker', () => {
    const onChange = jest.fn();
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'block-1',
          type: 'paragraph',
          text: 'The central claim to test.',
          challenge: { enabled: true, createdAt: '2026-06-01T12:00:00.000Z', note: '' }
        }]}
        onChange={onChange}
        onInsertHighlight={jest.fn()}
      />
    );

    const block = screen.getByRole('group', { name: 'Question block 1' });
    expect(block).toHaveAttribute('data-challenge-active', 'true');
    expect(screen.getByRole('button', { name: 'Challenged' })).toBeInTheDocument();
    expect(screen.getByText('Challenge active: dock support and counter-evidence beside this line.')).toBeInTheDocument();
    const gauge = screen.getByLabelText('Claim evidence balance: waiting for support and counter evidence');
    expect(gauge).toHaveAttribute('data-support-count', '0');
    expect(gauge).toHaveAttribute('data-counter-count', '0');
    expect(gauge).toHaveAttribute('data-evidence-total', '0');

    fireEvent.click(screen.getByRole('button', { name: 'Challenged' }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'block-1',
        challenge: { enabled: false, createdAt: null, note: '' }
      })
    ]);
  });

  it('renders the per-claim balance gauge for persisted evidence', () => {
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'block-1',
          type: 'paragraph',
          text: 'The central claim to test.',
          challenge: {
            enabled: true,
            createdAt: '2026-06-01T12:00:00.000Z',
            evidence: [
              { stance: 'support', title: 'Support one' },
              { stance: 'support', title: 'Support two' },
              { stance: 'counter', title: 'Counter one' }
            ]
          }
        }]}
        onChange={jest.fn()}
        onInsertHighlight={jest.fn()}
      />
    );

    const gauge = screen.getByLabelText('Claim evidence balance: 2 support / 1 counter');
    expect(gauge).toHaveAttribute('data-support-count', '2');
    expect(gauge).toHaveAttribute('data-counter-count', '1');
    expect(gauge).toHaveAttribute('data-evidence-total', '3');
    expect(gauge).toHaveTextContent('Support 67%');
    expect(gauge).toHaveTextContent('Counter 33%');
  });

  it('folds live support and counter signals into the challenged claim gauge', () => {
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'block-1',
          type: 'paragraph',
          text: 'The central claim to test.',
          challenge: {
            enabled: true,
            createdAt: '2026-06-01T12:00:00.000Z',
            note: ''
          }
        }]}
        onChange={jest.fn()}
        onInsertHighlight={jest.fn()}
        challengeEvidenceByBlockId={{
          'block-1': {
            support: [{ stance: 'support', title: 'Live support' }],
            counter: [{ stance: 'counter', title: 'Live counter' }]
          }
        }}
      />
    );

    const gauge = screen.getByLabelText('Claim evidence balance: 1 support / 1 counter');
    expect(gauge).toHaveAttribute('data-support-count', '1');
    expect(gauge).toHaveAttribute('data-counter-count', '1');
    expect(gauge).toHaveTextContent('Support 50%');
    expect(gauge).toHaveTextContent('Counter 50%');
  });
});
