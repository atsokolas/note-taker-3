import { formatClaimBornAt, resolveClaimBornAt } from './claimBornAt';

const created = '2026-02-01T12:00:00.000Z';
const historyAt = '2026-01-15T12:00:00.000Z';
const pageCreated = '2025-11-01T12:00:00.000Z';
const now = '2026-08-31T12:00:00.000Z';

describe('claimBornAt', () => {
  it('backfills from createdAt and history, never Unknown', () => {
    expect(resolveClaimBornAt({ createdAt: created }, { now }).toISOString()).toBe(created);
    expect(resolveClaimBornAt({
      history: [{ event: 'created', at: historyAt }, { event: 'updated', at: now }]
    }, { now }).toISOString()).toBe(historyAt);
    expect(resolveClaimBornAt({}, { pageCreatedAt: pageCreated, now }).toISOString()).toBe(pageCreated);
    expect(formatClaimBornAt({ createdAt: created })).not.toMatch(/unknown/i);
    expect(formatClaimBornAt({ createdAt: created }).length).toBeGreaterThan(0);
    expect(formatClaimBornAt({})).toBe('');
    expect(formatClaimBornAt({})).not.toMatch(/unknown/i);
  });
});
