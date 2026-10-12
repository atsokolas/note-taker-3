import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Welcome from './Welcome';
import {
  adoptWikiStarterPack,
  archiveWikiPage,
  createWikiPage,
  getJudgmentLibraryEvidence,
  getWikiPage,
  listWikiProposals,
  listWikiStarterPacks,
  startWikiPageBuild,
  updateWikiPage
} from '../api/wiki';
import { getArticles } from '../api/articles';
import { fileJudgmentEvidence } from '../api/judgmentResolution';
import {
  connectReadwiseToken,
  importPastedText,
  importPastedUrl,
  syncReadwiseConnection
} from '../api/imports';
import { markOnboardingCompleteOnServer } from '../api/onboarding';

let mockSearch = '';
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    useNavigate: () => mockNavigate,
    useSearchParams: () => {
      const [, rerender] = React.useReducer(n => n + 1, 0);
      return [new URLSearchParams(mockSearch), (next) => { mockSearch = next.toString(); rerender(); }];
    }
  };
}, { virtual: true });

jest.mock('../api/wiki', () => ({
  adoptWikiStarterPack: jest.fn(),
  archiveWikiPage: jest.fn().mockResolvedValue({}),
  createWikiPage: jest.fn(),
  getJudgmentLibraryEvidence: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiProposals: jest.fn(),
  listWikiStarterPacks: jest.fn(),
  startWikiPageBuild: jest.fn(),
  updateWikiPage: jest.fn()
}));
jest.mock('../api/articles', () => ({ getArticles: jest.fn() }));
jest.mock('../api/judgmentResolution', () => ({ fileJudgmentEvidence: jest.fn() }));
jest.mock('../api/imports', () => ({
  connectReadwiseToken: jest.fn(),
  importPastedText: jest.fn(),
  importPastedUrl: jest.fn(),
  syncReadwiseConnection: jest.fn()
}));
jest.mock('../api/onboarding', () => ({ markOnboardingCompleteOnServer: jest.fn().mockResolvedValue({}) }));
jest.mock('../onboarding/useExtensionPresence', () => ({
  __esModule: true,
  default: () => ({ state: 'not_installed', isConnected: false }),
  EXTENSION_STATE: { NOT_INSTALLED: 'not_installed' }
}));

const SENTENCE = 'Remote teams write better than they meet.';
const writtenPage = (extra = {}) => ({
  _id: 'page-1',
  title: 'Remote work',
  plainText: '# Remote work\n\nRemote teams lean on writing, and the written record outlasts the meetings that would have replaced it.',
  sourceRefs: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
  aiState: { draftStatus: 'ready' },
  ...extra
});
const heldPage = (judgment = {}) => writtenPage({ judgment: { currentJudgment: SENTENCE, ...judgment } });

const renderAt = (search = '') => {
  mockSearch = search;
  return render(<Welcome />);
};
const where = () => mockSearch;

