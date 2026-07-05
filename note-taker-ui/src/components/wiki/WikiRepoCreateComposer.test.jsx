import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiRepoCreateComposer from './WikiRepoCreateComposer';
import { createRepoWikiFromGitHub } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  createRepoWikiFromGitHub: jest.fn()
}));

describe('WikiRepoCreateComposer', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'true';
    createRepoWikiFromGitHub.mockResolvedValue({
      page: {
        _id: 'wiki-repo-1',
        title: 'agents-js repo wiki',
        pageType: 'project'
      },
      repo: { owner: 'openai', repo: 'agents-js', fullName: 'openai/agents-js' }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
  });

  it('accepts a valid GitHub URL and creates a repo wiki', async () => {
    const onCreated = jest.fn();
    render(
      <MemoryRouter>
        <WikiRepoCreateComposer onCreated={onCreated} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/openai/agents-js' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    await waitFor(() => {
      expect(createRepoWikiFromGitHub).toHaveBeenCalledWith('https://github.com/openai/agents-js');
    });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ _id: 'wiki-repo-1' }));
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-1', { replace: false });
  });

  it('rejects an invalid GitHub URL before calling the API', async () => {
    createRepoWikiFromGitHub.mockRejectedValueOnce(
      new Error('Enter a public GitHub repository as owner/repo or a github.com URL.')
    );

    render(
      <MemoryRouter>
        <WikiRepoCreateComposer />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'not-a-repo' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter a public GitHub repository as owner/repo or a github.com URL.'
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a loading state while the repo wiki is being created', async () => {
    let resolveCreate;
    createRepoWikiFromGitHub.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    render(
      <MemoryRouter>
        <WikiRepoCreateComposer />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'openai/agents-js' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByLabelText('GitHub repository URL')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    expect(screen.getByLabelText('Repo wiki trace')).toHaveTextContent('validating repository URL');

    resolveCreate({
      page: { _id: 'wiki-repo-1', title: 'agents-js repo wiki' },
      repo: { fullName: 'openai/agents-js' }
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-1', { replace: false });
    });
  });

  it('navigates to the new wiki page after a successful create', async () => {
    render(
      <MemoryRouter>
        <WikiRepoCreateComposer />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/openai/agents-js.git' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    await waitFor(() => {
      expect(createRepoWikiFromGitHub).toHaveBeenCalledWith('https://github.com/openai/agents-js.git');
      expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-1', { replace: false });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('GitHub repository URL')).toHaveValue('');
    });
  });
});
