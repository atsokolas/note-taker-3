import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import QuestionEditor from './QuestionEditor';
import { searchKeyword } from '../../../api/retrieval';

jest.mock('../../../hooks/useHighlights', () => () => ({
  highlights: [],
  highlightMap: new Map(),
  loading: false,
  error: null
}));

jest.mock('../../return-queue/ReturnLaterControl', () => function ReturnLaterControl(props) {
  ReturnLaterControl.lastProps = props;
  return <button type="button">Return later</button>;
});

jest.mock('../../agent/AgentSkillDock', () => function AgentSkillDock() {
  return <div data-testid="agent-skill-dock" />;
});

jest.mock('../../../api/retrieval', () => ({
  searchKeyword: jest.fn()
}));

jest.mock('../../wiki/open-sentence/LibraryPassagePicker', () => function LibraryPassagePicker({ open, onPlace, boundQuestion }) {
  if (!open) return null;
  return (
    <div>
      {boundQuestion ? <p>For this question</p> : null}
      {boundQuestion ? <p>{boundQuestion}</p> : null}
      <button
        type="button"
        onClick={() => onPlace({
          articleId: 'article-nomad',
          highlightId: 'highlight-nomad',
          title: 'Nomad',
          passage: 'A wrong turn can still leave another attempt.',
          href: '/library?articleId=article-nomad&highlightId=highlight-nomad'
        })}
      >
        Place here
      </button>
    </div>
  );
});

