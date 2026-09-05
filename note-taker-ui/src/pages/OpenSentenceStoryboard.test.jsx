import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
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

  it('walks into Nomad without opening the pocket or leaving the storyboard', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    fireEvent.click(screen.getByRole('link', { name: 'Open in Library →' }));
    expect(screen.getByRole('heading', { name: 'Nomad' })).toBeInTheDocument();
    expect(screen.getByText(/You were holding/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent('Nomad');
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent(/wrong turn/);
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Parenting →' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
  });

  it('leaves a way home after Nomad without opening the pocket', async () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave open' }));
    fireEvent.click(screen.getByRole('link', { name: 'Open in Library →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Parenting →' }));
    fireEvent.click(document.querySelector('.open-sentence__open'));
    await waitFor(() => {
      expect(screen.getByText('You were in Nomad.')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: STORYBOARD_RETURN_NOTE })).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    expect(screen.getByText(/From the Library of/)).toHaveTextContent('you were in Nomad.');
  });

  it('cycles honest absences without attaching a neighbor', () => {
    renderBoard();
    const sourceButton = () => screen.getByRole('button', { name: /Source condition/ });
    fireEvent.click(sourceButton());
    expect(screen.getByText('Nothing beside this sentence yet.')).toBeInTheDocument();
    expect(screen.queryByText('Illustrated source · not live retrieval')).not.toBeInTheDocument();
    fireEvent.click(sourceButton());
    expect(screen.getByText(/Nomad is unavailable/)).toBeInTheDocument();
    fireEvent.click(sourceButton());
    fireEvent.click(screen.getByRole('button', { name: 'Read around this' }));
    expect(screen.getByText('The surrounding lines were not saved with this passage.')).toBeInTheDocument();
    fireEvent.click(sourceButton());
    expect(screen.getByText('This is an older copy. A newer line was not attached.')).toBeInTheDocument();
    fireEvent.click(sourceButton());
    expect(document.querySelector('.open-sentence-pocket__source')).toHaveTextContent(/whether the person can continue/);
  });

  it('lets stillness skip the drawing', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Stillness' }));
    expect(document.querySelector('.open-sentence-storyboard__stage')).toHaveAttribute('data-stillness', '1');
    expect(screen.getByRole('button', { name: 'Stillness' })).toHaveAttribute('aria-pressed', 'true');
  });
});