describe('Welcome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.scrollTo = jest.fn();
    getArticles.mockResolvedValue([]);
    getWikiPage.mockResolvedValue(writtenPage());
    listWikiProposals.mockResolvedValue({ proposals: [] });
    listWikiStarterPacks.mockResolvedValue([]);
    archiveWikiPage.mockResolvedValue({});
    getJudgmentLibraryEvidence.mockResolvedValue({ candidates: [] });
  });

  it('opens on what Noeis builds, and goes on to your reading', async () => {
    renderAt('');
    expect(screen.getByRole('heading', { name: 'This is what Noeis builds from your reading.' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'An example page' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grow one from my reading' }));
    expect(where()).toBe('step=reading');
  });

  it('brings in each pasted link by name', async () => {
    importPastedUrl.mockImplementation(async ({ url }) => ({
      article: { title: url.includes('one') ? 'The first essay' : 'The second essay' }
    }));

    renderAt('step=reading');
    const continueButton = await screen.findByRole('button', { name: 'Write my first page' });
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Links to things you have read'), {
      target: { value: 'https://example.com/one\nhttps://example.com/two' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));

    expect(await screen.findByText('The first essay')).toBeInTheDocument();
    expect(await screen.findByText('The second essay')).toBeInTheDocument();
    expect(importPastedUrl).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(continueButton).not.toBeDisabled());
    fireEvent.click(continueButton);
    expect(where()).toBe('step=page');
  });

  it('takes a long passage as one source and refuses a sentence', async () => {
    importPastedText.mockResolvedValue({ article: { title: 'Pasted passage' } });

    renderAt('step=reading');
    const field = await screen.findByLabelText('Links to things you have read');
    fireEvent.change(field, { target: { value: 'Too short to find anything in.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));
    expect(screen.getByRole('alert')).toHaveTextContent('too short');

    fireEvent.change(field, { target: { value: Array(45).fill('word').join(' ') } });
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));
    await waitFor(() => expect(importPastedText).toHaveBeenCalled());
  });

  it('brings a Readwise library in from a pasted token and says what came', async () => {
    connectReadwiseToken.mockResolvedValue({ _id: 'conn-1' });
    syncReadwiseConnection.mockResolvedValue({ importedHighlights: 412, importedArticles: 63 });

    renderAt('step=reading');
    fireEvent.change(await screen.findByLabelText('Readwise access token'), { target: { value: ' tok-123 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bring them in' }));

    expect(await screen.findByText('412 highlights from 63 sources came in from Readwise.')).toBeInTheDocument();
    expect(connectReadwiseToken).toHaveBeenCalledWith({ apiToken: 'tok-123' });
    expect(syncReadwiseConnection).toHaveBeenCalledWith({ connectionId: 'conn-1' });
    expect(screen.getByRole('button', { name: 'Write my first page' })).not.toBeDisabled();
  });

  it('offers ready-made wikis up front, shows what is in each, and ends on the one taken', async () => {
    listWikiStarterPacks.mockResolvedValue([{
      id: 'mental-models',
      name: 'Mental Models',
      tagline: 'The Munger latticework for better judgment.',
      pages: ['First Principles', 'Opportunity Cost', 'Margin of Safety', 'Incentives', 'Inversion'].map(title => ({ title }))
    }]);
    adoptWikiStarterPack.mockResolvedValue({ pages: [{ _id: 'starter-1' }] });

    renderAt('');
    expect(await screen.findByText('First Principles · Opportunity Cost · Margin of Safety · Incentives · 1 more')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mental Models' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/wiki/read/starter-1', { replace: true }));
    expect(markOnboardingCompleteOnServer).toHaveBeenCalled();
  });

  it('offers what your reading keeps coming back to, and writes the page you pick', async () => {
    listWikiProposals.mockResolvedValue({
      proposals: [{ _id: 'p1', title: 'Remote work', sourceRefs: [{}, {}, {}] }]
    });
    createWikiPage.mockResolvedValue({ _id: 'page-1' });
    startWikiPageBuild.mockResolvedValue({ status: 'maintaining' });
    getWikiPage.mockResolvedValue(writtenPage({ aiState: { draftStatus: 'maintaining' } }));

    renderAt('step=page');
    expect(await screen.findByText('from three of your sources')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remote work' }));

    await waitFor(() => expect(startWikiPageBuild).toHaveBeenCalledWith('page-1'));
    expect(createWikiPage).toHaveBeenCalledWith({ title: 'Remote work', pageType: 'topic' });
    expect(where()).toBe('step=page&page=page-1');
    expect(await screen.findByRole('heading', { name: 'Writing Remote work…' })).toBeInTheDocument();
  });

  it('asks for a topic, not a sentence, when you name your own', async () => {
    renderAt('step=page');
    const field = await screen.findByLabelText('Topic for your first page');
    fireEvent.change(field, { target: { value: 'Costco membership fees make it very hard to compete with' } });
    fireEvent.click(screen.getByRole('button', { name: 'Write it' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Keep it to a few words');
    expect(createWikiPage).not.toHaveBeenCalled();
  });

  it('says plainly when the reading could not carry a page, and clears it away', async () => {
    getWikiPage.mockResolvedValue(writtenPage({ aiState: { draftStatus: 'error', errorCode: 'WIKI_CANDIDATE_REJECTED' } }));

    renderAt('step=page&page=page-1');
    expect(await screen.findByRole('heading', { name: 'Your reading does not say enough about Remote work yet.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pick another topic' }));
    await waitFor(() => expect(archiveWikiPage).toHaveBeenCalledWith('page-1'));
    await waitFor(() => expect(where()).toBe('step=page'));
  });

  it('offers another attempt when the sources backed every claim', async () => {
    const lastCandidateQuality = { metrics: { topicallyGroundedSourceCount: 3, unsupported: 0, claimCount: 9, cited: 9 } };
    getWikiPage.mockResolvedValue(writtenPage({ aiState: { draftStatus: 'error', errorCode: 'WIKI_CANDIDATE_REJECTED', lastCandidateQuality } }));

    renderAt('step=page&page=page-1');
    expect(await screen.findByRole('heading', { name: 'Remote work did not pass the last check.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(startWikiPageBuild).toHaveBeenCalledWith('page-1'));
    expect(archiveWikiPage).not.toHaveBeenCalled();
  });

  it('shows the written page and holds what you think about it on that page', async () => {
    updateWikiPage.mockResolvedValue(heldPage());

    renderAt('step=page&page=page-1');
    expect(await screen.findByText('Your first page is written, from three of your sources.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remote work' })).toBeInTheDocument();
    expect(screen.getByText(/the written record outlasts/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Your view'), { target: { value: SENTENCE } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold it' }));

    await waitFor(() => expect(where()).toBe('step=moment&page=page-1'));
    expect(updateWikiPage).toHaveBeenCalledWith('page-1', {
      judgment: expect.objectContaining({ currentJudgment: SENTENCE })
    });
  });

  it('lets you leave the page without a view', async () => {
    renderAt('step=page&page=page-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Not yet' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/wiki/read/page-1', { replace: true }));
    expect(markOnboardingCompleteOnServer).toHaveBeenCalled();
  });

  it('quotes what you saved and files it where you say', async () => {
    getWikiPage.mockResolvedValue(heldPage());
    getJudgmentLibraryEvidence.mockResolvedValue({
      candidates: [
        {
          id: 'highlight:a1:h1',
          text: 'Written decisions outlast the meetings that made them.',
          sourceLabel: 'The Async Manifesto',
          savedAt: '2026-10-09T10:00:00Z',
          matched: ['written']
        },
        { id: 'article:a2', text: 'Teams that meet daily ship faster.', sourceLabel: 'Standups', matched: [] }
      ]
    });
    fileJudgmentEvidence.mockImplementation(async ({ field }) => ({
      judgment: { currentJudgment: SENTENCE, [field]: [{ text: 'Written decisions outlast the meetings that made them.' }] }
    }));

    renderAt('step=moment&page=page-1');

    expect(await screen.findByRole('heading', { name: 'Two passages you saved bear on this.' })).toBeInTheDocument();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.getByText(/The Async Manifesto · saved Oct 9/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open where it came from' })[0])
      .toHaveAttribute('href', expect.stringContaining('/library?articleId=a1'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Supports it' })[0]);
    expect(await screen.findByText('Filed under why you hold it.')).toBeInTheDocument();
    expect(fileJudgmentEvidence).toHaveBeenCalledWith({
      pageId: 'page-1',
      expectedClaim: SENTENCE,
      field: 'why',
      articleId: 'a1',
      highlightId: 'h1',
      quote: 'Written decisions outlast the meetings that made them.'
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not about this' }));
    expect(screen.getByText('Set aside.')).toBeInTheDocument();
    expect(fileJudgmentEvidence).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open your view' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/judgment/page-1', { replace: true }));
  });

  it('says plainly when nothing you brought speaks to the view', async () => {
    getWikiPage.mockResolvedValue(heldPage());
    getJudgmentLibraryEvidence.mockResolvedValue({ candidates: [] });

    renderAt('step=moment&page=page-1');

    expect(await screen.findByRole('heading', { name: 'Nothing you brought speaks to this yet.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bring one more source' }));
    await waitFor(() => expect(where()).toBe('step=reading'));
  });

  it('opens a new reader who took a shared wiki on that wiki, ready for a view', async () => {
    getWikiPage.mockResolvedValue(writtenPage({ _id: 'page-9' }));

    renderAt('took=page-9');

    expect(await screen.findByText('The wiki you took is in your Wiki now.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your view')).toBeInTheDocument();
  });

  it('lets you leave at any step, and does not ask again', async () => {
    renderAt('');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/library', { replace: true }));
    expect(markOnboardingCompleteOnServer).toHaveBeenCalled();
  });

  it('sends a reader past first run straight to the wiki they took', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');

    renderAt('took=page-9');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('page-9'), { replace: true }));
  });
});
