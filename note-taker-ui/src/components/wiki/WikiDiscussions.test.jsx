import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiDiscussions from './WikiDiscussions';

const buildDiscussion = (overrides = {}) => ({
  _id: 'd1',
  question: 'What changed?',
  answer: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'The agent reviewed 3 sources.',
            marks: [{ type: 'claim', attrs: { claimId: 'c1', support: 'supported', citationIndexes: [1, 2] } }]
          }
        ]
      }
    ]
  },
  citationIndexesUsed: [1, 2],
  status: 'answered',
  errorMessage: '',
  model: 'gpt-test',
  askedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  ...overrides
});

describe('WikiDiscussions', () => {
  it('renders nothing when there are no discussions', () => {
    const { container } = render(<WikiDiscussions discussions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the question, answer prose, and a wiki-claim span with the right data attributes', () => {
    render(<WikiDiscussions discussions={[buildDiscussion()]} />);
    expect(screen.getByText('What changed?')).toBeInTheDocument();
    const claim = screen.getByText('The agent reviewed 3 sources.');
    expect(claim).toHaveClass('wiki-claim');
    expect(claim.getAttribute('data-claim-id')).toBe('c1');
    expect(claim.getAttribute('data-support')).toBe('supported');
    expect(claim.getAttribute('data-citation-indexes')).toBe('1,2');
    expect(screen.getByRole('button', { name: 'Backlink to sources 1, 2' })).toHaveTextContent('[1,2]');
  });

  it('shows the failed-state error message when status is failed', () => {
    render(<WikiDiscussions discussions={[buildDiscussion({
      status: 'failed',
      errorMessage: 'HF model timed out.'
    })]} />);
    expect(screen.getByText('HF model timed out.')).toBeInTheDocument();
  });

  it('orders multiple discussions newest-first', () => {
    const newer = buildDiscussion({ _id: 'd2', question: 'Newer?', askedAt: new Date().toISOString() });
    const older = buildDiscussion({ _id: 'd1', question: 'Older?', askedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    render(<WikiDiscussions discussions={[older, newer]} />);
    const items = screen.getAllByTestId('wiki-discussion-item');
    expect(items[0]).toHaveTextContent('Newer?');
    expect(items[1]).toHaveTextContent('Older?');
  });

  it('calls onRemove with the discussion id when the Remove button is clicked', () => {
    const onRemove = jest.fn();
    render(<WikiDiscussions discussions={[buildDiscussion()]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove discussion' }));
    expect(onRemove).toHaveBeenCalledWith('d1');
  });

  it('confirms a title before promoting an answer to a wiki page', () => {
    const onPromote = jest.fn();
    const discussion = buildDiscussion({ question: 'What changed after the ingest?' });
    render(<WikiDiscussions discussions={[discussion]} onPromote={onPromote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save as wiki page' }));
    const dialog = screen.getByRole('dialog', { name: 'Save answer as wiki page' });
    const input = screen.getByLabelText('New wiki page title');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(input).toHaveValue('What changed after');

    fireEvent.change(input, { target: { value: 'Ingest change answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save page' }));

    expect(onPromote).toHaveBeenCalledWith(discussion, 'Ingest change answer');
  });

  it('does not offer promotion for failed answers', () => {
    render(<WikiDiscussions discussions={[buildDiscussion({ status: 'failed' })]} onPromote={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save as wiki page' })).toBeNull();
  });

  it('hides the Remove button when no onRemove handler is provided', () => {
    render(<WikiDiscussions discussions={[buildDiscussion()]} />);
    expect(screen.queryByRole('button', { name: 'Remove discussion' })).toBeNull();
  });

  it('renders the singular "1 question" when only one discussion is present', () => {
    render(<WikiDiscussions discussions={[buildDiscussion()]} />);
    expect(screen.getByText('1 question')).toBeInTheDocument();
  });
});
