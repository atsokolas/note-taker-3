import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OpenedLibraryPassage from './OpenedLibraryPassage';
import { writeReturnTicket } from './openSentenceJourney';

const article = {
  _id: 'article-1',
  title: 'Nomad',
  content: '<p>Getting lost was part of the work. A wrong turn you can walk back from still teaches the map. That is a different kind of care.</p>'
};

const highlight = {
  _id: 'highlight-1',
  text: 'A wrong turn you can walk back from still teaches the map.',
  note: 'The reader should land here.',
  anchor: {
    prefix: 'Getting lost was part of the work.',
    suffix: 'That is a different kind of care.'
  }
};

const renderPassage = (props = {}) => render(
  <MemoryRouter>
    <OpenedLibraryPassage
      article={article}
      highlight={highlight}
      inArticle={false}
      {...props}
    />
  </MemoryRouter>
);

describe('OpenedLibraryPassage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('lands on the saved passage without opening the pocket', () => {
    writeReturnTicket({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      claimId: 'claim-1'
    });
    const onOpenedText = jest.fn();
    renderPassage({ onOpenedText });
    expect(screen.getByText(/You were holding Children need room to make mistakes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Parenting →' })).toHaveAttribute(
      'href',
      '/wiki/read/wiki-1?claimId=claim-1'
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    expect(onOpenedText).toHaveBeenCalledWith('');
  });

  it('opens the same pocket and hides the Library door because you are already here', () => {
    renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Opened sentence')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent(highlight.text);
    fireEvent.click(screen.getByRole('button', { name: 'Read around this' }));
    expect(screen.getByText('Getting lost was part of the work.')).toBeInTheDocument();
  });

  it('places the passage beside the Wiki thought you walked from', () => {
    writeReturnTicket({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      claimId: 'claim-1'
    });
    renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place beside' }));
    expect(screen.getByText('Beside Parenting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));
    expect(screen.getByText('Placed beside Parenting')).toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem('noeis.open-sentence.wiki-1.claim-1')).placed).toBe(true);
  });

  it('discards a closed Library experiment that did not keep a question', () => {
    renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'A wrong turn you can name still teaches the map.' }
    });
    fireEvent.click(document.querySelector('.open-sentence__open'));
    expect(window.sessionStorage.getItem('noeis.open-sentence.library:article-1.highlight-1')).toBeFalsy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(highlight.text);
  });
});
