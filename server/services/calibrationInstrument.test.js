const {
  SELECTION,
  SUFFICIENT,
  assertPrivate,
  buildCalibration,
  publicProjection
} = require('./calibrationInstrument');

const ownerPages = [
  {
    _id: 'p1',
    userId: 'user-host',
    judgment: {
      currentJudgment: 'Compute stays scarce.',
      confidence: 'certain',
      bornAt: '2026-01-01T00:00:00.000Z',
      verdicts: [{ result: 'held_up', recordedAt: '2026-03-01T00:00:00.000Z' }]
    }
  },
  {
    _id: 'p2',
    userId: 'user-host',
    judgment: {
      currentJudgment: 'Conversion holds.',
      confidence: 0.82,
      bornAt: '2025-01-01T00:00:00.000Z',
      outcomes: [{ result: 'broke', observedAt: '2026-02-01T00:00:00.000Z' }]
    }
  },
  {
    _id: 'p-other',
    userId: 'stranger',
    judgment: {
      currentJudgment: 'A stranger claim.',
      confidence: 'certain',
      verdicts: [{ result: 'held_up', recordedAt: '2026-08-01T00:00:00.000Z' }]
    }
  }
];

const plenty = Array.from({ length: SUFFICIENT }, (_, index) => ({
  _id: `enough-${index}`,
  userId: 'user-host',
  judgment: {
    currentJudgment: `Held sentence ${index}.`,
    confidence: 'certain',
    bornAt: '2026-01-01T00:00:00.000Z',
    verdicts: [{ result: index % 2 ? 'broke' : 'held_up', recordedAt: '2026-04-01T00:00:00.000Z' }]
  }
}));

describe('private longitudinal calibration', () => {
  it('stays on the owner page and names the selection effect', () => {
    const instrument = buildCalibration(ownerPages, { userId: 'user-host' });
    expect(instrument.private).toBe(true);
    expect(instrument.ownerId).toBe('user-host');
    expect(instrument.selection).toBe(SELECTION);
    expect(instrument.cases.every((row) => row.pageId !== 'p-other')).toBe(true);
    expect(JSON.stringify(instrument)).not.toMatch(/stranger|leaderboard|rank|shame/i);
    expect(assertPrivate(instrument, 'stranger')).toEqual(publicProjection());
    expect(assertPrivate(instrument, 'user-host').cases.length).toBe(2);
  });

  it('stays silent below the sufficient-sample threshold and speaks with a range after', () => {
    const sparse = buildCalibration(ownerPages, { userId: 'user-host' });
    expect(sparse.overall.sufficient).toBe(false);
    expect(sparse.overall.range.low).toBeNull();
    expect(sparse.overall.silence).toMatch(/Too few named outcomes/);
    const full = buildCalibration(plenty, { userId: 'user-host' });
    expect(full.overall.sufficient).toBe(true);
    expect(full.overall.n).toBe(SUFFICIENT);
    expect(full.overall.range.low).toBeGreaterThanOrEqual(0);
    expect(full.overall.range.high).toBeLessThanOrEqual(1);
    expect(full.byConfidence.find((row) => row.confidence === 'certain').n).toBe(SUFFICIENT);
    expect(JSON.stringify(full)).not.toMatch(/leaderboard|percentile|elo/i);
  });
});
