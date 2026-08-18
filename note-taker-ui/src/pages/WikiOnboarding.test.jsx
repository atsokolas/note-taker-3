import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiOnboarding, { describeThinSource } from './WikiOnboarding';
import {
  adoptWikiStarterPack,
  createWikiPage,
  deleteWikiPage,
  listWikiStarterPacks,
  startWikiPageBuild
} from '../api/wiki';
import { importPastedText, importPastedUrl } from '../api/imports';

// createWikiPage and startWikiPageBuild are mocked so the tests can assert they are
// never called: first run imports a source and stops.
jest.mock('../api/wiki', () => ({
  adoptWikiStarterPack: jest.fn(),
  createWikiPage: jest.fn(),
  deleteWikiPage: jest.fn(),
  listWikiStarterPacks: jest.fn(),
  startWikiPageBuild: jest.fn()
}));

jest.mock('../api/imports', () => ({
  importPastedText: jest.fn(),
  importPastedUrl: jest.fn()
}));

describe('WikiOnboarding', () => {
  let navigate;

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    jest.spyOn(router, 'useSearchParams').mockReturnValue([new URLSearchParams(), jest.fn()]);
    listWikiStarterPacks.mockResolvedValue([
      {
        id: 'mental-models',
        name: 'Mental Models',
        tagline: 'The Munger latticework for better judgment.',
        pageCount: 7,
        hero: true
      },
      {
        id: 'value-investing',
        name: 'Value Investing',
        tagline: 'Durable investing concepts.',
        pageCount: 5
      }
    ]);
    adoptWikiStarterPack.mockResolvedValue({
      pages: [{ _id: 'page-1', title: 'First Principles Thinking', claimCount: 2, sourceCount: 1 }]
    });
    startWikiPageBuild.mockResolvedValue({
      pageId: 'page-1',
      status: 'maintaining',
      startedAt: '2026-08-13T00:00:00.000Z',
      alreadyRunning: false
    });
    importPastedText.mockResolvedValue({
      article: {
        _id: 'article-1',
        title: 'Opportunity cost memo',
        url: 'import://manual/article-1'
      }
    });
    importPastedUrl.mockResolvedValue({
      article: {
        _id: 'article-url-1',
        title: 'URL memo',
        url: 'https://example.com/memo'
      }
    });
    deleteWikiPage.mockResolvedValue({});
  });

  it('keeps long starter-pack titles inside the feed cards without uppercasing them', async () => {
    listWikiStarterPacks.mockResolvedValueOnce([
      {
        id: 'behavioral-economics',
        name: 'Behavioral Economics & Decision-Making',
        tagline: 'Biases, base rates, and the psychology of judgment.',
        pageCount: 6
      },
      {
        id: 'mental-models',
        name: 'Mental Models',
        tagline: 'The Munger latticework for better judgment.',
        pageCount: 7,
        hero: true
      }
    ]);

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const longPackCard = await screen.findByRole('button', { name: /Behavioral Economics & Decision-Making/i });
    expect(longPackCard).toHaveClass('wiki-onboarding__pack');
    expect(longPackCard).toHaveTextContent('Behavioral Economics & Decision-Making');
    expect(longPackCard).not.toHaveTextContent('BEHAVIORAL ECONOMICS & DECISION-MAKING');
  });

  it('adopts a starter pack without building anything', async () => {
    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: /Mental Models/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add selected pack' }));

    await waitFor(() => expect(adoptWikiStarterPack).toHaveBeenCalledWith('mental-models'));
    expect(await screen.findByRole('heading', { name: 'This wiki is now yours.' })).toBeInTheDocument();
    // Adopted pages arrive already written. Nothing is built during first run.
    expect(startWikiPageBuild).not.toHaveBeenCalled();
  });

  it('puts a pasted source in the library and builds no page', async () => {
    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText(/Paste a link to something you read/i), {
      target: { value: 'Opportunity cost is the price of the best alternative not taken. Every allocation of capital or attention forecloses another one, so the true cost of any choice is the value of the option you gave up rather than the cash you handed over. Accountants record the cash; the decision maker has to price the road not travelled.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to my library' }));

    await waitFor(() => expect(importPastedText).toHaveBeenCalled());
    // The whole point of the change: a wiki page is synthesis over accumulated
    // reading, and one pasted link is not that. The evidence gate refused these
    // roughly half the time in production, which made failure a new user's first
    // outcome.
    expect(createWikiPage).not.toHaveBeenCalled();
    expect(startWikiPageBuild).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'That is in your library now.' })).toBeInTheDocument();
    expect(screen.getByText('Opportunity cost memo')).toBeInTheDocument();
  });

  it('leaves onboarding in the library', async () => {
    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText(/Paste a link to something you read/i), {
      target: { value: 'https://example.com/memo' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to my library' }));

    await waitFor(() => expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/memo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Go to my library' }));
    expect(navigate).toHaveBeenCalledWith('/library', { replace: true });
  });

  it('imports a pasted URL rather than treating it as prose', async () => {
    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText(/Paste a link to something you read/i), {
      target: { value: 'https://example.com/memo' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to my library' }));

    await waitFor(() => expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/memo' }));
    expect(importPastedText).not.toHaveBeenCalled();
  });

  it('lets users clear adopted sample packs and review possible merges', async () => {
    adoptWikiStarterPack.mockResolvedValue({
      pack: { id: 'mental-models', name: 'Mental Models' },
      mergeAvailable: true,
      pages: [
        { _id: 'sample-1', title: 'First Principles', claimCount: 2, sourceCount: 1, adoptedFrom: { sample: true } },
        { _id: 'sample-2', title: 'Opportunity Cost', claimCount: 1, sourceCount: 1, adoptedFrom: { sample: true } }
      ]
    });

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add selected pack' }));

    expect(await screen.findByText('Mental Models is sample material.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review possible merges' })).toHaveAttribute('href', '/wiki/workspace?view=list');

    fireEvent.click(screen.getByRole('button', { name: 'Clear sample pack' }));

    await waitFor(() => expect(deleteWikiPage).toHaveBeenCalledWith('sample-1'));
    expect(deleteWikiPage).toHaveBeenCalledWith('sample-2');
    expect(await screen.findByRole('heading', { name: 'Start with what you have already read.' })).toBeInTheDocument();
  });

  it('opens on the hook after a shared-wiki adoption handoff', async () => {
    jest.spyOn(router, 'useSearchParams').mockReturnValue([
      new URLSearchParams('adoptedPage=wiki-1&source=shared'),
      jest.fn()
    ]);

    render(<WikiOnboarding />);

    expect(screen.getByRole('heading', { name: 'This wiki is now yours.' })).toBeInTheDocument();
    expect(screen.getByLabelText("Tomorrow's Morning Paper")).toHaveTextContent(/Your adopted copy joins your own maintenance loop/i);
    await waitFor(() => expect(listWikiStarterPacks).toHaveBeenCalled());
    // Every path out of onboarding ends in the Library. A copied wiki also gets a
    // link to the pages that arrived, since it has some.
    expect(screen.getByRole('link', { name: 'See the copied pages' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to my library' }));
    expect(navigate).toHaveBeenCalledWith('/library', { replace: true });
  });

  it('refuses a source too thin to build from, before spending the user\'s time', async () => {
    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText(/Paste a link to something you read/i), {
      target: { value: 'Goodharts law says a measure that becomes a target stops being a good measure.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to my library' }));

    // This exact input reached production, burned ~20s, and was rejected by the
    // evidence gate for claims with no anchor in their source.
    expect(await screen.findByRole('alert')).toHaveTextContent(/too short to build from/i);
    expect(importPastedText).not.toHaveBeenCalled();
    expect(createWikiPage).not.toHaveBeenCalled();
  });

  it('always allows a URL, however short', () => {
    expect(describeThinSource('https://example.com/a-long-article')).toBe('');
    expect(describeThinSource('short')).toMatch(/too short/i);
    expect(describeThinSource('')).toMatch(/Paste a link/i);
    expect(describeThinSource(new Array(45).fill('word').join(' '))).toBe('');
  });

  /* Import leads. Connecting your own archive used to be a link under a
     button, below four sample packs — so the first thing a new reader was
     offered was somebody else's material, and their own years of reading were
     an afterthought. */
  it('offers your own archive before anyone else’s starter pack', async () => {
    render(<WikiOnboarding />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));

    const archive = await screen.findByRole('link', { name: 'Connect your reading archive' });
    expect(archive).toHaveAttribute('href', '/connections#sources');

    const packs = document.querySelector('.wiki-onboarding__packs');
    expect(archive.compareDocumentPosition(packs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /* You leave with a claim. Onboarding used to end on a page existing, which
     is the product describing itself rather than asking anything of you. */
});
