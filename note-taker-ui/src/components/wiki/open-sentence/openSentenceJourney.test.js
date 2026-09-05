import {
  bindDraft,
  bindLibraryPassage,
  cancelWikiDraftPlacement,
  homecomingLine,
  keepExploration,
  matchingReturnTicket,
  matchingWikiTicket,
  placeBesideWikiDraft,
  readRemembered,
  rememberDraft,
  surroundingFromArticle,
  wikiReturnHref,
  writeReturnTicket
} from './openSentenceJourney';
import { draftStorageKey } from './openSentenceBinding';
import { closeExploration, createExploration, keepQuestion, openExploration, tryWording } from './openSentenceModel';

const article = {
  _id: 'article-1',
  title: 'Nomad',
  content: '<p>Getting lost was part of the work. A wrong turn you can walk back from still teaches the map. That is a different kind of care.</p>'
};

const highlight = {
  _id: 'highlight-1',
  text: 'A wrong turn you can walk back from still teaches the map.'
};

describe('openSentenceJourney', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('uses saved prefix and suffix when they exist', () => {
    expect(surroundingFromArticle({
      article,
      highlight: {
        ...highlight,
        anchor: { prefix: 'Getting lost was part of the work.', suffix: 'That is a different kind of care.' }
      }
    })).toEqual({
      aroundBefore: 'Getting lost was part of the work.',
      aroundAfter: 'That is a different kind of care.'
    });
  });

  it('slices exact surrounding from the article and stays silent when the line is missing', () => {
    const around = surroundingFromArticle({ article, highlight });
    expect(around.aroundBefore).toContain('Getting lost');
    expect(around.aroundAfter).toContain('different kind of care');
    expect(surroundingFromArticle({
      article,
      highlight: { ...highlight, text: 'A similar-sounding neighbor was not attached.' }
    })).toEqual({ aroundBefore: '', aroundAfter: '' });
  });

  it('does not guess surrounding when the same sentence appears twice without an offset', () => {
    expect(surroundingFromArticle({
      article: {
        content: '<p>Same line. Other words. Same line.</p>'
      },
      highlight: { text: 'Same line.' }
    })).toEqual({ aroundBefore: '', aroundAfter: '' });
  });

  it('hides the Library door by binding the passage as already here', () => {
    const bound = bindLibraryPassage({ article, highlight });
    expect(bound.here).toBe(true);
    expect(bound.href).toBe('');
    expect(bound.passage).toBe(highlight.text);
    expect(bound.articleId).toBe('article-1');
    expect(bound.highlightId).toBe('highlight-1');
  });

  it('keeps a return ticket by identity, not in the URL', () => {
    writeReturnTicket({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      claimId: 'claim-1'
    });
    expect(matchingReturnTicket({ articleId: 'article-1', highlightId: 'highlight-1' }).sentence)
      .toBe('Children need room to make mistakes.');
    expect(matchingReturnTicket({ articleId: 'article-1', highlightId: 'other' })).toBeNull();
    expect(wikiReturnHref(matchingReturnTicket({ articleId: 'article-1', highlightId: 'highlight-1' })))
      .toBe('/wiki/read/wiki-1?claimId=claim-1');
  });

  it('names the source you were in, and forgets a closed draft with nothing to keep', () => {
    writeReturnTicket({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      sourceTitle: 'Nomad',
      claimId: 'claim-1'
    });
    expect(homecomingLine(matchingWikiTicket({ pageId: 'wiki-1', claimId: 'claim-1' })))
      .toBe('You were in Nomad.');
    const live = createExploration({ id: 'claim-1', originalText: 'Children need room to make mistakes.' });
    const forgotten = rememberDraft('wiki-1', 'claim-1', closeExploration(tryWording(live, 'draft')), live);
    expect(forgotten.provisionalText).toBe('Children need room to make mistakes.');
    expect(window.sessionStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBeFalsy();
  });

  it('keeps an opened draft so restore can find it', () => {
    const live = createExploration({ id: 'claim-1', originalText: 'Children need room to make mistakes.' });
    const opened = openExploration(keepQuestion(live, 'Which mistakes?'));
    keepExploration('wiki-1', 'claim-1', opened, live);
    const remembered = readRemembered('wiki-1', 'claim-1', live);
    expect(remembered.status).toBe('open');
    expect(remembered.question).toBe('Which mistakes?');
  });

  it('places the Library passage beside the Wiki draft without accepting a revision', () => {
    const ticket = {
      articleId: 'article-1',
      highlightId: 'highlight-1',
      sentence: 'Children need room to make mistakes.',
      pageId: 'wiki-1',
      pageTitle: 'Parenting',
      claimId: 'claim-1'
    };
    placeBesideWikiDraft(ticket);
    expect(JSON.parse(window.sessionStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).placed).toBe(true);
    cancelWikiDraftPlacement(ticket);
    expect(window.sessionStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBeFalsy();
  });

  it('rebinds a stored draft to live sentence text without inventing a source', () => {
    const live = createExploration({
      id: 'claim-1',
      originalText: 'Children need room to make mistakes.',
      source: { title: 'Nomad' }
    });
    const bound = bindDraft(live, {
      originalText: 'forged',
      provisionalText: 'draft',
      question: 'Which mistakes?',
      source: null,
      status: 'open'
    }, false);
    expect(bound.status).toBe('closed');
    expect(bound.originalText).toBe('Children need room to make mistakes.');
    expect(bound.source).toEqual({ title: 'Nomad' });
    expect(bound.question).toBe('Which mistakes?');
  });
});
