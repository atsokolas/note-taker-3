import { describeReturn, readLastSeen, rememberSeen, __testables } from './publicReturn';

const { newestAt } = __testables;

const delta = (at, summary = 'A revision') => ({ at, summary });

const memory = (seed = {}) => {
  const store = { ...seed };
  return {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    read: () => store
  };
};

/** A browser that refuses to talk about storage at all. */
const hostile = () => ({
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); }
});

const MARCH = '2026-03-01T00:00:00.000Z';
const APRIL = '2026-04-01T00:00:00.000Z';
const MAY = '2026-05-01T00:00:00.000Z';

describe('describeReturn', () => {
  it('says nothing to a reader it has never seen', () => {
    expect(describeReturn({ deltas: [delta(MARCH), delta(APRIL)], lastSeen: null }))
      .toEqual({ line: '', ids: [] });
  });

  it('counts only what arrived after the reader last looked', () => {
    const seen = new Date(MARCH).getTime();
    const result = describeReturn({ deltas: [delta(MARCH), delta(APRIL), delta(MAY)], lastSeen: seen });

    expect(result.line).toBe('2 changes since you were last here.');
    expect(result.ids).toEqual([APRIL, MAY]);
  });

  it('speaks of one change as one', () => {
    expect(describeReturn({ deltas: [delta(MARCH), delta(APRIL)], lastSeen: new Date(MARCH).getTime() }).line)
      .toBe('One change since you were last here.');
  });

  it('stays quiet when the case has not moved since the reader left', () => {
    expect(describeReturn({ deltas: [delta(MARCH)], lastSeen: new Date(MAY).getTime() }))
      .toEqual({ line: '', ids: [] });
  });

  it('stays quiet when there is nothing to have missed', () => {
    expect(describeReturn({ deltas: [], lastSeen: new Date(MARCH).getTime() }))
      .toEqual({ line: '', ids: [] });
  });

  it('ignores a delta with no usable date rather than counting it as new', () => {
    const result = describeReturn({
      deltas: [delta(MARCH), delta('whenever'), delta(APRIL)],
      lastSeen: new Date(MARCH).getTime()
    });
    expect(result.ids).toEqual([APRIL]);
  });
});

describe('remembering a reader', () => {
  it('records the newest change it showed them, not the moment they arrived', () => {
    const store = memory();
    rememberSeen('costco', [delta(MARCH), delta(MAY), delta(APRIL)], store);

    expect(store.read()['noeis:casebook-seen:costco']).toBe(MAY);
    expect(readLastSeen('costco', store)).toBe(new Date(MAY).getTime());
  });

  it('keeps readers of different casebooks apart', () => {
    const store = memory();
    rememberSeen('costco', [delta(MAY)], store);

    expect(readLastSeen('nvidia', store)).toBeNull();
  });

  it('writes nothing when there is nothing to have seen', () => {
    const store = memory();
    rememberSeen('costco', [], store);

    expect(Object.keys(store.read())).toHaveLength(0);
  });

  it('treats a browser that will not talk about storage as a first visit', () => {
    expect(readLastSeen('costco', hostile())).toBeNull();
    expect(() => rememberSeen('costco', [delta(MAY)], hostile())).not.toThrow();
  });

  it('says nothing at all without a casebook to remember', () => {
    const store = memory();
    rememberSeen('', [delta(MAY)], store);

    expect(readLastSeen('', store)).toBeNull();
    expect(Object.keys(store.read())).toHaveLength(0);
  });

  it('picks the newest stamp regardless of the order they arrive in', () => {
    expect(newestAt([delta(MAY), delta(MARCH), delta(APRIL)])).toBe(new Date(MAY).getTime());
    expect(Number.isNaN(newestAt([]))).toBe(true);
  });
});
