const {
  anniversary,
  calibration,
  firstWeek,
  isNewReader,
  corrections,
  disagreement,
  obituary,
  paperColumns,
  warned
} = require('./paperColumns');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 4);
const ago = days => new Date(NOW - days * DAY).toISOString();

const claim = (over = {}) => ({
  claimId: 'c1',
  text: 'Alphabet capex is defensive, not offensive.',
  support: 'supported',
  bornAt: ago(400),
  history: [],
  verdicts: [],
  ...over
});

const page = (over = {}) => ({
  _id: 'p1',
  title: 'Alphabet',
  updatedAt: ago(1),
  claims: [claim()],
  sourceRefs: [{ _id: 's1' }],
  ...over
});

describe('the anniversary', () => {
  /* Every reading app can show you a highlight from last March. Only this one
     can show you a belief and ask whether you still hold it. */
  it('finds a belief you have not looked at in a year', () => {
    const found = anniversary({ pages: [page()], now: NOW });
    expect(found).toMatchObject({ pageId: 'p1', pageTitle: 'Alphabet', years: 1 });
    expect(found.text).toMatch(/Alphabet capex/);
  });

  /* A claim you reaffirmed last month is settled. The paper has nothing to
     ask about it. */
  it('leaves alone the ones you have already gone back to', () => {
    const revisited = page({ claims: [claim({ lastCheckedAt: ago(30) })] });
    expect(anniversary({ pages: [revisited], now: NOW })).toBeNull();
    const inHistory = page({ claims: [claim({ history: [{ at: ago(20), action: 'reaffirmed' }] })] });
    expect(anniversary({ pages: [inHistory], now: NOW })).toBeNull();
  });

  it('does not ask about a claim you already retired', () => {
    expect(anniversary({ pages: [page({ claims: [claim({ checkInStatus: 'retired' })] })], now: NOW })).toBeNull();
    expect(anniversary({ pages: [page({ claims: [claim({ retiredAt: ago(5) })] })], now: NOW })).toBeNull();
  });

  it('waits until a belief is actually old', () => {
    expect(anniversary({ pages: [page({ claims: [claim({ bornAt: ago(200) })] })], now: NOW })).toBeNull();
  });

  it('falls back to when the claim was created if nobody set bornAt', () => {
    const found = anniversary({ pages: [page({ claims: [claim({ bornAt: null, createdAt: ago(800) })] })], now: NOW });
    expect(found?.years).toBe(2);
  });

  /* A front page that reshuffles when you refresh is a feed wearing a
     masthead. */
  it('gives the same morning the same claim, and does not pin one forever', () => {
    const many = page({
      claims: [claim({ claimId: 'a' }), claim({ claimId: 'b' }), claim({ claimId: 'c' })]
    });
    /* Stable within the day: refreshing must not deal a new hand. */
    const today = anniversary({ pages: [many], now: NOW });
    expect(anniversary({ pages: [many], now: NOW + 1000 })).toEqual(today);
    expect(anniversary({ pages: [many], now: NOW + 23 * 60 * 60 * 1000 })).toEqual(today);

    /* Which claim a given day lands on is a hash, so asking two named days to
       differ would be testing a collision. The property that matters is that
       the column moves around the shelf over a run of mornings. */
    const overAFortnight = new Set(
      Array.from({ length: 14 }, (_, day) => anniversary({ pages: [many], now: NOW + day * DAY })?.claimId)
    );
    expect(overAFortnight.size).toBeGreaterThan(1);
  });

  it('says nothing rather than something when there is nothing', () => {
    expect(anniversary({ pages: [], now: NOW })).toBeNull();
    expect(anniversary()).toBeNull();
  });
});

describe('quoting a claim on the front page', () => {
  /* Claims in a real corpus run to whole paragraphs. The first disagreement
     this column ever printed ended "...balancing conviction with a", which
     reads as broken software rather than as an excerpt. */
  it('cuts a long claim at a word, and marks that there is more', () => {
    const long = 'Research Week centers on a pattern of risk-aware learning and iterative strategy refinement, as evidenced by repeated emphasis on minimizing losses and avoiding catastrophic errors in investment and operational contexts, with sources highlighting the necessity of balancing conviction with humility.';
    const found = anniversary({ pages: [page({ claims: [claim({ text: long })] })], now: NOW });
    expect(found.text.length).toBeLessThan(long.length);
    expect(found.text).toMatch(/\u2026$/);
    expect(found.text).not.toMatch(/\s\S{1,2}\u2026$/);
    expect(long.startsWith(found.text.replace(/\u2026$/, '').trim())).toBe(true);
  });

  it('leaves a claim that already fits exactly as written', () => {
    const short = 'Alphabet capex is defensive, not offensive.';
    expect(anniversary({ pages: [page({ claims: [claim({ text: short })] })], now: NOW }).text).toBe(short);
  });
});

