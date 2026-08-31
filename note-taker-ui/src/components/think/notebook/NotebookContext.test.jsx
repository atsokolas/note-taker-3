import React from 'react';
import { render, screen } from '@testing-library/react';
import NotebookContext from './NotebookContext';

jest.mock('../../ReferencesPanel', () => () => <div>Mock backlinks</div>);

describe('NotebookContext', () => {
  it('keeps an exact Ariadne thread back to the saved Library passage', () => {
    render(
      <NotebookContext
        entry={{
          _id: 'note-1',
          tags: [],
          linkedArticleId: 'article-1',
          linkedHighlightIds: ['highlight-1'],
          blocks: [{
            id: 'b1',
            type: 'highlight_embed',
            text: 'A precise saved passage',
            articleId: 'article-1',
            articleTitle: 'A beautiful source',
            highlightId: 'highlight-1'
          }]
        }}
      />
    );

    expect(screen.getByText('Ariadne thread · Library')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to A beautiful source' })).toHaveAttribute(
      'href',
      '/library?articleId=article-1&highlightId=highlight-1'
    );
    expect(screen.getByText(/exact saved passage that entered the page/i)).toBeInTheDocument();
  });

  it('reconstructs the exact return from legacy linked identities', () => {
    render(
      <NotebookContext
        entry={{
          _id: 'note-legacy',
          tags: [],
          linkedArticleId: 'article-legacy',
          linkedHighlightIds: ['highlight-legacy'],
          blocks: [{ id: 'b1', type: 'highlight_embed', text: 'Earlier saved passage' }]
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Return to the saved source' })).toHaveAttribute(
      'href',
      '/library?articleId=article-legacy&highlightId=highlight-legacy'
    );
  });

  it('shows concept provenance for notebook drafts derived from a concept', () => {
    render(
      <NotebookContext
        entry={{
          _id: 'note-1',
          tags: [],
          importMeta: {
            sourceType: 'concept',
            sourceLabel: 'Template Concept',
            sourceUrl: '/think?tab=concepts&concept=Template%20Concept',
            draftTemplateLabel: 'Essay draft',
            importedAt: '2026-04-10T00:00:00.000Z'
          },
          blocks: [
            { id: 'b1', type: 'highlight_embed', text: 'A supporting fragment' }
          ]
        }}
      />
    );

    expect(screen.getByText('Notebook source')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue from Template Concept' })).toHaveAttribute(
      'href',
      '/think?tab=concepts&concept=Template%20Concept'
    );
    expect(screen.getByText('Concept handoff · Essay draft')).toBeInTheDocument();
    expect(screen.getByText(/Essay draft spun out from the concept/i)).toBeInTheDocument();
    expect(screen.getByText(/Bring the draft forward here, then return to the concept/i)).toBeInTheDocument();
  });
});
