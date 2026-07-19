import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import PublicWikiComparison, {
  buildPublicWikiComparisonSchema,
  evidenceRefLabel,
  explainMaterialChanges,
  isMalformedClaimText,
  isZeroChangeComparison,
  materialExamples,
  normalizeProofPulse,
  shortSha,
  summarizeAcceptanceFailure,
  summarizeNoeisChanges,
  summarizePreservedClaims,
  summarizeRepositoryChanges,
  summarizeStaticWikiRisk,
  uniqueRejectedCandidateBuilds
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
  const baselineVersion = '4cbdac0b740a461cdb57b14cbc069f5ca7083c63';
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
      '0 unique candidate builds were rejected',
      '0 candidate builds are currently held for review'
    ],
    baselineVersion,
    observedVersion,
    publishedVersion,
    ...overrides
  };
};

const liveV2ProofPulse = () => ({
  state: 'held_for_review',
  headline: 'This comparison remains a candidate because it has not demonstrated a source-backed claim rewrite with preserved peers.',
  facts: [
    '21 repository paths changed since baseline',
    '0 claims gained support',
    '0 claims became contradicted',
    '63 claims were reviewed and preserved',
    '63 preserved claims received refreshed evidence',
    '3 generate-once claims are now demonstrably stale',
    '2 unique candidate builds were rejected',
    '0 candidate builds are currently held for review'
  ],
  acceptance: {
    eligible: false,
    realClaimChanges: 0,
    sourceBackedClaimChanges: 0,
    preservedClaims: 63,
    blockers: ['no_source_backed_claim_rewrite']
  },
  baselineVersion: 'aaa9016a585629de49ed4b6df45906741ab7d8c4',
  observedVersion: '10be62083ee75cab214417ec4eb91ac1a62f8f6e',
  publishedVersion: '10be62083ee75cab214417ec4eb91ac1a62f8f6e'
});

