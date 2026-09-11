import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LibraryPassagePicker from './LibraryPassagePicker';

const article = {
  _id: 'article-1',
  title: 'Nomad',
  url: 'https://example.com/nomad',
  content: 'Getting lost was part of the work. A wrong turn can still leave another attempt.'
};

const highlight = {
  _id: 'highlight-1',
  articleId: 'article-1',
  articleTitle: 'Nomad',
  text: 'A wrong turn can still leave another attempt.',
  anchor: {
    text: 'A wrong turn can still leave another attempt.',
    prefix: 'Getting lost was part of the work.',
    suffix: 'The path remains open.'
  }
};

const dependencies = (overrides = {}) => ({
  loadFolders: jest.fn().mockResolvedValue([]),
  loadArticles: jest.fn().mockResolvedValue([]),
  loadArticle: jest.fn().mockResolvedValue({ article, highlights: [highlight] }),
  search: jest.fn().mockResolvedValue({
    articles: [],
    highlights: [highlight]
  }),
  ...overrides
});

const renderPicker = (props = {}, overrides = {}) => {
  const deps = dependencies(overrides);
  const onPlace = jest.fn();
  const onDismiss = jest.fn();
  const view = render(
    <LibraryPassagePicker
      open
      onPlace={onPlace}
      onDismiss={onDismiss}
      {...deps}
      {...props}
    />
  );
  return { ...deps, onPlace, onDismiss, view };
};

const searchForNomad = async () => {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nomad' } });
  const item = await screen.findByRole('listitem');
  return within(item).getByRole('button');
};

