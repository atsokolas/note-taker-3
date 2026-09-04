import {
  QUIET_MORNING,
  anniversaryLine,
  correctionLines,
  disagreementLine,
  obituaryLine,
  paperWeight
} from './paperColumnsModel';

describe('the anniversary', () => {
  /* "September 4, 2024" makes a reader do arithmetic before they feel
     anything, so the years are said out loud. */
  it('counts the years, and says when', () => {
    const line = anniversaryLine({
      text: 'Alphabet capex is defensive.',
      bornAt: '2024-09-04T00:00:00.000Z',
      years: 2,
      pageId: 'p1',
      pageTitle: 'Alphabet'
    });
    expect(line.standfirst).toBe('2 years ago you wrote this down');
    expect(line.footnote).toBe('Entered September 4, 2024 · Not looked at since');
    expect(line.href).toBe('/wiki/p1');
  });

  it('says a year, not 1 years', () => {
    expect(anniversaryLine({ text: 'x', years: 1 }).standfirst).toBe('A year ago you wrote this down');
  });

  it('says nothing at all when there is no claim to ask about', () => {
    expect(anniversaryLine(null)).toBeNull();
    expect(anniversaryLine({ text: '' })).toBeNull();
  });

  it('offers no door when the claim has lost its page', () => {
    expect(anniversaryLine({ text: 'x', years: 1 }).href).toBe('');
  });
});

describe('the disagreement', () => {
  it('names the page and how many sources are against it', () => {
    const line = disagreementLine({ text: 'Inference costs fall', against: 3, pageId: 'p2', pageTitle: 'Compute' });
    expect(line.standfirst).toBe('Your library disagrees with itself');
    expect(line.footnote).toBe('On Compute · 3 sources against it');
  });

  /* "1 source disagrees" reads as a rounding error rather than a fight. */
  it('does not make a fight out of one source', () => {
    expect(disagreementLine({ text: 'x', against: 1, pageTitle: 'Compute' }).footnote).toBe('On Compute');
    expect(disagreementLine({ text: 'x', against: 0, pageTitle: 'Compute' }).footnote).toBe('On Compute');
  });

  it('says nothing when the library agrees with itself', () => {
    expect(disagreementLine(null)).toBeNull();
  });
});

describe('the corrections box', () => {
  it('reads as a sentence about what you did', () => {
    const [line] = correctionLines([{
      key: 'k', text: 'Alphabet capex is defensive.', was: 'retired', became: 'brought it back',
      pageId: 'p1', pageTitle: 'Alphabet', at: '2026-09-01'
    }]);
    expect(line.text).toBe('You retired this, then brought it back.');
    expect(line.claim).toBe('Alphabet capex is defensive.');
    expect(line.footnote).toBe('Alphabet');
  });

  it('drops a half-written correction rather than printing "You  this, then ."', () => {
    expect(correctionLines([{ text: 'x' }, { was: 'retired' }, null])).toEqual([]);
    expect(correctionLines()).toEqual([]);
  });
});

describe('the obituary', () => {
  /* "312 days" is a number. "Ten months" is a feeling. */
  it('speaks in months once the silence is long', () => {
    expect(obituaryLine({ pageTitle: 'Deliberate Practice', days: 312, pageId: 'p3' }).text)
      .toBe('Nothing has been added to Deliberate Practice in 10 months.');
  });

  it('speaks in days while the silence is short', () => {
    expect(obituaryLine({ pageTitle: 'Anchoring', days: 45 }).text)
      .toBe('Nothing has been added to Anchoring in 45 days.');
  });

  it('says nothing when nothing has died', () => {
    expect(obituaryLine(null)).toBeNull();
    expect(obituaryLine({ pageTitle: '' })).toBeNull();
  });
});

describe('how much paper there is', () => {
  /* The point of the whole rebuild: the length says what kind of day it is
     before a word is read. */
  it('weighs only what the morning actually has', () => {
    expect(paperWeight({})).toBe(0);
    expect(paperWeight({ anniversary: { text: 'x' }, corrections: [] })).toBe(1);
    expect(paperWeight({
      anniversary: { text: 'x' }, disagreement: { text: 'y' }, corrections: [{}], obituary: { pageTitle: 'z' }
    })).toBe(4);
  });

  it('does not count an empty corrections box as a column', () => {
    expect(paperWeight({ corrections: [] })).toBe(0);
  });

  /* A morning with nothing to report is not a failure state. */
  it('has something to say about a morning with nothing to say', () => {
    expect(QUIET_MORNING).toMatch(/go and read something/);
  });
});
