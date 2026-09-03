import {
  clockCap,
  homeName,
  pressPosition,
  rowKeyAction,
  stripOptions,
  switchPositions
} from './placementSwitchModel';

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime();
const day = (iso) => `${iso}T12:00:00.000Z`;

describe('the switch', () => {
  /* Two piles, not three positions. The third was home, and home is not a
     place you send something — it is where a thing is when you have not sent
     it anywhere. Drawn as an option it was permanently lit and did nothing on
     the vast majority of sources, which are not parked at all. */
  it('offers the two piles a piece can be sent to', () => {
    expect(switchPositions({ placement: 'stream' }).map(p => p.position))
      .toEqual(['later', 'setAside']);
    expect(switchPositions({}).map(p => p.label)).toEqual(['LATER', 'SET ASIDE']);
  });

  it('presses exactly the pile the piece is in, and none when it is home', () => {
    expect(switchPositions({ placement: 'later' }).filter(p => p.active).map(p => p.position))
      .toEqual(['later']);
    expect(switchPositions({ placement: 'stream' }).some(p => p.active)).toBe(false);
  });

  /* Pressing the lit pile has sent a piece home since the switch was written,
     and nothing ever said so — which is why it needed a second control to
     spell it out. The button says it now. */
  it('says what pressing will do, including the way back', () => {
    const home = switchPositions({ placement: 'stream' });
    expect(home.map(p => p.phrase)).toEqual(['Put it in later', 'Put it in set aside']);

    const parked = switchPositions({ placement: 'later' });
    expect(parked.find(p => p.active).phrase).toBe('Take it back home');
    expect(parked.find(p => !p.active).phrase).toBe('Put it in set aside');
  });

  it('names the screened folder it would go back to', () => {
    const parked = switchPositions({ placement: 'setAside', folderName: 'Costco', asFeed: true });
    expect(parked.find(p => p.active).phrase).toBe('Take it back to Costco');
  });

  it('does not name a folder nobody screened, because that is not a home', () => {
    expect(homeName({ folderName: 'Investing', asFeed: false })).toBe('');
    expect(homeName({})).toBe('');
    expect(homeName({ folderName: 'Costco', asFeed: true })).toBe('Costco');
  });

  it('sends a piece home when you press the pile it already sits in', () => {
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
