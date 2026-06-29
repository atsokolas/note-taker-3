import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CommandPalette, {
  parseHighlightRetrieveIntent,
  parseHighlightToQuestionIntent,
  parseHighlightToWikiSectionIntent,
  parseLibraryFilingReviewIntent,
  parseWikiCompareCommand,
  parseWikiBuildCommand,
  parseWikiTemporalCommand
} from './CommandPalette';
import api from '../api';
import { searchKeyword } from '../api/retrieval';
import { createWikiPage, listWikiPages } from '../api/wiki';
import { createQuestion } from '../api/questions';
import { startLibraryFilingSuggestions } from '../api/library';
import { getNotebookSummaries } from '../api/notebook';
import { buildWikiCreatePayload, openWikiDraft } from '../utils/wikiCreate';
import { writeHighlightActionContext } from '../utils/highlightToThinkingModel';
import { SystemStatusProvider } from '../system/SystemStatusContext';

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

jest.mock('../api/questions', () => ({
  createQuestion: jest.fn()
}));

jest.mock('../api/notebook', () => ({
  getNotebookSummaries: jest.fn()
}));

jest.mock('../api/library', () => ({
  startLibraryFilingSuggestions: jest.fn()
}));

jest.mock('../utils/wikiCreate', () => ({
  buildWikiCreatePayload: jest.fn(payload => ({ built: true, ...payload })),
  buildWikiSourceRef: jest.fn((source = {}) => ({
    type: source.type || 'highlight',
    objectId: source._id || source.objectId || null,
    parentObjectId: source.parentObjectId || source.articleId || null,
    title: source.title || '',
    snippet: source.snippet || source.text || ''
  })),
  openWikiDraft: jest.fn()
}));

const buildSystemStatusControls = (overrides = {}) => ({
  setBackgroundWork: jest.fn(),
  setLatestReceipt: jest.fn(),
  setRecoverableFailure: jest.fn(),
  clearRecoverableFailure: jest.fn(),
  resetSystemStatus: jest.fn(),
  ...overrides
});

