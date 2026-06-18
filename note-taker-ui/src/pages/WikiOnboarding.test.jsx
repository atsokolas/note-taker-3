import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiOnboarding from './WikiOnboarding';
import {
  adoptWikiStarterPack,
  createWikiPage,
  listWikiStarterPacks,
  streamMaintainWikiPage
} from '../api/wiki';

jest.mock('../api/wiki', () => ({
  adoptWikiStarterPack: jest.fn(),
  createWikiPage: jest.fn(),
  listWikiStarterPacks: jest.fn(),
  streamMaintainWikiPage: jest.fn()
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
    streamMaintainWikiPage.mockImplementation(async (_pageId, _options, handlers = {}) => {
      handlers.onEvent?.('progress', { stage: 'maintaining' });
      handlers.onEvent?.('progress', { stage: 'graph_synced' });
      handlers.onPage?.({ _id: 'page-1', claimCount: 3, sourceCount: 2 });
      return { _id: 'page-1', claimCount: 3, sourceCount: 2 };
    });
  });

  it('moves from show to starter-pack build narration and hook', async () => {
    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: /Mental Models/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add selected pack' }));

    await waitFor(() => expect(adoptWikiStarterPack).toHaveBeenCalledWith('mental-models'));
    expect(await screen.findByRole('heading', { name: 'Your first page is ready.' })).toBeInTheDocument();
    expect(screen.getByText(/Tomorrow morning/)).toBeInTheDocument();
  });

  it('builds a first page from pasted text', async () => {
    createWikiPage.mockResolvedValue({ _id: 'paste-page', title: 'Opportunity cost memo' });
    streamMaintainWikiPage.mockResolvedValue({ _id: 'paste-page', claimCount: 1, sourceCount: 1 });

    render(<WikiOnboarding />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(await screen.findByPlaceholderText('Drop in something you read this week...'), {
      target: { value: 'Opportunity cost is the price of the best alternative not taken.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build from this' }));

    await waitFor(() => expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      createdFrom: expect.objectContaining({ type: 'paste' })
    })));
    expect(await screen.findByRole('heading', { name: 'Your first page is ready.' })).toBeInTheDocument();
  });

  it('opens on the hook after a shared-wiki adoption handoff', async () => {
    jest.spyOn(router, 'useSearchParams').mockReturnValue([
      new URLSearchParams('adoptedPage=wiki-1&source=shared'),
      jest.fn()
    ]);

    render(<WikiOnboarding />);

    expect(screen.getByRole('heading', { name: 'This wiki is now yours.' })).toBeInTheDocument();
    await waitFor(() => expect(listWikiStarterPacks).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Go to my wiki' }));
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-1', { replace: true });
  });
});
