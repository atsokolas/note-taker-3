import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

  it('renders populated Questions section instead of the empty copy', () => {
    render(
      <MemoryRouter>
        <ThinkShelfRail
          questions={[{
            _id: 'q-1',
            text: 'What breaks this thesis?',
            status: 'open'
          }]}
        />
      </MemoryRouter>
    );

    const section = screen.getByRole('region', { name: 'Questions' });
    expect(within(section).getByRole('button', { name: /what breaks this thesis/i })).toBeInTheDocument();
    expect(within(section).queryByText('No questions yet.')).not.toBeInTheDocument();
  });
});
