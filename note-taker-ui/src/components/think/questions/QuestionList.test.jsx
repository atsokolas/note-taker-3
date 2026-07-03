import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuestionList from './QuestionList';

jest.mock('../../return-queue/ReturnLaterControl', () => function MockReturnLaterControl() {
  return <button type="button">Return later</button>;
});

describe('QuestionList', () => {
  it('renders wiki-origin questions as source-page links instead of mutable question rows', () => {
    render(
      <MemoryRouter>
        <QuestionList
          questions={[{
            _id: 'wiki-open-question:page-1:0',
            text: 'The unresolved question is how to size concentrated positions.',
            sourceType: 'wiki_open_question',
            sourcePageTitle: 'Margin of Safety',
            href: '/wiki/workspace?page=page-1#open-questions'
          }]}
          onMarkAnswered={jest.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Margin of Safety')).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: 'Open page' });
    expect(sourceLink).toHaveAttribute('href', '/wiki/workspace?page=page-1#open-questions');
    expect(screen.queryByRole('button', { name: 'Mark answered' })).not.toBeInTheDocument();
  });
});
