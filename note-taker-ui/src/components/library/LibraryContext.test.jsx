import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryContext from './LibraryContext';

jest.mock('../references/ReferencePullIn', () => (props) => (
  <div
    data-testid="reference-pull-in"
    data-target-type={props.targetType}
    data-target-id={props.targetId}
    data-target-title={props.targetTitle}
    data-scope-type={props.scopeType}
    data-scope-id={props.scopeId}
  />
));

jest.mock('../retrieval/SemanticRelatedPanel', () => () => (
  <div data-testid="semantic-related-panel" />
));

const baseProps = {
  selectedArticleId: 'article-1',
  articleLoading: false,
  references: { notebookBlocks: [] },
  referencesLoading: false,
  referencesError: '',
  onHighlightClick: jest.fn(),
  onSelectHighlight: jest.fn(),
  onAddConcept: jest.fn(),
  onAddNotebook: jest.fn(),
  onAddQuestion: jest.fn(),
  onUpdateHighlight: jest.fn(),
  onDeleteHighlight: jest.fn(),
  onDumpToWorkingMemory: jest.fn()
};

describe('LibraryContext', () => {
  it('makes the active highlight a graph pull-in target scoped to its article', () => {
    render(
      <LibraryContext
        {...baseProps}
        activeHighlightId="highlight-1"
        articleHighlights={[
          {
            _id: 'highlight-1',
            text: 'Temperament and concentration are recurring source atoms.',
            tags: ['investing'],
            createdAt: '2026-05-01T00:00:00Z'
          },
          {
            _id: 'highlight-2',
            text: 'A second highlight stays quiet until focused.',
            tags: [],
            createdAt: '2026-05-02T00:00:00Z'
          }
        ]}
      />
    );

    const pullIn = screen.getByTestId('reference-pull-in');
    expect(pullIn).toHaveAttribute('data-target-type', 'highlight');
    expect(pullIn).toHaveAttribute('data-target-id', 'highlight-1');
    expect(pullIn).toHaveAttribute('data-scope-type', 'article');
    expect(pullIn).toHaveAttribute('data-scope-id', 'article-1');
    expect(pullIn).toHaveAttribute('data-target-title', 'Temperament and concentration are recurring source atoms.');
  });

  it('does not render highlight pull-in controls before a highlight is focused', () => {
    render(
      <LibraryContext
        {...baseProps}
        activeHighlightId=""
        articleHighlights={[
          {
            _id: 'highlight-1',
            text: 'Temperament and concentration are recurring source atoms.',
            tags: ['investing']
          }
        ]}
      />
    );

    expect(screen.queryByTestId('reference-pull-in')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reference' })).toBeInTheDocument();
  });

  it('exposes every highlight as a referenceable source atom', () => {
    const onHighlightClick = jest.fn();
    const onSelectHighlight = jest.fn();

    render(
      <LibraryContext
        {...baseProps}
        onHighlightClick={onHighlightClick}
        onSelectHighlight={onSelectHighlight}
        activeHighlightId=""
        articleHighlights={[
          {
            _id: 'highlight-1',
            text: 'Temperament and concentration are recurring source atoms.',
            tags: ['investing']
          },
          {
            _id: 'highlight-2',
            text: 'A second highlight can become evidence elsewhere.',
            tags: []
          }
        ]}
      />
    );

    const referenceButtons = screen.getAllByRole('button', { name: 'Reference' });
    expect(referenceButtons).toHaveLength(2);

    fireEvent.click(referenceButtons[1]);

    expect(onSelectHighlight).toHaveBeenCalledWith('highlight-2');
    expect(onHighlightClick).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'highlight-2',
      text: 'A second highlight can become evidence elsewhere.'
    }));
  });
});
