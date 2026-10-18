const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  weekBounds,
  offsetMinutesFor,
  isDinnerPartyTime,
  partwaySince,
  stillReading,
  pickForToday,
  newFromSources,
  readingWeather,
  worthSaying,
  phraseWorthSaying,
  explainItBack,
  canExplainBack,
  buildReadingRoom
} = require('./readingRoomService');

const DAY = 86400000;
// Wednesday 14 October 2026, noon UTC.
const NOW = new Date('2026-10-14T12:00:00Z');
const ago = (days) => new Date(NOW.getTime() - days * DAY);
const LONG = 'x'.repeat(1300);
let seq = 0;
const article = (fields = {}) => ({
  _id: `a${String(seq += 1).padStart(3, '0')}`,
  title: `Piece ${seq}`,
  createdAt: ago(60),
  placement: 'stream',
  folder: null,
  contentLength: 2000,
  highlights: [],
  readingState: null,
  ...fields
});
const mark = (daysAgo, fields = {}) => ({
  _id: `h${String(seq += 1).padStart(3, '0')}`,
  text: 'A line long enough to be worth quoting out loud.',
  createdAt: ago(daysAgo),
  tags: [],
  ...fields
});

test('weeks start on Monday where the reader is', () => {
  const { thisWeek, lastWeek } = weekBounds(NOW, 0);
  assert.equal(new Date(thisWeek.from).toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(new Date(lastWeek.from).toISOString(), '2026-10-05T00:00:00.000Z');
  // New York (UTC-4): Monday midnight local is 04:00 UTC.
  assert.equal(new Date(weekBounds(NOW, 240).thisWeek.from).toISOString(), '2026-10-12T04:00:00.000Z');
  assert.equal(offsetMinutesFor(NOW, 'America/New_York'), 240);
  assert.equal(offsetMinutesFor(NOW, 'Not/AZone'), 0);
});

test('dinner party runs Friday afternoon through Sunday, local time', () => {
  assert.equal(isDinnerPartyTime(new Date('2026-10-16T11:59:00Z'), 0), false);
  assert.equal(isDinnerPartyTime(new Date('2026-10-16T12:00:00Z'), 0), true);
  assert.equal(isDinnerPartyTime(new Date('2026-10-18T23:00:00Z'), 0), true);
  assert.equal(isDinnerPartyTime(new Date('2026-10-19T01:00:00Z'), 0), false);
  // 01:00 UTC Monday is still Sunday evening in New York.
  assert.equal(isDinnerPartyTime(new Date('2026-10-19T01:00:00Z'), 240), true);
  assert.equal(isDinnerPartyTime(NOW, 0), false);
});

test('partway: a recent reading place, or a recent mark on an unfinished piece', () => {
  assert.ok(partwaySince(article({ readingState: { ratio: 0.4, visitedAt: ago(2) } }), NOW));
  assert.equal(partwaySince(article({ readingState: { ratio: 0.4, visitedAt: ago(30) } }), NOW), 0);
  assert.equal(partwaySince(article({ readingState: { ratio: 0.02, visitedAt: ago(1) } }), NOW), 0);
  assert.equal(partwaySince(article({ readingState: { ratio: 0.95, visitedAt: ago(1) } }), NOW), 0);
  assert.ok(partwaySince(article({ highlights: [mark(3)] }), NOW));
  assert.equal(partwaySince(article({ highlights: [mark(20)] }), NOW), 0);
  assert.equal(partwaySince(article({ highlights: [mark(1)], readingState: { ratio: 0.92, visitedAt: ago(1) } }), NOW), 0);
});

test('still reading lists the latest three partway pieces and is empty when nothing is', () => {
  const rows = [1, 2, 3, 4].map((days) => article({ readingState: { ratio: 0.5, visitedAt: ago(days) } }));
  assert.deepEqual(stillReading(rows, NOW).map((row) => row.articleId), rows.slice(0, 3).map((row) => row._id));
  assert.deepEqual(stillReading([article()], NOW), []);
});

test('the pick rotates daily through the seven oldest unopened or half-read pieces you saved yourself', () => {
  const shelf = Array.from({ length: 9 }, (_, index) => article({ createdAt: ago(100 - index) }));
  const ids = new Set();
  for (let day = 0; day < 7; day += 1) {
    const pick = pickForToday(shelf, { now: new Date(NOW.getTime() + day * DAY) });
    ids.add(pick.articleId);
  }
  assert.deepEqual([...ids].sort(), shelf.slice(0, 7).map((row) => row._id).sort());
  assert.equal(pickForToday(shelf, { now: NOW }).articleId, pickForToday(shelf, { now: new Date(NOW.getTime() + 3600000) }).articleId);
});

test('the pick passes over feeds, parked, finished, marked, stub and still-reading pieces, and is silent when none qualify', () => {
  const ineligible = [
    article({ folder: { name: 'Stratechery', asFeed: true } }),
    article({ placement: 'later' }),
    article({ readingState: { ratio: 0.95, visitedAt: ago(40) } }),
    article({ highlights: [mark(40)] }),
    article({ contentLength: 300 }),
    article({ title: '  ' })
  ];
  assert.equal(pickForToday(ineligible, { now: NOW }), null);
  const halfRead = article({ readingState: { ratio: 0.5, visitedAt: ago(40) } });
  assert.equal(pickForToday([...ineligible, halfRead], { now: NOW }).articleId, halfRead._id);
  assert.equal(pickForToday([halfRead], { now: NOW, exclude: [halfRead._id] }), null);
});

test('new from your sources: unopened feed arrivals from the last week, newest first', () => {
  const feed = { name: 'Stratechery', asFeed: true };
  const fresh = article({ folder: feed, createdAt: ago(1) });
  const older = article({ folder: feed, createdAt: ago(3) });
  const rows = [
    older,
    fresh,
    article({ folder: feed, createdAt: ago(9) }),
    article({ folder: feed, createdAt: ago(1), readingState: { ratio: 0.2, visitedAt: ago(1) } }),
    article({ folder: { name: 'Mine' }, createdAt: ago(1) })
  ];
  assert.deepEqual(newFromSources(rows, NOW), [
    { articleId: fresh._id, title: fresh.title, sourceName: 'Stratechery' },
    { articleId: older._id, title: older.title, sourceName: 'Stratechery' }
  ]);
  assert.deepEqual(newFromSources([article()], NOW), []);
});

test('weather names last week\'s leading subject and a minority one', () => {
  const lastWeek = weekBounds(NOW, 0).lastWeek;
  const rows = [
    article({ highlights: [mark(5, { tags: ['semiconductors'] })] }),
    article({ highlights: [mark(6, { tags: ['Semiconductors', '#Stoicism'] })] }),
    article({ highlights: [mark(7, { tags: ['semiconductors'] })] }),
    article({ createdAt: ago(6), folder: { name: 'Stoicism' } }),
    article({ highlights: [mark(1, { tags: ['this week'] })] })
  ];
  assert.deepEqual(readingWeather(rows, lastWeek), {
    top: 'semiconductors',
    chance: 'Stoicism',
    line: 'Mostly semiconductors, with a chance of Stoicism.'
  });
  const single = rows.slice(0, 3).map((row) => ({ ...row, highlights: row.highlights.map((h) => ({ ...h, tags: ['chips'] })) }));
  assert.equal(readingWeather(single, lastWeek).line, 'Mostly chips.');
});

test('weather is silent when last week was thin, tied, or about filing trays', () => {
  const lastWeek = weekBounds(NOW, 0).lastWeek;
  assert.equal(readingWeather([article({ highlights: [mark(5, { tags: ['a'] })] })], lastWeek), null);
  const tied = ['a', 'a', 'b', 'b'].map((tag) => article({ highlights: [mark(5, { tags: [tag] })] }));
  assert.equal(readingWeather(tied, lastWeek), null);
  const trays = [1, 2, 3, 4].map(() => article({ createdAt: ago(6), folder: { name: 'Needs review' } }));
  assert.equal(readingWeather(trays, lastWeek), null);
  const scattered = ['a', 'b', 'c'].map((tag) => article({ highlights: [mark(5, { tags: [tag] })] }));
  assert.equal(readingWeather(scattered, lastWeek), null);
});

test('worth saying ranks this week\'s marked sources and quotes the line with your thought beside it', () => {
  const thisWeek = weekBounds(NOW, 0).thisWeek;
  const noted = mark(1, { text: 'The line you wrote a thought beside, kept for later.', note: 'Yes.' });
  const top = article({ highlights: [mark(1), mark(1), noted] });
  const second = article({ highlights: [mark(1), mark(2)] });
  const third = article({ highlights: [mark(2)] });
  const fourth = article({ highlights: [mark(2, { createdAt: ago(1.5) })], createdAt: ago(1) });
  const lines = worthSaying([third, fourth, second, top], thisWeek);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].articleId, top._id);
  assert.equal(lines[0].quote, noted.text);
  assert.equal(lines[0].highlightId, noted._id);
  assert.equal(lines[1].articleId, second._id);
  assert.equal(lines[2].articleId, fourth._id);
});

