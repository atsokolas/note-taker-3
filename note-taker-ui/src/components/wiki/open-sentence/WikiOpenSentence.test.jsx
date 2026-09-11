import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import renderTiptapDoc from '../renderTiptapDoc';
import { WikiOpenSentenceProvider, wrapOpenableParagraph } from './WikiOpenSentence';
import { draftStorageKey, openedStorageKey } from './openSentenceBinding';
import { RETURN_TICKET_KEY } from './openSentenceJourney';
import { writeStore } from './openSentenceStore';
import { sourceClip } from './openSentenceModel';

const page = {
  _id: 'wiki-1',
  title: 'Enterprise AI Memory',
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Memory compounds with review.',
        marks: [{
          type: 'claim',
          attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1] }
        }]
      }]
    }]
  },
  claims: [{ claimId: 'claim-1', text: 'Memory compounds with review.', support: 'supported' }],
  citations: [],
  sourceRefs: [{
    _id: 'source-1',
    type: 'highlight',
    objectId: 'highlight-1',
    parentObjectId: 'article-1',
    title: 'Memory article',
    snippet: 'Source snippet'
  }]
};

const twoSourcePage = {
  ...page,
  claims: [{
    claimId: 'claim-1',
    text: 'Memory compounds with review.',
    support: 'supported',
    sourceRefIds: ['source-1', 'source-letter']
  }],
  sourceRefs: [
    page.sourceRefs[0],
    {
      _id: 'source-letter',
      type: 'highlight',
      objectId: 'highlight-letter',
      parentObjectId: 'article-letter',
      title: 'Letter to a young investor',
      snippet: 'A loss you can survive still teaches the book.'
    }
  ],
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Memory compounds with review.',
        marks: [{
          type: 'claim',
          attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1, 2] }
        }]
      }]
    }]
  }
};

const providerFrom = (props, onOpenedClaim) => (
  <WikiOpenSentenceProvider
    enabled={props.enabled !== false}
    page={props.page || page}
    pageId={props.pageId || 'wiki-1'}
    revisions={props.revisions}
    onOpenedClaim={onOpenedClaim}
    onOpenedExploration={props.onOpenedExploration}
    readFresh={props.readFresh}
    durable={props.durable}
    persistence={props.persistence}
    onAcceptWording={props.onAcceptWording}
    onMakeTitle={props.onMakeTitle}
  >
    {renderTiptapDoc((props.page || page).body, { wrapParagraph: wrapOpenableParagraph })}
  </WikiOpenSentenceProvider>
);

const renderWikiSentence = (props = {}) => {
  const onOpenedClaim = props.onOpenedClaim || jest.fn();
  const rendered = render(
    <MemoryRouter>
      {providerFrom(props, onOpenedClaim)}
    </MemoryRouter>
  );
  return {
    onOpenedClaim,
    unmount: rendered.unmount,
    rerender: (next = {}) => rendered.rerender(
      <MemoryRouter>
        {providerFrom({ ...props, ...next }, next.onOpenedClaim || onOpenedClaim)}
      </MemoryRouter>
    )
  };
};

