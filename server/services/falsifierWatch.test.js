const { matchFalsifier, matchesForPage, openFalsifiers, termsOf } = require('./falsifierWatch');

const falsifier = (over = {}) => ({
  falsifierId: 'f1',
  text: 'The capex is a bet on new growth after all.',
  observableSignal: 'Nvidia guides datacenter revenue down two consecutive quarters',
  status: 'unobserved',
  ...over
});

const page = (falsifiers) => ({ _id: 'p1', title: 'Alphabet', judgment: { falsifiers } });

const arrival = (over = {}) => ({
  title: 'Nvidia Q3 earnings call transcript',
  summary: 'Management guides datacenter revenue down for the second consecutive quarter.',
  text: '',
  ...over
});

describe('the words a match can turn on', () => {
  it('drops the words English forces on every sentence', () => {
    const terms = termsOf('The revenue will be down for the quarter');
    expect([...terms].sort()).toEqual(['down', 'quarter', 'revenue']);
  });

  /* The quantity is usually the whole point — a signal that ignored "two"
     would fire on any transcript at all. */
  it('keeps numbers, because the number is the point', () => {
    expect(termsOf('down two quarters running').has('two')).toBe(true);
    expect(termsOf('the 10-K restates it').has('10')).toBe(true);
  });

  it('is not fooled by punctuation or case', () => {
    expect(termsOf('Datacenter REVENUE, down!')).toEqual(termsOf('datacenter revenue down'));
  });
});

describe('does the arrival look like the thing the reader named', () => {
  it('matches on the reader’s own words, and says which', () => {
    const match = matchFalsifier({ falsifier: falsifier(), arrival: arrival() });
    expect(match).toMatchObject({ falsifierId: 'f1' });
    expect(match.matchedTerms).toEqual(expect.arrayContaining(['datacenter', 'down', 'revenue']));
  });

  /* Two shared terms is a coincidence — "quarterly report" matches half a
     corpus. Three is a signal worth a reader's morning. */
  it('will not fire on a coincidence', () => {
    expect(matchFalsifier({
      falsifier: falsifier({ observableSignal: 'Nvidia guides revenue down' }),
      arrival: arrival({ title: 'Costco revenue rises', summary: 'Membership up.' })
    })).toBeNull();
  });

  it('will not fire on a signal too vague to be one', () => {
    expect(matchFalsifier({
      falsifier: falsifier({ observableSignal: 'it changes' }),
      arrival: arrival({ title: 'It changes', summary: 'It changes.' })
    })).toBeNull();
  });

  it('reads the body when the headline gives nothing away', () => {
    const match = matchFalsifier({
      falsifier: falsifier(),
      arrival: arrival({
        title: 'Q3 call',
        summary: '',
        text: 'Nvidia guides datacenter revenue down for two consecutive quarters.'
      })
    });
    expect(match).not.toBeNull();
  });

  it('says the same thing twice, and never says nine things', () => {
    const wordy = falsifier({ observableSignal: 'alpha bravo charlie delta echo foxtrot golf hotel' });
    const noisy = arrival({ title: 'hotel golf foxtrot echo delta charlie bravo alpha', summary: '' });
    const first = matchFalsifier({ falsifier: wordy, arrival: noisy });
    expect(first.matchedTerms).toHaveLength(6);
    expect(matchFalsifier({ falsifier: wordy, arrival: noisy })).toEqual(first);
  });

  it('survives a falsifier or an arrival with nothing in it', () => {
    expect(matchFalsifier({ falsifier: falsifier({ observableSignal: '' }), arrival: arrival() })).toBeNull();
    expect(matchFalsifier({ falsifier: falsifier(), arrival: {} })).toBeNull();
    expect(matchFalsifier({})).toBeNull();
  });
});

describe('which falsifiers are still worth watching', () => {
  /* One that has fired is waiting on a person, not on more evidence. Re-firing
     it every morning turns the one sentence that should stop a reader into
     wallpaper. */
  it('leaves alone the ones that have already fired, or been retired', () => {
    const open = openFalsifiers(page([
      falsifier({ falsifierId: 'open' }),
      falsifier({ falsifierId: 'warned', status: 'warning' }),
      falsifier({ falsifierId: 'fired', status: 'triggered' }),
      falsifier({ falsifierId: 'done', status: 'retired' })
    ]));
    expect(open.map(f => f.falsifierId)).toEqual(['open']);
  });

  it('ignores a falsifier with no signal to look for', () => {
    expect(openFalsifiers(page([falsifier({ observableSignal: '  ' })]))).toEqual([]);
  });

  it('survives a page with no judgment on it at all', () => {
    expect(openFalsifiers({})).toEqual([]);
    expect(openFalsifiers()).toEqual([]);
    expect(matchesForPage({ page: {}, arrival: arrival() })).toEqual([]);
  });

  it('reports every falsifier one arrival could have satisfied', () => {
    const matches = matchesForPage({
      page: page([
        falsifier({ falsifierId: 'a' }),
        falsifier({ falsifierId: 'b', observableSignal: 'datacenter revenue guides down' }),
        falsifier({ falsifierId: 'c', observableSignal: 'Costco membership renewal rate falls' })
      ]),
      arrival: arrival()
    });
    expect(matches.map(m => m.falsifierId)).toEqual(['a', 'b']);
  });
});
