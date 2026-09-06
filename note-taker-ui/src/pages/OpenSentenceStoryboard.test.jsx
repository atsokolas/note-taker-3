import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import OpenSentenceStoryboard, { patchStoryboardSearch } from './OpenSentenceStoryboard';
import { draftStorageKey, openedStorageKey } from '../components/wiki/open-sentence/openSentenceBinding';
import {
  STORYBOARD_COMPUTE_SENTENCE,
  STORYBOARD_COMPUTE_TITLE,
  STORYBOARD_ITEM_ID,
  STORYBOARD_PREMISE,
  STORYBOARD_PROVISIONAL,
  STORYBOARD_RETURN_NOTE,
  STORYBOARD_SCOPE,
  STORYBOARD_SENTENCE,
  STORYBOARD_THEN_NOW,
  STORYBOARD_THEN_QUOTATION
} from '../components/wiki/open-sentence/openSentenceStoryboardFixture';

const renderBoard = (entries = ['/']) => render(
  <MemoryRouter initialEntries={entries}>
    <OpenSentenceStoryboard />
  </MemoryRouter>
);

describe('OpenSentenceStoryboard', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('keeps the article on stage and rebinds the companion when the sentence opens', () => {
    renderBoard();
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent('Parenting');
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('Works beside this sentence. Does not rewrite the article.')).toBeInTheDocument();
  });

  it('proposes wording without writing, then accept writes the illustrated line', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Wording' }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_PROVISIONAL);
    fireEvent.click(screen.getByRole('button', { name: 'Propose this wording' }));
    expect(screen.getByText(/Proposed, not accepted/)).toHaveTextContent(STORYBOARD_PROVISIONAL);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept this wording' }));
    expect(screen.getByRole('button', { name: STORYBOARD_PROVISIONAL })).toBeInTheDocument();
    expect(screen.queryByText(/Proposed, not accepted/)).not.toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_PROVISIONAL);
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent(STORYBOARD_PROVISIONAL);
  });

  it('restores a private draft after interruption without changing the Wiki line', () => {
    const { unmount } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave open' }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_PROVISIONAL);
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_RETURN_NOTE);
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(openedStorageKey(STORYBOARD_SCOPE))).toBe(STORYBOARD_ITEM_ID);
    expect(window.sessionStorage.getItem(draftStorageKey(STORYBOARD_SCOPE, STORYBOARD_ITEM_ID)))
      .toContain(STORYBOARD_PROVISIONAL);
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

  it('does not forget a walk just because the stage width changed', () => {
    expect(patchStoryboardSearch('', { width: '430' })).toBe('?width=430');
    expect(patchStoryboardSearch('?beat=question', { width: '430' })).toBe('?beat=question&width=430');
    const { unmount } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    fireEvent.change(screen.getByLabelText('Leave this open'), {
      target: { value: 'Which mistakes?' }
    });
    unmount();
    renderBoard();
    expect(screen.getByLabelText('Leave this open')).toHaveValue('Which mistakes?');
  });

  it('keeps Open findable at the 430 stage without hover', () => {
    const css = fs.readFileSync(path.join(__dirname, 'open-sentence-storyboard.css'), 'utf8');
    expect(css).toMatch(/width:\s*var\(--storyboard-width, 1440px\)/);
    expect(css).toMatch(
      /\[data-width='430'\][\s\S]*open-sentence__open:not\(:focus-visible\)\s*\{\s*opacity:\s*0\.7;/
    );
    expect(css).toMatch(/\[data-width='430'\][\s\S]*open-sentence__chip[\s\S]*display:\s*none;/);
  });

  it('opens from the keyboard on the held sentence', () => {
    renderBoard();
    fireEvent.keyDown(screen.getByRole('button', { name: STORYBOARD_SENTENCE }), { key: 'Enter' });
    expect(screen.getByText(/The article still reads/)).toBeInTheDocument();
    expect(screen.getByText('Now with').closest('p')).toHaveTextContent(STORYBOARD_SENTENCE);
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
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'A narrower library line.' }
    });
    expect(screen.queryByRole('button', { name: 'Propose this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Parenting →' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
  });

  it('names a premise beside Compute without inventing a chain or leaving the pocket', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Pressure' }));
    expect(screen.getByRole('heading', { name: STORYBOARD_COMPUTE_TITLE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_COMPUTE_SENTENCE })).toBeInTheDocument();
    expect(screen.getByDisplayValue(STORYBOARD_PREMISE)).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(screen.queryByText(STORYBOARD_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(
      screen.getByText('The original stays. The experiment is not a generated causal chain.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(STORYBOARD_PREMISE)).not.toBeInTheDocument();
  });

  it('puts the earlier Compute line beside today without Parenting copy or a biography', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Then' }));
    expect(screen.getByRole('heading', { name: STORYBOARD_COMPUTE_TITLE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_THEN_NOW })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_THEN_NOW);
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(document.querySelector('.open-sentence-pocket__then-source')).toHaveTextContent(STORYBOARD_THEN_QUOTATION);
    expect(screen.getByText('Supply was the constraint this decade.')).toBeInTheDocument();
    expect(screen.queryByText(STORYBOARD_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/slower-demand experiment/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(
      screen.getByText('The earlier wording is recorded. It is not a reconstructed biography.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(document.querySelector('.open-sentence-pocket__then')).not.toBeInTheDocument();
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