describe('QuestionEditor', () => {
  it('ends a kept question with both named sources and retains them after save and reopen', () => {
    const sources = [
      { id: 'primary', type: 'highlight-ref', text: 'The sentence’s source words.', highlightId: 'highlight-1',
        articleId: 'article-1', articleTitle: 'The original source', sourcePath: '/library?articleId=article-1&highlightId=highlight-1' },
      { id: 'chosen', type: 'paragraph', text: 'The words brought into the thought.',
        articleId: 'article-2', articleTitle: 'The chosen source', sourcePath: '/library?articleId=article-2#passage=exact' }
    ];
    const question = {
      _id: 'question-1', text: 'What follows?', blocks: sources,
      importMeta: { sourceType: 'authored_exploration', sourceLabel: 'Parenting',
        sourceUrl: '/wiki/read/page-1?claimId=claim-1&exploration=1', sourcePath: sources[1].sourcePath }
    };
    const onSave = jest.fn();
    const { rerender } = render(<QuestionEditor question={question} onSave={onSave} />);
    const assertSources = () => {
      const footer = within(screen.getByRole('contentinfo', { name: 'Authored work origin' }));
      for (const source of sources) expect(footer.getByRole('link', { name: `Open ${source.articleTitle}` }))
        .toHaveAttribute('href', source.sourcePath);
      expect(footer.getByRole('link', { name: 'Return to Parenting' })).toHaveAttribute('href', question.importMeta.sourceUrl);
    };
    assertSources();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    rerender(<QuestionEditor question={onSave.mock.calls[0][0]} onSave={onSave} />);
    assertSources();
  });

  it('preserves the exact source-bound quotation when saving and reopening', () => {
    const onSave = jest.fn();
    const sourceBlock = {
      id: 'source-1',
      type: 'paragraph',
      text: 'The exact chosen passage.',
      articleId: 'article-1',
      articleTitle: 'A beautiful source',
      sourcePath: '/library?articleId=article-1#passage=exact'
    };
    const { rerender } = render(
      <QuestionEditor
        question={{ _id: 'question-1', text: 'What follows?', blocks: [sourceBlock] }}
        saving={false}
        error={null}
        onSave={onSave}
      />
    );

    expect(screen.getByRole('blockquote', { name: `Source quotation from ${sourceBlock.articleTitle}` }))
      .toHaveTextContent(sourceBlock.text);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ blocks: [expect.objectContaining(sourceBlock)] }));

    const saved = onSave.mock.calls[0][0];
    rerender(<QuestionEditor question={saved} saving={false} error={null} onSave={onSave} />);
    expect(screen.getByRole('link', { name: sourceBlock.articleTitle })).toHaveAttribute('href', sourceBlock.sourcePath);
    expect(screen.queryByDisplayValue(sourceBlock.text)).not.toBeInTheDocument();
  });

  it('preserves challenged claim evidence when initializing and saving a draft', () => {
    const onSave = jest.fn();
    const question = {
      _id: 'question-1',
      text: 'How strong is this claim?',
      blocks: [{
        id: 'claim-1',
        type: 'paragraph',
        text: 'Concentrated portfolios outperform when the underwriting is right.',
        evidence: [{ stance: 'support', title: 'Block-level support' }],
        challenge: {
          enabled: true,
          createdAt: '2026-06-01T12:00:00.000Z',
          note: 'Challenge this claim.',
          support: [{ title: 'Support one' }],
          counter: [{ title: 'Counter one' }]
        }
      }]
    };

    render(
      <QuestionEditor
        question={question}
        saving={false}
        error={null}
        onSave={onSave}
      />
    );

    expect(screen.getByLabelText('Claim evidence balance: 2 support / 1 counter')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [
        expect.objectContaining({
          id: 'claim-1',
          evidence: [{ stance: 'support', title: 'Block-level support' }],
          challenge: expect.objectContaining({
            enabled: true,
            support: [{ title: 'Support one' }],
            counter: [{ title: 'Counter one' }]
          })
        })
      ]
    }));
  });

  it('wraps long editorial question titles within the main column field', () => {
    render(
      <QuestionEditor
        question={{
          _id: 'question-1',
          text: 'When does concentration in a portfolio create more downside tail risk than upside optionality across market regimes?',
          blocks: [{ id: 'block-1', type: 'paragraph', text: 'Body copy.' }]
        }}
        saving={false}
        error={null}
        onSave={jest.fn()}
        variant="editorial"
      />
    );

    const titleField = screen.getByLabelText('Question title');
    expect(titleField.tagName).toBe('TEXTAREA');
    expect(titleField).toHaveClass('think-question-title-input--wrap');
  });

  it('places a found Library passage beside the question and keeps the question through save', () => {
    const onSave = jest.fn();
    const question = {
      _id: 'question-1',
      text: 'Who bears the downside?',
      blocks: [{ id: 'block-1', type: 'paragraph', text: 'A distinction still open.' }]
    };
    const { rerender } = render(
      <QuestionEditor question={question} saving={false} error={null} onSave={onSave} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find what I already have' }));
    expect(screen.getByText('For this question')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add highlight' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Who bears the downside?',
      linkedHighlightIds: ['highlight-nomad'],
      linkedHighlightId: 'highlight-nomad',
      blocks: [
        expect.objectContaining({
          type: 'highlight-ref',
          highlightId: 'highlight-nomad',
          articleId: 'article-nomad',
          articleTitle: 'Nomad',
          text: 'A wrong turn can still leave another attempt.',
          sourcePath: '/library?articleId=article-nomad&highlightId=highlight-nomad'
        }),
        expect.objectContaining({ id: 'block-1', text: 'A distinction still open.' })
      ]
    }));

    rerender(
      <QuestionEditor question={onSave.mock.calls[0][0]} saving={false} error={null} onSave={onSave} />
    );
    expect(screen.getByDisplayValue('Who bears the downside?')).toBeInTheDocument();
    expect(screen.getByRole('blockquote', { name: 'Source quotation from Nomad' }))
      .toHaveTextContent('A wrong turn can still leave another attempt.');
    fireEvent.change(screen.getByDisplayValue('A distinction still open.'), {
      target: { value: 'Edited after placing.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo passage placement' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'Who bears the downside?',
      linkedHighlightIds: [],
      linkedHighlightId: null,
      blocks: [expect.objectContaining({ id: 'block-1', text: 'Edited after placing.' })]
    }));
  });

  it('keeps a highlight link that lives on the question, not in blocks', () => {
    const onSave = jest.fn();
    render(
      <QuestionEditor
        question={{
          _id: 'question-1',
          text: 'Who bears the downside?',
          linkedHighlightId: 'highlight-origin',
          blocks: [{ id: 'block-1', type: 'paragraph', text: 'A distinction still open.' }]
        }}
        saving={false}
        error={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      linkedHighlightIds: ['highlight-origin'],
      linkedHighlightId: 'highlight-origin',
      blocks: [expect.objectContaining({ id: 'block-1', text: 'A distinction still open.' })]
    }));
  });

  it('places a found passage without dropping a pre-existing question highlight link', () => {
    const onSave = jest.fn();
    render(
      <QuestionEditor
        question={{
          _id: 'question-1',
          text: 'Who bears the downside?',
          linkedHighlightId: 'highlight-origin',
          blocks: [{ id: 'block-1', type: 'paragraph', text: 'A distinction still open.' }]
        }}
        saving={false}
        error={null}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find what I already have' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      linkedHighlightIds: ['highlight-origin', 'highlight-nomad'],
      linkedHighlightId: 'highlight-origin',
      blocks: [
        expect.objectContaining({ highlightId: 'highlight-nomad' }),
        expect.objectContaining({ id: 'block-1' })
      ]
    }));
  });

  it('keeps later edits and the original highlight link when undoing a found passage', () => {
    const onSave = jest.fn();
    const question = {
      _id: 'question-1',
      text: 'Who bears the downside?',
      linkedHighlightId: 'highlight-origin',
      linkedHighlightIds: ['highlight-origin'],
      blocks: [{ id: 'block-1', type: 'paragraph', text: 'A distinction still open.' }]
    };
    const { rerender } = render(
      <QuestionEditor question={question} saving={false} error={null} onSave={onSave} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find what I already have' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));
    rerender(
      <QuestionEditor question={onSave.mock.calls[0][0]} saving={false} error={null} onSave={onSave} />
    );
    fireEvent.change(screen.getByDisplayValue('A distinction still open.'), {
      target: { value: 'Edited after placing.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo passage placement' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'Who bears the downside?',
      linkedHighlightIds: ['highlight-origin'],
      linkedHighlightId: 'highlight-origin',
      blocks: [expect.objectContaining({ id: 'block-1', text: 'Edited after placing.' })]
    }));
  });

  it('saves an inquiry result without rewriting the question being edited', async () => {
    searchKeyword.mockResolvedValue({
      articles: [{
        _id: 'letter',
        title: 'Household letter',
        content: 'Patience is not the same as avoidance.'
      }],
      highlights: []
    });
    const onSave = jest.fn();
    render(
      <QuestionEditor
        question={{
          _id: 'question-1',
          text: 'Who bears the downside?',
          blocks: [{ id: 'block-1', type: 'paragraph', text: 'A distinction still open.' }]
        }}
        saving={false}
        error={null}
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByDisplayValue('Who bears the downside?'), {
      target: { value: 'Whose recoverable mistake is this?' }
    });
    fireEvent.change(screen.getByPlaceholderText(/patience from avoidance/i), {
      target: { value: 'Find an example that separates patience from avoidance.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look through your Library' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls.at(-1)[0];
    expect(payload).toEqual({
      _id: 'question-1',
      inquiry: expect.objectContaining({
        brief: 'Find an example that separates patience from avoidance.',
        run: expect.objectContaining({
          status: 'complete',
          boundQuestion: 'Whose recoverable mistake is this?'
        })
      })
    });
    expect(payload.text).toBeUndefined();
    expect(payload.blocks).toBeUndefined();
  });

  it('asks Paper to bring back the look, not a duplicate of the question title', () => {
    const ReturnLaterControl = jest.requireMock('../../return-queue/ReturnLaterControl');
    render(
      <QuestionEditor
        question={{
          _id: 'question-1',
          text: 'Who bears the downside?',
          inquiry: {
            brief: 'Find an example that separates patience from avoidance.',
            run: {
              status: 'complete',
              boundBrief: 'Find an example that separates patience from avoidance.',
              passages: [{ articleId: 'letter', passage: 'Patience is not avoidance.' }]
            }
          },
          blocks: []
        }}
        saving={false}
        error={null}
        onSave={jest.fn()}
      />
    );
    expect(ReturnLaterControl.lastProps.defaultReason)
      .toBe('Find an example that separates patience from avoidance.');
  });
});