test('worth saying is silent with fewer than three sources that have a quotable line this week', () => {
  const thisWeek = weekBounds(NOW, 0).thisWeek;
  const rows = [
    article({ highlights: [mark(1)] }),
    article({ highlights: [mark(1)] }),
    article({ highlights: [mark(1, { text: 'Too short.' })] }),
    article({ highlights: [mark(9)] })
  ];
  assert.equal(worthSaying(rows, thisWeek), null);
});

const LINES = [1, 2, 3].map((n) => ({ articleId: `p${n}`, highlightId: `h${n}`, title: `T${n}`, quote: `Quote number ${n} is here.`, note: '' }));

test('phrasing returns three plain sentences, or nothing at all', async () => {
  const configured = () => true;
  const said = await phraseWorthSaying(LINES, {
    userId: 'u1',
    configured,
    chat: async () => ({ text: JSON.stringify({ said: ['One thing I learned.', 'A second thing worth saying.', 'And a third, said plainly.'] }) })
  });
  assert.deepEqual(said, ['One thing I learned.', 'A second thing worth saying.', 'And a third, said plainly.']);
  assert.equal(await phraseWorthSaying(LINES, { userId: 'u2', configured, chat: async () => ({ text: '{"said":["Only one."]}' }) }), null);
  assert.equal(await phraseWorthSaying(LINES, { userId: 'u3', configured, chat: async () => ({ text: '{"said":["Wow!","Two is fine here.","Three is fine here."]}' }) }), null);
  assert.equal(await phraseWorthSaying(LINES, { userId: 'u4', configured, chat: async () => { throw new Error('down'); } }), null);
  let called = false;
  assert.equal(await phraseWorthSaying(LINES, { userId: 'u5', configured: () => false, chat: async () => { called = true; } }), null);
  assert.equal(called, false);
});

