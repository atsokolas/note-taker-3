import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CommandPalette from './CommandPalette';
import api from '../api';
import { searchKeyword } from '../api/retrieval';
import { createWikiPage, listWikiPages } from '../api/wiki';
import { getNotebookSummaries } from '../api/notebook';
import { buildWikiCreatePayload, openWikiDraft } from '../utils/wikiCreate';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

jest.mock('../api', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

jest.mock('../api/retrieval', () => ({
  searchKeyword: jest.fn()
}));

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn(),
  listWikiPages: jest.fn()
}));

jest.mock('../api/notebook', () => ({
  getNotebookSummaries: jest.fn()
}));

jest.mock('../utils/wikiCreate', () => ({
  buildWikiCreatePayload: jest.fn(payload => ({ built: true, ...payload })),
  openWikiDraft: jest.fn()
}));

const renderPalette = async () => {
  const result = render(<CommandPalette open onClose={jest.fn()} />);
  await act(async () => {});
  return result;
};

const flushSearch = async () => {
  await act(async () => {
    jest.advanceTimersByTime(180);
  });
  await act(async () => {});
};

describe('CommandPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    window.localStorage.clear();
    window.localStorage.setItem('token', 'token');
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: { _id: 'note-1' } });
    getNotebookSummaries.mockResolvedValue([]);
    searchKeyword.mockResolvedValue({
      articles: [],
      groups: {
        notes: [{ _id: 'note-hit', title: 'Portfolio note', snippet: 'Concentration research' }],
        highlights: [],
        claims: [],
        evidence: []
      }
    });
    createWikiPage.mockResolvedValue({ _id: 'wiki-new' });
    listWikiPages.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not advertise unavailable dump shortcut', async () => {
    await renderPalette();

    expect(screen.getByText('Cmd/Ctrl+K: Open')).toBeInTheDocument();
    expect(screen.queryByText('Cmd/Ctrl+Shift+D: Dump to memory')).not.toBeInTheDocument();
  });

  it('presents concepts and notebooks as Think postures instead of standalone surfaces', async () => {
    getNotebookSummaries.mockResolvedValueOnce([{ _id: 'note-1', title: 'Draft note' }]);
    api.get.mockImplementation((path) => {
      if (path === '/api/tags') return Promise.resolve({ data: [{ tag: 'Investing' }] });
      return Promise.resolve({ data: [] });
    });

    await renderPalette();

    expect(await screen.findByText('Think concepts')).toBeInTheDocument();
    expect(screen.getByText('Think notebook')).toBeInTheDocument();
    expect(screen.getByText('New Think note')).toBeInTheDocument();
    expect(screen.queryByText('Concepts')).not.toBeInTheDocument();
    expect(screen.queryByText('Notebook')).not.toBeInTheDocument();
  });

  it('opens the first search result before wiki creation when pressing Enter', async () => {
    await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'portfolio' }
    });
    fireEvent.keyDown(document.querySelector('.palette-overlay'), { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(createWikiPage).not.toHaveBeenCalled();

    await flushSearch();

    expect(await screen.findByText(/Portfolio note/)).toBeInTheDocument();
    fireEvent.keyDown(document.querySelector('.palette-overlay'), { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=notebook&entryId=note-hit');
    expect(createWikiPage).not.toHaveBeenCalled();
  });

  it('lets exact local page matches outrank async search and open immediately on Enter', async () => {
    await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'settings' }
    });
    fireEvent.keyDown(document.querySelector('.palette-overlay'), { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/settings');
    expect(createWikiPage).not.toHaveBeenCalled();
  });

  it('still allows explicit wiki page creation from a search query', async () => {
    await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'portfolio' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('New Wiki page from "portfolio"'));

    await waitFor(() => expect(buildWikiCreatePayload).toHaveBeenCalledWith(expect.objectContaining({
      type: 'search',
      title: 'portfolio',
      text: 'portfolio'
    })));
    expect(createWikiPage).toHaveBeenCalled();
    expect(openWikiDraft).toHaveBeenCalledWith({ navigate: mockNavigate, pageId: 'wiki-new' });
  });

  it('surfaces wiki pages first on wiki surfaces', async () => {
    window.history.pushState({}, '', '/wiki/workspace?view=graph');
    listWikiPages.mockResolvedValueOnce([
      { _id: 'wiki-1', title: 'Investing' }
    ]);

    await renderPalette();

    expect(await screen.findByText('Investing')).toBeInTheDocument();
    const groupTitles = Array.from(document.querySelectorAll('.palette-group-title')).map(node => node.textContent);
    expect(groupTitles[0]).toBe('Wiki pages');
    fireEvent.click(screen.getByText('Investing'));
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-1');
  });

  it('routes pull-reference action into the current Think surface', async () => {
    window.history.pushState({}, '', '/think?tab=questions&questionId=question-1');

    await renderPalette();

    fireEvent.click(screen.getByText('Pull reference into current surface'));

    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=questions&questionId=question-1&pull=1');
  });

  it('routes pull-reference action into the wiki chat pane while preserving workspace state', async () => {
    window.history.pushState({}, '', '/wiki/workspace?page=wiki-1&view=graph');

    await renderPalette();

    fireEvent.click(screen.getByText('Pull reference into current surface'));

    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-1&view=graph&pane=chat&pull=1');
  });

  it('ranks exact wiki page matches above stale broader wiki results', async () => {
    window.history.pushState({}, '', '/wiki/workspace?view=graph');
    listWikiPages
      .mockResolvedValueOnce([
        { _id: 'wiki-investing', title: 'Investing - Concepts, Ideas, and Strategies' }
      ])
      .mockResolvedValueOnce([
        { _id: 'wiki-investing', title: 'Investing - Concepts, Ideas, and Strategies' },
        { _id: 'wiki-cia', title: 'Cia Teach Investor Behavioural Investment' }
      ]);

    await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open wiki pages, notes, sources...'), {
      target: { value: 'Cia' }
    });
    await flushSearch();

    fireEvent.keyDown(document.querySelector('.palette-overlay'), { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-cia');
  });
});