describe('LibraryPassagePicker', () => {
  it('searches owned articles and highlights after a pause', async () => {
    const utils = renderPicker();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nomad' } });
    expect(screen.getByText('Looking…')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing in your Library matches/)).not.toBeInTheDocument();
    await screen.findByRole('listitem');
    expect(utils.search).toHaveBeenCalledWith({ q: 'Nomad', type: ['article', 'highlight'] });
    expect(screen.getByText(highlight.text)).toBeInTheDocument();
  });

  it('treats a changed valid query as pending until its search settles', async () => {
    let resolveSecondSearch;
    const search = jest.fn(({ q }) => q === 'Nomad'
      ? Promise.resolve({ articles: [], highlights: [highlight] })
      : new Promise((resolve) => { resolveSecondSearch = resolve; }));
    renderPicker({}, { search });
    await searchForNomad();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Parenting' } });
    expect(screen.getByText('Looking…')).toBeInTheDocument();
    expect(screen.queryByText(highlight.text)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing in your Library matches/)).not.toBeInTheDocument();

    await waitFor(() => expect(search).toHaveBeenCalledWith({ q: 'Parenting', type: ['article', 'highlight'] }));
    await act(async () => resolveSecondSearch({ articles: [], highlights: [] }));
    expect(await screen.findByText('Nothing in your Library matches “Parenting”.')).toBeInTheDocument();
  });

  it('previews a real saved passage before placing its exact identity', async () => {
    const utils = renderPicker();
    const result = await searchForNomad();
    result.focus();
    fireEvent.click(result);
    const back = await screen.findByRole('button', { name: 'Back to Library' });
    await waitFor(() => expect(back).toHaveFocus());
    expect(screen.getByText('Select other words')).toBeInTheDocument();
    expect(screen.getByText('Getting lost was part of the work.')).toBeInTheDocument();
    expect(utils.onPlace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));
    expect(utils.onPlace).toHaveBeenCalledWith(expect.objectContaining({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      passage: highlight.text,
      owned: true,
      href: '/library?articleId=article-1&highlightId=highlight-1'
    }));
  });

  it('returns focus to the result that opened a preview', async () => {
    renderPicker();
    const result = await searchForNomad();
    result.focus();
    fireEvent.click(result);
    const back = await screen.findByRole('button', { name: 'Back to Library' });
    await waitFor(() => expect(back).toHaveFocus());
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByRole('listitem').querySelector('button')).toHaveFocus());
  });

  it('names a recorded use on a search result before placement', async () => {
    renderPicker({ excluded: [{
      articleId: 'article-1',
      highlightId: 'highlight-1',
      passage: highlight.text
    }] });
    await searchForNomad();
    expect(screen.getByText('You already used this here.')).toBeInTheDocument();
  });

  it('does not create or duplicate an existing saved passage', async () => {
    const utils = renderPicker({ excluded: [{
      articleId: 'article-1',
      highlightId: 'highlight-1',
      passage: highlight.text
    }] });
    fireEvent.click(await searchForNomad());
    expect(await screen.findByRole('button', { name: 'Place here' })).toBeDisabled();
    expect(utils.onPlace).not.toHaveBeenCalled();
    expect(screen.getAllByText('You already used this here.').length).toBeGreaterThan(0);
  });

  it('lets an owned article contribute an exact bounded selection without making a highlight', async () => {
    const utils = renderPicker({}, {
      search: jest.fn().mockResolvedValue({ articles: [article], highlights: [] }),
      loadArticle: jest.fn().mockResolvedValue({ article, highlights: [] })
    });
    fireEvent.click(await searchForNomad());
    const text = await screen.findByLabelText('Article text');
    const passage = 'wrong turn';
    const start = article.content.indexOf(passage);
    text.setSelectionRange(start, start + passage.length);
    fireEvent.select(text);
    fireEvent.click(screen.getByRole('button', { name: 'Place here' }));

    expect(utils.onPlace).toHaveBeenCalledWith(expect.objectContaining({
      articleId: 'article-1',
      highlightId: '',
      passage,
      href: expect.stringMatching(/^\/library\?articleId=article-1#passage=/),
      anchor: expect.objectContaining({
        text: passage,
        prefix: expect.any(String),
        suffix: expect.any(String),
        startOffsetApprox: start
      })
    }));
  });

  it('reads the full article and bounds only the selected passage to 6000 characters', async () => {
    const longArticle = { ...article, content: `<p>${'word '.repeat(1600)}</p>` };
    renderPicker({}, {
      search: jest.fn().mockResolvedValue({ articles: [longArticle], highlights: [] }),
      loadArticle: jest.fn().mockResolvedValue({ article: longArticle, highlights: [] })
    });
    fireEvent.click(await searchForNomad());
    const text = await screen.findByLabelText('Article text');
    expect(text.value).toMatch(/^word/);
    expect(text.value.length).toBeGreaterThan(6000);
    text.setSelectionRange(0, 6001);
    fireEvent.select(text);
    expect(screen.getByText(/This selection is 6,001 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place here' })).toBeDisabled();
  });

  it('treats a search highlight missing from the fresh owned article as unavailable', async () => {
    const utils = renderPicker({}, {
      loadArticle: jest.fn().mockResolvedValue({ article, highlights: [] })
    });
    fireEvent.click(await searchForNomad());
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available');
    expect(screen.queryByRole('button', { name: 'Place here' })).not.toBeInTheDocument();
    expect(utils.onPlace).not.toHaveBeenCalled();
  });

  it('invalidates a late search when the query becomes too short', async () => {
    let resolveSearch;
    const search = jest.fn(() => new Promise((resolve) => { resolveSearch = resolve; }));
    renderPicker({}, { search });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nomad' } });
    await waitFor(() => expect(search).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'No' } });
    await act(async () => resolveSearch({ articles: [article], highlights: [] }));
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('invalidates a late search when browsing begins', async () => {
    let resolveSearch;
    const search = jest.fn(() => new Promise((resolve) => { resolveSearch = resolve; }));
    renderPicker({}, { search });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nomad' } });
    await waitFor(() => expect(search).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Browse shelves' }));
    await act(async () => resolveSearch({ articles: [article], highlights: [] }));
    expect(screen.queryByText('Open to choose exact words')).not.toBeInTheDocument();
  });

  it('browses the actual nested folder scope', async () => {
    const utils = renderPicker({}, {
      loadFolders: jest.fn().mockResolvedValue([
        { _id: 'investing', name: 'Investing', articleCount: 2 },
        { _id: 'costco', name: 'Costco', parentFolderId: 'investing', articleCount: 1 }
      ]),
      loadArticles: jest.fn().mockResolvedValue([article])
    });
    fireEvent.click(screen.getByRole('button', { name: 'Browse shelves' }));
    const child = await screen.findByRole('button', { name: 'Costco' });
    expect(child).toHaveStyle('--folder-depth: 1');
    fireEvent.click(child);
    await waitFor(() => expect(utils.loadArticles).toHaveBeenLastCalledWith(expect.objectContaining({
      scope: 'folder',
      folderId: 'costco',
      includePreview: true,
      limit: 1000
    })));
  });

  it('names the empty browse scope', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Browse shelves' }));
    expect(await screen.findByText('No sources are filed in all Library sources.')).toBeInTheDocument();
  });

  it('uses native list and button semantics for result rows', async () => {
    renderPicker();
    await searchForNomad();
    const item = screen.getByRole('listitem');
    expect(item.tagName).toBe('LI');
    expect(within(item).getByRole('button')).toBeInTheDocument();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])('keeps the chooser open while an input method handles Escape (%j)', (composition) => {
    const utils = renderPicker({}, { loadFolders: jest.fn(() => new Promise(() => {})) });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape', ...composition });
    expect(utils.onDismiss).not.toHaveBeenCalled();
    expect(utils.onPlace).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(utils.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps Escape inside the chooser and leaves placement untouched', () => {
    const parentEscape = jest.fn();
    window.addEventListener('keydown', parentEscape);
    const utils = renderPicker({}, { loadFolders: jest.fn(() => new Promise(() => {})) });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(utils.onDismiss).toHaveBeenCalledTimes(1);
    expect(utils.onPlace).not.toHaveBeenCalled();
    expect(parentEscape).not.toHaveBeenCalled();
    window.removeEventListener('keydown', parentEscape);
  });

  it('reports a missing source and never offers placement', async () => {
    const utils = renderPicker({}, {
      loadArticle: jest.fn().mockRejectedValue(new Error('missing'))
    });
    fireEvent.click(await searchForNomad());
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available');
    expect(screen.queryByRole('button', { name: 'Place here' })).not.toBeInTheDocument();
    expect(utils.onPlace).not.toHaveBeenCalled();
  });

  it('invalidates an in-flight search when the picker closes', async () => {
    let resolveSearch;
    const search = jest.fn(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const utils = renderPicker({}, { search });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nomad' } });
    await waitFor(() => expect(search).toHaveBeenCalled());
    utils.view.rerender(
      <LibraryPassagePicker
        open={false}
        search={search}
        loadFolders={utils.loadFolders}
        loadArticles={utils.loadArticles}
        loadArticle={utils.loadArticle}
        onDismiss={utils.onDismiss}
        onPlace={utils.onPlace}
      />
    );
    await act(async () => resolveSearch({ articles: [article], highlights: [] }));
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