const ARTICLE = {
  title: 'On moats',
  content: `<p>Costco's moat is the membership renewal rate, not the price of hot dogs.</p><p>${LONG}</p>`,
  highlights: [{ text: 'Prices stay low because the fee pays the bills.' }]
};

test('explain it back keeps only points whose quote is in the source', async () => {
  const result = await explainItBack({
    article: ARTICLE,
    text: 'Costco is cheap. People like it.',
    chat: async () => ({
      text: JSON.stringify({
        missed: [
          { point: 'You left out where the money comes from.', quote: 'the fee pays the bills' },
          { point: 'An invented point.', quote: 'Costco plans to open on the moon' }
        ]
      })
    })
  });
  assert.deepEqual(result, { missed: [{ point: 'You left out where the money comes from.', quote: 'the fee pays the bills' }] });
  assert.deepEqual(await explainItBack({ article: ARTICLE, text: 'x', chat: async () => ({ text: '{"missed":[]}' }) }), { missed: [] });
});

test('explain it back refuses an unreadable or wholly invented comparison', async () => {
  await assert.rejects(explainItBack({ article: ARTICLE, text: 'x', chat: async () => ({ text: 'not json' }) }));
  await assert.rejects(explainItBack({
    article: ARTICLE,
    text: 'x',
    chat: async () => ({ text: '{"missed":[{"point":"Made up.","quote":"nothing like this appears"}]}' })
  }));
});

test('explain it back is offered only with a model and a readable piece', () => {
  assert.equal(canExplainBack(ARTICLE, () => true), true);
  assert.equal(canExplainBack(ARTICLE, () => false), false);
  assert.equal(canExplainBack({ content: '<p>Short.</p>' }, () => true), false);
});

test('the room assembles every section and keeps the dinner party to its window', async () => {
  const Article = {
    aggregate: () => ({ option: async () => [article({ readingState: undefined, highlights: [mark(1)] })] })
  };
  const room = await buildReadingRoom({ models: { Article }, userId: 'u', now: NOW, configured: () => false });
  assert.deepEqual(Object.keys(room).sort(), ['modelAvailable', 'newFromSources', 'pick', 'stillReading', 'weather', 'worthSaying']);
  assert.equal(room.stillReading.length, 1);
  assert.deepEqual(room.worthSaying, []);
  assert.equal(room.modelAvailable, false);
});
