import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import PublicWikiComparison, {
  buildPublicWikiComparisonSchema,
  isZeroChangeComparison,
  materialExamples,
  normalizeProofPulse,
  shortSha,
  summarizeNoeisChanges,
  summarizeRepositoryChanges,
  summarizeStaticWikiRisk
} from './PublicWikiComparison';
import { getPublicProofRegistry, getPublicWikiComparison } from '../api/wiki';
import { PUBLIC_PROOF_PRIVACY_STATEMENT } from '../utils/maintenanceProof';

jest.mock('../api/wiki', () => ({
  getPublicWikiComparison: jest.fn(),
  getPublicProofRegistry: jest.fn()
}));

const mockParams = (idOrSlug) => {
  jest.spyOn(router, 'useParams').mockReturnValue({ idOrSlug });
};

const renderComparison = (ui) => render(
  <MemoryRouter initialEntries={['/share/wiki/noeis-repo/comparison']}>
    {ui}
  </MemoryRouter>
);

const proofPulseFor = (state = 'current', overrides = {}) => {
  const publishedVersion = 'a7cc281393dc2985c02a89a07d68d169ce3145b1';
  const observedVersion = state === 'repository_ahead' || state === 'held_for_review'
    ? '91ab3f2deadbeef0123456789abcdef01234567'
    : publishedVersion;
  const headlines = {
    current: '67 claims held steady through a7cc281.',
    maintained: 'Noeis updated 3 claims and preserved 64 through a7cc281.',
    repository_ahead: 'The repository moved to 91ab3f2; Noeis is still showing the trusted a7cc281 version.',
    held_for_review: 'Noeis refused to replace the trusted a7cc281 version with a weaker candidate.'
  };
  return {
    state,
    headline: headlines[state] || headlines.current,
    facts: [
      '0 repository paths changed since baseline',
      '0 claims gained support',
      '0 claims became contradicted',
      '67 claims were reviewed and preserved',
      '0 generate-once claims are now demonstrably stale',
      '0 candidate claim changes were rejected or held for review'
    ],
    observedVersion,
    publishedVersion,
    ...overrides
  };
};

