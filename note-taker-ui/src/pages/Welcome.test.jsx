import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Welcome from './Welcome';
import {
  createWikiPage,
  getJudgmentLibraryEvidence,
  getWikiPage,
  listWikiPages,
  updateWikiPage
} from '../api/wiki';
import { getArticles } from '../api/articles';
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
  createWikiPage: jest.fn(),
  getJudgmentLibraryEvidence: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiPages: jest.fn(),
  updateWikiPage: jest.fn()
}));
jest.mock('../api/articles', () => ({ getArticles: jest.fn() }));
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
const heldPage = (judgment = {}) => ({
  _id: 'view-1',
  createdAt: '2026-10-11T00:00:00Z',
  judgment: { currentJudgment: SENTENCE, ...judgment }
});

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
    getWikiPage.mockResolvedValue(heldPage());
    listWikiPages.mockResolvedValue([]);
  });

  it('holds the sentence you write and carries it into the next step', async () => {
    createWikiPage.mockResolvedValue({ _id: 'view-1' });
    updateWikiPage.mockResolvedValue(heldPage());

    renderAt('');
    fireEvent.change(screen.getByLabelText('Your view'), { target: { value: SENTENCE } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold it' }));

    expect(await screen.findByRole('heading', { name: 'Bring what you have read.' })).toBeInTheDocument();
    expect(createWikiPage).toHaveBeenCalledWith({ title: SENTENCE, pageType: 'topic' });
    expect(updateWikiPage).toHaveBeenCalledWith('view-1', expect.objectContaining({
      judgment: expect.objectContaining({ currentJudgment: SENTENCE })
    }));
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(where()).toBe('step=reading&view=view-1');
  });

  it('lends an example without holding it for you', () => {
    renderAt('');
    fireEvent.click(screen.getByRole('button', { name: /Costco/ }));

    expect(screen.getByLabelText('Your view').value).toMatch(/^Costco/);
    expect(createWikiPage).not.toHaveBeenCalled();
  });

  it('asks for a sentence when given a topic', () => {
    renderAt('');
    fireEvent.change(screen.getByLabelText('Your view'), { target: { value: 'Costco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold it' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A view is a sentence someone could disagree with.');
    expect(createWikiPage).not.toHaveBeenCalled();
  });

  it('brings in each pasted link and names it when it arrives', async () => {
    importPastedUrl.mockImplementation(async ({ url }) => ({
      article: { title: url.includes('one') ? 'The first essay' : 'The second essay' }
    }));

    renderAt('step=reading&view=view-1');
    const continueButton = await screen.findByRole('button', { name: 'See what it says' });
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Links to things you have read'), {
      target: { value: 'https://example.com/one\nhttps://example.com/two' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));

    expect(await screen.findByText('The first essay')).toBeInTheDocument();
    expect(await screen.findByText('The second essay')).toBeInTheDocument();
    expect(importPastedUrl).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(continueButton).not.toBeDisabled());
  });

  it('takes a long passage as one source and refuses a sentence', async () => {
    importPastedText.mockResolvedValue({ article: { title: 'Pasted passage' } });

    renderAt('step=reading&view=view-1');
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

    renderAt('step=reading&view=view-1');
    fireEvent.change(await screen.findByLabelText('Readwise access token'), { target: { value: ' tok-123 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bring them in' }));

    expect(await screen.findByText('412 highlights from 63 sources came in from Readwise.')).toBeInTheDocument();
    expect(connectReadwiseToken).toHaveBeenCalledWith({ apiToken: 'tok-123' });
    expect(syncReadwiseConnection).toHaveBeenCalledWith({ connectionId: 'conn-1' });
    expect(screen.getByRole('button', { name: 'See what it says' })).not.toBeDisabled();
  });

  it('quotes what you saved and files it where you say', async () => {
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
    updateWikiPage.mockImplementation(async (_id, { judgment }) => heldPage(judgment));

    renderAt('step=moment&view=view-1');

    expect(await screen.findByRole('heading', { name: 'Two passages you saved bear on this.' })).toBeInTheDocument();
    expect(screen.getByText(/The Async Manifesto · saved Oct 9/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open where it came from' })[0])
      .toHaveAttribute('href', expect.stringContaining('/library?articleId=a1'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Supports it' })[0]);
    expect(await screen.findByText('Filed under why you hold it.')).toBeInTheDocument();
    expect(updateWikiPage).toHaveBeenCalledWith('view-1', {
      judgment: expect.objectContaining({
        why: [expect.objectContaining({ text: 'Written decisions outlast the meetings that made them.' })]
      })
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not about this' }));
    expect(screen.getByText('Set aside.')).toBeInTheDocument();
    expect(updateWikiPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open your view' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/judgment/view-1', { replace: true }));
    expect(markOnboardingCompleteOnServer).toHaveBeenCalled();
  });

  it('says plainly when nothing you brought speaks to the view', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ candidates: [] });

    renderAt('step=moment&view=view-1');

    expect(await screen.findByRole('heading', { name: 'Nothing you brought speaks to this yet.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bring one more source' }));
    await waitFor(() => expect(where()).toContain('step=reading'));
  });

  it('picks up the view you already hold when the URL has lost it', async () => {
    listWikiPages.mockResolvedValue([heldPage()]);

    renderAt('step=reading');

    expect(await screen.findByText(SENTENCE)).toBeInTheDocument();
    await waitFor(() => expect(where()).toContain('view=view-1'));
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
