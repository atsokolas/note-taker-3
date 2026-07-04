import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalmIndexView from './CalmIndexView';

describe('CalmIndexView', () => {
  it('renders one primary next move above the motion list', () => {
    const onSelectThread = jest.fn();
    const primaryThread = {
      key: 'concept:investing',
      type: 'concept',
      id: 'investing',
      title: 'investing',
      raw: {}
    };
    render(
      <MemoryRouter>
        <CalmIndexView
          orientation="The desk is ready."
          primaryMove={{
            eyebrow: 'Resume this',
            title: 'investing',
            summary: 'Fresh material is waiting.',
            actionLabel: 'Reopen concept',
            thread: primaryThread
          }}
          motion={{
            inMotion: [primaryThread],
            shelf: []
          }}
          describeMotionNote={() => 'active'}
          onSelectThread={onSelectThread}
        />
      </MemoryRouter>
    );

    const primary = screen.getByLabelText('Primary next move');
    expect(primary).toHaveTextContent('Resume this');
    expect(primary).toHaveTextContent('Fresh material is waiting.');
    fireEvent.click(screen.getByRole('button', { name: 'Reopen concept' }));
    expect(onSelectThread).toHaveBeenCalledWith(primaryThread);
  });

  it('opens wiki-origin question threads as links to the source page', () => {
    const onSelectThread = jest.fn();
    render(
      <MemoryRouter>
        <CalmIndexView
          orientation="Questions are ready to revisit."
          motion={{
            inMotion: [{
              key: 'question:wiki-open-question:page-1:0',
              type: 'question',
              id: 'wiki-open-question:page-1:0',
              title: 'How should this thesis change?',
              raw: {
                sourceType: 'wiki_open_question',
                href: '/wiki/workspace?page=page-1#open-questions'
              }
            }],
            shelf: []
          }}
          describeMotionNote={() => 'from Margin of Safety'}
          onSelectThread={onSelectThread}
        />
      </MemoryRouter>
    );

    const threadLink = screen.getByRole('link', { name: /How should this thesis change/i });
    expect(threadLink).toHaveAttribute('href', '/wiki/workspace?page=page-1#open-questions');
    fireEvent.click(threadLink);
    expect(onSelectThread).not.toHaveBeenCalled();
  });
});
