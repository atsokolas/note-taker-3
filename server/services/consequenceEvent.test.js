const { ACCEPTED_CLASSES, contractEvent, dedupeEvents, freshness } = require('./consequenceEvent');
const { disposeConsequence, routeOne, selectPaperConsequence } = require('./consequenceRoute');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-31T12:00:00.000Z');

const event = (overrides = {}) => ({
  _id: 'evt-sec-1',
  provider: 'sec-edgar',
  externalId: '0001045810-26-000123',
  title: 'NVIDIA 10-Q',
  text: 'Confirmed signed capacity converts within 90 days.',
  url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/nvda-20260727.htm',
  sourceUpdatedAt: new Date('2026-08-28T00:00:00.000Z'),
  affectedPageIds: ['page-nvda'],
  metadata: {},
  ...overrides
});

const page = (overrides = {}) => ({
  _id: 'page-nvda',
  title: 'NVIDIA',
  createdAt: new Date('2026-01-01'),
  claims: [{
    claimId: 'claim-nvda',
    text: 'NVIDIA demand still outruns deliverable capacity.',
    lastCheckedAt: new Date('2026-08-01')
  }],
  judgment: {
    currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
    falsifiers: [{ falsifierId: 'f-1', text: 'Confirmed signed capacity converts within 90 days.', status: 'unobserved' }],
    why: [{ reasonId: 'w-1', text: 'Lead times and power constrain what can be delivered.' }],
    decisions: [{ decisionId: 'd-1', summary: 'Won’t add until signed capacity converts.', status: 'taken' }],
    dependsOn: []
  },
  ...overrides
});