const baseComparison = ({
  preservedCount = 67,
  withRepoChanges = false,
  withMaterialClaims = false,
  withStaticErrors = false,
  withRejected = false,
  proofPulse = null
} = {}) => {
  const preserved = Array.from({ length: preservedCount }, (_, index) => ({
    before: {
      claimId: `claim-p-${index}`,
      text: `Preserved claim ${index + 1} about repository structure.`,
      support: 'supported',
      section: 'Architecture'
    },
    after: {
      claimId: `claim-p-${index}`,
      text: `Preserved claim ${index + 1} about repository structure.`,
      support: 'supported',
      section: 'Architecture'
    }
  }));

  const added = withMaterialClaims
    ? [{ after: { claimId: 'claim-a', text: 'New claim about releases.', support: 'supported', section: 'Changelog' } }]
    : [];
  const changed = withMaterialClaims
    ? [{
      before: { claimId: 'claim-c', text: 'Old entrypoint claim.', support: 'supported', section: 'Key files' },
      after: { claimId: 'claim-c', text: 'Updated entrypoint claim.', support: 'supported', section: 'Key files' }
    }]
    : [];
  const gainedSupport = withMaterialClaims
    ? [{
      before: { claimId: 'claim-g', text: 'Partial claim.', support: 'partial', section: 'Tests' },
      after: { claimId: 'claim-g', text: 'Partial claim.', support: 'supported', section: 'Tests' }
    }]
    : [];
  const contradicted = withMaterialClaims
    ? [{
      before: { claimId: 'claim-x', text: 'Earlier narrative.', support: 'supported', section: 'Risks' },
      after: { claimId: 'claim-x', text: 'Earlier narrative.', support: 'conflicted', section: 'Risks' }
    }]
    : [];
  const removed = withMaterialClaims
    ? [{ before: { claimId: 'claim-r', text: 'Removed claim.', support: 'supported', section: 'Docs' } }]
    : [];

  const repositoryChanges = withRepoChanges
    ? {
      added: [{ path: 'docs/new.md', current: { path: 'docs/new.md', url: 'https://github.com/atsokolas/note-taker-3/blob/head2/docs/new.md' } }],
      changed: [{
        path: 'package.json',
        baseline: { path: 'package.json', blobSha: 'blob-old', url: 'https://github.com/atsokolas/note-taker-3/blob/head1/package.json' },
        current: { path: 'package.json', blobSha: 'blob-new', url: 'https://github.com/atsokolas/note-taker-3/blob/head2/package.json' }
      }],
      removed: [{ path: 'docs/old.md', baseline: { path: 'docs/old.md', url: 'https://github.com/atsokolas/note-taker-3/blob/head1/docs/old.md' } }]
    }
    : { added: [], changed: [], removed: [] };

  return {
    version: 1,
    repository: {
      owner: 'atsokolas',
      repo: 'note-taker-3',
      defaultBranch: 'main',
      url: 'https://github.com/atsokolas/note-taker-3'
    },
    baseline: {
      headSha: '4cbdac0b740a461cdb57b14cbc069f5ca7083c63',
      releaseTag: 'v0.1.0',
      generatorVersion: 'repo-wiki-1',
      capturedAt: '2026-07-01T12:00:00.000Z'
    },
    current: {
      observedHeadSha: '91ab3f2deadbeef0123456789abcdef01234567',
      publishedHeadSha: 'a7cc281393dc2985c02a89a07d68d169ce3145b1',
      releaseTag: 'v0.2.0',
      generatorVersion: 'repo-wiki-2',
      publishedAt: '2026-07-10T18:00:00.000Z',
      buildStatus: 'ready'
    },
    repositoryChanges,
    claimComparison: {
      outcome: 'accepted',
      counts: {
        added: added.length,
        changed: changed.length,
        gainedSupport: gainedSupport.length,
        contradicted: contradicted.length,
        preserved: preserved.length,
        removed: removed.length
      },
      deltas: {
        added,
        changed,
        gainedSupport,
        contradicted,
        preserved,
        removed
      },
      materialChangeCount: added.length + changed.length + gainedSupport.length + contradicted.length + removed.length,
      reviewedClaimCount: preserved.length + added.length + changed.length
    },
    rejectedCandidates: withRejected
      ? [{ runId: 'run-9', at: '2026-07-09T10:00:00.000Z', counts: { changed: 2, removed: 1 } }]
      : [],
    staticWikiErrors: withStaticErrors
      ? [{
        claimId: 'claim-c',
        staleClaim: 'The entrypoint is still the old path.',
        reason: 'A repository source supporting this baseline claim changed or disappeared.',
        refs: [{ path: 'package.json', url: 'https://github.com/atsokolas/note-taker-3/blob/head2/package.json' }]
      }]
      : [],
    supportingRefs: [
      {
        sourceRefId: 'ref-1',
        title: 'package.json',
        path: 'package.json',
        evidenceType: 'config',
        blobSha: 'blob-new',
        commitSha: 'a7cc281393dc2985c02a89a07d68d169ce3145b1',
        tagName: '',
        url: 'https://github.com/atsokolas/note-taker-3/blob/a7cc281/package.json'
      },
      {
        sourceRefId: 'ref-2',
        title: 'README.md',
        path: 'README.md',
        evidenceType: 'docs',
        commitSha: 'a7cc281393dc2985c02a89a07d68d169ce3145b1',
        url: 'https://github.com/atsokolas/note-taker-3/blob/a7cc281/README.md'
      }
    ],
    ...(proofPulse ? { proofPulse } : {})
  };
};

