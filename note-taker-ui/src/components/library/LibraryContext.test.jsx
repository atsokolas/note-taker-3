import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { listWikiPages } from '../../api/wiki';
import LibraryContext from './LibraryContext';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));

jest.mock('../references/ReferencePullIn', () => (props) => (
  <div
    data-testid="reference-pull-in"
    data-target-type={props.targetType}
    data-target-id={props.targetId}
    data-target-title={props.targetTitle}
    data-scope-type={props.scopeType}
    data-scope-id={props.scopeId}
    data-mode={props.mode}
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

const renderContext = (props = {}) => render(
  <MemoryRouter>
    <LibraryContext {...baseProps} {...props} />
  </MemoryRouter>
);

describe('LibraryContext', () => {
  beforeEach(() => {
    listWikiPages.mockResolvedValue([]);
  });

  it('makes the active highlight a source that can be referenced into durable work', async () => {
    renderContext({
      activeHighlightId: 'highlight-1',
      articleHighlights: [
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
      ]
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    const pullIn = screen.getByTestId('reference-pull-in');
    expect(pullIn).toHaveAttribute('data-target-type', 'highlight');
    expect(pullIn).toHaveAttribute('data-target-id', 'highlight-1');
    expect(pullIn).toHaveAttribute('data-mode', 'reference-source');
    expect(pullIn).not.toHaveAttribute('data-scope-type');
    expect(pullIn).not.toHaveAttribute('data-scope-id');
    expect(pullIn).toHaveAttribute('data-target-title', 'Temperament and concentration are recurring source atoms.');
  });

  it('does not render highlight pull-in controls before a highlight is focused', async () => {
    renderContext({
      activeHighlightId: '',
      articleHighlights: [
        {
          _id: 'highlight-1',
          text: 'Temperament and concentration are recurring source atoms.',
          tags: ['investing']
        }
      ]
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(screen.queryByTestId('reference-pull-in')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reference' })).toBeInTheDocument();
  });

  it('exposes every highlight as a referenceable source atom', async () => {
    const onHighlightClick = jest.fn();
    const onSelectHighlight = jest.fn();

    renderContext({
      onHighlightClick,
      onSelectHighlight,
      activeHighlightId: '',
      articleHighlights: [
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
      ]
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    const referenceButtons = screen.getAllByRole('button', { name: 'Reference' });
    expect(referenceButtons).toHaveLength(2);

    fireEvent.click(referenceButtons[1]);

    expect(onSelectHighlight).toHaveBeenCalledWith('highlight-2');
    expect(onHighlightClick).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'highlight-2',
      text: 'A second highlight can become evidence elsewhere.'
    }));
  });

  it('whispers Why back to the claim when this feed row was filed', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'wiki-compute',
      judgment: {
        currentJudgment: 'Demand still outruns deliverable capacity.',
        why: [{ acceptedFrom: 'highlight:article-1:highlight-1' }],
        against: []
      }
    }]);

    renderContext({
      articleHighlights: [
        {
          _id: 'highlight-1',
          articleId: 'article-1',
          text: 'Capacity still lags demand.',
          tags: []
        }
      ]
    });

    const door = await screen.findByTestId('passage-door');
    expect(door).toHaveAttribute('href', '/judgment/wiki-compute');
    expect(door).toHaveTextContent('Why');
    expect(screen.queryByRole('button', { name: /open claim/i })).not.toBeInTheDocument();
  });

  it('stays silent on a feed row that was never filed', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'wiki-compute',
      sourceRefs: [{ type: 'article', objectId: 'article-1' }],
      judgment: { currentJudgment: 'Demand still outruns deliverable capacity.', why: [] }
    }]);

    renderContext({
      articleHighlights: [
        {
          _id: 'highlight-1',
          articleId: 'article-1',
          text: 'An unfiled sentence.',
          tags: []
        }
      ]
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(screen.queryByTestId('passage-door')).not.toBeInTheDocument();
  });
});
