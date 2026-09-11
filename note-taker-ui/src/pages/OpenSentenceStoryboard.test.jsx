import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import OpenSentenceStoryboard, { patchStoryboardSearch } from './OpenSentenceStoryboard';
import { draftStorageKey, openedStorageKey } from '../components/wiki/open-sentence/openSentenceBinding';
import { sourceClip } from '../components/wiki/open-sentence/openSentenceModel';
import {
  STORYBOARD_BEARING_SOURCE,
  STORYBOARD_COMPUTE_SENTENCE,
  STORYBOARD_COMPUTE_SOURCE,
  STORYBOARD_COMPUTE_TITLE,
  STORYBOARD_ITEM_ID,
  STORYBOARD_MEET_LIMIT,
  STORYBOARD_MEET_RELATION,
  STORYBOARD_MEET_SOURCE,
  STORYBOARD_PREMISE,
  STORYBOARD_PROVISIONAL,
  STORYBOARD_QUESTION,
  STORYBOARD_DISTINCTION,
  STORYBOARD_EXHIBIT_NAME,
  STORYBOARD_EXHIBIT_OTHER,
  STORYBOARD_EXHIBIT_THIS,
  STORYBOARD_INSTRUMENT_NAME,
  STORYBOARD_NARROWER,
  STORYBOARD_NARROW_REASON,
  STORYBOARD_REHEARSAL,
  STORYBOARD_UNWRITTEN,
  STORYBOARD_UNWRITTEN_GAP,
  STORYBOARD_CARRY_CONCLUSION,
  STORYBOARD_CARRY_QUESTION,
  STORYBOARD_CONTRIBUTIONS_QUESTION,
  STORYBOARD_BOTH_ACCEPT,
  STORYBOARD_THIS_DISPUTES,
  STORYBOARD_OTHER_DISPUTES,
  STORYBOARD_OBSERVATION,
  STORYBOARD_SCOPE,
  STORYBOARD_SENTENCE,
  STORYBOARD_SOURCE,
  STORYBOARD_THEN_NOW,
  STORYBOARD_THEN_ORIGINAL,
  STORYBOARD_THEN_QUESTION,
  STORYBOARD_THEN_QUOTATION,
  STORYBOARD_THEN_BESIDE
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

  it('names the page from the wording and leaves the article line', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Make this the title' }));
    expect(screen.getByRole('heading', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: STORYBOARD_SENTENCE })).not.toHaveClass('is-unnamed');
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('The title is named. The sentence stays.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
    expect(screen.getByRole('button', { name: 'Read it fresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(openedStorageKey(STORYBOARD_SCOPE))).toBe(STORYBOARD_ITEM_ID);
    expect(window.sessionStorage.getItem(draftStorageKey(STORYBOARD_SCOPE, STORYBOARD_ITEM_ID)))
      .toContain(STORYBOARD_PROVISIONAL);
    unmount();
    renderBoard();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_PROVISIONAL);
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
  });

  it('returns later material beside the unfinished question without closing it', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave open' }));
    expect(screen.queryByText('Bears on this distinction.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
    expect(screen.getByText('Bears on this distinction.')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_BEARING_SOURCE.passage)).toBeInTheDocument();
    expect(
      screen.getByText('This bears on the distinction. It does not close the question.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/resolved/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Keep Capacity as what still holds' }));
    expect(screen.getByLabelText('What still holds')).toHaveValue(STORYBOARD_COMPUTE_SOURCE.passage);
    expect(document.querySelector('.open-sentence-pocket__pressure')).toHaveTextContent('Capacity');
    expect(screen.queryByRole('button', { name: 'Keep Capacity as unknown' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
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
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_THEN_BESIDE.passage);
    expect(screen.getByText('Then you left this open')).toBeInTheDocument();
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_THEN_QUESTION);
    expect(within(document.querySelector('.open-sentence-pocket__then')).getByLabelText('The distinction that would help')).toHaveValue('');
    expect(document.querySelectorAll('.open-sentence-pocket__question textarea')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Return to source →' })).toHaveAttribute(
      'href',
      STORYBOARD_THEN_ORIGINAL
    );
    expect(screen.queryByText('Also beside')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(screen.getByText('Supply was the constraint this decade.')).toBeInTheDocument();
    expect(screen.queryByText(STORYBOARD_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/slower-demand experiment/)).not.toBeInTheDocument();
    expect(
      screen.getByText('The earlier wording is recorded. It is not a reconstructed biography.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(document.querySelector('.open-sentence-pocket__then')).not.toBeInTheDocument();
  });

  it('lets a Then passage sit as what still holds without inventing a consequence', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Then' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suppose this stops being true' }));
    expect(screen.getByRole('button', { name: 'Keep Capacity as what still holds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep earlier Capacity as what still holds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Plant log as what still holds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Then you left this open/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep earlier Capacity as what still holds' }));
    expect(screen.getByLabelText('What still holds')).toHaveValue(STORYBOARD_THEN_QUOTATION);
    expect(screen.queryByRole('button', { name: 'Keep earlier Capacity as unknown' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.queryByLabelText('What still holds')).not.toBeInTheDocument();
  });

  it('copies a bound passage with its source, including the recorded Then door', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sourceClip(STORYBOARD_SOURCE)));
    fireEvent.click(screen.getByRole('button', { name: 'Then' }));
    const quoted = [...document.querySelectorAll('.open-sentence-pocket__then-source')]
      .find((node) => node.textContent.includes(STORYBOARD_THEN_QUOTATION));
    fireEvent.click([...quoted.querySelectorAll('button')].find((el) => el.textContent === 'Copy with source'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `"${STORYBOARD_THEN_QUOTATION}"\n— Capacity\n${STORYBOARD_THEN_ORIGINAL}`
    ));
    const question = [...document.querySelectorAll('.open-sentence-pocket__then-source')]
      .find((node) => node.textContent.includes('Then you left this open'));
    expect(question.querySelector('button')).toBeNull();
  });

  it('puts the investment letter beside Parenting without generating the connection', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Meet' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText('Also beside')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_MEET_SOURCE.passage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try the other way' })).toBeInTheDocument();
    expect(screen.getByLabelText('How they meet')).toHaveValue(STORYBOARD_MEET_RELATION);
    expect(screen.getByLabelText('Where that stops')).toHaveValue(STORYBOARD_MEET_LIMIT);
    expect(screen.getByLabelText('The space between')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Keep this as an experiment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this as the line' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this as an essay' })).not.toBeInTheDocument();
    expect(screen.queryByText(STORYBOARD_THEN_BESIDE.passage)).not.toBeInTheDocument();
    expect(screen.queryByText(STORYBOARD_COMPUTE_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(
      screen.getByText('Both ends are inspectable. The space between is yours.')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('The space between'), {
      target: { value: 'Survivable error is not the same kind of care.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an experiment' }));
    expect(screen.getByLabelText('For this experiment')).toHaveValue(
      'Survivable error is not the same kind of care.'
    );
    expect(screen.getByLabelText('What still holds')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Propose this as the line' }));
    expect(screen.getByText(/Proposed, not accepted/)).toHaveTextContent(
      'Survivable error is not the same kind of care.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an essay' }));
    expect(screen.getByText(/An essay, not the line/)).toHaveTextContent(
      'Survivable error is not the same kind of care.'
    );
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.queryByText('Also beside')).not.toBeInTheDocument();
  });

  it('keeps a named distinction as an instrument and applies it beside Compute without writing', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave open' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
    expect(screen.queryByRole('button', { name: 'Use this here' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an instrument' }));
    fireEvent.change(screen.getByLabelText('Name this instrument'), {
      target: { value: STORYBOARD_INSTRUMENT_NAME }
    });
    expect(screen.getByText(/An instrument, not the line/)).toHaveTextContent(STORYBOARD_INSTRUMENT_NAME);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    fireEvent.click(screen.getByRole('button', { name: 'Instrument' }));
    expect(screen.getByRole('heading', { name: STORYBOARD_COMPUTE_TITLE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_COMPUTE_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/An instrument, not the line/)).toHaveTextContent(STORYBOARD_INSTRUMENT_NAME);
    expect(screen.getByText('Used here as written.')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_DISTINCTION)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this as an instrument' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this here' })).not.toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(
      screen.getByText('The instrument sits beside this sentence. It does not rewrite the article.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('narrows a failed Compute use and keeps the old words on that use', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an instrument' }));
    fireEvent.change(screen.getByLabelText('Name this instrument'), {
      target: { value: STORYBOARD_INSTRUMENT_NAME }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Instrument' }));
    fireEvent.click(screen.getByRole('button', { name: "This didn't hold" }));
    fireEvent.change(screen.getByLabelText('A narrower definition'), {
      target: { value: STORYBOARD_NARROWER }
    });
    fireEvent.change(screen.getByLabelText('Why it failed here'), {
      target: { value: STORYBOARD_NARROW_REASON }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep this wording' }));
    expect(screen.getByText(STORYBOARD_DISTINCTION)).toBeInTheDocument();
    expect(screen.getByText('Used here as written.')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_NARROW_REASON, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Changed words')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This didn't hold" })).not.toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
  });

  it('keeps two readings as an exhibit without writing', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Exhibit' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/An exhibit, not evidence/)).toHaveTextContent(STORYBOARD_EXHIBIT_NAME);
    expect(screen.getByLabelText('This way')).toHaveValue(STORYBOARD_EXHIBIT_THIS);
    expect(screen.getByLabelText('The other way')).toHaveValue(STORYBOARD_EXHIBIT_OTHER);
    fireEvent.click(screen.getByRole('button', { name: 'Show the other way' }));
    expect(screen.getByRole('button', { name: 'Show the other way' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(
      screen.getByText('The exhibit is an illustration. It is not evidence.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets the person try saying it without a grade', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Rehearse' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByText('A rehearsal, not a grade.')).toBeInTheDocument();
    expect(screen.getByLabelText('Try saying it')).toHaveValue(STORYBOARD_REHEARSAL);
    expect(screen.getByText('Still beside this explanation.')).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('The explanation is yours. It is not a grade.')).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('names unwritten work without ghostwriting the article', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Unwritten' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByText('Unwritten work, not the article.')).toBeInTheDocument();
    expect(screen.getByLabelText('What this collection could become')).toHaveValue(STORYBOARD_UNWRITTEN);
    expect(screen.getByLabelText('What still stops it')).toHaveValue(STORYBOARD_UNWRITTEN_GAP);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('This is not the article. The gap stays a gap.')).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('sets the Nomad source aside without deleting it', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Limits' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.queryByText(STORYBOARD_SOURCE.passage)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByRole('button', { name: 'Bring Nomad back' })).toBeInTheDocument();
    expect(screen.getByText('The source is set aside. It is not deleted.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bring Nomad back' }));
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
  });

  it('carries a snapshot of two included passages without publishing', () => {
    renderBoard();
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Scene' })).getByRole('button', { name: 'Carry' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByText('A snapshot. It is not a publication.')).toBeInTheDocument();
    expect(screen.getByLabelText('The question')).toHaveValue(STORYBOARD_CARRY_QUESTION);
    expect(screen.getByLabelText('A provisional conclusion')).toHaveValue(STORYBOARD_CARRY_CONCLUSION);
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(STORYBOARD_SOURCE.passage);
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(STORYBOARD_MEET_SOURCE.passage);
    expect(screen.getByLabelText('What a recipient would see').querySelector('a')).toBeNull();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('This is a snapshot. It is not a publication.')).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets two bound passages meet as attributed contributions, not a consensus', () => {
    renderBoard();
    fireEvent.click(
      within(screen.getByRole('tablist', { name: 'Scene' })).getByRole('button', {
        name: 'Libraries',
        exact: true
      })
    );
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(screen.getByText('Two contributions. Not a consensus.', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Different values', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByLabelText('Shared question')).toHaveValue(STORYBOARD_CONTRIBUTIONS_QUESTION);
    expect(screen.getByLabelText('What both accept')).toHaveValue(STORYBOARD_BOTH_ACCEPT);
    expect(screen.getByLabelText(`What ${STORYBOARD_SOURCE.title} still disputes`))
      .toHaveValue(STORYBOARD_THIS_DISPUTES);
    expect(screen.getByLabelText(`What ${STORYBOARD_MEET_SOURCE.title} still disputes`))
      .toHaveValue(STORYBOARD_OTHER_DISPUTES);
    expect(screen.getByLabelText('What observation might help')).toHaveValue(STORYBOARD_OBSERVATION);
    expect(screen.getByRole('button', { name: 'Different values' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('Two contributions. Not a consensus. Not a motive.')).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('sets the Parenting paragraph aside without deleting it', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Without' }));
    expect(screen.getByRole('heading', { name: 'Parenting' })).toBeInTheDocument();
    expect(document.querySelector('.open-sentence')).toHaveClass('is-without');
    expect(screen.getByText(/Care is not the same as preventing every scrape/)).toBeInTheDocument();
    expect(screen.getByText(/The useful distinction is not whether a mistake happened/)).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByRole('button', { name: `Bring “${STORYBOARD_SENTENCE}” back` })).toBeInTheDocument();
    expect(screen.getByText('The paragraph is set aside. It is not deleted.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Bring “${STORYBOARD_SENTENCE}” back` }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: STORYBOARD_DISTINCTION })).toBeInTheDocument();
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
