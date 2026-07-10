import {
  displayWikiPageTitle,
  formatGitHubRepoWatchReceipt,
  githubWatchState,
  repoDossierGitHubLabel,
  repoNameFromPage
} from './wikiRepoDossierModel';

describe('wikiRepoDossierModel', () => {
  it('preserves owner/repo casing in watch state and receipts', () => {
    const watch = {
      owner: 'atsokolas',
      repo: 'note-taker-3',
      status: 'active',
      lastCheckedAt: '2026-07-04T12:00:00.000Z',
      lastHeadSha: 'e6acfc3abc1234567890'
    };
    const state = githubWatchState(watch);

    expect(state.fullName).toBe('atsokolas/note-taker-3');
    expect(formatGitHubRepoWatchReceipt(watch)).toMatch(/GitHub watcher armed for atsokolas\/note-taker-3/);
  });

  it('shows the full owner/repo slug in the dossier label', () => {
    expect(repoDossierGitHubLabel({
      externalWatches: {
        githubRepo: {
          owner: 'atsokolas',
          repo: 'note-taker-3'
        }
      }
    })).toBe('atsokolas/note-taker-3');
  });

  it('derives display titles from repo identity without title-casing', () => {
    const page = {
      title: 'Atsokolas/Note-Taker-3 Repo Wiki',
      externalWatches: {
        githubRepo: {
          owner: 'atsokolas',
          repo: 'note-taker-3'
        }
      }
    };

    expect(repoNameFromPage(page)).toBe('note-taker-3');
    expect(displayWikiPageTitle(page)).toBe('note-taker-3 — repo wiki');
  });

  it('preserves package path casing in non-repo page titles', () => {
    expect(displayWikiPageTitle({ title: 'Margin of Safety' })).toBe('Margin of Safety');
  });
});