describe('consequence event contract', () => {
  it('classifies accepted sources and hashes identity before routing', () => {
    const shaped = contractEvent(event(), { now: NOW });
    expect(shaped.class).toBe(ACCEPTED_CLASSES.SEC_FILING);
    expect(shaped.canonicalSourceId).toBe('sec-edgar:0001045810-26-000123');
    expect(shaped.eventIdentity).toMatch(/^sec-edgar:0001045810-26-000123#/);
    expect(shaped.quarantine).toBe(false);
  });

  it('links a correction to the original without minting a second identity', () => {
    const original = contractEvent(event(), { now: NOW });
    const correction = contractEvent(event({
      _id: 'evt-sec-1-corr',
      metadata: { correctsEventId: original.id }
    }), { now: NOW });
    expect(correction.correctsEventId).toBe('evt-sec-1');
    expect(correction.eventIdentity).toBe(original.eventIdentity);
  });

  it('treats unchanged content as one canonical event', () => {
    const first = contractEvent(event({ _id: 'a' }), { now: NOW });
    const second = contractEvent(event({ _id: 'b', createdAt: new Date('2026-08-29') }), { now: NOW });
    const deduped = dedupeEvents([first, second]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('a');
  });

  it('measures freshness against the last accepted evidence clock', () => {
    const shaped = contractEvent(event({ sourceUpdatedAt: new Date('2026-07-01') }), { now: NOW });
    const stale = freshness({
      event: shaped,
      lastAcceptedAt: new Date('2026-08-01'),
      now: NOW
    });
    expect(stale.kind).toBe('stale');
    expect(stale.age).toBe('61 days ago');
  });
});

describe('thin consequence route', () => {
  it('routes one event to one claim, exact passage, and a reversible diff', () => {
    const routed = routeOne({ event: event(), pages: [page()], now: NOW });
    expect(routed.kind).toBe('material');
    expect(routed.mutation).toBe(false);
    expect(routed.preview.passage).toBe('Confirmed signed capacity converts within 90 days.');
    expect(routed.preview.prior).toBe('NVIDIA demand still outruns deliverable capacity.');
    expect(routed.preview.proposed).toContain('2026-08-28');
    expect(routed.preview.proposed).toContain(routed.preview.prior.replace(/[.]$/, ''));
    expect(routed.preview.reversible).toBe(true);
    expect(routed.preview.whatINeed).toMatch(/Accept, narrow, preserve, reject, or defer/);
    expect(routed.preview.dependents).toEqual([]);
  });

  it('previews dependents and does not mutate them', () => {
    const dependent = page({
      _id: 'page-cw',
      claims: [{ claimId: 'claim-cw', text: 'CoreWeave is cheap if compute stays scarce.' }],
      judgment: {
        currentJudgment: 'CoreWeave is cheap if compute stays scarce.',
        dependsOn: [{ pageId: 'page-nvda', note: 'If capacity converts this stops being cheap.' }]
      }
    });
    const routed = routeOne({ event: event(), pages: [page(), dependent], now: NOW });
    expect(routed.preview.dependents).toEqual([
      expect.objectContaining({ pageId: 'page-cw', claim: 'CoreWeave is cheap if compute stays scarce.' })
    ]);
    expect(dependent.judgment.currentJudgment).toBe('CoreWeave is cheap if compute stays scarce.');
  });

  it('puts at most one qualified consequence on the paper', () => {
    const paper = selectPaperConsequence({
      events: [event(), event({ _id: 'evt-2', externalId: '0001045810-26-000124', title: 'Another 10-Q' })],
      pages: [page()],
      now: NOW
    });
    expect(paper.eventId).toBe('evt-sec-1');
    expect(paper.eventTitle).toBe('NVIDIA 10-Q');
  });
});

describe('consequence disposition persist', () => {
  const modelsFor = (held) => {
    const receipts = new Map();
    return {
      WikiPage: {
        findOne: async () => held
      },
      WikiRevision: function Revision(value) {
        Object.assign(this, value);
        this._id = 'rev-1';
      },
      NoeisReceipt: {
        findOne: async ({ receiptId }) => receipts.get(receiptId) || null,
        findOneAndUpdate: async (_query, { $set }) => {
          const stored = { ...$set, receiptId: $set.receiptId };
          receipts.set(stored.receiptId, stored);
          return stored;
        }
      },
      _receipts: receipts
    };
  };

  const heldPage = () => {
    const row = page();
    row.markModified = () => {};
    row.save = async () => row;
    row.toObject = () => JSON.parse(JSON.stringify(row));
    return row;
  };

  beforeAll(() => {
    const Revision = function WikiRevision(value) {
      Object.assign(this, value);
      this._id = 'rev-1';
    };
    modelsFor(heldPage()).WikiRevision = Revision;
  });

  it('accepts a reversible write, keeps prior wording, and schedules review', async () => {
    const held = heldPage();
    const models = modelsFor(held);
    models.WikiRevision = function WikiRevision(value) {
      Object.assign(this, value);
      this._id = 'rev-1';
      this.save = async () => this;
    };
    const routed = routeOne({ event: event(), pages: [held], now: NOW });
    const result = await disposeConsequence({
      models,
      userId: 'user-a',
      preview: routed.preview,
      action: 'accept',
      now: NOW
    });
    expect(result.receipt.status).toBe('accepted');
    expect(result.receipt.provenance.prior).toBe('NVIDIA demand still outruns deliverable capacity.');
    expect(held.judgment.currentJudgment).toContain('Confirmed signed capacity converts within 90 days');
    expect(new Date(result.preview.reviewAt).getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect(result.receipt.provenance.dependentsMutated).toEqual([]);
  });

  it('preserve and reject leave the claim untouched', async () => {
    const held = heldPage();
    const models = modelsFor(held);
    models.WikiRevision = function WikiRevision(value) {
      Object.assign(this, value);
      this.save = async () => this;
    };
    const routed = routeOne({ event: event(), pages: [held], now: NOW });
    await disposeConsequence({
      models, userId: 'user-a', preview: routed.preview, action: 'preserve', now: NOW
    });
    expect(held.judgment.currentJudgment).toBe('NVIDIA demand still outruns deliverable capacity.');
  });
});
