import {
  capRepoWikiDominance,
  dedupePagesByRepoKey,
  filterPagesForTodaysPage,
  isEligibleForTodaysPage,
  prepareExplorePages,
  repoKeyForPage,
  repoWikiHasRecentActivity
} from './wikiRepoDedupeModel';

const repoPage = ({
  id,
  title,
  owner = 'atsokolas',
  repo = 'note-taker-3',
  updatedAt = '2026-07-01T12:00:00.000Z',
  lastCheckedAt = null,
  sourceCount = 0
} = {}) => ({
  _id: id,
  title: title || `${owner}/${repo} repo wiki`,
  pageType: 'repo',
  updatedAt,
  sourceCount,
  externalWatches: {
    githubRepo: {
      owner,
      repo,
      status: 'active',
      lastCheckedAt
    }
  }
});

describe('wikiRepoDedupeModel', () => {
  it('uses lowercase owner/repo as the dedupe key', () => {
    const page = repoPage({ owner: 'Atsokolas', repo: 'Note-Taker-3' });
    expect(repoKeyForPage(page)).toBe('atsokolas/note-taker-3');
  });

  it('dedupes identical repo entries to the newest maintained page', () => {
    const stale = repoPage({
      id: 'repo-old',
      updatedAt: '2026-06-01T12:00:00.000Z',
      lastCheckedAt: '2026-06-02T12:00:00.000Z'
    });
    const fresh = repoPage({
      id: 'repo-new',
      updatedAt: '2026-07-08T12:00:00.000Z',
      lastCheckedAt: '2026-07-09T08:00:00.000Z',
      sourceCount: 7
    });
    const topic = {
      _id: 'topic-1',
      title: 'Margin of Safety',
      pageType: 'topic',
      updatedAt: '2026-06-10T12:00:00.000Z'
    };

    const result = dedupePagesByRepoKey([stale, topic, fresh, stale, fresh]);

    expect(repoKeyForPage(topic)).toBe('');
    expect(dedupePagesByRepoKey([topic]).map((page) => page._id)).toEqual(['topic-1']);
    expect(result.map((page) => page._id)).toEqual(['topic-1', 'repo-new']);
  });

  it('leaves normal non-repo pages unaffected', () => {
    const pages = [
      { _id: 'a', title: 'First Principles', pageType: 'topic' },
      { _id: 'b', title: 'Opportunity Cost', pageType: 'topic' }
    ];
    expect(dedupePagesByRepoKey(pages)).toEqual(pages);
  });

  it('excludes stale repo wikis from Today\'s Page unless briefing shows change', () => {
    const staleRepo = repoPage({
      id: 'repo-stale',
      lastCheckedAt: '2026-01-01T12:00:00.000Z'
    });
    const topic = { _id: 'topic-1', title: 'Margin of Safety', pageType: 'topic' };

    expect(isEligibleForTodaysPage(staleRepo, {})).toBe(false);
    expect(filterPagesForTodaysPage([staleRepo, topic], {})).toEqual([topic]);
  });

  it('allows repo wikis on Today\'s Page when briefing marks them as changed', () => {
    const repo = repoPage({ id: 'repo-active' });
    const briefing = {
      recentlyUpdatedPages: [{ _id: 'repo-active', title: repo.title }]
    };

    expect(repoWikiHasRecentActivity(repo, briefing)).toBe(true);
    expect(isEligibleForTodaysPage(repo, briefing)).toBe(true);
  });

  it('caps repo-wiki dominance on explore surfaces', () => {
    const repos = Array.from({ length: 7 }, (_, index) => repoPage({
      id: `repo-${index}`,
      owner: 'atsokolas',
      repo: `repo-${index}`,
      updatedAt: `2026-07-0${index + 1}T12:00:00.000Z`
    }));
    const topics = [
      { _id: 'topic-1', title: 'Margin of Safety', pageType: 'topic' },
      { _id: 'topic-2', title: 'Opportunity Cost', pageType: 'topic' },
      { _id: 'topic-3', title: 'Systems Thinking', pageType: 'topic' }
    ];
    const explore = prepareExplorePages([...repos, ...topics], { limit: 10 });

    const repoCount = explore.filter((page) => page.pageType === 'repo').length;
    expect(repoCount).toBeLessThanOrEqual(explore.filter((page) => page.pageType === 'topic').length);
    expect(explore.length).toBe(6);
    expect(explore.filter((page) => page.pageType === 'topic')).toHaveLength(3);
  });

  it('never lets repo pages become a majority when alternatives exist', () => {
    const pages = [
      repoPage({ id: 'repo-1', owner: 'a', repo: 'one' }),
      repoPage({ id: 'repo-2', owner: 'b', repo: 'two' }),
      repoPage({ id: 'repo-3', owner: 'c', repo: 'three' }),
      { _id: 'topic-1', title: 'Only topic', pageType: 'topic' }
    ];

    const capped = capRepoWikiDominance(pages, { maxFraction: 0.4, minNonRepo: 1 });
    const repoCount = capped.filter((page) => page.pageType === 'repo').length;

    expect(repoCount).toBeLessThanOrEqual(Math.floor(capped.length / 2));
    expect(capped.some((page) => page._id === 'topic-1')).toBe(true);
  });
});
