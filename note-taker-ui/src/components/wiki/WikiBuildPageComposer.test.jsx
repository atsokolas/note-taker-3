import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import { createRepoWikiFromGitHub, createWikiPage, streamMaintainWikiPage } from '../../api/wiki';
import { parseGitHubRepoInput } from '../../utils/githubRepoInput';

jest.mock('../../api/wiki', () => ({
  createRepoWikiFromGitHub: jest.fn(),
  createWikiPage: jest.fn(),
  streamMaintainWikiPage: jest.fn()
}));

describe('WikiBuildPageComposer', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'true';
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    createRepoWikiFromGitHub.mockResolvedValue({ page: { _id: 'wiki-new', title: 'openai/agents-js' } });
    streamMaintainWikiPage.mockImplementation(async (_pageId, _options, handlers = {}) => {
      handlers.onPage?.({ _id: 'wiki-new', title: 'Portfolio Concentration' });
      return { _id: 'wiki-new', title: 'Portfolio Concentration' };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
  });

  it('creates an overview page and opens the workspace page for agent drafting', async () => {
    const onBuilt = jest.fn();
    render(
      <MemoryRouter>
        <WikiBuildPageComposer onBuilt={onBuilt} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Wiki page to build'), {
      target: { value: 'Portfolio Concentration' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    await waitFor(() => {
      expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Portfolio Concentration',
        pageType: 'overview'
      }));
    });
    expect(createRepoWikiFromGitHub).not.toHaveBeenCalled();
    expect(streamMaintainWikiPage).not.toHaveBeenCalled();
    expect(onBuilt).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-new&build=1', { replace: false });
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('captured topic · Portfolio Concentration');
      expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('opening @wiki:wiki-new');
      expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('agent drafting from your library');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki page to build')).toHaveValue('');
    });
  });

  it('parses GitHub repo URLs and owner/repo shorthand', () => {
    expect(parseGitHubRepoInput('https://github.com/openai/agents-js.git')).toEqual({
      owner: 'openai',
      repo: 'agents-js',
      fullName: 'openai/agents-js'
    });
    expect(parseGitHubRepoInput('github.com/vercel/next.js/tree/canary')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
      fullName: 'vercel/next.js'
    });
    expect(parseGitHubRepoInput('not a repo')).toBeNull();
  });

  it('creates a project wiki and arms the repo watcher when a GitHub URL is pasted', async () => {
    const onBuilt = jest.fn();
    createRepoWikiFromGitHub.mockResolvedValueOnce({
      page: {
        _id: 'wiki-repo',
        title: 'openai/agents-js repo wiki',
        externalWatches: {
          githubRepo: {
            owner: 'openai',
            repo: 'agents-js',
            status: 'active'
          }
        }
      }
    });

    render(
      <MemoryRouter>
        <WikiBuildPageComposer onBuilt={onBuilt} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Wiki page to build'), {
      target: { value: 'https://github.com/openai/agents-js.git' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    await waitFor(() => {
      expect(createRepoWikiFromGitHub).toHaveBeenCalledWith('https://github.com/openai/agents-js.git');
    });
    expect(createWikiPage).not.toHaveBeenCalled();
    expect(onBuilt).toHaveBeenCalledWith(expect.objectContaining({
      externalWatches: {
        githubRepo: expect.objectContaining({
          owner: 'openai',
          repo: 'agents-js'
        })
      }
    }));
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo&build=1', { replace: false });
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('repo watcher armed · openai/agents-js');
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('agent drafting from repository sources');
    });
  });

  it('surfaces a repo watcher failure without navigating', async () => {
    createRepoWikiFromGitHub.mockRejectedValueOnce(new Error('Private GitHub repositories are not supported.'));

    render(
      <MemoryRouter>
        <WikiBuildPageComposer />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Wiki page to build'), {
      target: { value: 'openai/private-repo' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to build this repo wiki.');
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('repo wiki failed · openai/private-repo');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('exposes the full build placeholder for the thought partner prompt', () => {
    render(
      <MemoryRouter>
        <WikiBuildPageComposer />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('Ask thought partner to build a wiki page...')).toBeInTheDocument();
  });

  it('surfaces a build failure without navigating', async () => {
    createWikiPage.mockRejectedValueOnce(new Error('nope'));
    render(
      <MemoryRouter>
        <WikiBuildPageComposer />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Wiki page to build'), {
      target: { value: 'Broken page' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to build this wiki page.');
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('build failed · Broken page');
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki build trace')).toHaveTextContent('waiting for a retry');
    });
    expect(streamMaintainWikiPage).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
