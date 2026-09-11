import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionBlocksEditor, { getChallengeEvidenceBalance } from './QuestionBlocksEditor';

const mockUseHighlights = jest.fn(() => ({ highlightMap: new Map() }));

jest.mock('../../../hooks/useHighlights', () => (...args) => mockUseHighlights(...args));

describe('QuestionBlocksEditor', () => {
  beforeEach(() => {
    mockUseHighlights.mockReturnValue({ highlightMap: new Map() });
  });

  it('renders a source-bound paragraph as an attributed quotation with its exact Library return', () => {
    const sourcePath = '/library?articleId=article-1#passage=%7B%22text%22%3A%22Exact%22%7D';
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'source-1',
          type: 'paragraph',
          text: 'The exact chosen passage.',
          articleId: 'article-1',
          articleTitle: 'A beautiful source',
          sourcePath
        }]}
        onChange={jest.fn()}
        onInsertHighlight={jest.fn()}
      />
    );

    expect(screen.getByRole('blockquote', { name: 'Source quotation from A beautiful source' }))
      .toHaveTextContent('The exact chosen passage.');
    expect(screen.queryByDisplayValue('The exact chosen passage.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A beautiful source' })).toHaveAttribute('href', sourcePath);
  });

  it('rejects a source path for another article and falls back to the canonical Library route', () => {
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'source-1',
          type: 'paragraph',
          text: 'Source passage.',
          articleId: 'article-1',
          articleTitle: 'Known source',
          sourcePath: '/library?articleId=article-2#passage=wrong'
        }]}
        onChange={jest.fn()}
        onInsertHighlight={jest.fn()}
      />
    );

    expect(screen.getByRole('link', { name: 'Known source' })).toHaveAttribute(
      'href',
      '/library?articleId=article-1'
    );
  });

  it('keeps an authored highlight snapshot even when the live highlight text has changed', () => {
    mockUseHighlights.mockReturnValue({
      highlightMap: new Map([['highlight-1', {
        _id: 'highlight-1',
        text: 'Changed live highlight text.',
        articleId: 'article-1',
        articleTitle: 'A beautiful source'
      }]])
    });
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'source-1',
          type: 'highlight-ref',
          highlightId: 'highlight-1',
          text: 'The passage as it was when kept.',
          articleId: 'article-1',
          articleTitle: 'A beautiful source',
          sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
        }]}
        onChange={jest.fn()}
        onInsertHighlight={jest.fn()}
      />
    );

    expect(screen.getByRole('blockquote', { name: 'Source quotation from A beautiful source' }))
      .toHaveTextContent('The passage as it was when kept.');
    expect(screen.getByRole('link', { name: 'A beautiful source' })).toHaveAttribute(
      'href',
      '/library?articleId=article-1&highlightId=highlight-1'
    );
    expect(screen.queryByText('Changed live highlight text.')).not.toBeInTheDocument();
  });

  it('keeps an ordinary highlight embed live when it has no authored source path', () => {
    mockUseHighlights.mockReturnValue({
      highlightMap: new Map([['highlight-1', {
        _id: 'highlight-1',
        text: 'Current saved highlight text.',
        articleId: 'article-1',
        articleTitle: 'A beautiful source'
      }]])
    });
    render(
      <QuestionBlocksEditor
        blocks={[{
          id: 'highlight-block-1',
          type: 'highlight-ref',
          highlightId: 'highlight-1',
          text: 'Older cached text.',
          articleId: 'article-1',
          articleTitle: 'A beautiful source'
        }]}
        onChange={jest.fn()}
        onInsertHighlight={jest.fn()}
      />
    );

    expect(screen.getByText(/Current saved highlight text/)).toBeInTheDocument();
    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
  });

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
