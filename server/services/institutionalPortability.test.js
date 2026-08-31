const {
  exportBundle,
  forgetCase,
  placeHold,
  PortabilityError,
  roundTrip,
  transferOwnership,
  validateImport
} = require('./institutionalPortability');

const SECRET = 'institution-test-secret';

const page = {
  _id: '64f500000000000000000010',
  userId: 'user-host',
  slug: 'compute-stays-scarce',
  title: 'Compute stays scarce',
  sourceRefs: [{ type: 'article', title: 'DOE capacity report', url: 'https://example.com/doe' }],
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    bornAt: '2026-01-15T12:00:00.000Z',
    verdicts: [{ result: 'partly', recordedAt: '2026-08-01T12:00:00.000Z', note: 'Eased in two regions.' }]
  }
};

describe('institution portability', () => {
  it('round-trips a signed export and refuses a tampered one', () => {
    const bundle = exportBundle({
      pages: [page],
      lineage: [{
        fromPageId: page._id,
        toPageId: '64f500000000000000000011',
        kind: 'assumption',
        object: { kind: 'assumption', text: 'Lead times stay long.' },
        status: 'accepted'
      }],
      secret: SECRET,
      ownerId: 'user-host',
      signedAt: '2026-08-31T12:00:00.000Z'
    });
    expect(bundle.kind).toBe('institution-export');
    expect(bundle.cases[0].folio.seal.hash).toBeTruthy();
    const checked = validateImport(bundle, { secret: SECRET });
    expect(checked.ok).toBe(true);
    const again = roundTrip(bundle, { secret: SECRET });
    expect(again.digest).toBe(bundle.digest);
    expect(again.cases[0].hash).toBe(bundle.cases[0].seal.hash);
    const tampered = {
      ...bundle,
      cases: [{
        ...bundle.cases[0],
        folio: {
          ...bundle.cases[0].folio,
          claim: { ...bundle.cases[0].folio.claim, text: 'Compute is abundant.' }
        }
      }]
    };
    expect(() => validateImport(tampered, { secret: SECRET })).toThrow(/does not match its seal/);
  });

  it('blocks deletion under a legal hold and transfers ownership without rewriting the claim', () => {
    const hold = placeHold({
      pageId: page._id,
      kind: 'legal',
      note: 'Keep until the review closes.',
      actorId: 'user-host'
    });
    expect(() => forgetCase({ page, holds: [hold] })).toThrow(PortabilityError);
    expect(() => forgetCase({ page, holds: [hold] })).toThrow(/hold keeps this case/);
    const succession = transferOwnership({
      page,
      fromUserId: 'user-host',
      toUserId: 'user-successor',
      now: '2026-08-31T12:00:00.000Z'
    });
    expect(succession.authorshipIntact).toBe(true);
    expect(succession.claim).toBe(page.judgment.currentJudgment);
    expect(succession.toUserId).toBe('user-successor');
  });
});
