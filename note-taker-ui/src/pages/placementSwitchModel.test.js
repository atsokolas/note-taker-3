import {
  clockCap,
  homeLabel,
  pressPosition,
  rowKeyAction,
  stripOptions,
  switchPositions
} from './placementSwitchModel';

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime();
const day = (iso) => `${iso}T12:00:00.000Z`;

describe('the switch', () => {
  it('offers three positions and lights exactly one', () => {
    const positions = switchPositions({ placement: 'later' });
    expect(positions.map(p => p.position)).toEqual(['stream', 'later', 'setAside']);
    expect(positions.filter(p => p.active)).toHaveLength(1);
    expect(positions.find(p => p.active).position).toBe('later');
  });

  /* Home is only a position when there is something to come home from. A
     piece already home showed it anyway: a third of the control, permanently
     lit, doing nothing when pressed — which on an ordinary source, meaning
     nearly all of them, was the whole of what the reader saw. */
  it('offers only the two piles to a piece that is already home', () => {
    const positions = switchPositions({ placement: 'stream' });
    expect(positions.map(p => p.position)).toEqual(['later', 'setAside']);
    expect(positions.some(p => p.active)).toBe(false);
  });

  it('says nothing about home to a piece nobody has placed', () => {
    expect(switchPositions({}).map(p => p.position)).toEqual(['later', 'setAside']);
  });

  it('names the home it would actually return to', () => {
    expect(homeLabel({})).toBe('HOME');
    expect(homeLabel({ folderName: 'Costco', asFeed: true })).toBe('COSTCO');
    // A folder you have not screened is not a home of its own.
    expect(homeLabel({ folderName: 'Investing', asFeed: false })).toBe('HOME');
  });

  it('sends a piece home when you press the position it already sits in', () => {
    expect(pressPosition({ placement: 'later', pressed: 'later' })).toBe('stream');
    expect(pressPosition({ placement: 'later', pressed: 'setAside' })).toBe('setAside');
    expect(pressPosition({ placement: 'stream', pressed: 'stream' })).toBe('stream');
  });
});

describe('the clock cap', () => {
  it('exists only while the piece is parked', () => {
    expect(clockCap({ placement: 'stream', dueAt: day('2026-10-06'), now: NOW })).toBeNull();
    expect(clockCap({ placement: 'later', dueAt: day('2026-10-06'), now: NOW })).not.toBeNull();
    expect(clockCap({ placement: 'setAside', dueAt: null, now: NOW })).not.toBeNull();
  });

  it('prints the promised day in the product’s one time word', () => {
    expect(clockCap({ placement: 'later', dueAt: day('2026-10-06'), now: NOW }).day).toBe('TUE');
    expect(clockCap({ placement: 'later', dueAt: day('2026-11-01'), now: NOW }).day).toBe('NOV 1');
  });

  it('marks a recurring promise', () => {
    expect(clockCap({ placement: 'later', dueAt: day('2026-10-05'), recurring: true, now: NOW }).day)
      .toBe('MON ↻');
  });

  it('says nothing rather than inventing a day for a parked piece with no promise', () => {
    const cap = clockCap({ placement: 'later', dueAt: null, now: NOW });
    expect(cap.day).toBe('');
    expect(cap.promised).toBe(false);
  });
});

describe('the return strip', () => {
  const presets = [
    { id: 'tomorrow', label: 'Tomorrow', dueAt: day('2026-10-02'), cadence: null },
    { id: 'every-monday', label: 'Every Monday', dueAt: day('2026-10-05'), cadence: 'weekly' }
  ];

  it('offers the presets, then a date, then no clock', () => {
    expect(stripOptions(presets).map(o => o.id))
      .toEqual(['tomorrow', 'every-monday', 'a-date', 'no-clock', 'in-place']);
  });

  it('ends with the honest escape: a nudge that moves nothing', () => {
    const last = stripOptions(presets).at(-1);
    expect(last.label).toBe('Just remind me — leave it where it is');
    expect(last.inPlace).toBe(true);
  });

  it('keeps a recurring preset’s cadence, which is what makes it recur', () => {
    expect(stripOptions(presets).find(o => o.id === 'every-monday').cadence).toBe('weekly');
  });

  it('still offers a way to set one when there are no presets to offer', () => {
    expect(stripOptions([]).map(o => o.id)).toEqual(['a-date', 'no-clock', 'in-place']);
  });
});

describe('single letters on a focused row', () => {
  it('moves the piece', () => {
    expect(rowKeyAction('h')).toEqual({ kind: 'place', placement: 'stream' });
    expect(rowKeyAction('l')).toEqual({ kind: 'place', placement: 'later' });
    expect(rowKeyAction('s')).toEqual({ kind: 'place', placement: 'setAside' });
  });

  it('keeps the vow on its own letter, because it is not a position', () => {
    expect(rowKeyAction('k')).toEqual({ kind: 'keep' });
  });

  it('opens the strip without moving anything', () => {
    expect(rowKeyAction('r')).toEqual({ kind: 'strip' });
  });

  it('ignores every other key rather than guessing', () => {
    expect(rowKeyAction('x')).toBeNull();
    expect(rowKeyAction('')).toBeNull();
    expect(rowKeyAction()).toBeNull();
  });

  it('does not care about the shift key', () => {
    expect(rowKeyAction('L')).toEqual({ kind: 'place', placement: 'later' });
  });
});