describe('PublicWikiComparison', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    getPublicWikiComparison.mockReset();
    getPublicProofRegistry.mockReset();
    getPublicProofRegistry.mockResolvedValue({ items: [] });
    mockParams('noeis-repo');
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/noeis-repo/comparison',
      search: '',
      hash: '',
      state: null,
      key: 'test'
    });
  });

  it('renders baseline, published, and observed commits distinctly', async () => {
    getPublicWikiComparison.mockResolvedValue({ comparison: baseComparison() });
    renderComparison(<PublicWikiComparison />);

    await waitFor(() => expect(getPublicWikiComparison).toHaveBeenCalledWith('noeis-repo'));
    expect(await screen.findByRole('heading', { name: 'atsokolas/note-taker-3' })).toBeInTheDocument();

    const baseline = screen.getByText('Baseline').closest('[data-version="baseline"]');
    const published = screen.getByText('Successfully published').closest('[data-version="published"]');
    const observed = screen.getByText('Latest observed GitHub head').closest('[data-version="observed"]');

    expect(within(baseline).getByText('4cbdac0')).toBeInTheDocument();
    expect(within(published).getByText('a7cc281')).toBeInTheDocument();
    expect(within(observed).getByText('91ab3f2')).toBeInTheDocument();
  });

  it('leads with four plain-English answers and keeps technical evidence collapsed', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({ withRepoChanges: true, withMaterialClaims: true })
    });
    renderComparison(<PublicWikiComparison />);

    expect(await screen.findByText('1 · What changed?')).toBeInTheDocument();
    expect(screen.getByText('2 · What does the trusted wiki reflect?')).toBeInTheDocument();
    expect(screen.getByText('3 · Why publish or hold?')).toBeInTheDocument();
    expect(screen.getByText('4 · What should I inspect?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Material examples' })).toBeInTheDocument();
    const detail = screen.getByText('Technical detail and full evidence').closest('details');
    expect(detail).not.toHaveAttribute('open');
    expect(detail.querySelectorAll('[data-claim-group]').length).toBeGreaterThan(0);
    expect(screen.getByText(/Candidate proof\. Promotion requires a legible source event/i)).toBeInTheDocument();
  });

  it('ranks claim examples ahead of repository filenames and shows the evidence disposition', async () => {
    const comparison = baseComparison({ withRepoChanges: true, withMaterialClaims: true });
    const examples = materialExamples(comparison);
    expect(examples[0]).toEqual(expect.objectContaining({
      type: 'Changed',
      before: 'Old entrypoint claim.',
      after: 'Updated entrypoint claim.',
      disposition: 'Candidate changed'
    }));
    expect(examples.map(example => example.before)).not.toContain('package.json');

    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);
    await screen.findByRole('heading', { name: 'Material examples' });
    const exampleSection = screen.getByRole('region', { name: 'Material examples' });
    expect(within(exampleSection).getByText('Old entrypoint claim.')).toBeInTheDocument();
    expect(within(exampleSection).getByText('Updated entrypoint claim.')).toBeInTheDocument();
    expect(within(exampleSection).getAllByText(/No public source is linked/i).length).toBeGreaterThan(0);
    expect(within(exampleSection).queryByText('package.json')).not.toBeInTheDocument();
  });

  it('omits ledger deltas with no publicly visible before-after difference or evidence', () => {
    const comparison = baseComparison();
    comparison.claimComparison.counts.changed = 1;
    comparison.claimComparison.deltas.changed = [{
      before: { text: 'Same public claim.', support: 'supported', section: 'Overview' },
      after: { text: 'Same public claim.', support: 'supported', section: 'Overview' }
    }];
    expect(materialExamples(comparison)).toEqual([]);
  });

  it('never labels the observed or candidate head as published', async () => {
    getPublicWikiComparison.mockResolvedValue({ comparison: baseComparison() });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText('Successfully published');
    const published = screen.getByText('Successfully published').closest('[data-version="published"]');
    const observed = screen.getByText('Latest observed GitHub head').closest('[data-version="observed"]');

    expect(within(published).queryByText('91ab3f2')).not.toBeInTheDocument();
    expect(within(observed).getByText(/not the published\/current-through head/i)).toBeInTheDocument();
    expect(screen.queryByText(/published through 91ab3f2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/current through 91ab3f2/i)).not.toBeInTheDocument();
  });

  it('renders added, changed, and removed repository groups', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({ withRepoChanges: true })
    });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText('Repository files, docs, and releases changed');
    const addedGroup = document.querySelector('[data-repo-change-group="added"]');
    const changedGroup = document.querySelector('[data-repo-change-group="changed"]');
    const removedGroup = document.querySelector('[data-repo-change-group="removed"]');
    expect(addedGroup).toHaveTextContent(/Added \(1\)/);
    expect(addedGroup).toHaveTextContent('docs/new.md');
    expect(changedGroup).toHaveTextContent(/Changed \(1\)/);
    expect(changedGroup).toHaveTextContent('package.json');
    expect(removedGroup).toHaveTextContent(/Removed \(1\)/);
    expect(removedGroup).toHaveTextContent('docs/old.md');
  });

  it('renders all claim-delta groups including preserved and material classes', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({
        preservedCount: 2,
        withMaterialClaims: true
      })
    });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText('Claims changed');
    expect(document.querySelector('[data-claim-group="added"]')).toHaveTextContent(/Added \(1\)/);
    expect(document.querySelector('[data-claim-group="changed"]')).toHaveTextContent(/Changed \(1\)/);
    expect(document.querySelector('[data-claim-group="gainedSupport"]')).toHaveTextContent(/Gained support \(1\)/);
    expect(document.querySelector('[data-claim-group="contradicted"]')).toHaveTextContent(/Contradicted \(1\)/);
    expect(document.querySelector('[data-claim-group="removed"]')).toHaveTextContent(/Removed \(1\)/);
    expect(document.querySelector('[data-claim-group="preserved"]')).toHaveTextContent(/Preserved \(2\)/);
    expect(screen.getAllByText('New claim about releases.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Updated entrypoint claim.').length).toBeGreaterThan(0);
  });

  it('shows rejected counts without rejected candidate prose', async () => {
    const comparison = baseComparison({ withRejected: true, preservedCount: 1 });
    // Simulate a private field leaking into the mock payload — UI must not render prose.
    comparison.rejectedCandidates[0].deltas = {
      changed: [{ after: { text: 'SECRET rejected candidate prose should stay hidden' } }]
    };
    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText('Claims rejected or flagged');
    expect(screen.getByText(/rejected candidate 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/run-9/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/2 changed/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/SECRET rejected candidate prose/i)).not.toBeInTheDocument();
  });

  it('renders static-wiki errors and supporting refs', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({
        withRepoChanges: true,
        withStaticErrors: true,
        preservedCount: 1
      })
    });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText('What a static wiki would now say incorrectly');
    expect(screen.getAllByText('The entrypoint is still the old path.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/repository source supporting this baseline claim/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Supporting GitHub refs' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /package\.json/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /README\.md/i })).toHaveAttribute(
      'href',
      expect.stringContaining('github.com')
    );
  });

  it('renders an honest zero-change baseline state', async () => {
    const comparison = baseComparison({ preservedCount: 67 });
    expect(isZeroChangeComparison(comparison)).toBe(true);
    expect(comparison.proofPulse).toBeUndefined();
    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText(/Baseline state: the repository evidence set/i);
    expect(screen.getByText(/67 claims are preserved with no material repository drift yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No repository files, docs, or releases changed since the baseline snapshot/i)).toBeInTheDocument();
    expect(screen.queryByTestId('proof-pulse')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Comparison unavailable' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-repo-change-group="added"]')).toHaveTextContent(/None in this group/);
  });

  it('renders proofPulse as the dominant summary narrative for current state', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({
        preservedCount: 67,
        proofPulse: proofPulseFor('current')
      })
    });
    renderComparison(<PublicWikiComparison />);

    const pulse = await screen.findByTestId('proof-pulse');
    expect(screen.getByTestId('proof-pulse-headline')).toHaveTextContent(/67 claims held steady through a7cc281/i);
    expect(screen.getByTestId('proof-pulse-state')).toHaveTextContent('No drift observed');
    expect(document.querySelector('[data-proof-pulse-state="current"]')).toBeInTheDocument();
    expect(within(pulse).getByText(/Why maintenance matters/i)).toBeInTheDocument();
    expect(screen.getByTestId('proof-pulse-published')).toHaveTextContent('a7cc281');
    expect(screen.getByTestId('proof-pulse-observed')).toHaveTextContent('a7cc281');
    expect(within(pulse).getByText(/67 claims were reviewed and preserved/i)).toBeInTheDocument();
    // Zero-change baseline note is reserved for absent proofPulse.
    expect(screen.queryByText(/Baseline state: the repository evidence set/i)).not.toBeInTheDocument();
  });

  it('never labels observedVersion as published in proofPulse', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({
        proofPulse: proofPulseFor('repository_ahead')
      })
    });
    renderComparison(<PublicWikiComparison />);

    await screen.findByTestId('proof-pulse');
    const published = screen.getByTestId('proof-pulse-published');
    const observed = screen.getByTestId('proof-pulse-observed');
    expect(published).toHaveTextContent('a7cc281');
    expect(observed).toHaveTextContent('91ab3f2');
    expect(published).not.toHaveTextContent('91ab3f2');
    expect(screen.getByTestId('proof-pulse-state')).toHaveTextContent('Repository ahead');
    expect(screen.queryByText(/published.*91ab3f2/i)).not.toBeInTheDocument();
  });

  it('communicates held_for_review as trusted preservation, not generic failure', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({
        withRejected: true,
        proofPulse: proofPulseFor('held_for_review', {
          facts: [
            '1 repository paths changed since baseline',
            '2 candidate claim changes were rejected or held for review',
            '67 claims were reviewed and preserved'
          ]
        })
      })
    });
    renderComparison(<PublicWikiComparison />);

    await screen.findByTestId('proof-pulse');
    expect(screen.getByTestId('proof-pulse-state')).toHaveTextContent('Held for review');
    expect(screen.getByTestId('proof-pulse-headline')).toHaveTextContent(/refused to replace the trusted a7cc281/i);
    expect(screen.getByText(/preserved the trusted published article/i)).toBeInTheDocument();
    expect(screen.getByText(/held for review rather than silently replacing/i)).toBeInTheDocument();
    expect(screen.queryByText(/generation failed/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-proof-pulse-state="held_for_review"]')).toBeInTheDocument();
  });

  it('renders maintained proofPulse with evidence facts', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({
        withMaterialClaims: true,
        preservedCount: 2,
        proofPulse: proofPulseFor('maintained', {
          headline: 'Noeis updated 3 claims and preserved 2 through a7cc281.',
          facts: [
            '1 repository paths changed since baseline',
            '1 claims gained support',
            '2 claims were reviewed and preserved'
          ]
        })
      })
    });
    renderComparison(<PublicWikiComparison />);

    await screen.findByTestId('proof-pulse');
    expect(screen.getByTestId('proof-pulse-state')).toHaveTextContent('Candidate update');
    expect(screen.getByTestId('proof-pulse-headline')).toHaveTextContent(/updated 3 claims and preserved 2/i);
    expect(screen.getByText(/1 claims gained support/i)).toBeInTheDocument();
  });

  it('renders 404 / not-public state', async () => {
    getPublicWikiComparison.mockRejectedValue({ response: { status: 404 } });
    renderComparison(<PublicWikiComparison />);

    expect(await screen.findByRole('heading', { name: 'Comparison unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/private, incomplete, or no longer exists/i)).toBeInTheDocument();
  });

  it('emits structured TechArticle metadata with citations and dates', async () => {
    const comparison = baseComparison({ preservedCount: 3 });
    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);
    await screen.findByRole('heading', { name: 'atsokolas/note-taker-3' });

    const schema = buildPublicWikiComparisonSchema({
      comparison,
      canonicalPath: '/share/wiki/noeis-repo/comparison',
      idOrSlug: 'noeis-repo'
    });
    expect(schema['@type']).toBe('TechArticle');
    expect(schema.url).toContain('/share/wiki/noeis-repo/comparison');
    expect(schema.dateModified).toBe('2026-07-10T18:00:00.000Z');
    expect(schema.dateReviewed).toBe('2026-07-10T18:00:00.000Z');
    expect(schema.citation.length).toBeGreaterThan(0);
    expect(schema.about.join(' ')).toMatch(/baseline commit 4cbdac0/i);
    expect(schema.about.join(' ')).toMatch(/published commit a7cc281/i);
    expect(schema.about.join(' ')).not.toMatch(/published commit 91ab3f2/i);
  });

  it('does not render private-field classes from unexpected payload keys', async () => {
    const comparison = baseComparison({ preservedCount: 1 });
    comparison.userId = 'private-user-id-should-not-render';
    comparison.agentState = { secret: 'agent-private' };
    comparison.highlights = [{ text: 'private highlight body' }];
    comparison.backlinks = [{ title: 'private backlink' }];
    comparison.buildLease = { token: 'lease-token-secret' };
    comparison.rawCandidate = { body: 'private candidate article body' };
    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);

    await screen.findByRole('heading', { name: 'atsokolas/note-taker-3' });
    expect(screen.queryByText(/private-user-id-should-not-render/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agent-private/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private highlight body/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private backlink/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lease-token-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private candidate article body/i)).not.toBeInTheDocument();
    expect(screen.getByText(PUBLIC_PROOF_PRIVACY_STATEMENT)).toBeInTheDocument();
  });
});

describe('PublicWikiComparison helpers', () => {
  it('shortens SHAs and summarizes zero-change honestly', () => {
    expect(shortSha('abcdef0123456789')).toBe('abcdef0');
    const zero = baseComparison({ preservedCount: 67 });
    expect(isZeroChangeComparison(zero)).toBe(true);
    expect(summarizeRepositoryChanges(zero)).toMatch(/No repository files/i);
    expect(summarizeNoeisChanges(zero)).toMatch(/preserved 67/i);
    expect(summarizeStaticWikiRisk(zero)).toMatch(/no demonstrated stale/i);
  });

  it('normalizes proofPulse and rejects empty headlines', () => {
    expect(normalizeProofPulse(null)).toBeNull();
    expect(normalizeProofPulse({ state: 'current', headline: '' })).toBeNull();
    const pulse = normalizeProofPulse(proofPulseFor('repository_ahead'));
    expect(pulse.state).toBe('repository_ahead');
    expect(pulse.observedVersion).toContain('91ab3f2');
    expect(pulse.publishedVersion).toContain('a7cc281');
    expect(pulse.facts.length).toBeGreaterThan(0);
  });
});