const baseComparison = ({
  preservedCount = 67,
  withRepoChanges = false,
  withMaterialClaims = false,
  withStaticErrors = false,
  withRejected = false,
  proofPulse = null,
  version = 1,
  v2LiveShape = false
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
    ? [{ after: { claimId: 'claim-a', text: 'New claim about releases that is long enough to be material.', support: 'supported', section: 'Changelog' } }]
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
    ? [{ before: { claimId: 'claim-r', text: 'Removed claim about documentation paths that used to exist.', support: 'supported', section: 'Docs' } }]
    : [];

  const repositoryChanges = withRepoChanges
    ? {
      added: [{ path: 'docs/new.md', current: { path: 'docs/new.md', title: 'docs/new.md', url: 'https://github.com/atsokolas/note-taker-3/blob/head2/docs/new.md' } }],
      changed: [{
        path: 'package.json',
        baseline: { path: 'package.json', blobSha: 'blob-old', url: 'https://github.com/atsokolas/note-taker-3/blob/head1/package.json' },
        current: { path: 'package.json', blobSha: 'blob-new', title: 'package.json', url: 'https://github.com/atsokolas/note-taker-3/blob/head2/package.json' }
      }],
      removed: [{ path: 'docs/old.md', baseline: { path: 'docs/old.md', url: 'https://github.com/atsokolas/note-taker-3/blob/head1/docs/old.md' } }]
    }
    : { added: [], changed: [], removed: [] };

  if (v2LiveShape) {
    const evidenceRefreshed = Array.from({ length: 2 }, (_, index) => ({
      before: {
        text: `A long preserved claim ${index + 1} about the reading-to-thinking workspace that stays the same.`,
        support: 'supported',
        section: 'Overview'
      },
      after: {
        text: `A long preserved claim ${index + 1} about the reading-to-thinking workspace that stays the same.`,
        support: 'supported',
        section: 'Overview'
      },
      evidenceRefs: [{
        title: 'atsokolas/note-taker-3 .env.example',
        path: '.env.example',
        url: 'https://github.com/atsokolas/note-taker-3/blob/10be620/.env.example'
      }]
    }));
    return {
      version: 2,
      repository: {
        owner: 'atsokolas',
        repo: 'note-taker-3',
        defaultBranch: 'main',
        url: 'https://github.com/atsokolas/note-taker-3'
      },
      baseline: {
        headSha: 'aaa9016a585629de49ed4b6df45906741ab7d8c4',
        releaseTag: '',
        generatorVersion: '',
        capturedAt: '2026-07-12T00:56:53.531Z'
      },
      current: {
        observedHeadSha: '10be62083ee75cab214417ec4eb91ac1a62f8f6e',
        publishedHeadSha: '10be62083ee75cab214417ec4eb91ac1a62f8f6e',
        releaseTag: '',
        generatorVersion: '',
        publishedAt: '2026-07-16T17:52:04.099Z',
        buildStatus: 'ready'
      },
      repositoryChanges: {
        added: [
          { path: 'packages/cli/package.json', current: { path: 'packages/cli/package.json', title: 'cli package', url: 'https://github.com/x/a' } },
          { path: 'packages/wiki-mcp/package.json', current: { path: 'packages/wiki-mcp/package.json', title: 'mcp package', url: 'https://github.com/x/b' } },
          { path: 'server/services/wikiMaintenanceReceiptService.js', current: { path: 'server/services/wikiMaintenanceReceiptService.js', title: 'receipt', url: 'https://github.com/x/c' } },
          { path: 'docs/agentic-concept-center-plan.md', current: { path: 'docs/agentic-concept-center-plan.md', title: 'plan', url: 'https://github.com/x/d' } }
        ],
        changed: Array.from({ length: 12 }, (_, i) => ({
          path: `changed/path-${i}.js`,
          baseline: { path: `changed/path-${i}.js`, blobSha: `old${i}`, url: `https://github.com/x/old${i}` },
          current: { path: `changed/path-${i}.js`, blobSha: `new${i}`, title: `changed path ${i}`, url: `https://github.com/x/new${i}` }
        })),
        removed: [
          { path: '.github/workflows/agent-harness-regression.yml', baseline: { path: '.github/workflows/agent-harness-regression.yml', url: 'https://github.com/x/r1' } },
          { path: 'server/services/agentRunReviewState.js', baseline: { path: 'server/services/agentRunReviewState.js', url: 'https://github.com/x/r2' } },
          { path: 'docs/noeis-brand-system.md', baseline: { path: 'docs/noeis-brand-system.md', url: 'https://github.com/x/r3' } }
        ]
      },
      repositoryChangeTotals: { added: 4, changed: 14, removed: 3 },
      repositoryChangesTruncated: { added: 0, changed: 2, removed: 0 },
      claimComparison: {
        counts: {
          added: 6,
          changed: 0,
          evidenceRefreshed: 63,
          gainedSupport: 0,
          contradicted: 0,
          preserved: 63,
          removed: 4
        },
        deltas: {
          added: [
            { after: { text: 'Create', support: 'supported', section: 'UX' }, evidenceRefs: [{ title: 'wiki.js', path: 'note-taker-ui/src/api/wiki.js', url: 'https://github.com/x/wiki' }] },
            { after: { text: 'repo wiki', support: 'supported', section: 'UX' } },
            { after: { text: 'packages/wiki-mcp/package.json: connected-agent wiki tools and runtime transport are documented here.', support: 'supported', section: 'Packages' }, evidenceRefs: [{ path: 'packages/wiki-mcp/package.json', url: 'https://github.com/x/mcp' }] }
          ],
          changed: [],
          evidenceRefreshed,
          gainedSupport: [],
          contradicted: [],
          preserved: evidenceRefreshed,
          removed: [
            { before: { text: 'Create repo wiki: user pastes a GitHub URL, the UI calls the wiki API client, then the backend creates a maintained page.', support: 'supported', section: 'UX' } }
          ]
        }
      },
      rejectedCandidates: [
        {
          at: '2026-07-16T15:09:20.389Z',
          disposition: 'rejected',
          candidateHeadSha: '',
          counts: { added: 6, changed: 22, gainedSupport: 0, contradicted: 0, preserved: 0, removed: 47 }
        },
        {
          at: '2026-07-16T13:53:42.080Z',
          disposition: 'rejected',
          candidateHeadSha: '',
          counts: { added: 4, changed: 58, gainedSupport: 0, contradicted: 0, preserved: 0, removed: 11 }
        },
        // Duplicate of first shape — must be deduped in UI language
        {
          at: '2026-07-16T15:09:20.389Z',
          disposition: 'rejected',
          candidateHeadSha: '',
          counts: { added: 6, changed: 22, gainedSupport: 0, contradicted: 0, preserved: 0, removed: 47 }
        }
      ],
      staticWikiErrors: [
        {
          staleClaim: 'Create repo wiki: user pastes a GitHub URL, the UI calls the wiki API client, the backend creates or updates a maintained page.',
          reason: 'A repository source supporting this baseline claim changed or disappeared.',
          refs: [{ title: 'atsokolas/note-taker-3 note-taker-ui/src/api/wiki.js', path: 'note-taker-ui/src/api/wiki.js', url: 'https://github.com/x/wiki' }]
        },
        {
          staleClaim: 'Start from package evidence and keep root commands distinct from nested UI commands.',
          reason: 'Source drifted.',
          refs: [{ path: 'package.json', url: 'https://github.com/x/pkg' }]
        },
        {
          staleClaim: 'Another stale claim that remains readable for static-wiki risk.',
          reason: 'Source drifted.',
          refs: []
        }
      ],
      supportingRefs: [
        {
          title: '',
          path: 'package.json',
          evidenceType: 'config',
          commitSha: '10be62083ee75cab214417ec4eb91ac1a62f8f6e',
          url: 'https://github.com/atsokolas/note-taker-3/blob/10be620/package.json'
        },
        {
          title: 'atsokolas/note-taker-3 README.md',
          path: 'README.md',
          evidenceType: 'docs',
          commitSha: '10be62083ee75cab214417ec4eb91ac1a62f8f6e',
          url: 'https://github.com/atsokolas/note-taker-3/blob/10be620/README.md'
        }
      ],
      proofPulse: liveV2ProofPulse()
    };
  }

  return {
    version,
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
      ? [{ runId: 'run-9', at: '2026-07-09T10:00:00.000Z', disposition: 'rejected', counts: { changed: 2, removed: 1 } }]
      : [],
    staticWikiErrors: withStaticErrors
      ? [{
        claimId: 'claim-c',
        staleClaim: 'The entrypoint is still the old path that readers used to follow.',
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
    getPublicProofRegistry.mockResolvedValue({
      items: [{
        publicUrl: '/share/wiki/noeis-repo',
        title: 'atsokolas/note-taker-3',
        proofGrade: {
          grade: 'candidate',
          label: 'Candidate',
          comparisonUrl: '/share/wiki/noeis-repo/comparison'
        }
      }]
    });
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

    const baseline = screen.getByText('Baseline', { selector: 'h3' }).closest('[data-version="baseline"]');
    const published = screen.getByText('Successfully published').closest('[data-version="published"]');
    const observed = screen.getByText('Latest observed GitHub head').closest('[data-version="observed"]');

    expect(within(baseline).getByText('4cbdac0')).toBeInTheDocument();
    expect(within(published).getByText('a7cc281')).toBeInTheDocument();
    expect(within(observed).getByText('91ab3f2')).toBeInTheDocument();
  });

  it('shows baseline SHA above the fold alongside published and observed for v2', async () => {
    getPublicWikiComparison.mockResolvedValue({ comparison: baseComparison({ v2LiveShape: true }) });
    getPublicProofRegistry.mockResolvedValue({
      items: [{
        publicUrl: '/share/wiki/noeis-repo',
        title: 'atsokolas/note-taker-3',
        proofGrade: {
          grade: 'candidate',
          label: 'Candidate',
          comparisonUrl: '/share/wiki/noeis-repo/comparison'
        }
      }]
    });
    renderComparison(<PublicWikiComparison />);

    const pulse = await screen.findByTestId('proof-pulse');
    expect(screen.getByTestId('proof-pulse-baseline')).toHaveTextContent('aaa9016');
    expect(screen.getByTestId('proof-pulse-published')).toHaveTextContent('10be620');
    expect(screen.getByTestId('proof-pulse-observed')).toHaveTextContent('10be620');
    expect(within(pulse).getByText(/Latest observed \(matches published\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('answer-baseline')).toHaveTextContent(/aaa9016/);
    expect(screen.getByTestId('answer-trusted')).toHaveTextContent(/10be620/);
    expect(screen.getByTestId('answer-trusted')).toHaveTextContent(/build ready/i);
  });

  it('presents evidenceRefreshed separately and never as changed or updated', async () => {
    getPublicWikiComparison.mockResolvedValue({ comparison: baseComparison({ v2LiveShape: true }) });
    renderComparison(<PublicWikiComparison />);

    await screen.findByTestId('acceptance-failure');
    expect(screen.getByTestId('answer-preserved')).toHaveTextContent(/63 preserved with refreshed evidence/i);
    expect(screen.getByTestId('answer-changed')).toHaveTextContent(/not counted as changed/i);
    expect(screen.getByTestId('answer-changed')).not.toHaveTextContent(/63 changed/i);
    expect(screen.getByTestId('answer-changed')).not.toHaveTextContent(/updated 63/i);
    expect(summarizeNoeisChanges(baseComparison({ v2LiveShape: true }))).toMatch(/preserved with refreshed evidence/i);
    expect(summarizeNoeisChanges(baseComparison({ v2LiveShape: true }))).not.toMatch(/63 changed/i);
    expect(screen.getByRole('heading', { name: 'Preserved with refreshed evidence' })).toBeInTheDocument();
  });

  it('discloses repository path truncation from totals', async () => {
    const comparison = baseComparison({ v2LiveShape: true });
    expect(summarizeRepositoryChanges(comparison)).toMatch(/14 paths changed in total/i);
    expect(summarizeRepositoryChanges(comparison)).toMatch(/only 12 are displayed/i);
    expect(summarizeRepositoryChanges(comparison)).toMatch(/2 omitted/i);

    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);

    await screen.findByTestId('repository-path-totals');
    expect(screen.getByTestId('repository-path-totals')).toHaveTextContent(/14 paths changed/i);
    expect(screen.getByTestId('repository-path-totals')).toHaveTextContent(/only 12 are displayed/i);
    expect(screen.getByTestId('answer-changed')).toHaveTextContent(/14 paths changed/i);
  });

  it('makes failed acceptance unmistakable as candidate comparison not public proof', async () => {
    getPublicWikiComparison.mockResolvedValue({ comparison: baseComparison({ v2LiveShape: true }) });
    renderComparison(<PublicWikiComparison />);

    const failure = await screen.findByTestId('acceptance-failure');
    expect(failure).toHaveTextContent(/candidate comparison, not public proof/i);
    expect(failure).toHaveTextContent(/No source-backed claim rewrite has been demonstrated/i);
    expect(screen.getByTestId('answer-candidate')).toHaveTextContent(/candidate comparison, not public proof/i);
    expect(await screen.findByText(/Candidate · regeneration stability under review/i)).toBeInTheDocument();
    expect(document.querySelector('[data-acceptance-eligible="false"]')).toBeInTheDocument();
    expect(screen.getByTestId('proof-pulse-state')).toHaveTextContent(/acceptance not met/i);
    expect(screen.getByText(/2 prior candidate builds were rejected; no build is currently held/i)).toBeInTheDocument();
    expect(screen.queryByText(/weaker candidate was held/i)).not.toBeInTheDocument();
  });

  it('describes unique rejected builds and keeps held separate without 102 inflation', async () => {
    const comparison = baseComparison({ v2LiveShape: true });
    expect(uniqueRejectedCandidateBuilds(comparison.rejectedCandidates)).toHaveLength(2);

    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);

    const rejectedList = await screen.findByTestId('rejected-builds');
    expect(within(rejectedList).getAllByText(/Rejected unique build/i)).toHaveLength(2);
    expect(screen.getByTestId('held-builds-empty')).toHaveTextContent(/0 candidate builds are currently held/i);
    expect(screen.queryByText(/102/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 unique candidate builds were rejected/i)).toBeInTheDocument();
    const pulse = screen.getByTestId('proof-pulse');
    expect(within(pulse).getByText(/0 candidate builds are currently held for review/i)).toBeInTheDocument();
  });

  it('gives evidence links an accessible visible label from title then path', async () => {
    getPublicWikiComparison.mockResolvedValue({ comparison: baseComparison({ v2LiveShape: true }) });
    renderComparison(<PublicWikiComparison />);

    await screen.findByRole('heading', { name: 'Supporting GitHub refs' });
    expect(evidenceRefLabel({ title: '', path: 'package.json', url: 'https://x' })).toBe('package.json');
    expect(evidenceRefLabel({ title: 'Readable title', path: 'package.json' })).toBe('Readable title');
    const refsSection = screen.getByRole('region', { name: 'Supporting GitHub refs' });
    const pathFallbackLink = within(refsSection).getByRole('link', { name: 'package.json' });
    expect(pathFallbackLink).toHaveAttribute('href', expect.stringContaining('package.json'));
    expect(within(refsSection).getByRole('link', { name: /atsokolas\/note-taker-3 README\.md/i })).toBeInTheDocument();
    const exampleSection = screen.getByRole('region', { name: 'What actually changed' });
    const exampleLinks = within(exampleSection).queryAllByRole('link');
    exampleLinks.forEach((link) => {
      expect(link).toHaveAccessibleName();
      expect(link.textContent.trim().length).toBeGreaterThan(0);
    });
  });

  it('omits malformed claim fragments from curated examples with disclosure', () => {
    const comparison = baseComparison({ v2LiveShape: true });
    const bundle = materialExamples(comparison, 8);
    expect(bundle.omittedMalformedCount).toBeGreaterThan(0);
    expect(bundle.disclosure).toMatch(/excluded from curated examples/i);
    expect(bundle.examples.every((ex) => !isMalformedClaimText(ex.after) || ex.type.startsWith('Rejected'))).toBe(true);
    expect(bundle.examples.some((ex) => /Create$/.test(ex.after))).toBe(false);
  });

  it('leads with five plain-English answers and keeps technical evidence collapsed', async () => {
    getPublicWikiComparison.mockResolvedValue({
      comparison: baseComparison({ withRepoChanges: true, withMaterialClaims: true })
    });
    renderComparison(<PublicWikiComparison />);

    expect(await screen.findByText('1 · What was baseline?')).toBeInTheDocument();
    expect(screen.getByText('2 · What is trusted now?')).toBeInTheDocument();
    expect(screen.getByText('3 · What actually changed?')).toBeInTheDocument();
    expect(screen.getByText('4 · What was preserved?')).toBeInTheDocument();
    expect(screen.getByText('5 · Why still only a candidate?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What actually changed' })).toBeInTheDocument();
    const detail = screen.getByText('Technical detail and full evidence').closest('details');
    expect(detail).not.toHaveAttribute('open');
    expect(detail.querySelectorAll('[data-claim-group]').length).toBeGreaterThan(0);
    expect(screen.getByText(/Candidate proof\. Promotion requires a legible source event/i)).toBeInTheDocument();
  });

  it('ranks claim examples ahead of repository filenames and shows the evidence disposition', async () => {
    const comparison = baseComparison({ withRepoChanges: true, withMaterialClaims: true });
    const { examples } = materialExamples(comparison);
    expect(examples[0]).toEqual(expect.objectContaining({
      type: 'Changed',
      before: 'Old entrypoint claim.',
      after: 'Updated entrypoint claim.',
      disposition: 'Candidate changed'
    }));
    expect(examples.map((example) => example.before)).not.toContain('package.json');

    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);
    const narratives = explainMaterialChanges(comparison);
    expect(narratives.length).toBeGreaterThan(0);
    expect(narratives[0]).toEqual(expect.objectContaining({
      title: expect.any(String),
      explanation: expect.any(String),
      impact: expect.any(String)
    }));

    await screen.findByRole('heading', { name: 'What actually changed' });
    const exampleSection = screen.getByRole('region', { name: 'What actually changed' });
    expect(within(exampleSection).getAllByText(/Why it matters/i).length).toBeGreaterThan(0);
    expect(within(exampleSection).getAllByText(/Inspect accepted wording/i).length).toBeGreaterThan(0);
  });

  it('omits ledger deltas with no publicly visible before-after difference or evidence', () => {
    const comparison = baseComparison();
    comparison.claimComparison.counts.changed = 1;
    comparison.claimComparison.deltas.changed = [{
      before: { text: 'Same public claim.', support: 'supported', section: 'Overview' },
      after: { text: 'Same public claim.', support: 'supported', section: 'Overview' }
    }];
    expect(materialExamples(comparison).examples).toEqual([]);
  });

  it('explains the current repo changes instead of making before-and-after prose carry the meaning', () => {
    const comparison = baseComparison();
    comparison.claimComparison.counts.changed = 3;
    comparison.claimComparison.deltas.changed = [
      {
        before: { text: 'Run the API and UI, then prove wiki behavior.', section: 'Run and prove changes', support: 'supported' },
        after: { text: 'Use the declared package manager and the repository-declared proof command.', section: 'Run and prove changes', support: 'supported' },
        evidenceRefs: [{ path: 'package.json', url: 'https://github.com/example/repo/blob/head/package.json' }]
      },
      {
        before: { text: 'Configure AI_SERVICE_URL and AI_SERVICE_TIMEOUT_MS. Keep values private.', section: 'Run and prove changes', support: 'supported' },
        after: { text: 'Configure PUBLIC_PROOF_ALPHABET_PAGE and PUBLIC_PROOF_NOEIS_REPO_PAGE. Keep values private.', section: 'Run and prove changes', support: 'supported' },
        evidenceRefs: [{ path: '.env.example', url: 'https://github.com/example/repo/blob/head/.env.example' }]
      },
      {
        before: { text: 'packages/wiki-mcp/README.md documents connected-agent wiki tools.', section: 'System map', support: 'supported' },
        after: { text: 'packages/wiki-mcp/package.json documents connected-agent wiki tools.', section: 'System map', support: 'supported' },
        evidenceRefs: [{ path: 'packages/wiki-mcp/package.json', url: 'https://github.com/example/repo/blob/head/packages/wiki-mcp/package.json' }]
      }
    ];
    comparison.editorialReview = {
      passed: false,
      blockingRiskCount: 3,
      risks: [
        {
          code: 'operational_detail_lost', severity: 'blocking', group: 'changed', index: 0,
          title: 'Setup guidance became broader—and less executable',
          explanation: 'The rewrite replaces explicit API/UI startup guidance with a general package-level rule.',
          impact: 'The maintained claim no longer gives a contributor the concrete local startup sequence present in the accepted baseline.'
        },
        {
          code: 'configuration_scope_regressed', severity: 'blocking', group: 'changed', index: 1,
          title: 'Proof configuration was added, but AI settings disappeared from the claim',
          explanation: 'The rewrite adds public-proof selectors while dropping AI-service variables that still exist in .env.example.',
          impact: 'A claim grounded in the same configuration file became less complete and requires correction before acceptance.'
        },
        {
          code: 'documentation_source_weakened', severity: 'blocking', group: 'changed', index: 2,
          title: 'The claim now points to metadata instead of the actual documentation',
          explanation: 'The rewrite replaces the package README with package.json as the file said to document runtime transport.',
          impact: 'Package metadata is a weaker source for transport documentation and must be corrected before acceptance.'
        }
      ]
    };

    const narratives = explainMaterialChanges(comparison);
    expect(narratives.map(item => item.title)).toEqual([
      'Setup guidance became broader—and less executable',
      'Proof configuration was added, but AI settings disappeared from the claim',
      'The claim now points to metadata instead of the actual documentation'
    ]);
    expect(narratives.every(item => item.tone === 'concern')).toBe(true);
    expect(narratives[0].impact).toMatch(/concrete local startup sequence/i);
    expect(narratives[1].explanation).toMatch(/dropping AI-service variables/i);
    expect(narratives[2].impact).toMatch(/weaker source/i);
  });

  it('labels an evidence-only ledger delta as preserved claim text', () => {
    const comparison = baseComparison();
    comparison.claimComparison.counts.changed = 1;
    comparison.claimComparison.deltas.changed = [{
      before: { text: 'Same public claim about a long enough sentence for display.', support: 'supported', section: 'Overview' },
      after: { text: 'Same public claim about a long enough sentence for display.', support: 'supported', section: 'Overview' },
      evidenceRefs: [{ title: 'README.md', url: 'https://github.com/example/repo/blob/head/README.md' }]
    }];
    expect(materialExamples(comparison).examples[0]).toEqual(expect.objectContaining({
      before: 'Same public claim about a long enough sentence for display.',
      after: 'Same public claim about a long enough sentence for display.',
      disposition: 'Evidence changed; claim text preserved',
      evidence: expect.objectContaining({ label: 'README.md' })
    }));
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
    expect(screen.getAllByText(/New claim about releases/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Updated entrypoint claim.').length).toBeGreaterThan(0);
  });

  it('shows rejected counts without rejected candidate prose', async () => {
    const comparison = baseComparison({ withRejected: true, preservedCount: 1 });
    comparison.rejectedCandidates[0].deltas = {
      changed: [{ after: { text: 'SECRET rejected candidate prose should stay hidden' } }]
    };
    getPublicWikiComparison.mockResolvedValue({ comparison });
    renderComparison(<PublicWikiComparison />);

    await screen.findByText('Rejected candidate builds');
    const rejectedList = screen.getByTestId('rejected-builds');
    expect(within(rejectedList).getByText(/rejected unique build 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/run-9/i)).not.toBeInTheDocument();
    expect(within(rejectedList).getByText(/2 changed/i)).toBeInTheDocument();
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
    expect(screen.getAllByText(/The entrypoint is still the old path/i).length).toBeGreaterThan(0);
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
    expect(screen.getByTestId('proof-pulse-baseline')).toHaveTextContent('4cbdac0');
    expect(screen.getByTestId('proof-pulse-published')).toHaveTextContent('a7cc281');
    expect(screen.getByTestId('proof-pulse-observed')).toHaveTextContent('a7cc281');
    expect(within(pulse).getByText(/67 claims were reviewed and preserved/i)).toBeInTheDocument();
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
            '2 unique candidate builds were rejected',
            '0 candidate builds are currently held for review',
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
    expect(summarizePreservedClaims(zero)).toMatch(/67 accepted claims preserved/i);
  });

  it('normalizes proofPulse acceptance and baseline version', () => {
    expect(normalizeProofPulse(null)).toBeNull();
    expect(normalizeProofPulse({ state: 'current', headline: '' })).toBeNull();
    const pulse = normalizeProofPulse(liveV2ProofPulse());
    expect(pulse.state).toBe('held_for_review');
    expect(pulse.baselineVersion).toContain('aaa9016');
    expect(pulse.acceptance.eligible).toBe(false);
    expect(pulse.acceptance.blockers).toContain('no_source_backed_claim_rewrite');
    expect(pulse.facts.length).toBe(8);
    expect(summarizeAcceptanceFailure({}, pulse)).toMatch(/candidate comparison, not public proof/i);
  });

  it('labels evidence refs with title then path fallback', () => {
    expect(evidenceRefLabel({ title: 'Nice', path: 'a/b', url: 'https://x' })).toBe('Nice');
    expect(evidenceRefLabel({ title: '', path: 'a/b.js', url: 'https://x' })).toBe('a/b.js');
    expect(evidenceRefLabel({ url: 'https://github.com/x' })).toBe('https://github.com/x');
    expect(isMalformedClaimText('Create')).toBe(true);
    expect(isMalformedClaimText('repo wiki')).toBe(true);
    expect(isMalformedClaimText('A full sentence about repository maintenance that is material.')).toBe(false);
  });
});
