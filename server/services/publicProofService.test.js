const assert = require('assert');
const {
  DEFAULT_PUBLIC_PROOF_SLOTS,
  PUBLIC_PROOF_PRIVACY_STATEMENT,
  buildPublicMaintenanceProof,
  buildPublicProofGrade,
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
  const candidate = sharedPage({
    _id: 'repo-candidate',
    sourceRefs: [{ title: 'README' }],
    claims: [{ claimId: 'claim-1' }],
    externalWatches: {
      githubRepo: {
        status: 'active',
        owner: 'atsokolas',
        repo: 'note-taker-3',
        publishedHeadSha: 'accepted123',
        lastPublishedAt: '2026-07-12T00:00:00.000Z'
      }
    },
    aiState: {
      changeLog: [{ type: 'edit', text: 'Used one file as evidence.', createdAt: '2026-07-12T00:00:00.000Z' }]
    }
  });
  const grade = buildPublicProofGrade({ slot: { key: 'noeis-repo' }, page: candidate });
  assert.strictEqual(grade.grade, 'candidate');
  assert.strictEqual(grade.criteria.explicitlyAccepted, false);
  assert.strictEqual(grade.comparisonUrl, '/share/wiki/repo-candidate/comparison');
})();

(() => {
  const requestedButIncomplete = sharedPage({
    sourceRefs: [{ title: 'README' }],
    claims: [{ claimId: 'claim-1' }],
    publicProof: { grade: 'proven', acceptedAt: '2026-07-12T00:00:00.000Z' }
  });
  assert.strictEqual(
    buildPublicProofGrade({ slot: { key: 'noeis-repo' }, page: requestedButIncomplete }).grade,
    'candidate'
  );
})();

(() => {
  const proven = sharedPage({
    _id: 'accepted-repo',
    sourceRefs: [{ title: 'README' }],
    claims: [{ claimId: 'claim-1' }],
    publicProof: {
      grade: 'proven',
      acceptedAt: '2026-07-12T00:00:00.000Z',
      acceptedEventId: 'maintenance-receipt-1',
      reason: 'A claim-level repository maintenance receipt passed editorial acceptance.'
    },
    externalWatches: {
      githubRepo: {
        status: 'active',
        owner: 'atsokolas',
        repo: 'note-taker-3',
        publishedHeadSha: 'accepted123',
        lastPublishedAt: '2026-07-12T00:00:00.000Z'
      }
    },
    aiState: {
      changeLog: [{ type: 'maintenance', text: 'Updated one claim from repository evidence.', createdAt: '2026-07-12T00:00:00.000Z' }]
    }
  });
  const grade = buildPublicProofGrade({ slot: { key: 'noeis-repo' }, page: proven });
  assert.strictEqual(grade.grade, 'proven');
  assert.strictEqual(grade.criteria.explicitlyAccepted, true);
  assert.strictEqual(grade.reason, 'A claim-level repository maintenance receipt passed editorial acceptance.');
})();

