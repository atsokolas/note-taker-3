import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import renderTiptapDoc from '../renderTiptapDoc';
import { WikiOpenSentenceProvider, wrapOpenableParagraph } from './WikiOpenSentence';
import { draftStorageKey, openedStorageKey } from './openSentenceBinding';
import { RETURN_TICKET_KEY } from './openSentenceJourney';
import { writeStore } from './openSentenceStore';

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

const providerFrom = (props, onOpenedClaim) => (
  <WikiOpenSentenceProvider
    enabled={props.enabled !== false}
    page={props.page || page}
    pageId={props.pageId || 'wiki-1'}
    onOpenedClaim={onOpenedClaim}
    onAcceptWording={props.onAcceptWording}
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
    expect(window.sessionStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBeFalsy();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue('Memory compounds when we forget.');
    expect(screen.getByLabelText('Leave this open')).toHaveValue('Does it still?');
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

  it('discards a closed experiment that did not keep a question', () => {
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
      returnNote: '',
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
});
