import {
  NOEIS_LOOP_IDS,
  latestLoopReceipt,
  validateLoopStatusEnvelope
} from './noeisLoopModel';

const loop = (id, overrides = {}) => ({
  id,
  status: 'idle',
  reason: 'Nothing is due.',
  updatedAt: null,
  href: '/wiki',
  receipt: null,
  metrics: {},
  ...overrides
});

const envelope = () => ({
  schemaVersion: 1,
  generatedAt: '2026-08-22T12:00:00.000Z',
  loops: Object.fromEntries(NOEIS_LOOP_IDS.map(id => [id, loop(id)]))
});

describe('noeisLoopModel', () => {
  it('accepts exactly the four stable loop identities', () => {
    const result = validateLoopStatusEnvelope(envelope());
    expect(Object.keys(result.loops).sort()).toEqual([...NOEIS_LOOP_IDS].sort());
  });

  it.each([
    ['missing loop', value => { delete value.loops['loop.weekly-ai']; }],
    ['unknown loop', value => { value.loops['loop.other'] = loop('loop.other'); }],
    ['unknown state', value => { value.loops['loop.morning-paper'].status = 'probably'; }],
    ['blank reason', value => { value.loops['loop.outcome-review'].reason = ''; }]
  ])('fails closed on %s', (_label, mutate) => {
    const value = envelope();
    mutate(value);
    expect(() => validateLoopStatusEnvelope(value)).toThrow(/loop|malformed/i);
  });

  it('selects the latest durable receipt without inventing a session receipt', () => {
    const value = envelope();
    value.loops['loop.morning-paper'].receipt = { id: 'old', completedAt: '2026-08-21T12:00:00.000Z' };
    value.loops['loop.wiki-maintenance'].receipt = { id: 'new', completedAt: '2026-08-22T12:00:00.000Z' };
    expect(latestLoopReceipt(value.loops)).toEqual(expect.objectContaining({
      loopId: 'loop.wiki-maintenance',
      receipt: expect.objectContaining({ id: 'new' })
    }));
  });
});
