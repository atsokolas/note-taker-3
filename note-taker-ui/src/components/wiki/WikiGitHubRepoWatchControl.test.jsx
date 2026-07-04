import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiGitHubRepoWatchControl, {
  formatGitHubRepoWatchReceipt,
  isRepoDossierPage
} from './WikiGitHubRepoWatchControl';
import { armGitHubRepoWatch } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  armGitHubRepoWatch: jest.fn()
}));

const projectPage = {
  _id: 'wiki-project-1',
  title: 'Agents JS',
  pageType: 'project',
  externalWatches: {}
};

const armedPage = {
  ...projectPage,
  externalWatches: {
    githubRepo: {
      owner: 'openai',
      repo: 'agents-js',
      defaultBranch: 'main',
      status: 'active',
      lastCheckedAt: '2026-07-04T12:00:00.000Z',
      lastHeadSha: 'abc1234567890abcdef',
      lastReleaseTag: 'v1.2.3'
    }
  }
};

describe('WikiGitHubRepoWatchControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects project/log/repo pages', () => {
    expect(isRepoDossierPage({ pageType: 'project' })).toBe(true);
    expect(isRepoDossierPage({ pageType: 'log' })).toBe(true);
    expect(isRepoDossierPage({ pageType: 'concept' })).toBe(false);
    expect(isRepoDossierPage({
      pageType: 'concept',
      externalWatches: { githubRepo: { owner: 'openai', repo: 'agents-js' } }
    })).toBe(true);
    expect(isRepoDossierPage({
      pageType: 'topic',
      metadata: { githubUrl: 'https://github.com/openai/agents-js' }
    })).toBe(true);
  });

  it('formats armed receipt copy with repo, commit, and release', () => {
    expect(formatGitHubRepoWatchReceipt(armedPage.externalWatches.githubRepo))
      .toMatch(/GitHub watcher armed for openai\/agents-js · last checked Jul 4, 2026 · head abc1234 · latest release v1.2.3/);
  });

  it('does not render on unrelated pages', () => {
    const { container } = render(
      <WikiGitHubRepoWatchControl pageId="wiki-1" page={{ pageType: 'concept', title: 'Moat' }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows empty state with repository input', () => {
    render(<WikiGitHubRepoWatchControl pageId="wiki-project-1" page={projectPage} />);

    expect(screen.getByRole('heading', { name: 'Track GitHub repo' })).toBeInTheDocument();
    expect(screen.getByText(/read-only public repository docs/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Repository')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track repo' })).toBeInTheDocument();
  });

  it('normalizes GitHub URLs before arming watch', async () => {
    const onPageUpdate = jest.fn();
    armGitHubRepoWatch.mockResolvedValueOnce({ page: armedPage });

    render(
      <WikiGitHubRepoWatchControl
        pageId="wiki-project-1"
        page={projectPage}
        onPageUpdate={onPageUpdate}
      />
    );

    fireEvent.change(screen.getByLabelText('Repository'), {
      target: { value: 'https://github.com/openai/agents-js.git' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Track repo' }));

    await waitFor(() => {
      expect(armGitHubRepoWatch).toHaveBeenCalledWith('wiki-project-1', { repo: 'openai/agents-js' });
    });
    expect(onPageUpdate).toHaveBeenCalledWith(armedPage);
  });

  it('shows validation error for invalid repo input', async () => {
    render(<WikiGitHubRepoWatchControl pageId="wiki-project-1" page={projectPage} />);

    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'agents-js' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track repo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a public GitHub repository as owner/repo.');
    expect(armGitHubRepoWatch).not.toHaveBeenCalled();
  });

  it('shows API error when arming fails', async () => {
    armGitHubRepoWatch.mockRejectedValueOnce(new Error('Private GitHub repositories are not supported.'));

    render(<WikiGitHubRepoWatchControl pageId="wiki-project-1" page={projectPage} />);

    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'openai/private-repo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track repo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Private GitHub repositories are not supported.');
  });

  it('shows armed receipt when watch is already active', () => {
    render(<WikiGitHubRepoWatchControl pageId="wiki-project-1" page={armedPage} />);

    expect(screen.getByRole('status')).toHaveTextContent(/GitHub watcher armed for openai\/agents-js/);
    expect(screen.getByRole('button', { name: 'Update watch' })).toBeInTheDocument();
  });

  it('shows stored watch error state', () => {
    render(
      <WikiGitHubRepoWatchControl
        pageId="wiki-project-1"
        page={{
          ...projectPage,
          externalWatches: {
            githubRepo: {
              owner: 'openai',
              repo: 'agents-js',
              status: 'error',
              errorMessage: 'GitHub request failed with HTTP 403.'
            }
          }
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('GitHub request failed with HTTP 403.');
  });
});