(() => {
  const alphabetBase = {
    _id: 'alphabet-proof-gate',
    title: 'Alphabet allocator dossier',
    sourceRefs: [{ title: 'Alphabet 10-K' }],
    claims: [{ claimId: 'claim-1' }],
    freshness: {
      acceptedThrough: {
        sourceEventId: 'latest-event',
        title: 'Alphabet accepted evidence',
        url: 'https://www.sec.gov/Archives/alphabet',
        sourceUpdatedAt: '2026-07-12T00:00:00.000Z',
        acceptedAt: '2026-07-12T01:00:00.000Z'
      }
    },
    aiState: { changeLog: [] },
    publicProof: {
      grade: 'proven',
      acceptedAt: '2026-07-12T00:00:00.000Z',
      acceptedEventId: 'acceptance-record-1',
      reason: 'This reason must not survive an incomplete acceptance record.'
    }
  };
  const incomplete = buildPublicProofGrade({
    slot: { key: 'alphabet' },
    page: sharedPage(alphabetBase)
  });
  assert.strictEqual(incomplete.grade, 'acceptance_in_progress');
  assert.deepStrictEqual(incomplete.criteria.requiredClocks, {
    secEdgar: false
  });
  assert.deepStrictEqual(incomplete.criteria.optionalClocks, {
    earningsTranscript: false
  });
  assert.ok(!incomplete.reason.includes('must not survive'));

  const accepted = buildPublicProofGrade({
    slot: { key: 'alphabet' },
    page: sharedPage({
      ...alphabetBase,
      publicProof: {
        ...alphabetBase.publicProof,
        reason: 'The authoritative SEC filing clock passed editorial acceptance.',
        acceptedClocks: [{
          type: 'sec_edgar',
          sourceEventId: 'private-filing-event',
          revisionId: 'private-filing-revision',
          acceptedAt: '2026-07-12T00:00:00.000Z'
        }]
      }
    })
  });
  assert.strictEqual(accepted.grade, 'proven');
  assert.strictEqual(accepted.criteria.explicitlyAccepted, true);
  assert.strictEqual(accepted.criteria.materialEvent, true);
  assert.deepStrictEqual(accepted.criteria.requiredClocks, {
    secEdgar: true
  });
  assert.deepStrictEqual(accepted.criteria.optionalClocks, {
    earningsTranscript: false
  });
  assert.ok(!JSON.stringify(accepted).includes('private-filing-event'));
  assert.ok(!JSON.stringify(accepted).includes('private-transcript-revision'));
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
    sharedPage({ _id: 'alphabet', title: 'Alphabet is Berkshire Hathaway 2.0', status: 'draft' }),
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
  const legacyConfiguredPage = sharedPage({
    _id: 'legacy-alphabet',
    title: 'Alphabet is Berkshire Hathaway 2.0'
  });
  const acceptedPage = sharedPage({
    _id: 'accepted-alphabet',
    title: 'Alphabet’s Berkshire-like allocator—and where the analogy breaks',
    sourceRefs: [{ title: 'Alphabet 10-Q' }],
    claims: [{ claimId: 'claim-1' }],
    freshness: {
      acceptedThrough: {
        sourceEventId: 'filing-event',
        title: 'GOOGL 10-Q filed 2026-04-30',
        url: 'https://www.sec.gov/Archives/alphabet',
        acceptedAt: '2026-07-16T00:00:00.000Z'
      }
    },
    publicProof: {
      grade: 'proven',
      acceptedAt: '2026-07-16T00:00:00.000Z',
      acceptedEventId: 'acceptance-record',
      acceptedClocks: [{
        type: 'sec_edgar',
        sourceEventId: 'filing-event',
        revisionId: 'filing-revision',
        acceptedAt: '2026-07-16T00:00:00.000Z'
      }]
    }
  });
  const [selected] = selectPublicProofPages({
    pages: [legacyConfiguredPage, acceptedPage],
    slots: [DEFAULT_PUBLIC_PROOF_SLOTS[0]],
    env: { PUBLIC_PROOF_ALPHABET_PAGE: 'legacy-alphabet' }
  });
  assert.strictEqual(selected.page._id, 'accepted-alphabet');
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

(() => {
  const page = sharedPage({
    _id: 'compact-page',
    title: 'Compact proof',
    plainText: 'A concise public summary.',
    sourceRefs: [{ _id: 'private-source-id', title: 'Public source', url: 'https://example.com/source', snippet: 'Large private-adjacent excerpt' }],
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Large article body' }] }] }
  });
  const entry = serializePublicProofEntry({
    slot: { key: 'compact', label: 'Proof' },
    page,
    compact: true,
    serializePage: input => ({ ...input, maintenanceProof: buildPublicMaintenanceProof(input) })
  });
  const json = JSON.stringify(entry);
  assert.ok(!json.includes('Large article body'));
  assert.ok(!json.includes('private-source-id'));
  assert.ok(!json.includes('Large private-adjacent excerpt'));
  assert.deepStrictEqual(entry.page.sourceRefs, [{ title: 'Public source', url: 'https://example.com/source' }]);
})();

console.log('publicProofService tests passed');
