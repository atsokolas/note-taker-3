import {
  anniversaryLine,
  askedLine,
  calibrationLine,
  closingGroups,
  closingLines,
  correctionLines,
  disagreementLine,
  obituaryLine,
  oldestOpenLine,
  paperWeight,
  quietMorning,
  quietStreakLine,
  rightForWrongReasonsLine,
  warnedLine
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
    expect(quietMorning()).toMatch(/go and read something/);
  });

  /* "It's Saturday" is a reason. "A quiet morning" is a report. The weekend
     line does not send you off to read, because that is what the day is for. */
  it('names the day on a weekend, and stops sending you to read', () => {
    const saturday = Date.UTC(2026, 8, 5, 12);
    expect(quietMorning({ weekend: true, now: saturday })).toBe('It’s Saturday. Nothing is asking for you.');
    expect(quietMorning({ weekend: true, now: saturday + 24 * 60 * 60 * 1000 })).toMatch(/^It’s Sunday\./);
    expect(quietMorning({ weekend: true, now: saturday })).not.toMatch(/read something/);
  });
});

describe('the paper counting its own asking', () => {
  /* Showing a thing a fourth time is a re-read. Saying it is the fourth time
     is a confrontation. */
  it('says which morning this is, once it is worth saying', () => {
    expect(askedLine(2)).toBe('The third morning I have asked.');
    expect(askedLine(3)).toBe('The fourth morning I have asked.');
    expect(askedLine(7)).toBe('The 8th morning I have asked.');
  });

  /* "I have asked this once before" is a fact about the software, not about
     the reader. */
  it('stays quiet until asking twice becomes a pattern', () => {
    expect(askedLine(0)).toBe('');
    expect(askedLine(1)).toBe('');
    expect(askedLine()).toBe('');
  });
});

describe('what closed since the paper last asked', () => {
  it('names what you did, per kind', () => {
    expect(closingLines([{ kind: 'anniversary', label: 'Alphabet', day: '2026-09-01', pageId: 'p1' }])[0])
      .toMatchObject({ text: 'You went back to it: Alphabet.', href: '/wiki/p1' });
    expect(closingLines([{ kind: 'disagreement', label: 'Compute', day: '2026-09-01' }])[0].text)
      .toBe('You settled it: Compute.');
    expect(closingLines([{ kind: 'obituary', label: 'Anchoring', day: '2026-09-01' }])[0].text)
      .toBe('You wrote on it again: Anchoring.');
  });

  /* Gone is not the same as answered, and offering a door to a page that no
     longer exists is worse than saying so. */
  it('says when the thing is gone, and offers no door to it', () => {
    const [line] = closingLines([{ kind: 'obituary', label: 'Old page', day: '2026-09-01', pageId: 'p9', vanished: true }]);
    expect(line.text).toBe('Old page is gone. The paper was still asking about it.');
    expect(line.href).toBe('');
  });

  /* Answered is a follow-up. Vanished is a correction in the sense a
     newspaper means it — we printed a thing and the thing was not there. */
  it('tells a follow-up from a correction', () => {
    const groups = closingGroups([
      { kind: 'anniversary', label: 'Alphabet', day: '2026-09-01', pageId: 'p1' },
      { kind: 'obituary', label: 'Old page', day: '2026-09-02', pageId: 'p9', vanished: true }
    ]);
    expect(groups.answered.map(l => l.text)).toEqual(['You went back to it: Alphabet.']);
    expect(groups.corrections.map(l => l.text)).toEqual(['Old page is gone. The paper was still asking about it.']);
  });

  it('has neither when nothing closed', () => {
    expect(closingGroups([])).toEqual({ answered: [], corrections: [] });
    expect(closingGroups()).toEqual({ answered: [], corrections: [] });
  });

  it('drops a closing it cannot name', () => {
    expect(closingLines([{ kind: 'anniversary' }, { label: 'No day' }, null])).toEqual([]);
    expect(closingLines()).toEqual([]);
  });
});

describe('the thing you said would change your mind', () => {
  /* Two verbs on purpose: the software found a resemblance between words the
     reader wrote and words that arrived. It has not read the source. */
  it('hands the ruling back to the reader', () => {
    const line = warnedLine({
      text: 'The capex is a bet on new growth after all.',
      signal: 'Nvidia guides datacenter revenue down two quarters',
      pageId: 'p1',
      pageTitle: 'Alphabet'
    });
    expect(line.standfirst).toBe('The thing you said would change your mind may have happened');
    expect(line.footnote).toBe('On Alphabet · Read it, then say: held, or broke');
    expect(line.href).toBe('/judgment/p1');
  });

  it('says nothing when nothing has been matched', () => {
    expect(warnedLine(null)).toBeNull();
    expect(warnedLine({ text: '' })).toBeNull();
  });
});

describe('how your confidence met later outcomes', () => {
  /* A percentage invites a target, and a target invites gaming the one
     instrument that only works when nobody is performing for it. */
  it('counts, and never scores', () => {
    const line = calibrationLine({ confidence: 'certain', held: 7, of: 9 });
    expect(line.text).toBe('When you said “certain”, it held 7 of 9 times.');
    expect(line.text).not.toMatch(/%|\d+\.\d/);
    expect(line.href).toBe('/judgment/mirror');
  });

  it('stays silent when the instrument had nothing to say', () => {
    expect(calibrationLine(null)).toBeNull();
    expect(calibrationLine({ confidence: 'certain', of: 0 })).toBeNull();
  });
});

describe('the small details', () => {
  /* "A year ago today" is an anniversary. "A year ago" is a fact. */
  it('says today when it is the day itself', () => {
    expect(anniversaryLine({ text: 'x', years: 1, toTheDay: true }).standfirst)
      .toBe('A year ago today you wrote this down');
    expect(anniversaryLine({ text: 'x', years: 2, toTheDay: true }).standfirst)
      .toBe('2 years ago today you wrote this down');
    expect(anniversaryLine({ text: 'x', years: 1 }).standfirst)
      .toBe('A year ago you wrote this down');
  });

  /* One quiet day is rest; a two-day streak is a weekend. */
  it('calls a run of quiet mornings only once it is a run', () => {
    expect(quietStreakLine(5)).toBe('5 quiet mornings in a row. The corpus has gone cold.');
    expect(quietStreakLine(3)).toBe('');
    expect(quietStreakLine(0)).toBe('');
    expect(quietStreakLine()).toBe('');
  });

  it('names the oldest open question, once it is genuinely old', () => {
    expect(oldestOpenLine({ text: 'Does it scale?', days: 94, pageId: 'p1' }))
      .toMatchObject({ text: 'Your oldest open question is 94 days old.', href: '/wiki/p1' });
    expect(oldestOpenLine({ text: 'Fresh', days: 3 })).toBeNull();
    expect(oldestOpenLine(null)).toBeNull();
  });

  /* The only software that lets a person admit this should say so. */
  it('prints right-for-the-wrong-reasons deadpan', () => {
    const line = rightForWrongReasonsLine({ claim: 'Capex is defensive.', pageTitle: 'Alphabet', pageId: 'p1' });
    expect(line.text).toBe('You were right about Alphabet — for the wrong reasons.');
    expect(line.href).toBe('/judgment/p1');
    expect(rightForWrongReasonsLine(null)).toBeNull();
  });
});
