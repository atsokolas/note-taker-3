const assert = require('assert');
const { fireAskedBack, fireStickyNotes } = require('./kairosFireService');

const USER = '64f100000000000000000001';
const TODAY = new Date('2026-08-31T12:00:00.000Z');

const asDoc = (plain) => {
  const doc = {
    ...plain,
    toObject() {
      const { toObject, save, ...rest } = this;
      return rest;
    },
    async save() {
      Object.assign(plain, this);
      return this;
    }
  };
  return doc;
};

const mongoMatch = (doc, query = {}) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return (value || []).some((clause) => mongoMatch(doc, clause));
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    if ('$in' in value) return value.$in.map(String).includes(String(doc[key]));
    if ('$lte' in value) return new Date(doc[key] || 0) <= new Date(value.$lte);
    if ('$ne' in value) return String(doc[key] ?? '') !== String(value.$ne ?? '');
  }
  return String(doc[key] ?? '') === String(value ?? '');
});

const collection = (rows) => ({
  find: (query = {}) => rows.filter((row) => mongoMatch(row, query)),
  findOne: async (query = {}) => rows.find((row) => mongoMatch(row, query)) || null
});

const modelsOf = ({ entries = [], articles = [], folders = [] } = {}) => ({
  ReturnQueueEntry: collection(entries),
  Article: collection(articles),
  Folder: collection(folders)
});

const article = (id, extras = {}) => asDoc({
  _id: id,
  userId: USER,
  title: extras.title || 'The Costco 10-K',
  placement: extras.placement || 'setAside',
  placementAt: extras.placementAt || new Date('2026-08-25T09:00:00.000Z'),
  placementReason: extras.placementReason || 'the margin note on returns',
  hiddenFromHome: Boolean(extras.hiddenFromHome),
  debugOnly: Boolean(extras.debugOnly),
  archived: Boolean(extras.archived),
  folder: extras.folder || null
});

const entry = (id, extras = {}) => asDoc({
  _id: id,
  userId: USER,
  itemType: 'article',
  itemId: extras.itemId || 'a-costco',
  reason: extras.reason === undefined ? 'the margin note on returns' : extras.reason,
  dueAt: extras.dueAt === undefined ? new Date('2026-08-31T09:00:00.000Z') : extras.dueAt,
  cadence: extras.cadence || null,
  lastFiredOn: extras.lastFiredOn || '',
  status: extras.status || 'pending',
  completedAt: extras.completedAt || null,
  fired: extras.fired || null
});

