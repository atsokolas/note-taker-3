import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as Router from 'react-router-dom';
import OpenedLibraryPassage from './OpenedLibraryPassage';
import { writeReturnTicket } from './openSentenceJourney';

jest.mock('../../../api/notebook', () => ({
  getNotebookSummaries: () => new Promise(() => {}),
  getNotebookEntry: async () => null,
  createNotebookEntry: async () => null,
  updateNotebookEntry: async () => null
}));

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

const persistence = { load: jest.fn(), save: jest.fn(), keep: jest.fn(), discard: jest.fn() };

const renderPassage = async (props = {}) => {
  let view;
  await act(async () => { view = render(
  <MemoryRouter>
    <OpenedLibraryPassage
      article={article}
      highlight={highlight}
      inArticle={false}
      persistence={persistence}
      {...props}
    />
  </MemoryRouter>
  ); });
  return view;
};

describe('OpenedLibraryPassage', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    jest.clearAllMocks();
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [] });
    persistence.save.mockImplementation(async (articleId, highlightId, payload) => ({ articleId, highlightId, revision: payload.expectedRevision + 1, draft: payload.draft, keeps: [] }));
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  const earlier = {
    articleId: 'article-1', highlightId: 'highlight-1', revision: 3, originStale: true,
    draft: { title: 'Room to return', writing: 'These words outlive the mark.', originalText: highlight.text, question: 'What remains?', returnNote: 'Try the exception.' },
    keeps: [{ destination: 'notebook', status: 'complete', targetId: 'note-1' }]
  };

  it('discovers live and earlier work from an ordinary article without opening or saving', async () => {
    const onOpenedText = jest.fn();
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [
      { ...earlier, originStale: false },
      { ...earlier, highlightId: 'gone', draft: { title: 'An earlier thought', writing: 'Keep this distinct.' } },
      { highlightId: 'empty', draft: { originalText: 'Only a quotation.', provisionalText: 'Only a quotation.' } }
    ] });
    await renderPassage({ highlight: null, highlights: [highlight], onOpenedText });
    expect(screen.getByRole('button', { name: 'Room to return' })).toBeVisible();
    expect(screen.getByText('Try the exception.')).toBeVisible();
    expect(screen.getByText('An earlier thought', { selector: 'summary' })).toBeVisible();
    expect(screen.getByText('Earlier passage')).toBeVisible();
    expect(screen.queryByText('Only a quotation.')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(onOpenedText).not.toHaveBeenCalled();
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('preserves Library scope and folder when choosing live or earlier writing', async () => {
    jest.spyOn(Router, 'useLocation').mockReturnValue({ search: '?scope=kept&folder=folder-1', key: 'browse' });
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [earlier, { ...earlier, highlightId: 'gone', draft: { title: 'An earlier thought', writing: 'Earlier words.' } }] });
    await renderPassage({ highlight: null, highlights: [highlight] });
    fireEvent.click(screen.getByRole('button', { name: 'Room to return' }));
    expect(Router.useNavigate()).toHaveBeenLastCalledWith({ pathname: '/library', search: 'scope=kept&folder=folder-1&articleId=article-1&highlightId=highlight-1&exploration=1', hash: '' });
    const details = screen.getByText('An earlier thought', { selector: 'summary' }).closest('details');
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(Router.useNavigate()).toHaveBeenLastCalledWith({ pathname: '/library', search: 'scope=kept&folder=folder-1&articleId=article-1&highlightId=gone&exploration=1', hash: '' });
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('keeps empty articles quiet and distinguishes failure without an origin request', async () => {
    const view = await renderPassage({ highlight: null });
    expect(screen.queryByLabelText('Your work here')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.unmount();
    persistence.load.mockRejectedValueOnce(new Error('Offline'));
    await renderPassage({ highlight: null });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText(/No saved writing was found/)).not.toBeInTheDocument();
  });

  it('keeps one account-bound load while moving between highlights in the article', async () => {
    const view = await renderPassage();
    view.rerender(<MemoryRouter><OpenedLibraryPassage article={article} highlight={{ ...highlight, _id: 'another' }} persistence={persistence} /></MemoryRouter>);
    expect(persistence.load).toHaveBeenCalledTimes(1);
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('opens missing-highlight recovery at the saved quotation and words without editing or saving', async () => {
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [earlier] });
    const onOpenedText = jest.fn();
    await renderPassage({ highlight: null, focusedHighlightId: 'highlight-1', onOpenedText });
    expect(screen.getByText('Room to return', { selector: 'summary' }).closest('details')).toHaveAttribute('open');
    expect(screen.getByText(highlight.text)).toBeVisible();
    expect(screen.getByText(earlier.draft.writing)).toBeVisible();
    expect(screen.getByText('Try the exception.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open kept note' })).toHaveAttribute('href', '/think?tab=notebook&entryId=note-1');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep question' })).not.toBeInTheDocument();
    expect(persistence.save).not.toHaveBeenCalled();
    expect(onOpenedText).not.toHaveBeenCalled();
  });

  it('distinguishes an interrupted load from absent work and retries in place', async () => {
    persistence.load.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ userId: 'owner-1', explorations: [earlier] });
    await renderPassage({ highlight: null, focusedHighlightId: 'highlight-1' });
    expect(screen.queryByText(/No saved writing was found/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(earlier.draft.writing)).toBeVisible();
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('does not attach recovered writing to an identical replacement highlight', async () => {
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [earlier] });
    await renderPassage({ highlight: { ...highlight, _id: 'replacement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }));
    expect(screen.getByLabelText('Your writing')).toHaveValue('');
    expect(screen.getByText(earlier.draft.writing)).not.toBeVisible();
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('finishes an existing Library Keep without saving the missing origin again', async () => {
    const pending = { ...earlier, keeps: [{ destination: 'notebook', status: 'pending', targetId: 'note-1', mutationId: 'keep-1' }] };
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [pending] });
    persistence.keep.mockResolvedValue({ exploration: earlier });
    await renderPassage({ highlight: null, focusedHighlightId: 'highlight-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Finish keeping note' }));
    expect(await screen.findByRole('link', { name: 'Open kept note' })).toBeInTheDocument();
    expect(persistence.keep).toHaveBeenCalledWith('article-1', 'highlight-1', { expectedRevision: 3, mutationId: 'keep-1', destination: 'notebook' });
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('keeps both versions after stale Discard and deletes only after reviewing the current revision', async () => {
    const current = { ...earlier, revision: 4, draft: { ...earlier.draft, writing: 'A newer saved version.' } };
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [earlier] });
    persistence.discard.mockRejectedValueOnce({ response: { status: 409, data: { current } } }).mockResolvedValueOnce();
    await renderPassage({ highlight: null, focusedHighlightId: 'highlight-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard exploration' }));
    expect(await screen.findByText('This work changed elsewhere. Both versions are available.')).toBeInTheDocument();
    expect(screen.getByText(earlier.draft.writing)).toBeVisible();
    expect(screen.getByText(current.draft.writing)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use the saved version' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard exploration' }));
    await waitFor(() => expect(screen.queryByText('Room to return', { selector: 'summary' })).not.toBeInTheDocument());
    expect(persistence.discard).toHaveBeenLastCalledWith('article-1', 'highlight-1', 4);
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('recovers a saved unresolved field even without a title or main writing', async () => {
    persistence.load.mockResolvedValue({ userId: 'owner-1', explorations: [{ ...earlier, draft: { originalText: highlight.text, pressure: { unknown: 'Whose room is at stake?' } } }] });
    await renderPassage({ highlight: null, focusedHighlightId: 'highlight-1' });
    expect(screen.getByText('Whose room is at stake?', { selector: 'summary' })).toBeVisible();
  });

  it('reopens when Work with this passage navigates to the same saved passage again', async () => {
    const location = jest.spyOn(Router, 'useLocation').mockReturnValue({ search: '?exploration=1', key: 'first' });
    const view = await renderPassage();
    fireEvent.click(document.querySelector('.open-sentence__open'));
    expect(screen.getByRole('button', { name: 'Open', exact: true })).toBeInTheDocument();
    location.mockReturnValue({ search: '?exploration=1', key: 'again' });
    view.rerender(<MemoryRouter><OpenedLibraryPassage article={article} highlight={highlight} persistence={persistence} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Open', exact: true })).not.toBeInTheDocument();
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('lands on the saved passage without opening the pocket', async () => {
    writeReturnTicket({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      claimId: 'claim-1'
    });
    const onOpenedText = jest.fn();
    await renderPassage({ onOpenedText });
    expect(screen.getByText(/You were holding Children need room to make mistakes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Parenting →' })).toHaveAttribute(
      'href',
      '/wiki/read/wiki-1?claimId=claim-1'
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    expect(onOpenedText).toHaveBeenCalledWith('');
  });

  it('opens the same pocket and hides the Library door because you are already here', async () => {
    await renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Opened sentence')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent(highlight.text);
    expect(document.querySelector('.open-sentence-pocket__then')).not.toBeInTheDocument();
    expect(screen.queryByText('Also beside')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('How they meet')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('The space between')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this as an experiment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this as an essay' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'A narrower library line.' }
    });
    expect(screen.queryByRole('button', { name: 'Propose this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this as the line' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read around this' }));
    expect(screen.getByText('Getting lost was part of the work.')).toBeInTheDocument();
  });

  it('lets the person suppose without a Wiki write', async () => {
    await renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suppose this stops being true' }));
    fireEvent.change(screen.getByLabelText('For this experiment'), {
      target: { value: 'the turn cannot be walked back' }
    });
    expect(screen.getByDisplayValue('the turn cannot be walked back')).toBeInTheDocument();
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent(highlight.text);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this as the line' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
  });

  it('lets a named distinction be kept as an instrument without a Wiki write', async () => {
    await renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('button', { name: 'Keep this as an instrument' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('The distinction that would help'), {
      target: { value: 'A turn you can walk back from, versus one that strands you.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an instrument' }));
    fireEvent.change(screen.getByLabelText('Name this instrument'), {
      target: { value: 'Room to be wrong' }
    });
    expect(screen.getByText(/An instrument, not the line/)).toHaveTextContent('Room to be wrong');
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent(highlight.text);
    expect(screen.queryByRole('button', { name: 'Propose this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
  });

  it('lets remaining S5 work sit beside a Library passage without a Wiki write', async () => {
    await renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('button', { name: 'Carry this out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Let two contributions meet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an exhibit' }));
    fireEvent.change(screen.getByLabelText('Name this exhibit'), {
      target: { value: 'Recoverable, or not' }
    });
    fireEvent.change(screen.getByLabelText('This way'), {
      target: { value: 'A scrape you can walk back from still teaches the ground.' }
    });
    fireEvent.change(screen.getByLabelText('The other way'), {
      target: { value: 'A stranding ends the walk.' }
    });
    expect(screen.getByText(/An exhibit, not evidence/)).toHaveTextContent('Recoverable, or not');
    fireEvent.click(screen.getByRole('button', { name: 'Try saying it' }));
    fireEvent.change(screen.getByLabelText('Try saying it'), {
      target: { value: 'Care is letting a child find the path without being carried.' }
    });
    expect(screen.getByText('A rehearsal, not a grade.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as unwritten work' }));
    fireEvent.change(screen.getByLabelText('What this collection could become'), {
      target: { value: 'Who gets to experiment, and who pays for the mistake?' }
    });
    expect(screen.getByText('Unwritten work, not the article.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read around this' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this source' }));
    expect(screen.queryByRole('button', { name: 'Read around this' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bring Nomad back' })).toBeInTheDocument();
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent(highlight.text);
    expect(screen.queryByRole('button', { name: 'Propose this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carry this out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Let two contributions meet' })).not.toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('places the passage beside the Wiki thought you walked from', async () => {
    writeReturnTicket({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      claimId: 'claim-1'
    });
    await renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place beside' }));
    expect(screen.getByText('Beside Parenting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));
    expect(screen.getByText('Placed beside Parenting')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('noeis.open-sentence.wiki-1.claim-1')).placed).toBe(true);
  });

  it('preserves authored wording on close and does not save merely to reopen', async () => {
    await renderPassage();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'A wrong turn you can name still teaches the map.' }
    });
    await screen.findByText('Saved privately');
    expect(persistence.save).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.open-sentence__open'));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('A wrong turn you can name still teaches the map.');
    expect(persistence.save).toHaveBeenCalledTimes(1);
  });

  it('preserves older device words and their original passage until a deliberate edit', async () => {
    window.localStorage.setItem('noeis.open-sentence.library:article-1.highlight-1', JSON.stringify({
      id: 'highlight-1',
      originalText: highlight.text,
      provisionalText: 'A wrong turn you can name still teaches the map.',
      question: 'Can you walk it back?',
      status: 'open'
    }));
    window.localStorage.setItem('noeis.open-sentence.library:article-1.opened', 'highlight-1');
    const moved = {
      ...highlight,
      text: 'A later line in Nomad was not attached.'
    };
    await renderPassage({ highlight: moved });
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('A wrong turn you can name still teaches the map.');
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent('A later line in Nomad was not attached.');
    expect(JSON.parse(window.localStorage.getItem('noeis.open-sentence.library:article-1.highlight-1')).originalText)
      .toBe(highlight.text);
    expect(persistence.save).not.toHaveBeenCalled();
  });
});
