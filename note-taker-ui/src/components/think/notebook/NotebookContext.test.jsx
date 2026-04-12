import React from 'react';
import { render, screen } from '@testing-library/react';
import NotebookContext from './NotebookContext';

jest.mock('../../ReferencesPanel', () => () => <div>Mock backlinks</div>);

describe('NotebookContext', () => {
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
    expect(screen.getByText('Concept handoff')).toBeInTheDocument();
    expect(screen.getByText(/Bring the draft forward here, then return to the concept/i)).toBeInTheDocument();
  });
});