(async () => {
  const first = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q1', { itemId: 'a-costco' })],
      articles: [article('a-costco')]
    })
  });
  assert.strictEqual(first.length, 1);
  assert.strictEqual(first[0].articleId, 'a-costco');
  assert.strictEqual(first[0].title, 'The Costco 10-K');
  assert.strictEqual(first[0].href, '/library?articleId=a-costco');
  assert.strictEqual(first[0].reason, 'the margin note on returns');
  assert.strictEqual(first[0].fromPlacement, 'setAside');
  assert.strictEqual(first[0].home, 'imbox');
  assert.strictEqual(first[0].lastFiredOn, '2026-08-31');
  assert.strictEqual(first[0].queueId, 'q1');

  const firedArticle = article('a-costco');
  const oneShot = entry('q1', { itemId: 'a-costco' });
  await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({ entries: [oneShot], articles: [firedArticle] })
  });
  assert.strictEqual(firedArticle.placement, 'stream');
  assert.strictEqual(firedArticle.placementAt, null);
  assert.strictEqual(firedArticle.placementReason, '');
  assert.strictEqual(oneShot.status, 'completed');
  assert.strictEqual(oneShot.lastFiredOn, '2026-08-31');
  assert.strictEqual(oneShot.fired.title, 'The Costco 10-K');

  const reprintEntry = entry('q1', {
    itemId: 'a-costco',
    status: 'completed',
    lastFiredOn: '2026-08-31',
    completedAt: TODAY,
    fired: {
      title: 'The Costco 10-K',
      href: '/library?articleId=a-costco',
      reason: 'the margin note on returns',
      fromPlacement: 'setAside',
      home: 'imbox'
    }
  });
  const reprint = await fireAskedBack({
    userId: USER,
    now: new Date('2026-08-31T18:00:00.000Z'),
    timezone: 'UTC',
    models: modelsOf({
      entries: [reprintEntry],
      articles: [article('a-costco', { placement: 'stream', placementAt: null, placementReason: '' })]
    })
  });
  assert.strictEqual(reprint.length, 1);
  assert.strictEqual(reprint[0].title, 'The Costco 10-K');
  assert.strictEqual(reprintEntry.status, 'completed');

  const nextMorning = await fireAskedBack({
    userId: USER,
    now: new Date('2026-09-01T12:00:00.000Z'),
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q1', {
        itemId: 'a-costco',
        status: 'completed',
        lastFiredOn: '2026-08-31',
        fired: { title: 'The Costco 10-K', href: '/library?articleId=a-costco', reason: '', fromPlacement: 'setAside', home: 'imbox' }
      })],
      articles: [article('a-costco', { placement: 'stream' })]
    })
  });
  assert.deepStrictEqual(nextMorning, []);

  const weekly = entry('q2', {
    itemId: 'a-weekly',
    cadence: 'weekly',
    dueAt: new Date('2026-08-31T09:00:00.000Z')
  });
  const weeklyArticle = article('a-weekly', { title: 'Every Monday filing' });
  const weeklyPrint = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({ entries: [weekly], articles: [weeklyArticle] })
  });
  assert.strictEqual(weeklyPrint.length, 1);
  assert.strictEqual(weekly.status, 'pending');
  assert.strictEqual(weekly.lastFiredOn, '2026-08-31');
  assert.strictEqual(weekly.dueAt.toISOString(), '2026-09-07T09:00:00.000Z');

  const sameMorningWeekly = await fireAskedBack({
    userId: USER,
    now: new Date('2026-08-31T15:00:00.000Z'),
    timezone: 'UTC',
    models: modelsOf({ entries: [weekly], articles: [weeklyArticle] })
  });
  assert.strictEqual(sameMorningWeekly.length, 1);
  assert.strictEqual(weekly.dueAt.toISOString(), '2026-09-07T09:00:00.000Z');

  const monthly = entry('q3', {
    itemId: 'a-month',
    cadence: 'monthly',
    dueAt: new Date('2026-08-31T09:00:00.000Z')
  });
  await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [monthly],
      articles: [article('a-month', { title: 'Monthly 10-Q' })]
    })
  });
  assert.strictEqual(monthly.status, 'pending');
  assert.strictEqual(monthly.dueAt.toISOString().slice(0, 10), '2026-09-30');

  const quiet = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({ entries: [], articles: [] })
  });
  assert.deepStrictEqual(quiet, []);

  const gone = entry('q-gone', { itemId: 'missing' });
  await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({ entries: [gone], articles: [] })
  });
  assert.strictEqual(gone.status, 'completed');
  assert.strictEqual(gone.fired, null);

  const suppressed = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q-debug', { itemId: 'a-debug' })],
      articles: [article('a-debug', { title: 'Debug fixture', debugOnly: true })]
    })
  });
  assert.deepStrictEqual(suppressed, []);

  const untitled = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q-empty', { itemId: 'a-empty' })],
      articles: [article('a-empty', { title: '   ' })]
    })
  });
  assert.deepStrictEqual(untitled, []);

  const many = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [
        entry('q-overdue', { itemId: 'a1', dueAt: new Date('2026-08-20T09:00:00.000Z') }),
        entry('q-today-early', { itemId: 'a2', dueAt: new Date('2026-08-31T08:00:00.000Z') }),
        entry('q-today-late', { itemId: 'a3', dueAt: new Date('2026-08-31T11:00:00.000Z') }),
        entry('q-also', { itemId: 'a4', dueAt: new Date('2026-08-31T12:00:00.000Z') }),
        entry('q-future', { itemId: 'a5', dueAt: new Date('2026-09-07T09:00:00.000Z') })
      ],
      articles: [
        article('a1', { title: 'Overdue' }),
        article('a2', { title: 'Early today' }),
        article('a3', { title: 'Later today' }),
        article('a4', { title: 'Also today' }),
        article('a5', { title: 'Next week' })
      ]
    })
  });
  assert.deepStrictEqual(many.map((row) => row.title), ['Overdue', 'Early today', 'Later today']);

  const feedHome = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q-feed', { itemId: 'a-feed' })],
      articles: [article('a-feed', { title: 'A screened newsletter', folder: 'folder-news', placement: 'later' })],
      folders: [asDoc({ _id: 'folder-news', userId: USER, asFeed: true, name: 'Newsletters' })]
    })
  });
  assert.strictEqual(feedHome[0].home, 'feed');
  assert.strictEqual(feedHome[0].fromPlacement, 'later');

  const notDue = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q-wait', { itemId: 'a-wait', dueAt: new Date('2026-09-07T09:00:00.000Z') })],
      articles: [article('a-wait', { title: 'Not yet' })]
    })
  });
  assert.deepStrictEqual(notDue, []);

  const reasonFromArticle = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [entry('q-blank', { itemId: 'a-blank', reason: '' })],
      articles: [article('a-blank', { placementReason: 'the margin note on returns' })]
    })
  });
  assert.strictEqual(reasonFromArticle[0].reason, 'the margin note on returns');

  const sticky = (id, extras = {}) => asDoc({
    _id: id,
    userId: USER,
    text: extras.text || 'Ask him about Thursday.',
    targetType: 'article',
    targetId: 'a-costco',
    targetTitle: 'The Costco 10-K',
    targetHref: '/library?articleId=a-costco',
    dueAt: extras.dueAt === undefined ? new Date('2026-08-31T09:00:00.000Z') : extras.dueAt,
    status: extras.status || 'pending',
    ...extras
  });
  const stickyModels = (rows) => ({ Sticky: collection(rows) });

  const printed = await fireStickyNotes({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: stickyModels([
      sticky('s-due'),
      sticky('s-future', { dueAt: new Date('2026-09-07T09:00:00.000Z') }),
      sticky('s-undated', { dueAt: null }),
      sticky('s-done', { status: 'done' })
    ])
  });
  assert.strictEqual(printed.length, 1);
  assert.strictEqual(printed[0].text, 'Ask him about Thursday.');
  assert.strictEqual(printed[0].href, '/library?articleId=a-costco');

  /* A dated sticky prints once: the second morning finds it done. */
  const again = await fireStickyNotes({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: stickyModels([sticky('s-fired', { status: 'done' })])
  });
  assert.deepStrictEqual(again, []);

  console.log('kairosFireService tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
