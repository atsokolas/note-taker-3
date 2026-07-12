const assert = require('assert');
const {
  DEFAULT_PUBLIC_PROOF_SLOTS,
  PUBLIC_PROOF_PRIVACY_STATEMENT,
  buildPublicMaintenanceProof,
  selectPublicProofPages,
  serializePublicProofEntry
} = require('./publicProofService');

const sharedPage = (overrides = {}) => ({
  _id: overrides._id || `page-${Math.random()}`,
  slug: 'example',
  title: 'Example',
  pageType: 'topic',
  visibility: 'shared',
  status: 'published',
  sourceRefs: [],
  claims: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  freshness: {},
  aiState: {},
  externalWatches: {},
  ...overrides
});

(() => {
  const page = sharedPage({
    title: 'Noeis repo',
    sourceRefs: [{ title: 'README' }, { title: 'package.json' }],
    claims: [{ claimId: 'c1' }],
    externalWatches: {
      githubRepo: {
        status: 'active',
        owner: 'atsokolas',
        repo: 'note-taker-3',
        lastHeadSha: 'candidate999',
        candidateHeadSha: 'candidate999',
        publishedHeadSha: 'published123456789',
        lastPublishedAt: '2026-07-11T10:00:00.000Z'
      }
    },
    aiState: {
      changeLog: [{
        type: 'merged_new_evidence',
        text: 'Generator version tracking was added.',
        createdAt: '2026-07-11T10:01:00.000Z'
      }]
    }
  });
  const proof = buildPublicMaintenanceProof(page);
  assert.deepStrictEqual(proof.clock, {
    type: 'github',
    label: 'GitHub default-branch and release monitoring'
  });
  assert.strictEqual(proof.currentThrough.label, 'Commit publish');
  assert.ok(proof.currentThrough.ref.endsWith('/commit/published123456789'));
  assert.ok(!proof.currentThrough.ref.includes('candidate999'));
  assert.strictEqual(proof.latestMaterialEvent.summary, 'Generator version tracking was added.');
  assert.strictEqual(proof.sourceCount, 2);
  assert.strictEqual(proof.claimCount, 1);
  assert.strictEqual(proof.privacyStatement, PUBLIC_PROOF_PRIVACY_STATEMENT);
})();

(() => {
  const page = sharedPage({
    title: 'Alphabet is Berkshire Hathaway 2.0',
    externalWatches: {
      edgar: {
        status: 'active',
        ticker: 'GOOGL',
        lastAccessionNumber: '0001652044-26-000001',
        lastFilingAt: '2026-07-09T00:00:00.000Z'
      },
      transcripts: {
        status: 'active',
        ticker: 'GOOGL',
        lastTranscriptKey: 'GOOGL:2026:2',
        lastTranscriptAt: '2026-07-10T00:00:00.000Z'
      }
    },
    aiState: {
      lastDraftedAt: '2026-07-08T00:00:00.000Z',
      maintenanceSummary: 'Reviewed the accepted Alphabet thesis.'
    }
  });
  const proof = buildPublicMaintenanceProof(page);
  assert.strictEqual(proof.clock.type, 'sec_edgar_and_earnings_transcript');
  assert.strictEqual(proof.currentThrough.label, 'Last accepted review');
  assert.ok(!JSON.stringify(proof).includes('0001652044-26-000001'));
  assert.ok(!JSON.stringify(proof).includes('GOOGL:2026:2'));
})();

(() => {
  const page = sharedPage({
    title: 'Accepted filing dossier',
    freshness: {
      acceptedThrough: {
        sourceEventId: 'event-accepted',
        title: 'GOOGL 10-Q filed 2026-04-30',
        url: 'https://www.sec.gov/Archives/accepted-filing',
        sourceUpdatedAt: '2026-04-30T00:00:00.000Z'
      }
    }
  });
  const proof = buildPublicMaintenanceProof(page);
  assert.strictEqual(proof.currentThrough.label, 'GOOGL 10-Q filed 2026-04-30');
  assert.strictEqual(proof.currentThrough.ref, 'https://www.sec.gov/Archives/accepted-filing');
})();

(() => {
  const pages = [
    sharedPage({ _id: 'alphabet', title: 'Alphabet is Berkshire Hathaway 2.0' }),
    sharedPage({ _id: 'margin', title: 'Margin of Safety in Value Investing' }),
    sharedPage({ _id: 'circle', title: 'Circle of Competence' }),
    sharedPage({ _id: 'map', title: 'AI Infrastructure Market Map', pageType: 'overview' }),
    sharedPage({ _id: 'question', title: 'Will inference economics commoditize models?', pageType: 'question' }),
    sharedPage({
      _id: 'repo',
      title: 'Atsokolas/Note-Taker-3 Repo Wiki',
      pageType: 'repo',
      externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3', status: 'active' } }
    }),
    sharedPage({ _id: 'private', title: 'Margin of Safety', visibility: 'private' })
  ];
  const selected = selectPublicProofPages({ pages, env: {} });
  assert.strictEqual(selected.length, 6);
  assert.deepStrictEqual(selected.map(item => item.slot.key), DEFAULT_PUBLIC_PROOF_SLOTS.map(slot => slot.key));
  assert.ok(!selected.some(item => item.page._id === 'private'));
})();

(() => {
  const page = sharedPage({
    _id: 'safe-page',
    title: 'Safe public proof',
    userId: 'private-user',
    discussions: [{ question: 'private' }],
    externalWatches: { githubRepo: { buildLease: { token: 'private-token' } } }
  });
  const entry = serializePublicProofEntry({
    slot: { key: 'safe', label: 'Proof', title: 'Safe proof' },
    page,
    serializePage: input => ({
      _id: input._id,
      title: input.title,
      maintenanceProof: buildPublicMaintenanceProof(input)
    })
  });
  const json = JSON.stringify(entry);
  assert.strictEqual(entry.publicUrl, '/share/wiki/safe-page');
  assert.ok(!json.includes('private-user'));
  assert.ok(!json.includes('private-token'));
  assert.ok(!json.includes('discussions'));
})();

console.log('publicProofService tests passed');
