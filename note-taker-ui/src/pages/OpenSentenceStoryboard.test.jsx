import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OpenSentenceStoryboard from './OpenSentenceStoryboard';
import { STORYBOARD_PROVISIONAL, STORYBOARD_RETURN_NOTE, STORYBOARD_SENTENCE } from '../components/wiki/open-sentence/openSentenceStoryboardFixture';

const renderBoard = () => render(
  <MemoryRouter>
    <OpenSentenceStoryboard />
  </MemoryRouter>
);

describe('OpenSentenceStoryboard', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('keeps the article on stage and rebinds the companion when the sentence opens', () => {
    renderBoard();
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent('Parenting');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('restores a private draft after interruption without changing the Wiki line', () => {
    const { unmount } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave open' }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_PROVISIONAL);
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_RETURN_NOTE);
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    unmount();
    renderBoard();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_PROVISIONAL);
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_RETURN_NOTE);
  });

  it('lets the companion become a drawer at mobile width', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Mobile 430' }));
    expect(screen.getByRole('button', { name: 'Companion' })).toBeInTheDocument();
  });
});
