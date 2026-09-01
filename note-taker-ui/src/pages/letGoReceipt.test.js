import {
  describeLetGo,
  forgetLetGo,
  readLetGo,
  rememberLetGo,
  LET_GO_WINDOW_MS
} from './letGoReceipt';

const memory = (seed = {}) => {
  const held = { ...seed };
  return {
    getItem: key => (key in held ? held[key] : null),
    setItem: (key, value) => { held[key] = String(value); },
    removeItem: (key) => { delete held[key]; },
    read: () => held
  };
};

const hostile = () => ({
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); }
});

const LET_GO_AT = '2026-09-01T12:00:00.000Z';
const DAY_AFTER = new Date('2026-09-02T12:00:00.000Z').getTime();
const EIGHT_DAYS_ON = new Date('2026-09-09T13:00:00.000Z').getTime();

describe('letting go of a kept thing', () => {
  it('leaves a receipt naming what went', () => {
    const shelf = memory();
    rememberLetGo({ id: 'a1', title: 'The Bitter Lesson', at: LET_GO_AT }, shelf);

    const receipt = readLetGo(shelf, DAY_AFTER);
    expect(receipt.id).toBe('a1');
    expect(describeLetGo(receipt)).toBe('You let go of The Bitter Lesson.');
  });

  it('keeps the way back for seven days', () => {
    const shelf = memory();
    rememberLetGo({ id: 'a1', title: 'The Bitter Lesson', at: LET_GO_AT }, shelf);

    const almost = new Date(LET_GO_AT).getTime() + LET_GO_WINDOW_MS - 1000;
    expect(readLetGo(shelf, almost)).not.toBeNull();
  });

  it('lets go for good on the eighth day', () => {
    const shelf = memory();
    rememberLetGo({ id: 'a1', title: 'The Bitter Lesson', at: LET_GO_AT }, shelf);

    expect(readLetGo(shelf, EIGHT_DAYS_ON)).toBeNull();
  });

  it('forgets the receipt when the reader takes the way back', () => {
    const shelf = memory();
    rememberLetGo({ id: 'a1', title: 'The Bitter Lesson', at: LET_GO_AT }, shelf);
    forgetLetGo(shelf);

    expect(readLetGo(shelf, DAY_AFTER)).toBeNull();
  });

  it('says nothing when nothing has been let go', () => {
    expect(readLetGo(memory(), DAY_AFTER)).toBeNull();
    expect(describeLetGo(null)).toBe('');
  });

  it('writes no receipt for a thing it cannot name', () => {
    const shelf = memory();
    rememberLetGo({ id: 'a1', title: '   ', at: LET_GO_AT }, shelf);
    rememberLetGo({ id: '', title: 'Nameless', at: LET_GO_AT }, shelf);

    expect(Object.keys(shelf.read())).toHaveLength(0);
  });

  it('refuses a receipt it cannot read back as a real day', () => {
    const shelf = memory({ 'noeis:let-go': JSON.stringify({ id: 'a1', title: 'A thing', at: 'whenever' }) });
    expect(readLetGo(shelf, DAY_AFTER)).toBeNull();
  });

  it('survives a browser that will not talk about storage', () => {
    expect(readLetGo(hostile(), DAY_AFTER)).toBeNull();
    expect(() => rememberLetGo({ id: 'a1', title: 'A thing' }, hostile())).not.toThrow();
    expect(() => forgetLetGo(hostile())).not.toThrow();
  });

  it('refuses nonsense rather than throwing on it', () => {
    expect(readLetGo(memory({ 'noeis:let-go': 'not json' }), DAY_AFTER)).toBeNull();
  });
});