describe('WikiOpenSentence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('pauses hidden writing controls without closing, reloading or resaving the work', async () => {
    window.history.replaceState({}, '', '/wiki/read/wiki-1?claimId=claim-1&exploration=1');
    const persistence = { load: jest.fn(async () => ({ userId: 'owner-1', explorations: [{ claimId: 'claim-1', revision: 2, draft: { writing: 'My distinction.', originalText: 'Memory compounds with review.' } }] })), save: jest.fn() };
    const onOpenedExploration = jest.fn();
    const view = renderWikiSentence({ durable: true, persistence, onOpenedExploration });
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(writing).toHaveValue('My distinction.'));
    view.rerender({ readFresh: true });
    expect(onOpenedExploration).toHaveBeenLastCalledWith(null);
    expect(view.onOpenedClaim).toHaveBeenLastCalledWith('');
    fireEvent.keyDown(window, { key: 'Escape' });
    view.rerender({ readFresh: false });
    expect(screen.getByRole('textbox', { name: 'Your writing' })).toBe(writing);
    expect(writing).toHaveValue('My distinction.');
    expect(onOpenedExploration).toHaveBeenLastCalledWith(expect.objectContaining({ claimId: 'claim-1' }));
    expect(persistence.load).toHaveBeenCalledTimes(1);
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('recovers every private field when the marked sentence disappears but its ledger remains', async () => {
    const draft = {
      title: 'Room to return', originalText: 'An earlier sentence.',
      writing: 'An earlier paragraph.', question: 'What changes?', returnNote: 'Next: an exception.',
      provisionalText: 'An alternative line.',
      pressure: { against: 'An earlier sentence.', premise: 'Suppose memory fades.', stillHolds: 'A record remains.', unknown: 'Who returns?' },
      meet: { relation: 'A useful likeness.', limit: 'Different circumstances.', between: 'A bridge between them.' },
      essay: { text: 'An earlier essay.', against: 'An earlier sentence.' },
      proposal: { text: 'A proposed line.', against: 'An earlier sentence.' },
      selectedSource: { title: 'An owned source', passage: 'The chosen words.' },
    };
    const persistence = { load: jest.fn(async () => ({ userId: 'owner-1', explorations: [{ claimId: 'claim-1', draft, revision: 2 }] })) };
    renderWikiSentence({ durable: true, persistence, page: { ...page, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A different sentence.' }] }] } } });
    expect(await screen.findByText('Room to return', { selector: 'summary' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Room to return', { selector: 'summary' }));
    for (const value of ['An earlier paragraph.', 'What changes?', 'Next: an exception.', 'An alternative line.', 'Suppose memory fades.', 'A record remains.', 'Who returns?', 'A useful likeness.', 'Different circumstances.', 'A bridge between them.', 'An earlier essay.', 'A proposed line.', 'The chosen words.']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.queryByRole('textbox', { name: 'Your writing' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard exploration' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Keep in Notebook' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep question' })).not.toBeInTheDocument();
  });

  it('opens a removed sentence return link directly to saved words without saving or focusing an editor', async () => {
    window.history.replaceState({}, '', '/wiki/read/wiki-1?claimId=claim-1&exploration=1');
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: [{ claimId: 'claim-1', revision: 2, draft: { title: 'Room to return', writing: 'Words that remain.', returnNote: 'Try the exception.' } }] })),
      save: jest.fn()
    };
    try {
      renderWikiSentence({ durable: true, persistence, page: { ...page, claims: [], body: { type: 'doc', content: [] } } });
      const summary = await screen.findByText('Room to return', { selector: 'summary' });
      await waitFor(() => expect(summary.closest('details')).toHaveAttribute('open'));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
      expect(screen.getByText('Words that remain.')).toBeVisible();
      expect(screen.getByText('Try the exception.')).toBeVisible();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(persistence.save).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState({}, '', '/');
      Element.prototype.scrollIntoView = originalScroll;
    }
  });

  it('finishes a reserved Keep from removed-claim recovery and preserves its private words', async () => {
    const saved = {
      claimId: 'claim-1', revision: 2,
      draft: { title: 'Room to return', writing: 'Words that outlive the sentence.', originalText: 'An earlier sentence.' },
      keeps: [{ destination: 'notebook', status: 'pending', targetId: 'note-1', mutationId: 'keep-1' }]
    };
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: [saved] })),
      save: jest.fn(),
      keep: jest.fn(async () => ({ exploration: { ...saved, keeps: [{ ...saved.keeps[0], status: 'complete' }] } }))
    };
    renderWikiSentence({ durable: true, persistence, page: { ...page, claims: [], body: { type: 'doc', content: [] } } });
    fireEvent.click(await screen.findByText('Room to return', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish keeping note' }));
    expect(await screen.findByRole('link', { name: 'Open kept note' })).toHaveAttribute('href', '/think?tab=notebook&entryId=note-1');
    expect(screen.getByText('Words that outlive the sentence.')).toBeInTheDocument();
    expect(persistence.save).not.toHaveBeenCalled();
    expect(persistence.keep).toHaveBeenCalledWith('wiki-1', 'claim-1', expect.objectContaining({ destination: 'notebook' }));
    expect(screen.queryByRole('button', { name: 'Keep question' })).not.toBeInTheDocument();
  });

  it('explains why Keep failed without losing the authored words or claiming success', async () => {
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: [] })),
      save: jest.fn(async (_pageId, claimId, payload) => ({ claimId, draft: payload.draft, revision: payload.expectedRevision + 1, keeps: [] })),
      keep: jest.fn().mockRejectedValue({ isAxiosError: true, message: 'Request failed with status code 409', response: { status: 409, data: { error: 'The selected passage changed.' } } })
    };
    renderWikiSentence({ durable: true, persistence });
    await waitFor(() => expect(persistence.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(writing).toBeEnabled());
    fireEvent.change(writing, { target: { value: 'These words remain mine.' } });
    await screen.findByText('Saved privately');
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Notebook' }));
    expect(await screen.findByText('The selected passage changed.')).toBeInTheDocument();
    expect(writing).toHaveValue('These words remain mine.');
    expect(screen.queryByText('Request failed with status code 409')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open kept note' })).not.toBeInTheDocument();
  });

  it.each([false, true])('recovers a stale Discard without hiding either version (removed claim: %s)', async removed => {
    const original = { claimId: 'claim-1', revision: 1, keeps: [],
      draft: { title: 'A thought to revisit', writing: 'My original words.', originalText: 'Memory compounds with review.' } };
    const newer = { ...original, revision: 2, draft: { ...original.draft, writing: 'Newer words from another session.' } };
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: [original] })),
      save: jest.fn(),
      discard: jest.fn().mockRejectedValueOnce({ response: { status: 409,
        data: { current: newer, error: 'The exploration revision is stale.' } } }).mockResolvedValueOnce({})
    };
    renderWikiSentence({ durable: true, persistence,
      ...(removed ? { page: { ...page, claims: [], body: { type: 'doc', content: [] } } } : {}) });
    const works = await screen.findByRole('complementary', { name: 'Your work here' });
    fireEvent.click(within(works).getByText('A thought to revisit', { selector: removed ? 'summary' : 'button' }));
    if (!removed) fireEvent.click(screen.getByText('Exploration options'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard exploration' }));
    fireEvent.click(await screen.findByText('Read the saved version'));
    expect(screen.getByText('Newer words from another session.')).toBeInTheDocument();
    if (removed) {
      expect(screen.getByText('My original words.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save my version instead' })).not.toBeInTheDocument();
    } else expect(screen.getByRole('textbox', { name: 'Your writing' })).toHaveValue('My original words.');
    expect(screen.getByRole('button', { name: 'Discard exploration' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use the saved version' }));
    expect(screen.queryByText('The exploration revision is stale.')).not.toBeInTheDocument();
    expect(persistence.save).not.toHaveBeenCalled();
    expect(persistence.discard).toHaveBeenCalledTimes(1);
    const discard = screen.getByRole('button', { name: 'Discard exploration' });
    expect(discard).toBeEnabled();
    fireEvent.click(discard);
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Your work here' })).not.toBeInTheDocument());
    expect(persistence.discard).toHaveBeenLastCalledWith('wiki-1', 'claim-1', 2);
  });

  it('offers Finish keeping after the server acknowledges an interrupted copy without claiming it is complete', async () => {
    let saved;
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: [] })),
      save: jest.fn(async (_page, claimId, payload) => {
        saved = { claimId, revision: payload.expectedRevision + 1, draft: payload.draft, keeps: [] };
        return saved;
      }),
      keep: jest.fn(async (_page, _claim, payload) => {
        if (!saved.keeps.length) {
          saved = { ...saved, revision: saved.revision + 1, keeps: [{ destination: 'notebook',
            targetId: 'note-1', mutationId: payload.mutationId, status: 'pending' }] };
          throw { response: { status: 503, data: { code: 'keep_pending', current: saved,
            error: 'Your copy is saved. Finishing Keep was interrupted; try again.' } } };
        }
        saved = { ...saved, keeps: [{ ...saved.keeps[0], status: 'complete' }] };
        return { exploration: saved, href: '/think?tab=notebook&entryId=note-1' };
      })
    };
    renderWikiSentence({ durable: true, persistence });
    await waitFor(() => expect(persistence.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    fireEvent.change(writing, { target: { value: 'A thought worth keeping.' } });
    await screen.findByText('Saved privately');
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Notebook' }));
    const retry = await screen.findByRole('button', { name: 'Finish keeping note' });
    expect(screen.queryByRole('link', { name: 'Open kept note' })).not.toBeInTheDocument();
    expect(writing).toHaveValue('A thought worth keeping.');
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await screen.findByRole('link', { name: 'Open kept note' })).toHaveAttribute('href', '/think?tab=notebook&entryId=note-1');
    expect(persistence.save).toHaveBeenCalledTimes(1);
    expect(persistence.keep.mock.calls[1][2].mutationId).toBe(persistence.keep.mock.calls[0][2].mutationId);
  });

  it('offers version review for a stale Keep and creates no copy until the person retries', async () => {
    const original = { claimId: 'claim-1', revision: 1, keeps: [],
      draft: { title: 'A thought to keep', writing: 'My first version.', question: 'What remains?', originalText: 'Memory compounds with review.' } };
    const newer = { ...original, revision: 3, draft: { ...original.draft, writing: 'A newer version.' } };
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: [original] })),
      save: jest.fn(async (_page, _claim, payload) => ({ ...original, revision: payload.expectedRevision + 1, draft: payload.draft })),
      keep: jest.fn().mockRejectedValueOnce({ response: { status: 409,
        data: { current: newer, error: 'The exploration revision is stale.' } } }).mockResolvedValueOnce({
          exploration: { ...newer, keeps: [{ destination: 'notebook', status: 'complete', targetId: 'note-1' }] },
          href: '/think?tab=notebook&entryId=note-1'
        })
    };
    renderWikiSentence({ durable: true, persistence });
    const works = await screen.findByRole('complementary', { name: 'Your work here' });
    fireEvent.click(within(works).getByRole('button', { name: 'A thought to keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Notebook' }));
    fireEvent.click(await screen.findByText('Read the saved version'));
    expect(screen.getByText('A newer version.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your writing' })).toHaveValue('My first version.');
    expect(screen.getByRole('button', { name: 'Keep in Notebook' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep question' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open kept note' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use the saved version' }));
    expect(screen.getByRole('textbox', { name: 'Your writing' })).toHaveValue('A newer version.');
    expect(screen.queryByText('The exploration revision is stale.')).not.toBeInTheDocument();
    expect(persistence.keep).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Notebook' }));
    expect(await screen.findByRole('link', { name: 'Open kept note' })).toHaveAttribute('href', '/think?tab=notebook&entryId=note-1');
    expect(persistence.keep).toHaveBeenLastCalledWith('wiki-1', 'claim-1', expect.objectContaining({ expectedRevision: 3 }));
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])('leaves title confirmation to the input method (%j)', async (composition) => {
    const load = jest.fn(async () => ({ userId: 'owner-1', explorations: [] }));
    renderWikiSentence({ durable: true, persistence: {
      load
    } });
    await waitFor(() => expect(load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(writing).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Give it a name' }));
    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: '考える余地' } });
    for (const key of ['Enter', 'Escape']) {
      fireEvent.keyDown(title, { key, ...composition });
      expect(title).toHaveFocus();
      expect(title).toHaveValue('考える余地');
      expect(writing).toBeInTheDocument();
    }
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(writing).toHaveFocus();
  });

  it('keeps authored words after close and restores them from the server in a fresh session', async () => {
    let saved = null;
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: saved ? [saved] : [] })),
      save: jest.fn(async (_pageId, claimId, payload) => {
        saved = { claimId, draft: payload.draft, revision: payload.expectedRevision + 1, keeps: [] };
        return saved;
      })
    };
    const onOpenedExploration = jest.fn();
    const view = renderWikiSentence({ durable: true, persistence, onOpenedExploration });
    await waitFor(() => expect(persistence.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(writing).toBeEnabled());
    const words = 'The difference is room to be wrong.\nAn attempt should leave another attempt possible.';
    fireEvent.change(writing, { target: { value: words } });
    writing.setSelectionRange(18, 34);
    fireEvent.select(writing);
    const titleAction = screen.getByRole('button', { name: 'Make this the title' });
    expect(fireEvent.pointerDown(titleAction, { pointerType: 'touch' })).toBe(false);
    fireEvent.click(titleAction);
    expect(writing).toHaveValue(words);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Do not keep this title' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Escape' });
    expect(writing).toHaveFocus();
    expect(screen.queryByText('Do not keep this title')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Saved privately')).toBeInTheDocument());
    expect(saved.draft.writing).toBe(words);
    expect(onOpenedExploration).toHaveBeenLastCalledWith(expect.objectContaining({ draft: expect.objectContaining({ writing: words }) }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    view.unmount();
    window.localStorage.clear();
    renderWikiSentence({ durable: true, persistence });
    await waitFor(() => expect(persistence.load).toHaveBeenCalledTimes(2));
    fireEvent.click(await within(await screen.findByRole('complementary', { name: 'Your work here' })).findByRole('button', { name: saved.draft.title, exact: true }));
    expect(await screen.findByRole('textbox', { name: 'Your writing' })).toHaveValue(words);
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('opens a pocket under the claim without rewriting the article line', () => {
    const { onOpenedClaim } = renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Source snippet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Library →' })).toHaveAttribute(
      'href',
      '/library?articleId=article-1&highlightId=highlight-1'
    );
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'Memory compounds when we forget.' }
    });
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(onOpenedClaim).toHaveBeenCalledWith('claim-1');
  });

  it('copies the bound passage with its source, not an invented door', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sourceClip({
      title: 'Memory article',
      passage: 'Source snippet',
      href: '/library?articleId=article-1&highlightId=highlight-1'
    })));
    expect(writeText.mock.calls[0][0]).not.toContain('Memory compounds with review.');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('shows Then from revisions without rewriting the article line', () => {
    renderWikiSentence({
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Memory was a pile of notes.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-1' } }]
              }]
            }]
          },
          claims: [{ claimId: 'claim-1', text: 'Memory was a pile of notes.' }]
        }
      }]
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent('Memory was a pile of notes.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used to believe/i)).not.toBeInTheDocument();
  });

  it('lets a second recorded source sit beside the first without rewriting the article', () => {
    renderWikiSentence({
      page: {
        ...page,
        claims: [{
          claimId: 'claim-1',
          text: 'Memory compounds with review.',
          support: 'supported',
          sourceRefIds: ['source-1', 'source-letter']
        }],
        sourceRefs: [
          page.sourceRefs[0],
          {
            _id: 'source-letter',
            type: 'highlight',
            objectId: 'highlight-letter',
            parentObjectId: 'article-letter',
            title: 'Letter to a young investor',
            snippet: 'A loss you can survive still teaches the book.'
          }
        ],
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Memory compounds with review.',
              marks: [{
                type: 'claim',
                attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1, 2] }
              }]
            }]
          }]
        }
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Also beside')).toBeInTheDocument();
    expect(screen.getByText('A loss you can survive still teaches the book.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try the other way' })).toBeInTheDocument();
    expect(screen.getByLabelText('How they meet')).toHaveValue('');
    expect(screen.getByLabelText('The space between')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Keep this as an experiment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this as the line' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this as an essay' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('How they meet'), { target: { value: 'analogy' } });
    expect(screen.getByLabelText('How they meet')).toHaveValue('analogy');
    fireEvent.change(screen.getByLabelText('The space between'), {
      target: { value: 'Survivable error is not the same kind of care.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an experiment' }));
    expect(screen.getByLabelText('For this experiment')).toHaveValue(
      'Survivable error is not the same kind of care.'
    );
    expect(screen.getByLabelText('What still holds')).toHaveValue('');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Propose this as the line' }));
    expect(screen.getByText(/Proposed, not accepted/)).toHaveTextContent(
      'Survivable error is not the same kind of care.'
    );
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds with review.');
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an essay' }));
    expect(screen.getByText(/An essay, not the line/)).toHaveTextContent(
      'Survivable error is not the same kind of care.'
    );
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('lets a two-source claim carry a snapshot without writing or publishing', () => {
    renderWikiSentence({ page: twoSourcePage });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Carry this out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Include Memory article' }));
    fireEvent.click(screen.getByRole('button', { name: 'Include Letter to a young investor' }));
    fireEvent.change(screen.getByLabelText('The question'), {
      target: { value: 'What still compounds when review is only a pile?' }
    });
    fireEvent.change(screen.getByLabelText('A provisional conclusion'), {
      target: { value: 'A later pass has to be able to find the first.' }
    });
    expect(screen.getByText('A snapshot. It is not a publication.')).toBeInTheDocument();
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(
      'What still compounds when review is only a pile?'
    );
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent('Source snippet');
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(
      'A loss you can survive still teaches the book.'
    );
    expect(screen.getByLabelText('What a recipient would see').querySelector('a')).toBeNull();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets a two-source claim record two contributions without inventing a consensus', () => {
    renderWikiSentence({ page: twoSourcePage });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Let two contributions meet' }));
    fireEvent.change(screen.getByLabelText('Shared question'), {
      target: { value: 'Who still has to find the first note?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Different values' }));
    fireEvent.change(screen.getByLabelText('What Memory article still disputes'), {
      target: { value: 'A pile of notes is not yet a memory.' }
    });
    fireEvent.change(screen.getByLabelText('What Letter to a young investor still disputes'), {
      target: { value: 'A loss you cannot survive is not a review you get to keep.' }
    });
    expect(screen.getByText('Two contributions. Not a consensus.', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Different values', { selector: 'p' })).toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent(
      'Memory compounds with review.'
    );
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets a named distinction be kept as an instrument without writing the article', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('button', { name: 'Keep this as an instrument' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('The distinction that would help'), {
      target: { value: 'Review that compounds memory, versus review that only piles notes.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an instrument' }));
    fireEvent.change(screen.getByLabelText('Name this instrument'), {
      target: { value: 'Room to be wrong' }
    });
    expect(screen.getByText(/An instrument, not the line/)).toHaveTextContent('Room to be wrong');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets an exhibit, a rehearsal, unwritten work, and a set-aside source sit beside the claim without writing', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('button', { name: 'Carry this out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Let two contributions meet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an exhibit' }));
    fireEvent.change(screen.getByLabelText('Name this exhibit'), {
      target: { value: 'Review that compounds, or review that piles' }
    });
    fireEvent.change(screen.getByLabelText('This way'), {
      target: { value: 'A later pass can still find the earlier one.' }
    });
    fireEvent.change(screen.getByLabelText('The other way'), {
      target: { value: 'A pile of notes does not compound.' }
    });
    expect(screen.getByText(/An exhibit, not evidence/)).toHaveTextContent(
      'Review that compounds, or review that piles'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try saying it' }));
    fireEvent.change(screen.getByLabelText('Try saying it'), {
      target: { value: 'Review works when a later pass can still find the first.' }
    });
    expect(screen.getByText('A rehearsal, not a grade.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as unwritten work' }));
    fireEvent.change(screen.getByLabelText('What this collection could become'), {
      target: { value: 'Who does the reviewing, and who only stores the notes?' }
    });
    expect(screen.getByText('Unwritten work, not the article.')).toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('hides the bound source in the pocket and brings it back by name', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Source snippet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this source', exact: true }));
    expect(screen.queryByText('Source snippet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bring Memory article back' })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    fireEvent.click(screen.getByRole('button', { name: 'Bring Memory article back' }));
    expect(screen.getByText('Source snippet')).toBeInTheDocument();
  });

  it('lets a third recorded passage sit beside the named distinction without resolving the question', () => {
    renderWikiSentence({
      page: {
        ...page,
        claims: [{
          claimId: 'claim-1',
          text: 'Memory compounds with review.',
          support: 'supported',
          sourceRefIds: ['source-1', 'source-letter', 'source-notes']
        }],
        sourceRefs: [
          page.sourceRefs[0],
          {
            _id: 'source-letter',
            type: 'highlight',
            objectId: 'highlight-letter',
            parentObjectId: 'article-letter',
            title: 'Letter to a young investor',
            snippet: 'A loss you can survive still teaches the book.'
          },
          {
            _id: 'source-notes',
            type: 'highlight',
            objectId: 'highlight-notes',
            parentObjectId: 'article-notes',
            title: 'Field notes',
            snippet: 'Review compounds memory only when a later pass can still find the earlier one.'
          }
        ],
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Memory compounds with review.',
              marks: [{
                type: 'claim',
                attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1, 2, 3] }
              }]
            }]
          }]
        }
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByText('Bears on this distinction.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Leave this open'), {
      target: { value: 'I cannot tell which review is enough.' }
    });
    fireEvent.change(screen.getByLabelText('The distinction that would help'), {
      target: { value: 'Review that compounds memory, versus review that only piles notes.' }
    });
    expect(screen.getByText('Bears on this distinction.')).toBeInTheDocument();
    expect(screen.getByText(
      'Review compounds memory only when a later pass can still find the earlier one.'
    )).toBeInTheDocument();
    expect(screen.getByLabelText('Leave this open')).toHaveValue('I cannot tell which review is enough.');
    expect(screen.queryByText(/resolved/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
  });

  it('opens the recorded quotation from that revision, not a neighbor or today\'s snippet', () => {
    renderWikiSentence({
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Memory was a pile of notes.',
                marks: [{
                  type: 'claim',
                  attrs: { claimId: 'claim-1', citationIndexes: [1] }
                }]
              }]
            }]
          },
          claims: [{
            claimId: 'claim-1',
            text: 'Memory was a pile of notes.',
            sourceRefIds: ['source-1']
          }],
          sourceRefs: [{
            _id: 'source-1',
            type: 'highlight',
            objectId: 'highlight-1',
            parentObjectId: 'article-1',
            title: 'Memory article',
            snippet: 'Memory used to be a pile of notes.',
            url: 'https://old.example/memory-then'
          }]
        }
      }]
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent('Memory was a pile of notes.');
    expect(document.querySelector('.open-sentence-pocket__then-source')).toHaveTextContent('Memory used to be a pile of notes.');
    expect(screen.getByText('Source snippet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to source →' })).toHaveAttribute(
      'href',
      'https://old.example/memory-then'
    );
    expect(screen.getAllByRole('link', { name: 'Open in Library →' })).toHaveLength(1);
    expect(screen.queryByText('Unrelated')).not.toBeInTheDocument();
  });

  it('opens a second recorded source from that revision, not a neighbor or today\'s other', () => {
    renderWikiSentence({
      page: {
        ...page,
        claims: [{
          claimId: 'claim-1',
          text: 'Memory compounds with review.',
          sourceRefIds: ['source-1']
        }]
      },
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Memory was a pile of notes.',
                marks: [{
                  type: 'claim',
                  attrs: { claimId: 'claim-1', citationIndexes: [1, 2] }
                }]
              }]
            }]
          },
          claims: [{
            claimId: 'claim-1',
            text: 'Memory was a pile of notes.',
            sourceRefIds: ['source-1', 'source-log']
          }],
          sourceRefs: [{
            _id: 'source-1',
            title: 'Memory article',
            snippet: 'Memory used to be a pile of notes.'
          }, {
            _id: 'source-log',
            type: 'highlight',
            title: 'Review log',
            snippet: 'The pile did not become a practice by sitting still.'
          }, {
            _id: 'source-other',
            type: 'highlight',
            title: 'Unrelated',
            snippet: 'A neighboring log was not this claim.'
          }]
        }
      }]
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const then = document.querySelector('.open-sentence-pocket__then');
    expect(then).toHaveTextContent('Memory used to be a pile of notes.');
    expect(then).toHaveTextContent('Review log');
    expect(then).toHaveTextContent('The pile did not become a practice by sitting still.');
    expect(screen.queryByText('Also beside')).not.toBeInTheDocument();
    expect(screen.queryByText('A neighboring log was not this claim.')).not.toBeInTheDocument();
  });

  it('lets a recorded Then passage sit as what still holds, not a neighbor or a question', () => {
    renderWikiSentence({
      page: {
        ...page,
        claims: [{
          claimId: 'claim-1',
          text: 'Memory compounds with review.',
          sourceRefIds: ['source-1']
        }]
      },
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Memory was a pile of notes.',
                marks: [{
                  type: 'claim',
                  attrs: { claimId: 'claim-1', citationIndexes: [1, 2] }
                }]
              }]
            }]
          },
          claims: [{
            claimId: 'claim-1',
            text: 'Memory was a pile of notes.',
            sourceRefIds: ['source-1', 'source-log']
          }],
          sourceRefs: [{
            _id: 'source-1',
            title: 'Memory article',
            snippet: 'Memory used to be a pile of notes.'
          }, {
            _id: 'source-log',
            type: 'highlight',
            title: 'Review log',
            snippet: 'The pile did not become a practice by sitting still.'
          }, {
            _id: 'source-other',
            type: 'highlight',
            title: 'Unrelated',
            snippet: 'A neighboring log was not this claim.'
          }, {
            _id: 'source-question',
            type: 'question',
            snippet: 'Does memory still compound if we never return?'
          }]
        }
      }]
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suppose this stops being true' }));
    expect(screen.getByRole('button', { name: 'Keep Memory article as what still holds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep earlier Memory article as what still holds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Review log as what still holds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unrelated/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Does memory still compound/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Then you left this open/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Review log as what still holds' }));
    expect(screen.getByLabelText('What still holds')).toHaveValue(
      'The pile did not become a practice by sitting still.'
    );
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent(
      'Memory compounds with review.'
    );
  });

  it('opens a recorded question from that revision without rewriting the article or forging today\'s walk', () => {
    renderWikiSentence({
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Memory was a pile of notes.',
                marks: [{
                  type: 'claim',
                  attrs: { claimId: 'claim-1', citationIndexes: [1] }
                }]
              }]
            }]
          },
          claims: [{
            claimId: 'claim-1',
            text: 'Memory was a pile of notes.',
            sourceRefIds: ['source-1', 'source-question']
          }],
          sourceRefs: [{
            _id: 'source-1',
            title: 'Memory article',
            snippet: 'Memory used to be a pile of notes.'
          }, {
            _id: 'source-question',
            type: 'question',
            snippet: 'Does memory still compound if we never return?'
          }]
        }
      }]
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const then = document.querySelector('.open-sentence-pocket__then');
    expect(then).toHaveTextContent('Memory was a pile of notes.');
    expect(then).toHaveTextContent('Then you left this open');
    expect(then).toHaveTextContent('Does memory still compound if we never return?');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByLabelText('Leave this open')).toHaveValue('');
    expect(screen.queryByText(/biography/i)).not.toBeInTheDocument();
  });

  it('leaves a return ticket when walking into Library, not a Wiki rewrite', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('link', { name: 'Open in Library →' }));
    expect(JSON.parse(window.localStorage.getItem(RETURN_TICKET_KEY))).toEqual(
      expect.objectContaining({
        articleId: 'article-1',
        highlightId: 'highlight-1',
        pageId: 'wiki-1',
        pageTitle: 'Enterprise AI Memory',
        sourceTitle: 'Memory article',
        claimId: 'claim-1',
        sentence: 'Memory compounds with review.'
      })
    );
  });

  it.each(['', 'An authored distinction.'])('marks a durable Library return for reopening only when it holds work: %s', async writing => {
    const persistence = {
      load: jest.fn(async () => ({ userId: 'owner-1', explorations: writing ? [{
        claimId: 'claim-1', revision: 1, draft: { writing, originalText: 'Memory compounds with review.' }, keeps: []
      }] : [] }))
    };
    renderWikiSentence({ durable: true, persistence });
    await waitFor(() => expect(persistence.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const field = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(field).toBeEnabled());
    expect(field).toHaveValue(writing);
    fireEvent.click(screen.getByRole('link', { name: 'Open in Library →' }));
    const ticket = JSON.parse(window.localStorage.getItem(RETURN_TICKET_KEY));
    expect(ticket.reopen).toBe(writing ? true : undefined);
    expect(ticket.claimId).toBe('claim-1');
  });

  it('restores a leftover tab draft onto the device without accepting a forged wiki line', () => {
    window.sessionStorage.setItem(openedStorageKey('wiki-1'), 'claim-1');
    window.sessionStorage.setItem(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'forged',
      provisionalText: 'Memory compounds when we forget.',
      question: 'Does it still?',
      returnNote: 'Next: open the highlight',
      mark: '!',
      source: null,
      placed: false,
      status: 'open'
    }));
    renderWikiSentence();
    expect(window.localStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toContain('Does it still?');
    expect(window.localStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toContain('"distinction"');
    expect(window.localStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).not.toContain('"returnNote"');
    expect(window.sessionStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBeFalsy();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds when we forget.');
    expect(screen.getByLabelText('Leave this open')).toHaveValue('Does it still?');
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue('Next: open the highlight');
    expect(screen.getByText('You left this open.')).toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText('Source snippet')).toBeInTheDocument();
    expect(screen.queryByText('forged')).not.toBeInTheDocument();
  });

  it('says nothing when the claim has no source of its own', () => {
    renderWikiSentence({
      page: {
        ...page,
        sourceRefs: [],
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Memory compounds with review.',
              marks: [{ type: 'claim', attrs: { claimId: 'claim-1', citationIndexes: [] } }]
            }]
          }]
        }
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Nothing beside this sentence yet.')).toBeInTheDocument();
  });

  it('discards a legacy experiment that did not keep a question', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'Memory compounds when we forget.' }
    });
    fireEvent.click(document.querySelector('.open-sentence__open'));
    expect(window.localStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBeFalsy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds with review.');
  });

  it('remembers Nomad when you come home without opening the pocket', () => {
    writeStore(RETURN_TICKET_KEY, JSON.stringify({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Memory compounds with review.',
      pageId: 'wiki-1',
      pageTitle: 'Enterprise AI Memory',
      sourceTitle: 'Memory article',
      claimId: 'claim-1'
    }));
    renderWikiSentence();
    expect(screen.getByText('You were in Memory article.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
  });

  it('lets another tab’s save become this tab’s restore', () => {
    renderWikiSentence();
    writeStore(openedStorageKey('wiki-1'), 'claim-1');
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'forged',
      provisionalText: 'Memory compounds when we forget.',
      question: 'Does it still?',
      status: 'open'
    }));
    fireEvent(window, new StorageEvent('storage', { key: openedStorageKey('wiki-1') }));
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds when we forget.');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('leaves a quiet gold thread on a closed placed sentence without opening', () => {
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'Memory compounds with review.',
      provisionalText: 'Memory compounds with review.',
      question: '',
      mark: '',
      placed: true,
      status: 'closed'
    }));
    renderWikiSentence();
    expect(document.querySelector('.open-sentence')).toHaveClass('is-placed');
    expect(document.querySelector('.open-sentence')).not.toHaveClass('is-open');
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
  });

  it('does not restore a private walk on a host that does not own the page', () => {
    writeStore(openedStorageKey('wiki-1'), 'claim-1');
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'forged',
      provisionalText: 'Memory compounds when we forget.',
      question: 'Does it still?',
      status: 'open'
    }));
    const { onOpenedClaim } = renderWikiSentence({ enabled: false });
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    expect(onOpenedClaim).not.toHaveBeenCalledWith('claim-1');
  });

  it('restores a kept question after the page host retries', () => {
    writeStore(openedStorageKey('wiki-1'), 'claim-1');
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'forged',
      provisionalText: 'Memory compounds when we forget.',
      question: 'Does it still?',
      status: 'open'
    }));
    const { rerender } = renderWikiSentence({ enabled: false });
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    rerender({ enabled: true });
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds when we forget.');
    expect(screen.getByLabelText('Leave this open')).toHaveValue('Does it still?');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('keeps the current article line when the Wiki moved on, and does not feed a draft to the companion', () => {
    writeStore(openedStorageKey('wiki-1'), 'claim-1');
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'Memory compounds with review.',
      provisionalText: 'Memory compounds when we forget.',
      question: 'Does it still?',
      proposal: {
        text: 'Memory compounds when we forget.',
        against: 'Memory compounds with review.'
      },
      status: 'open'
    }));
    const moved = {
      ...page,
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Memory compounds when we return to it.',
            marks: [{
              type: 'claim',
              attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1] }
            }]
          }]
        }]
      },
      claims: [{ claimId: 'claim-1', text: 'Memory compounds with review.', support: 'supported' }],
      sourceRefs: []
    };
    const { onOpenedClaim } = renderWikiSentence({ page: moved });
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds when we forget.');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds when we return to it.');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds when we return to it.');
    expect(screen.getByText('This source is unavailable. A similar passage was not attached.')).toBeInTheDocument();
    expect(onOpenedClaim).toHaveBeenCalledWith('claim-1');
    expect(screen.queryByText(/Proposed, not accepted/)).not.toBeInTheDocument();
  });

  it('does not let a vanished claim speak through a stored draft', () => {
    writeStore(openedStorageKey('wiki-1'), 'claim-1');
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'Memory compounds with review.',
      provisionalText: 'Memory compounds when we forget.',
      question: 'Does it still?',
      status: 'open'
    }));
    const { onOpenedClaim } = renderWikiSentence({
      page: {
        ...page,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The page moved on.' }] }]
        },
        claims: []
      }
    });
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(onOpenedClaim).toHaveBeenCalledWith('');
    expect(JSON.parse(window.localStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).question)
      .toBe('Does it still?');
  });

  it('opens a Compute claim the same way, without borrowing Parenting copy', () => {
    const compute = {
      _id: 'wiki-compute',
      title: 'Compute will remain scarce',
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Compute will remain scarce.',
            marks: [{
              type: 'claim',
              attrs: { claimId: 'claim-compute', citationIndexes: [1] }
            }]
          }]
        }]
      },
      claims: [{ claimId: 'claim-compute', text: 'Compute will remain scarce.' }],
      citations: [],
      sourceRefs: [{
        _id: 'source-capacity',
        type: 'highlight',
        objectId: 'highlight-capacity',
        parentObjectId: 'article-capacity',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    };
    const { onOpenedClaim } = renderWikiSentence({ page: compute, pageId: 'wiki-compute' });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Supply was the constraint this decade.')).toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-compute"]')).toHaveTextContent('Compute will remain scarce.');
    expect(screen.queryByText('Children need room to make mistakes.')).not.toBeInTheDocument();
    expect(onOpenedClaim).toHaveBeenCalledWith('claim-compute');
  });

  it('asks the host to accept the named proposal, not a later unproposed edit', async () => {
    const onAcceptWording = jest.fn().mockResolvedValue();
    renderWikiSentence({ onAcceptWording });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'Memory compounds when we forget.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Propose this wording' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'Memory compounds when we remember.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept this wording' }));
    await waitFor(() => expect(onAcceptWording).toHaveBeenCalledWith({
      claimId: 'claim-1',
      against: 'Memory compounds with review.',
      text: 'Memory compounds when we forget.'
    }));
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('keeps the article when the host refuses a stale proposal', async () => {
    const onAcceptWording = jest.fn().mockRejectedValue({
      response: { data: { error: 'The article moved on. This proposal was not applied.', code: 'stale_claim' } }
    });
    renderWikiSentence({ onAcceptWording });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'Memory compounds when we forget.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Propose this wording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept this wording' }));
    expect(await screen.findByText('The article moved on. This proposal was not applied.')).toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.getByText(/Proposed, not accepted/)).toHaveTextContent('Memory compounds when we forget.');
  });

  it('lets the person name a premise beside the original line', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suppose this stops being true' }));
    fireEvent.change(screen.getByLabelText('For this experiment'), {
      target: { value: 'demand grows more slowly' }
    });
    expect(screen.getByDisplayValue('demand grows more slowly')).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.click(document.querySelector('.open-sentence__open'));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('For this experiment')).toHaveValue('demand grows more slowly');
  });

  it('drops a named experiment when the live line has moved on', () => {
    writeStore(openedStorageKey('wiki-1'), 'claim-1');
    writeStore(draftStorageKey('wiki-1', 'claim-1'), JSON.stringify({
      id: 'claim-1',
      originalText: 'Memory compounds with review.',
      provisionalText: 'Memory compounds with review.',
      pressure: {
        against: 'Memory compounds with review.',
        premise: 'demand grows more slowly',
        stillHolds: '',
        unknown: ''
      },
      status: 'open'
    }));
    const moved = {
      ...page,
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Memory compounds when we return to it.',
            marks: [{
              type: 'claim',
              attrs: { claimId: 'claim-1', support: 'supported', citationIndexes: [1] }
            }]
          }]
        }]
      },
      claims: [{ claimId: 'claim-1', text: 'Memory compounds with review.', support: 'supported' }]
    };
    renderWikiSentence({ page: moved });
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds when we return to it.');
    expect(screen.queryByDisplayValue('demand grows more slowly')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suppose this stops being true' })).toBeInTheDocument();
  });

  it('does not offer accept when the host cannot write', () => {
    renderWikiSentence();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Try a narrower wording'), {
      target: { value: 'Memory compounds when we forget.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Propose this wording' }));
    expect(screen.getByText(/Proposed, not accepted/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
  });

  it('hides the claim paragraph in the article and brings it back by name', () => {
    renderWikiSentence({
      page: {
        ...page,
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Before the claim.' }] },
            page.body.content[0],
            { type: 'paragraph', content: [{ type: 'text', text: 'After the claim.' }] }
          ]
        }
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try without this paragraph' }));
    expect(document.querySelector('.open-sentence')).toHaveClass('is-without');
    expect(screen.getByText('Before the claim.')).toBeInTheDocument();
    expect(screen.getByText('After the claim.')).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent('Memory compounds with review.');
    fireEvent.click(screen.getByRole('button', { name: 'Bring “Memory compounds with review.” back' }));
    expect(document.querySelector('.open-sentence')).not.toHaveClass('is-without');
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });

  it('asks the host to name the page and leaves the claim text', async () => {
    const onMakeTitle = jest.fn().mockResolvedValue();
    const { rerender } = renderWikiSentence({ onMakeTitle });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make this the title' }));
    await waitFor(() => expect(onMakeTitle).toHaveBeenCalledWith('Memory compounds with review.'));
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
    rerender({ onMakeTitle, page: { ...page, title: 'Memory compounds with review.' } });
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
  });

  it('keeps the title when naming fails', async () => {
    const onMakeTitle = jest.fn().mockRejectedValue(new Error('no'));
    renderWikiSentence({ onMakeTitle });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make this the title' }));
    await waitFor(() => expect(onMakeTitle).toHaveBeenCalledWith('Memory compounds with review.'));
    expect(screen.getByRole('button', { name: 'Make this the title' })).toBeInTheDocument();
    expect(document.querySelector('[data-claim-id="claim-1"]')).toHaveTextContent('Memory compounds with review.');
  });
});
