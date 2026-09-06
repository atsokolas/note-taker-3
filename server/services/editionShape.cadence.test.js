const assert = require('assert');

const { normalizeEdition, resolveEditionProfile, windowFor, profileKeysFor } = require('./editionShape');

const iso = (d) => d.toISOString().slice(0, 10);

/* A reader's own topic, shaped the way the router loads them. */
const BIOTECH = {
  biotech: {
    key: 'biotech',
    titleLabel: 'This Month in Biotech',
    issueLabel: 'Issue',
    cadence: 'monthly',
    sections: [
      { key: 'clinical_evidence', label: 'Clinical evidence' },
      { key: 'counterevidence', label: 'Counterevidence' }
    ],
    minItems: 1,
    maxItems: 10
  }
};

const item = (over = {}) => ({
  title: 'A paper', url: 'https://example.com/a', section: 'clinical_evidence',
  finding: 'The trial reported a 12 point improvement.',
  boundary: 'Single site, n=40, no replication.',
  ...over
});

describe('edition cadence', () => {
  // Two agents filing on the same morning must land in the same issue, so the
  // window is derived from the standing cadence rather than sent by the caller.
  it('puts a Wednesday and a Friday of one week in the same weekly issue', () => {
    const wed = windowFor('weekly', new Date('2026-09-09T15:00:00Z'));
    const fri = windowFor('weekly', new Date('2026-09-11T02:00:00Z'));
    assert.deepStrictEqual(iso(wed.windowStart), iso(fri.windowStart));
    assert.deepStrictEqual(iso(wed.windowEnd), iso(fri.windowEnd));
  });

  it('matches the weekly window already filed in production', () => {
    const w = windowFor('weekly', new Date('2026-09-09T15:00:00Z'));
    assert.strictEqual(iso(w.windowStart), '2026-09-06');
    assert.strictEqual(iso(w.windowEnd), '2026-09-12');
  });

  it('gives a daily issue one day and a monthly issue its whole month', () => {
    const d = windowFor('daily', new Date('2026-09-09T23:59:00Z'));
    assert.strictEqual(iso(d.windowStart), '2026-09-09');
    assert.strictEqual(iso(d.windowEnd), '2026-09-09');
    const m = windowFor('monthly', new Date('2026-09-09T15:00:00Z'));
    assert.strictEqual(iso(m.windowStart), '2026-09-01');
    assert.strictEqual(iso(m.windowEnd), '2026-09-30');
  });

  it('separates consecutive days and consecutive months', () => {
    assert.notStrictEqual(
      iso(windowFor('daily', new Date('2026-09-09T00:00:00Z')).windowStart),
      iso(windowFor('daily', new Date('2026-09-10T00:00:00Z')).windowStart)
    );
    assert.notStrictEqual(
      iso(windowFor('monthly', new Date('2026-09-30T23:00:00Z')).windowEnd),
      iso(windowFor('monthly', new Date('2026-10-01T01:00:00Z')).windowEnd)
    );
  });
});

describe("a reader's own edition topics", () => {
  it('resolves alongside the built-in two without displacing them', () => {
    assert.strictEqual(resolveEditionProfile('biotech', { profiles: BIOTECH }).titleLabel, 'This Month in Biotech');
    assert.strictEqual(resolveEditionProfile('this_week_in_ai', { profiles: BIOTECH }).key, 'this_week_in_ai');
    assert(profileKeysFor(BIOTECH).includes('biotech'));
    assert(profileKeysFor(BIOTECH).includes('weekend_readings'));
  });

  it('accepts an edition filed against a configured topic', () => {
    const built = normalizeEdition({
      profile: 'biotech',
      windowStart: '2026-09-01', windowEnd: '2026-09-30',
      items: [item()]
    }, { profiles: BIOTECH });
    assert.strictEqual(built.profile, 'biotech');
    assert.strictEqual(built.title, 'This Month in Biotech');
  });

  it('refuses a section the reader never configured, and names the real ones', () => {
    assert.throws(() => normalizeEdition({
      profile: 'biotech',
      windowStart: '2026-09-01', windowEnd: '2026-09-30',
      items: [item({ section: 'models_methods' })]
    }, { profiles: BIOTECH }), /clinical_evidence, counterevidence/);
  });

  // The rule that separates this from a newsletter holds on every topic a
  // reader invents, not only the two that shipped.
  it('still requires a boundary on a topic the reader invented', () => {
    assert.throws(() => normalizeEdition({
      profile: 'biotech',
      windowStart: '2026-09-01', windowEnd: '2026-09-30',
      items: [item({ boundary: '' })]
    }, { profiles: BIOTECH }), /boundary/);
  });

  it('tells an agent which topics exist when it names one that does not', () => {
    assert.throws(() => normalizeEdition({
      profile: 'quantum',
      windowStart: '2026-09-01', windowEnd: '2026-09-30',
      items: [item()]
    }, { profiles: BIOTECH }), /biotech.*Configure a new one/s);
  });
});
