import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { listWikiPages } from '../../api/wiki';
import { fileJudgmentEvidence } from '../../api/judgmentResolution';
import LibraryContext from './LibraryContext';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));
jest.mock('../../api/judgmentResolution', () => ({ fileJudgmentEvidence: jest.fn() }));

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

const baseProps = {
  selectedArticleId: 'article-1',
  articleLoading: false,
  references: { notebookBlocks: [] },
  referencesLoading: false,
  referencesError: '',
  onHighlightClick: jest.fn(),
  onAddConcept: jest.fn(),
  onAddNotebook: jest.fn(),
  onAddQuestion: jest.fn(),
  onUpdateHighlight: jest.fn(),
  onDeleteHighlight: jest.fn()
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
  });

  it('opens a highlight by its words and files it with one Add to row', async () => {
    const onHighlightClick = jest.fn();
    const onAddNotebook = jest.fn();

    renderContext({
      onHighlightClick,
      onAddNotebook,
      activeHighlightId: '',
      articleHighlights: [
        {
          _id: 'highlight-2',
          text: 'A second highlight can become evidence elsewhere.',
          tags: []
        }
      ]
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Focus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reference' })).not.toBeInTheDocument();
    expect(screen.getByText('Add to')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /A second highlight can become evidence/ }));
    expect(onHighlightClick).toHaveBeenCalledWith(expect.objectContaining({ _id: 'highlight-2' }));

    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    expect(onAddNotebook).toHaveBeenCalledWith(expect.objectContaining({ _id: 'highlight-2' }));
  });

  it('counts a thought written beside a highlight as marginalia', async () => {
    renderContext({
      references: { notebookBlocks: [{ notebookEntryId: 'n1', blockId: 'b1', notebookTitle: 'Hiring', blockPreviewText: 'Quoted.' }] },
      articleHighlights: [
        { _id: 'h1', text: 'Writing rewards the fluent.', note: 'True for proposals, less for code.' },
        { _id: 'h2', text: 'No thought here.', note: '  ' }
      ]
    });

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    const marginalia = screen.getByRole('button', { name: /Marginalia/ });
    expect(marginalia).toHaveTextContent('2 notes');
    if (marginalia.getAttribute('aria-expanded') !== 'true') fireEvent.click(marginalia);
    expect(screen.getByText('Beside your highlights')).toBeInTheDocument();
    expect(screen.getByText('True for proposals, less for code.')).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why' })).not.toBeInTheDocument();
  });

  it('offers Why and Against on an unfiled feed row that covers the hold', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'wiki-compute',
      judgment: {
        currentJudgment: 'Demand still outruns deliverable capacity.',
        why: [],
        against: []
      }
    }]);

    renderContext({
      articleHighlights: [
        {
          _id: 'highlight-1',
          articleId: 'article-1',
          text: 'Deliverable capacity lags demand by two years.',
          tags: []
        }
      ]
    });

    expect(await screen.findByRole('button', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Against' })).toBeInTheDocument();
    expect(screen.getByTestId('passage-door-offer')).toHaveTextContent(
      'Demand still outruns deliverable capacity.'
    );
    expect(screen.queryByTestId('passage-door')).not.toBeInTheDocument();
  });

  it('files Why from the feed and becomes the whisper', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'wiki-compute',
      judgment: {
        currentJudgment: 'Demand still outruns deliverable capacity.',
        why: [],
        against: []
      }
    }]);
    fileJudgmentEvidence.mockResolvedValue({
      judgment: {
        currentJudgment: 'Demand still outruns deliverable capacity.',
        why: [{ acceptedFrom: 'highlight:article-1:highlight-1' }],
        against: []
      }
    });

    renderContext({
      articleHighlights: [
        {
          _id: 'highlight-1',
          articleId: 'article-1',
          text: 'Deliverable capacity lags demand by two years.',
          tags: []
        }
      ]
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Why' }));
    await waitFor(() => expect(fileJudgmentEvidence).toHaveBeenCalled());
    expect(fileJudgmentEvidence.mock.calls[0][0]).toMatchObject({
      pageId: 'wiki-compute',
      field: 'why',
      articleId: 'article-1',
      highlightId: 'highlight-1'
    });
    expect(await screen.findByTestId('passage-door')).toHaveTextContent('Why');
    expect(screen.queryByTestId('passage-door-offer')).not.toBeInTheDocument();
  });
});