describe('the disagreement', () => {
  /* Two things you trusted enough to save, that cannot both be right. */
  it('finds a claim your own sources contradict', () => {
    const conflicted = page({ claims: [claim({ contradictedByCitationIds: ['x', 'y'] })] });
    expect(disagreement({ pages: [conflicted], now: NOW })).toMatchObject({ pageTitle: 'Alphabet', against: 2 });
  });

  it('counts a claim marked conflicted as a disagreement too', () => {
    expect(disagreement({ pages: [page({ claims: [claim({ support: 'conflicted' })] })], now: NOW }))
      .toMatchObject({ pageId: 'p1' });
  });

  it('stays quiet when your library agrees with itself', () => {
    expect(disagreement({ pages: [page()], now: NOW })).toBeNull();
  });
});

describe('the corrections box', () => {
  /* Not a memory of what the paper printed — a reading of what happened. */
  it('prints a claim you retired and then brought back', () => {
    const reversed = page({
      claims: [claim({
        history: [
          { at: ago(20), action: 'retired' },
          { at: ago(3), action: 'restored' }
        ]
      })]
    });
    const [correction] = corrections({ pages: [reversed], now: NOW });
    expect(correction).toMatchObject({ was: 'retired', became: 'brought it back', pageTitle: 'Alphabet' });
  });

  it('prints a verdict that reversed itself', () => {
    const reversed = page({
      claims: [claim({ history: [{ at: ago(15), action: 'held_up' }, { at: ago(2), action: 'broke' }] })]
    });
    expect(corrections({ pages: [reversed], now: NOW })[0])
      .toMatchObject({ was: 'said it held up', became: 'recorded that it broke' });
  });

  /* A correction is news. Something you undid three months ago is history. */
  it('forgets a reversal once it is old', () => {
    const stale = page({
      claims: [claim({ history: [{ at: ago(120), action: 'retired' }, { at: ago(90), action: 'restored' }] })]
    });
    expect(corrections({ pages: [stale], now: NOW })).toEqual([]);
  });

  it('is not a correction when nothing was undone', () => {
    expect(corrections({ pages: [page({ claims: [claim({ history: [{ at: ago(2), action: 'restored' }] })] })], now: NOW }))
      .toEqual([]);
    expect(corrections({ pages: [page()], now: NOW })).toEqual([]);
  });

  it('runs the newest first, and keeps the box short', () => {
    const busy = page({
      claims: [
        claim({ claimId: 'a', history: [{ at: ago(18), action: 'retired' }, { at: ago(9), action: 'restored' }] }),
        claim({ claimId: 'b', history: [{ at: ago(17), action: 'retired' }, { at: ago(1), action: 'restored' }] }),
        claim({ claimId: 'c', history: [{ at: ago(16), action: 'reaffirmed' }, { at: ago(5), action: 'revised' }] })
      ]
    });
    const box = corrections({ pages: [busy], now: NOW });
    expect(box).toHaveLength(2);
    expect(new Date(box[0].at) > new Date(box[1].at)).toBe(true);
  });
});

describe('the obituary', () => {
  it('names the page that has gone longest without a word', () => {
    const shelf = [
      page({ _id: 'p1', title: 'Recent', updatedAt: ago(10) }),
      page({ _id: 'p2', title: 'Deliberate Practice', updatedAt: ago(300) }),
      page({ _id: 'p3', title: 'Quiet', updatedAt: ago(100) })
    ];
    expect(obituary({ pages: shelf, now: NOW })).toMatchObject({ pageTitle: 'Deliberate Practice', days: 300 });
  });

  /* A page with nothing in it was never alive, so it has not died — and an
     obituary for it would be a joke at the reader's expense. */
  it('will not bury a page that was never alive', () => {
    const empty = page({ updatedAt: ago(300), claims: [], sourceRefs: [] });
    expect(obituary({ pages: [empty], now: NOW })).toBeNull();
  });

  it('leaves a page alone until the silence is real', () => {
    expect(obituary({ pages: [page({ updatedAt: ago(20) })], now: NOW })).toBeNull();
  });

  it('does not bury what you already archived', () => {
    expect(obituary({ pages: [page({ updatedAt: ago(300), status: 'archived' })], now: NOW })).toBeNull();
  });
});

