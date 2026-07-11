import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiGitHubRepoWatchControl, {
  formatGitHubRepoWatchReceipt,
  formatRepoWatchPublicationMessage,
  isRepoDossierPage,
  repoWatchPublicationState
} from './WikiGitHubRepoWatchControl';
import { armGitHubRepoWatch } from '../../api/wiki';
import { SystemStatusProvider } from '../../system/SystemStatusContext';

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
      publishedHeadSha: 'abc1234567890abcdef',
      buildStatus: 'idle',
      lastReleaseTag: 'v1.2.3'
    }
  }
};

const buildSystemStatusControls = (overrides = {}) => ({
  setBackgroundWork: jest.fn(),
  setLatestReceipt: jest.fn(),
  clearRecentReceipts: jest.fn(),
  setRecoverableFailure: jest.fn(),
  clearRecoverableFailure: jest.fn(),
  resetSystemStatus: jest.fn(),
  ...overrides
});

const renderControl = (props = {}, { systemStatusControls = buildSystemStatusControls() } = {}) => render(
  <SystemStatusProvider value={systemStatusControls}>
    <WikiGitHubRepoWatchControl pageId="wiki-project-1" {...props} />
  </SystemStatusProvider>
);

describe('WikiGitHubRepoWatchControl', () => {
  let systemStatusControls;

  beforeEach(() => {
    jest.clearAllMocks();
    systemStatusControls = buildSystemStatusControls();
  });

  it('detects project/log/repo pages', () => {
    expect(isRepoDossierPage({ pageType: 'repo' })).toBe(true);
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
    const { container } = renderControl({ page: { pageType: 'concept', title: 'Moat' } });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows empty state with repository input', () => {
    renderControl({ page: projectPage });

    expect(screen.getByRole('heading', { name: 'Track GitHub repo' })).toBeInTheDocument();
    expect(screen.getByText(/read-only public repository docs/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Repository')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track repo' })).toBeInTheDocument();
  });

  it('normalizes GitHub URLs before arming watch', async () => {
    const onPageUpdate = jest.fn();
    armGitHubRepoWatch.mockResolvedValueOnce({ page: armedPage });

    renderControl({ page: projectPage, onPageUpdate }, { systemStatusControls });

    fireEvent.change(screen.getByLabelText('Repository'), {
      target: { value: 'https://github.com/openai/agents-js.git' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Track repo' }));

    await waitFor(() => {
      expect(armGitHubRepoWatch).toHaveBeenCalledWith('wiki-project-1', { repo: 'openai/agents-js' });
    });
    expect(onPageUpdate).toHaveBeenCalledWith(armedPage);
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'GitHub repo watch',
      stage: 'Arming openai/agents-js'
    });
    expect(systemStatusControls.setBackgroundWork).toHaveBeenLastCalledWith(null);
  });

  it('shows validation error for invalid repo input', async () => {
    renderControl({ page: projectPage });

    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'agents-js' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track repo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a public GitHub repository as owner/repo.');
    expect(armGitHubRepoWatch).not.toHaveBeenCalled();
  });

  it('shows API error when arming fails', async () => {
    armGitHubRepoWatch.mockRejectedValueOnce(new Error('Private GitHub repositories are not supported.'));

    renderControl({ page: projectPage }, { systemStatusControls });

    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'openai/private-repo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track repo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Private GitHub repositories are not supported.');
    expect(systemStatusControls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'GitHub repo watch',
      message: 'Private GitHub repositories are not supported.'
    }));
  });

  it('shows armed receipt with preserved owner/repo casing', () => {
    renderControl({
      page: {
        ...projectPage,
        externalWatches: {
          githubRepo: {
            owner: 'atsokolas',
            repo: 'note-taker-3',
            status: 'active',
            lastCheckedAt: '2026-07-04T12:00:00.000Z',
            lastHeadSha: 'e6acfc3abc1234567890',
            publishedHeadSha: 'e6acfc3abc1234567890',
            buildStatus: 'idle'
          }
        }
      }
    });

    expect(screen.getByRole('status')).toHaveTextContent(/Page current through e6acfc3/);
    expect(screen.getByLabelText('Repository')).toHaveValue('atsokolas/note-taker-3');
  });

  it('shows current publication state when published matches observed head', () => {
    renderControl({ page: armedPage }, { systemStatusControls });

    expect(screen.getByRole('status')).toHaveTextContent(/Page current through abc1234 · checked/);
    expect(screen.getByLabelText('Repository publication status')).toHaveTextContent(/Repository checked abc1234/);
    expect(screen.getByLabelText('Repository publication status')).toHaveTextContent(/Page current through abc1234/);
    expect(screen.getByLabelText('Repository publication status')).toHaveTextContent(/Build state Current/);
    expect(screen.getByRole('region', { name: 'GitHub repository watch' })).toHaveAttribute('data-repo-watch-state', 'current');
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith(null);
  });

  it('shows rebuilding publication state when a new head is detected', () => {
    renderControl({
      page: {
        ...armedPage,
        sourceRefs: Array.from({ length: 50 }, (_, index) => ({ _id: `source-${index}` })),
        externalWatches: {
          githubRepo: {
            ...armedPage.externalWatches.githubRepo,
            lastHeadSha: '91ab3f2deadbeef0123456789abcdef',
            publishedHeadSha: '4cbdac0123456789abcdef0123456789',
            candidateHeadSha: '91ab3f2deadbeef0123456789abcdef',
            buildStatus: 'building'
          }
        }
      }
    }, { systemStatusControls });

    expect(screen.getByRole('status')).toHaveTextContent(
      'New commits detected at 91ab3f2 · rebuilding from 50 repository sources'
    );
    expect(screen.getByLabelText('Repository publication status')).toHaveTextContent(/Build state Rebuilding/);
    expect(screen.getByRole('region', { name: 'GitHub repository watch' })).toHaveAttribute('data-repo-watch-state', 'rebuilding');
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Repo wiki rebuild',
      stage: 'Rebuilding openai/agents-js from repository sources'
    });
  });

  it('shows failed candidate publication state and pushes a needs-review receipt', () => {
    renderControl({
      page: {
        ...armedPage,
        externalWatches: {
          githubRepo: {
            ...armedPage.externalWatches.githubRepo,
            lastHeadSha: '91ab3f2deadbeef0123456789abcdef',
            publishedHeadSha: '4cbdac0123456789abcdef0123456789',
            candidateHeadSha: '91ab3f2deadbeef0123456789abcdef',
            buildStatus: 'needs_review',
            lastBuildError: 'Missing core path evidence.'
          }
        }
      }
    }, { systemStatusControls });

    expect(screen.getByRole('status')).toHaveTextContent(
      'The latest update did not pass the evidence bar. Showing the last trusted version from 4cbdac0.'
    );
    expect(screen.getByLabelText('Repository publication status')).toHaveTextContent(/Build state Needs review/);
    expect(screen.getByRole('region', { name: 'GitHub repository watch' })).toHaveAttribute('data-repo-watch-state', 'failed_candidate');
    expect(systemStatusControls.setLatestReceipt).toHaveBeenCalledWith({
      id: 'repo-watch-review-wiki-project-1',
      title: 'Repo wiki update needs review',
      summary: 'The latest update did not pass the evidence bar. Showing the last trusted version from 4cbdac0.',
      status: 'needs_review',
      href: '/wiki/workspace?page=wiki-project-1'
    });
  });

  it('shows superseded candidate publication state when a newer head arrives mid-build', () => {
    renderControl({
      page: {
        ...armedPage,
        externalWatches: {
          githubRepo: {
            ...armedPage.externalWatches.githubRepo,
            lastHeadSha: 'deadbeef0123456789abcdef012345678',
            publishedHeadSha: '4cbdac0123456789abcdef0123456789',
            candidateHeadSha: '91ab3f2deadbeef0123456789abcdef',
            buildStatus: 'building'
          }
        }
      }
    }, { systemStatusControls });

    expect(repoWatchPublicationState({
      lastHeadSha: 'deadbeef0123456789abcdef012345678',
      candidateHeadSha: '91ab3f2deadbeef0123456789abcdef',
      buildStatus: 'building'
    })).toBe('superseded');
    expect(screen.getByRole('status')).toHaveTextContent(
      'A newer commit arrived while this page was rebuilding. Continuing with the latest head.'
    );
    expect(screen.getByRole('region', { name: 'GitHub repository watch' })).toHaveAttribute('data-repo-watch-state', 'superseded');
    expect(systemStatusControls.setBackgroundWork).toHaveBeenCalledWith({
      label: 'Repo wiki rebuild',
      stage: 'Continuing with latest head for openai/agents-js'
    });
  });

  it('derives publication messages for all four states', () => {
    const watchBase = {
      lastCheckedAt: '2026-07-10T18:00:00.000Z',
      publishedHeadSha: '4cbdac0123456789abcdef0123456789'
    };
    const page = { sourceRefs: Array.from({ length: 50 }, (_, index) => ({ _id: `source-${index}` })) };

    expect(formatRepoWatchPublicationMessage(
      { ...watchBase, lastHeadSha: watchBase.publishedHeadSha, buildStatus: 'idle' },
      page,
      'current'
    )).toMatch(/Page current through 4cbdac0 · checked/);

    expect(formatRepoWatchPublicationMessage(
      {
        ...watchBase,
        lastHeadSha: '91ab3f2deadbeef0123456789abcdef',
        candidateHeadSha: '91ab3f2deadbeef0123456789abcdef',
        buildStatus: 'building'
      },
      page,
      'rebuilding'
    )).toBe('New commits detected at 91ab3f2 · rebuilding from 50 repository sources');

    expect(formatRepoWatchPublicationMessage(
      watchBase,
      page,
      'failed_candidate'
    )).toBe('The latest update did not pass the evidence bar. Showing the last trusted version from 4cbdac0.');

    expect(formatRepoWatchPublicationMessage(watchBase, page, 'superseded')).toBe(
      'A newer commit arrived while this page was rebuilding. Continuing with the latest head.'
    );
  });

  it('shows stored watch error state', () => {
    renderControl({
      page: {
        ...projectPage,
        externalWatches: {
          githubRepo: {
            owner: 'openai',
            repo: 'agents-js',
            status: 'error',
            errorMessage: 'GitHub request failed with HTTP 403.'
          }
        }
      }
    });

    expect(screen.getByRole('alert')).toHaveTextContent('GitHub request failed with HTTP 403.');
  });
});
