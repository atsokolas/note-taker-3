const { matchFalsifier, matchesForPage, openSignals, termsOf } = require('./falsifierWatch');

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
    const open = openSignals(page([
      falsifier({ falsifierId: 'open' }),
      falsifier({ falsifierId: 'warned', status: 'warning' }),
      falsifier({ falsifierId: 'fired', status: 'triggered' }),
      falsifier({ falsifierId: 'done', status: 'retired' })
    ]));
    expect(open.map(f => f.falsifierId)).toEqual(['open']);
  });

  it('ignores a falsifier with no signal to look for', () => {
    expect(openSignals(page([falsifier({ observableSignal: '  ' })]))).toEqual([]);
  });

  it('survives a page with no judgment on it at all', () => {
    expect(openSignals({})).toEqual([]);
    expect(openSignals()).toEqual([]);
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

describe('the prompt readers actually answer', () => {
  /* The watcher was built against judgment.falsifiers, written by one bare
     input in the living-thesis editor. "What would change your mind" writes
     claims[].resolutionCriteria, and nothing joined them — so the watcher
     listened in a room almost nobody writes in. */
  const withCriteria = (over = {}) => ({
    _id: 'p1',
    title: 'Alphabet',
    claims: [{
      claimId: 'c1',
      text: 'Alphabet capex is defensive.',
      resolutionCriteria: 'Nvidia guides datacenter revenue down two quarters',
      ...over
    }],
    judgment: { falsifiers: [] }
  });

  it('watches what the reader answered, not only what the editor wrote', () => {
    const signals = openSignals(withCriteria());
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: 'claim', claimId: 'c1' });
  });

  it('matches an arrival against a criteria answer, and says which claim', () => {
    const [match] = matchesForPage({ page: withCriteria(), arrival: arrival() });
    expect(match).toMatchObject({ kind: 'claim', claimId: 'c1' });
  });

  /* Once the answer has a falsifier of its own it is watched through that,
     and offering both would warn twice for one belief. */
  it('does not watch a claim twice once its falsifier exists', () => {
    const page = withCriteria();
    page.judgment.falsifiers = [{
      falsifierId: 'claim-c1',
      text: 'Alphabet capex is defensive.',
      observableSignal: 'Nvidia guides datacenter revenue down two quarters',
      status: 'unobserved',
      affectedClaimIds: ['c1']
    }];
    const signals = openSignals(page);
    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe('falsifier');
  });

  /* A belief you dropped is not watching for anything. */
  it('stops watching a retired claim', () => {
    expect(openSignals(withCriteria({ checkInStatus: 'retired' }))).toEqual([]);
    expect(openSignals(withCriteria({ retiredAt: new Date().toISOString() }))).toEqual([]);
  });

  it('ignores a claim that named no criteria', () => {
    expect(openSignals(withCriteria({ resolutionCriteria: '  ' }))).toEqual([]);
  });
});
