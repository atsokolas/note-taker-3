import {
  applyRepoDossierSectionAnchors,
  buildRepoDossierSectionNav,
  buildRepoSectionChangeBadges,
  displayWikiPageTitle,
  extractRepoDossierOverviewSummary,
  formatGitHubRepoWatchReceipt,
  githubWatchState,
  isRepoDossierPage,
  repoDossierGitHubLabel,
  repoNameFromPage,
  repoSectionIdForHeading
} from './wikiRepoDossierModel';

describe('wikiRepoDossierModel', () => {
  it('never classifies curated research editions as repo dossiers', () => {
    expect(isRepoDossierPage({
      pageType: 'log',
      createdFrom: { label: 'weekend-readings:user-1:2026-07-06:2026-07-19' }
    })).toBe(false);
    expect(isRepoDossierPage({
      pageType: 'log',
      createdFrom: { label: 'this-week-in-ai:user-1:2026-07-20:2026-07-26' }
    })).toBe(false);
  });

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
      title: 'note-taker-3 — repo wiki',
      externalWatches: {
        githubRepo: {
          owner: 'atsokolas',
          repo: 'note-taker-3'
        }
      }
    };

    expect(repoNameFromPage(page)).toBe('note-taker-3');
    expect(displayWikiPageTitle(page)).toBe('note-taker-3 — repo wiki');
    expect(displayWikiPageTitle({ title: 'Atsokolas/Note-Taker-3 Repo Wiki' }))
      .toBe('Note-Taker-3 — repo wiki');
  });

  it('preserves package path casing in non-repo page titles', () => {
    expect(displayWikiPageTitle({ title: 'Margin of Safety' })).toBe('Margin of Safety');
  });

  it('keeps dossier summaries whole or silent', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A complete overview sentence. A second sentence that runs beyond the small test budget.' }] }]
    };
    const summary = extractRepoDossierOverviewSummary(doc, {});
    expect(summary).toBe('A complete overview sentence. A second sentence that runs beyond the small test budget.');
    expect(summary).not.toMatch(/…|\.\.\.$/);
  });

  it('maps repo dossier headings to stable canonical section ids', () => {
    expect(repoSectionIdForHeading('What this repo is')).toBe('overview');
    expect(repoSectionIdForHeading('What Noeis is')).toBe('overview');
    expect(repoSectionIdForHeading('System map')).toBe('architecture');
    expect(repoSectionIdForHeading('Change paths')).toBe('key-decisions');
    expect(repoSectionIdForHeading('Risks and unknowns')).toBe('open-questions');
  });

  it('builds canonical section navigation and stable anchors from toc items', () => {
    const nav = buildRepoDossierSectionNav({
      tocItems: [
        { id: 'what-this-repo-is', title: 'What this repo is', blockIndex: 1 },
        { id: 'architecture-map', title: 'Architecture map', blockIndex: 4 },
        { id: 'open-questions', title: 'Open questions', blockIndex: 8 }
      ]
    });
    expect(nav.find(item => item.id === 'overview')).toMatchObject({
      available: true,
      anchorId: 'repo-section-overview'
    });
    expect(nav.find(item => item.id === 'architecture')).toMatchObject({ available: true });
    expect(nav.find(item => item.id === 'changelog-digest')).toMatchObject({ available: false });

    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Architecture map' }] }
      ]
    };
    const anchored = applyRepoDossierSectionAnchors(doc, [{ title: 'Architecture map', blockIndex: 1 }]);
    expect(anchored.content[1].attrs.anchorId).toBe('repo-section-architecture');
  });

  it('derives section change badges from comparison claim deltas', () => {
    const badges = buildRepoSectionChangeBadges({
      claimComparison: {
        deltas: {
          changed: [{ after: { section: 'Architecture map' } }],
          added: [{ after: { section: 'Open questions' } }]
        }
      }
    });
    expect(badges.architecture).toBe(1);
    expect(badges['open-questions']).toBe(1);
  });
});
