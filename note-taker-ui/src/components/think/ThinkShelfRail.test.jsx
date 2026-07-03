import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThinkShelfRail from './ThinkShelfRail';

describe('ThinkShelfRail', () => {
  it('links wiki-origin questions back to their source page', () => {
    render(
      <MemoryRouter>
        <ThinkShelfRail
          questions={[{
            _id: 'wiki-open-question:page-1:0',
            text: 'The unresolved question is how the thesis should change.',
            sourceType: 'wiki_open_question',
            href: '/wiki/workspace?page=page-1#open-questions'
          }]}
        />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: /the unresolved question is how the thesis should change/i });
    expect(link).toHaveAttribute('href', '/wiki/workspace?page=page-1#open-questions');
    expect(screen.getByText('Wiki page')).toBeInTheDocument();
  });
});
