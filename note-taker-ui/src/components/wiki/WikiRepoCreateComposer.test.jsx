import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiRepoCreateComposer from './WikiRepoCreateComposer';
import { createRepoWikiFromGitHub } from '../../api/wiki';
import { SystemStatusProvider } from '../../system/SystemStatusContext';

jest.mock('../../api/wiki', () => ({
  createRepoWikiFromGitHub: jest.fn()
}));

const buildSystemStatusControls = (overrides = {}) => ({
  setBackgroundWork: jest.fn(),
  setLatestReceipt: jest.fn(),
  setRecoverableFailure: jest.fn(),
  clearRecoverableFailure: jest.fn(),
  resetSystemStatus: jest.fn(),
  ...overrides
});

const renderComposer = (props = {}, { systemStatusControls = buildSystemStatusControls() } = {}) => render(
  <MemoryRouter>
    <SystemStatusProvider value={systemStatusControls}>
      <WikiRepoCreateComposer {...props} />
    </SystemStatusProvider>
  </MemoryRouter>
);

describe('WikiRepoCreateComposer', () => {
  const mockNavigate = jest.fn();
  let systemStatusControls;

  beforeEach(() => {
    jest.clearAllMocks();
    systemStatusControls = buildSystemStatusControls();
    jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'true';
    createRepoWikiFromGitHub.mockResolvedValue({
      action: 'created',
      page: {
        _id: 'wiki-repo-1',
        title: 'agents-js — repo wiki',
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
    renderComposer({ onCreated }, { systemStatusControls });

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/openai/agents-js' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    await waitFor(() => {
      expect(createRepoWikiFromGitHub).toHaveBeenCalledWith('https://github.com/openai/agents-js');
    });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ _id: 'wiki-repo-1' }));
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-1', { replace: false });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Created repo wiki.',
      summary: 'Created repo wiki for agents-js — repo wiki.',
      href: '/wiki/workspace?page=wiki-repo-1'
    }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Created repo wiki.');
    });
  });

  it('shows an updated receipt and navigates when the repo wiki already exists', async () => {
    createRepoWikiFromGitHub.mockResolvedValueOnce({
      action: 'updated',
      page: {
        _id: 'wiki-repo-existing',
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'repo'
      },
      repo: { owner: 'openai', repo: 'agents-js', fullName: 'openai/agents-js' }
    });

    renderComposer({}, { systemStatusControls });

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'openai/agents-js' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-existing', { replace: false });
    });
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Updated existing repo wiki.',
      summary: 'Updated existing repo wiki for agents-js — repo wiki.',
      href: '/wiki/workspace?page=wiki-repo-existing'
    }));
    expect(screen.getByRole('status')).toHaveTextContent('Updated existing repo wiki.');
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    expect(screen.getByLabelText('Repo wiki trace')).toHaveTextContent('Updated existing repo wiki · agents-js — repo wiki');
  });

  it('rejects an invalid GitHub URL before calling the API', async () => {
    createRepoWikiFromGitHub.mockRejectedValueOnce(
      new Error('Enter a public GitHub repository as owner/repo or a github.com URL.')
    );

    renderComposer();

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
    expect(systemStatusControls.setLatestReceipt).not.toHaveBeenCalled();
  });

  it('shows a loading state while the repo wiki is being created', async () => {
    let resolveCreate;
    createRepoWikiFromGitHub.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    renderComposer();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'openai/agents-js' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    expect(screen.getByRole('button', { name: 'Building...' })).toBeDisabled();
    expect(screen.getByLabelText('GitHub repository URL')).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Repo wiki build progress' })).toHaveTextContent('Validate repository');
    expect(screen.getByRole('region', { name: 'Repo wiki build progress' })).toHaveTextContent('Attach evidence');
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Repo wiki trace')).toHaveTextContent('validating repository URL');
    });

    resolveCreate({
      action: 'created',
      page: { _id: 'wiki-repo-1', title: 'agents-js repo wiki' },
      repo: { fullName: 'openai/agents-js' }
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-1', { replace: false });
    });
  });

  it('navigates to the new wiki page after a successful create', async () => {
    renderComposer();

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

  it('still opens the created page when the GitHub watch needs a retry', async () => {
    createRepoWikiFromGitHub.mockResolvedValueOnce({
      action: 'created',
      page: {
        _id: 'wiki-repo-retry',
        title: 'agents-js — repo wiki',
        pageType: 'project'
      },
      repo: { owner: 'openai', repo: 'agents-js', fullName: 'openai/agents-js' },
      watchResult: {
        watchError: {
          statusCode: 403,
          message: 'GitHub request failed with HTTP 403.'
        }
      }
    });

    renderComposer();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/openai/agents-js' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create repo wiki' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-repo-retry', { replace: false });
    });
    fireEvent.click(screen.getByRole('button', { name: /expand .* trace history/i }));
    expect(screen.getByLabelText('Repo wiki trace')).toHaveTextContent('GitHub watch needs retry');
    expect(screen.getByRole('status')).toHaveTextContent('Created repo wiki. The GitHub watch can be retried from the page.');
  });
});