const renderPalette = async ({ systemStatusControls = buildSystemStatusControls(), onClose = jest.fn() } = {}) => {
  const result = render(
    <SystemStatusProvider value={systemStatusControls}>
      <CommandPalette open onClose={onClose} />
    </SystemStatusProvider>
  );
  await act(async () => {});
  return { ...result, systemStatusControls, onClose };
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
    createQuestion.mockResolvedValue({ _id: 'question-new' });
    listWikiPages.mockResolvedValue([]);
    startLibraryFilingSuggestions.mockResolvedValue({
      thread: { threadId: 'thread-filing-1' },
      receipt: {
        stage: 'ready',
        summary: 'Staged 2 filing suggestions across 2 folders for review.'
      }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parses explicit wiki-build commands without treating every query as an instruction', () => {
    expect(parseWikiBuildCommand('turn my highlights on incentives into a wiki page')).toMatchObject({
      topic: 'incentives',
      label: 'Turn highlights on "incentives" into a wiki page'
    });
    expect(parseWikiBuildCommand('build a wiki page about opportunity cost')).toMatchObject({
      topic: 'opportunity cost'
    });
    expect(parseWikiBuildCommand('opportunity cost')).toBe(null);
  });

  it('parses explicit highlight-retrieve commands without treating every query as an instruction', () => {
    expect(parseHighlightRetrieveIntent('find the highlight I saved about compounding from Munger')).toMatchObject({
      topic: 'compounding from Munger',
      label: 'Find highlight about "compounding from Munger"'
    });
    expect(parseHighlightRetrieveIntent('find my highlight about incentives')).toMatchObject({
      topic: 'incentives'
    });
    expect(parseHighlightRetrieveIntent('show highlight about opportunity cost')).toMatchObject({
      topic: 'opportunity cost'
    });
    expect(parseHighlightRetrieveIntent('compounding from Munger')).toBe(null);
    expect(parseHighlightRetrieveIntent('find highlights on incentives')).toBe(null);
  });

  it('parses explicit library-filing review commands without treating every query as an instruction', () => {
    expect(parseLibraryFilingReviewIntent('review filing suggestions')).toMatchObject({
      label: 'Review library filing suggestions'
    });
    expect(parseLibraryFilingReviewIntent('clean up my library filing')).toMatchObject({
      label: 'Review library filing suggestions'
    });
    expect(parseLibraryFilingReviewIntent('organize my library filing suggestions')).toMatchObject({
      label: 'Review library filing suggestions'
    });
    expect(parseLibraryFilingReviewIntent('library filing')).toBe(null);
    expect(parseLibraryFilingReviewIntent('review my highlights')).toBe(null);
  });

  it('parses explicit wiki comparison commands without treating every query as an instruction', () => {
    expect(parseWikiCompareCommand('compare my notes on opportunity cost and loss aversion')).toMatchObject({
      left: 'opportunity cost',
      right: 'loss aversion',
      topic: 'opportunity cost vs loss aversion',
      label: 'Compare "opportunity cost" and "loss aversion"'
    });
    expect(parseWikiCompareCommand('compare compounding with discounting in a wiki page')).toMatchObject({
      left: 'compounding',
      right: 'discounting'
    });
    expect(parseWikiCompareCommand('compare opportunity cost versus loss aversion')).toMatchObject({
      left: 'opportunity cost',
      right: 'loss aversion'
    });
    expect(parseWikiCompareCommand('opportunity cost and loss aversion')).toBe(null);
    expect(parseWikiCompareCommand('compare notes')).toBe(null);
  });

  it('parses temporal change commands without treating every query as an instruction', () => {
    expect(parseWikiTemporalCommand('what changed in my thinking about opportunity cost over the last month')).toMatchObject({
      topic: 'opportunity cost',
      period: 'month',
      label: 'Draft change ledger for "opportunity cost"'
    });
    expect(parseWikiTemporalCommand('what changed since I last opened loss aversion')).toMatchObject({
      topic: 'loss aversion'
    });
    expect(parseWikiTemporalCommand('show change ledger for compounding')).toMatchObject({
      topic: 'compounding'
    });
    expect(parseWikiTemporalCommand('what changed')).toBe(null);
    expect(parseWikiTemporalCommand('change ledger')).toBe(null);
  });

  it('parses highlight-to-question and highlight-to-wiki-section commands', () => {
    expect(parseHighlightToQuestionIntent('turn my highlights on incentives into a question')).toMatchObject({
      topic: 'incentives',
      label: 'Turn highlights on "incentives" into a question'
    });
    expect(parseHighlightToQuestionIntent('turn these highlights into a question')).toMatchObject({
      useContextHighlights: true,
      label: 'Turn selected highlights into a question'
    });
    expect(parseHighlightToWikiSectionIntent('turn these highlights into a wiki section draft')).toMatchObject({
      useContextHighlights: true
    });
    expect(parseHighlightToWikiSectionIntent('turn my highlights on compounding into a wiki section')).toMatchObject({
      topic: 'compounding'
    });
  });

  it('starts library filing review, leaves a receipt, and navigates to the Think thread', async () => {
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'review filing suggestions' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Review library filing suggestions'));

    await waitFor(() => expect(startLibraryFilingSuggestions).toHaveBeenCalled());
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Filing the library',
      stage: 'Staging suggestions'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Noeis update',
      summary: 'Staged 2 filing suggestions across 2 folders for review.',
      status: 'completed',
      href: '/think?tab=threads&threadId=thread-filing-1'
    }));
    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=threads&threadId=thread-filing-1');
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
  });

  it('keeps library filing review failures recoverable from system status', async () => {
    startLibraryFilingSuggestions.mockRejectedValueOnce(new Error('network down'));
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'clean up my library filing' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Review library filing suggestions'));

    await waitFor(() => expect(systemStatusControls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'Command palette',
      message: 'Could not stage filing suggestions. Try again in a moment.',
      retryable: true
    })));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('turns a comparison command into a durable comparison wiki page and receipt', async () => {
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'compare my notes on opportunity cost and loss aversion' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Compare "opportunity cost" and "loss aversion"'));

    await waitFor(() => expect(buildWikiCreatePayload).toHaveBeenCalledWith(expect.objectContaining({
      type: 'search',
      pageType: 'comparison',
      title: 'opportunity cost vs loss aversion',
      text: 'compare my notes on opportunity cost and loss aversion',
      label: 'compare my notes on opportunity cost and loss aversion'
    })));
    expect(createWikiPage).toHaveBeenCalled();
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Creating comparison page',
      stage: 'Comparing opportunity cost and loss aversion'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'command-compare-wiki-new',
      title: 'Comparison page created',
      summary: 'Started a comparison of "opportunity cost" and "loss aversion".',
      status: 'completed',
      href: '/wiki/workspace?page=wiki-new'
    }));
    expect(openWikiDraft).toHaveBeenCalledWith({ navigate: mockNavigate, pageId: 'wiki-new' });
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
  });

  it('keeps comparison command failures recoverable from system status', async () => {
    createWikiPage.mockRejectedValueOnce(new Error('network down'));
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'compare compounding with discounting' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Compare "compounding" and "discounting"'));

    await waitFor(() => expect(systemStatusControls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'Command palette',
      message: 'Could not create a comparison page.',
      retryable: true
    })));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
    expect(openWikiDraft).not.toHaveBeenCalled();
  });

  it('turns a temporal command into a durable change-ledger wiki draft and receipt', async () => {
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'what changed in my thinking about opportunity cost over the last month' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Draft change ledger for "opportunity cost"'));

    await waitFor(() => expect(buildWikiCreatePayload).toHaveBeenCalledWith(expect.objectContaining({
      type: 'search',
      pageType: 'temporal_review',
      title: 'opportunity cost change ledger',
      text: 'what changed in my thinking about opportunity cost over the last month',
      label: 'what changed in my thinking about opportunity cost over the last month',
      createdFrom: expect.objectContaining({
        type: 'temporal_query',
        topic: 'opportunity cost',
        period: 'month'
      })
    })));
    expect(createWikiPage).toHaveBeenCalled();
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Creating change ledger',
      stage: 'Reading history for opportunity cost'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'command-temporal-wiki-new',
      title: 'Change ledger started',
      summary: 'Started a wiki draft to inspect what changed about "opportunity cost" across month.',
      status: 'needs_review',
      href: '/wiki/workspace?page=wiki-new'
    }));
    expect(openWikiDraft).toHaveBeenCalledWith({ navigate: mockNavigate, pageId: 'wiki-new' });
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
  });

  it('keeps temporal command failures recoverable from system status', async () => {
    createWikiPage.mockRejectedValueOnce(new Error('network down'));
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'show change ledger for compounding' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Draft change ledger for "compounding"'));

    await waitFor(() => expect(systemStatusControls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'Command palette',
      message: 'Could not create the change ledger.',
      retryable: true
    })));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
    expect(openWikiDraft).not.toHaveBeenCalled();
  });

  it('retrieves the best highlight match, leaves a receipt, and navigates to the article', async () => {
    searchKeyword.mockImplementation(({ q }) => {
      if (q === 'compounding from Munger') {
        return Promise.resolve({
          articles: [],
          groups: {
            notes: [],
            highlights: [{
              _id: 'highlight-1',
              articleId: 'article-1',
              articleTitle: 'Poor Charlie\'s Almanack',
              text: 'The first rule of compounding: never interrupt it unnecessarily.',
              openPath: '/library?articleId=article-1'
            }],
            claims: [],
            evidence: []
          }
        });
      }
      return Promise.resolve({
        articles: [],
        groups: { notes: [], highlights: [], claims: [], evidence: [] }
      });
    });
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'find the highlight I saved about compounding from Munger' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Find highlight about "compounding from Munger"'));

    await waitFor(() => expect(searchKeyword).toHaveBeenCalledWith({ q: 'compounding from Munger', scope: 'all' }));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Finding highlight',
      stage: 'Searching for "compounding from Munger"'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'command-highlight-highlight-1',
      title: 'Highlight found',
      status: 'completed',
      href: '/library?articleId=article-1&highlightId=highlight-1'
    }));
    expect(mockNavigate).toHaveBeenCalledWith('/library?articleId=article-1&highlightId=highlight-1');
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
  });

  it('keeps highlight retrieve failures recoverable from system status', async () => {
    searchKeyword.mockResolvedValueOnce({
      articles: [],
      groups: {
        notes: [],
        highlights: [],
        claims: [],
        evidence: []
      }
    });
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'find my highlight about unknown topic' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Find highlight about "unknown topic"'));

    await waitFor(() => expect(systemStatusControls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'Command palette',
      message: 'No highlight matched "unknown topic".',
      retryable: true
    })));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
    expect(mockNavigate).not.toHaveBeenCalled();
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
    const { systemStatusControls } = await renderPalette();

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
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Creating wiki page',
      stage: 'Drafting portfolio'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'command-wiki-wiki-new',
      title: 'Wiki page created',
      status: 'completed',
      href: '/wiki/workspace?page=wiki-new'
    }));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
  });

  it('turns a plain-English highlights command into a durable wiki page and receipt', async () => {
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'turn my highlights on incentives into a wiki page' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Turn highlights on "incentives" into a wiki page'));

    await waitFor(() => expect(buildWikiCreatePayload).toHaveBeenCalledWith(expect.objectContaining({
      type: 'search',
      title: 'incentives',
      text: 'turn my highlights on incentives into a wiki page',
      label: 'turn my highlights on incentives into a wiki page'
    })));
    expect(createWikiPage).toHaveBeenCalled();
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Building wiki page from command',
      stage: 'Drafting incentives'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'command-wiki-wiki-new',
      title: 'Wiki command completed',
      summary: 'Built a wiki page for "incentives" from your command.',
      status: 'completed',
      href: '/wiki/workspace?page=wiki-new'
    }));
    expect(openWikiDraft).toHaveBeenCalledWith({ navigate: mockNavigate, pageId: 'wiki-new' });
  });

  it('turns selected highlights into a reviewable question draft from the command palette', async () => {
    writeHighlightActionContext([
      { _id: 'h1', text: 'Incentives drive behavior', articleId: 'a1' }
    ]);
    searchKeyword.mockResolvedValueOnce({
      articles: [],
      groups: { notes: [], highlights: [], claims: [], evidence: [] }
    });
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'turn these highlights into a question' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Turn selected highlights into a question'));

    await waitFor(() => {
      expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
        linkedHighlightIds: ['h1'],
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: 'highlight-ref', highlightId: 'h1' })
        ])
      }));
      expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
        id: 'command-question-question-new',
        title: 'Question draft ready',
        status: 'needs_review',
        href: '/think?tab=questions&questionId=question-new'
      }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=questions&questionId=question-new');
  });

  it('turns topic-matched highlights into a wiki section draft from the command palette', async () => {
    searchKeyword.mockImplementation(async ({ q } = {}) => ({
      articles: [],
      groups: {
        notes: [],
        highlights: String(q || '').toLowerCase().includes('compounding')
          ? [{ _id: 'h2', text: 'Compounding rewards patience', articleId: 'a2', articleTitle: 'Letter' }]
          : [],
        claims: [],
        evidence: []
      }
    }));
    const { systemStatusControls } = await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'turn my highlights on compounding into a wiki section' }
    });
    await flushSearch();

    fireEvent.click(await screen.findByText('Turn highlights on "compounding" into a wiki section'));

    await waitFor(() => {
      expect(createWikiPage).toHaveBeenCalled();
      const payload = createWikiPage.mock.calls.at(-1)[0];
      expect(payload.initialSourceRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'highlight', objectId: 'h2' })
        ])
      );
      expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Wiki section draft ready',
        status: 'needs_review'
      }));
    });
    expect(buildWikiCreatePayload).toHaveBeenCalledWith(expect.objectContaining({
      type: 'highlight',
      objectIds: ['h2']
    }));
    expect(openWikiDraft).toHaveBeenCalledWith({ navigate: mockNavigate, pageId: 'wiki-new' });
  });

  it('announces async search state to assistive tech', async () => {
    await renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Quick open notes, highlights, claims, evidence...'), {
      target: { value: 'portfolio' }
    });

    expect(screen.getByRole('status')).toHaveTextContent('Searching…');
    await flushSearch();
  });

  it('leaves a receipt after creating a Think note from the command palette', async () => {
    const { systemStatusControls } = await renderPalette();

    fireEvent.click(screen.getByText('New Think note'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/notebook',
      { title: 'Untitled', content: '', blocks: [] },
      { headers: { Authorization: 'Bearer token' } }
    ));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Creating note',
      stage: 'Saving notebook entry'
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'command-note-note-1',
      title: 'Think note created',
      status: 'completed',
      href: '/think?tab=notebook&entryId=note-1'
    }));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=notebook&entryId=note-1');
  });

  it('keeps command failures recoverable from system status', async () => {
    api.post.mockRejectedValueOnce(new Error('network down'));
    const { systemStatusControls } = await renderPalette();

    fireEvent.click(screen.getByText('New Think note'));

    await waitFor(() => expect(systemStatusControls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'Command palette',
      message: 'Could not create a Think note.',
      retryable: true
    })));
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=notebook');
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
