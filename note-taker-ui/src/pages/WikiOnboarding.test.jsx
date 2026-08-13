import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiOnboarding from './WikiOnboarding';
import {
  adoptWikiStarterPack,
  createWikiPage,
  deleteWikiPage,
  listWikiStarterPacks,
  startWikiPageBuild
} from '../api/wiki';
import { importPastedText, importPastedUrl } from '../api/imports';

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

  it('moves from show to starter-pack build narration and hook', async () => {
    render(<WikiOnboarding />);

    expect(screen.getByLabelText('Example wiki page preview')).toHaveTextContent('Core idea');
    expect(screen.getByLabelText('Example wiki page preview')).toHaveTextContent('Evidence');
    expect(screen.getByLabelText('Example wiki page preview')).toHaveTextContent('Open question');

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: /Mental Models/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add selected pack' }));

    await waitFor(() => expect(adoptWikiStarterPack).toHaveBeenCalledWith('mental-models'));
    expect(await screen.findByRole('heading', { name: 'Your first page is ready.' })).toBeInTheDocument();
    expect(screen.getByLabelText("Tomorrow's Morning Paper")).toHaveTextContent(/Background maintenance checks due wiki pages about every six hours/i);
    expect(screen.getByText('Scheduled page refresh is on.')).toBeInTheDocument();
    // The extension ask is now a real card with detected state, rendered inline —
    // it used to be a link to /connections#capture, which had nothing to land on.
    expect(screen.getByLabelText('Browser capture setup')).toBeInTheDocument();
  });

  it('builds a first page from pasted text', async () => {
    createWikiPage.mockResolvedValue({ _id: 'paste-page', title: 'Opportunity cost memo' });

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText('Drop in something you read this week...'), {
      target: { value: 'Opportunity cost is the price of the best alternative not taken.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build from this' }));

    await waitFor(() => expect(importPastedText).toHaveBeenCalledWith({
      text: 'Opportunity cost is the price of the best alternative not taken.',
      title: 'Opportunity Cost'
    }));
    await waitFor(() => expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      createdFrom: expect.objectContaining({ type: 'article', objectId: 'article-1' }),
      initialSourceRef: expect.objectContaining({ type: 'article', objectId: 'article-1' })
    })));
    await waitFor(() => expect(startWikiPageBuild).toHaveBeenCalledWith(
      'paste-page',
      expect.objectContaining({
        maintenanceProfile: 'fast',
        sourceLimit: 8,
        sourceTextLimit: 800,
        inlineAutolinkLimit: 150,
        skipQualityRebuild: true,
        streamDraft: false,
        deferInboundAutolinks: true
      })
    ));
    expect(await screen.findByRole('heading', { name: 'Your first page is ready.' })).toBeInTheDocument();
  });

  it('strips a leading article when inferring a generated first-page title', async () => {
    createWikiPage.mockResolvedValue({ _id: 'paste-page', title: 'Availability Heuristic' });

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText('Drop in something you read this week...'), {
      target: { value: 'The availability heuristic is a shortcut where vivid examples crowd out base rates.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build from this' }));

    await waitFor(() => expect(importPastedText).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Availability Heuristic'
    })));
  });

  it('hands the build off in the background instead of holding the user on a spinner', async () => {
    createWikiPage.mockResolvedValue({ _id: 'paste-page', title: 'Spaced Repetition' });

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText('Drop in something you read this week...'), {
      target: { value: 'Spaced repetition is a learning technique where reviews are timed.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build from this' }));

    // The user reaches the end of onboarding while the build is still running.
    expect(await screen.findByRole('heading', { name: 'Your first page is ready.' })).toBeInTheDocument();

    // And the in-flight build is recorded so the ambient banner can pick it up.
    const handoff = JSON.parse(sessionStorage.getItem('noeis.onboarding.activeBuild.v1'));
    expect(handoff).toEqual(expect.objectContaining({
      pageId: 'paste-page',
      title: 'Spaced Repetition'
    }));
  });

  it('imports a pasted URL before creating the first wiki page', async () => {
    createWikiPage.mockResolvedValue({ _id: 'url-page', title: 'URL memo' });

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText('Drop in something you read this week...'), {
      target: { value: 'https://example.com/memo' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build from this' }));

    await waitFor(() => expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/memo' }));
    expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      title: 'URL memo',
      initialSourceRef: expect.objectContaining({ url: 'https://example.com/memo' })
    }));
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
    expect(await screen.findByRole('heading', { name: 'Start with a foundation.' })).toBeInTheDocument();
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
    // Onboarding now ends on the Paper — home — with the built page one click away.
    expect(screen.getByRole('button', { name: 'Show me around' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to my page' }));
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-1', { replace: true });
  });
});
