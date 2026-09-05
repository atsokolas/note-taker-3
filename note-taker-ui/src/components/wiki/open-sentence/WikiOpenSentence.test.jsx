import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

const renderWikiSentence = (props = {}) => {
  const onOpenedText = props.onOpenedText || jest.fn();
  render(
    <MemoryRouter>
      <WikiOpenSentenceProvider
        enabled
        page={props.page || page}
        pageId="wiki-1"
        onOpenedText={onOpenedText}
      >
        {renderTiptapDoc((props.page || page).body, { wrapParagraph: wrapOpenableParagraph })}
      </WikiOpenSentenceProvider>
    </MemoryRouter>
  );
  return { onOpenedText };
};

describe('WikiOpenSentence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('opens a pocket under the claim without rewriting the article line', () => {
    const { onOpenedText } = renderWikiSentence();
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
    expect(onOpenedText).toHaveBeenCalledWith('Memory compounds with review.');
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
});