describe('the whole front page', () => {
  /* A morning with nothing to say prints nothing, which is what makes the
     paper short on a quiet day. */
  it('says nothing at all about a quiet morning', () => {
    expect(paperColumns({ pages: [page({ claims: [claim({ bornAt: ago(3) })], updatedAt: ago(1) })], now: NOW }))
      .toEqual({
        warned: null,
        calibration: null,
        /* A corpus a year old is not in its first week, so this is silent —
           which is the point: the first-week column stops the moment the
           year-scale ones can speak. */
        firstWeek: null,
        oldestOpen: null,
        rightForWrongReasons: null,
        anniversary: null,
        disagreement: null,
        corrections: [],
        obituary: null
      });
    expect(paperColumns()).toMatchObject({ anniversary: null, corrections: [] });
  });

  it('survives a shelf full of half-written pages', () => {
    const junk = [null, {}, { _id: 'x' }, { title: 'No id' }, page({ claims: [{ text: '' }] })];
    expect(() => paperColumns({ pages: junk, now: NOW })).not.toThrow();
  });
});

describe('the thing you said would change your mind', () => {
  const falsifier = (over = {}) => ({
    falsifierId: 'f1',
    text: 'The capex is a bet on new growth after all.',
    observableSignal: 'Nvidia guides datacenter revenue down two quarters',
    status: 'warning',
    lastCheckedAt: ago(1),
    ...over
  });
  const judged = (falsifiers) => page({ judgment: { falsifiers } });

  it('prints a falsifier a watcher matched', () => {
    expect(warned({ pages: [judged([falsifier()])] }))
      .toMatchObject({ pageId: 'p1', pageTitle: 'Alphabet', falsifierId: 'f1' });
  });

  /* Unobserved is nothing to say. Triggered and retired are already answered
     — reprinting them every morning turns the one sentence that should stop a
     reader into wallpaper. */
  it('speaks only for the ones actually warned', () => {
    ['unobserved', 'triggered', 'retired'].forEach((status) => {
      expect(warned({ pages: [judged([falsifier({ status })])] })).toBeNull();
    });
  });

  /* Two of these on one morning is not twice the signal, it is a queue. */
  it('prints one, the newest', () => {
    const found = warned({ pages: [judged([
      falsifier({ falsifierId: 'old', lastCheckedAt: ago(9) }),
      falsifier({ falsifierId: 'new', lastCheckedAt: ago(1) })
    ])] });
    expect(found.falsifierId).toBe('new');
  });

  it('says nothing about a corpus with no judgment on it', () => {
    expect(warned({ pages: [page()] })).toBeNull();
    expect(warned()).toBeNull();
  });

  /* It leads. A matched falsifier outranks a year-old belief. */
  it('leads the paper', () => {
    const built = paperColumns({ pages: [judged([falsifier()])], now: NOW });
    expect(Object.keys(built)[0]).toBe('warned');
    expect(built.warned).not.toBeNull();
  });
});

describe('how your confidence met later outcomes', () => {
  /* The instrument refuses to speak without enough settled cases, and this
     quotes it rather than re-deriving it. A corpus with nothing settled says
     nothing at all. */
  it('stays silent until the instrument has enough to say', () => {
    expect(calibration({ pages: [page()], userId: 'u1' })).toBeNull();
    expect(calibration()).toBeNull();
  });
});

describe('a paper for someone who started on Tuesday', () => {
  const fresh = (over = {}) => page({ createdAt: ago(2), claims: [], ...over });

  it('counts what arrived, because at three days old that is the news', () => {
    expect(firstWeek({ pages: [fresh(), fresh({ _id: 'p2' })], now: NOW }))
      .toMatchObject({ pages: 2, claims: 0 });
  });

  it('counts beliefs held, since the ledger is what the paper reads from', () => {
    expect(firstWeek({ pages: [fresh({ claims: [claim()] })], now: NOW }).claims).toBe(1);
  });

  /* It stops the moment the year-scale columns can speak for themselves — a
     paper that keeps introducing itself has stopped being a paper. */
  it('goes quiet once the corpus is no longer new', () => {
    expect(firstWeek({ pages: [page({ createdAt: ago(400) })], now: NOW })).toBeNull();
    expect(isNewReader({ pages: [page({ createdAt: ago(400) })], now: NOW })).toBe(false);
  });

  /* A corpus that will not say when it began is not thereby young. */
  it('does not greet a reader of two years as a beginner', () => {
    expect(isNewReader({ pages: [page({ createdAt: null })], now: NOW })).toBe(false);
    expect(firstWeek({ pages: [page({ createdAt: null })], now: NOW })).toBeNull();
  });

  it('says nothing to someone who has saved nothing', () => {
    expect(firstWeek({ pages: [], now: NOW })).toBeNull();
    expect(firstWeek()).toBeNull();
  });
});
