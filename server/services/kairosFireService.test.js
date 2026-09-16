const assert = require('assert');
const { fireAskedBack } = require('./kairosFireService');

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

const modelsOf = ({ entries = [], articles = [], folders = [], questions = [] } = {}) => ({
  ReturnQueueEntry: collection(entries),
  Article: collection(articles),
  Folder: collection(folders),
  Question: collection(questions)
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

const question = (id, extras = {}) => asDoc({
  _id: id,
  userId: USER,
  text: extras.text === undefined ? 'Who bears the downside?' : extras.text,
  status: extras.status || 'open',
  inquiry: extras.inquiry === undefined ? {
    brief: 'Find an example that separates patience from avoidance.',
    run: {
      status: 'complete',
      boundQuestion: 'Who bears the downside?',
      boundBrief: 'Find an example that separates patience from avoidance.',
      passages: [{
        articleId: 'a-letter',
        title: 'Household letter',
        passage: 'Patience is not the same as avoidance.'
      }]
    }
  } : extras.inquiry
});

const entry = (id, extras = {}) => asDoc({
  _id: id,
  userId: USER,
  itemType: extras.itemType || 'article',
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

  const inquiryEntry = entry('q-inquiry', {
    itemType: 'question',
    itemId: 'question-downside',
    reason: ''
  });
  const inquiryQuestion = question('question-downside');
  const inquiryReturn = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [inquiryEntry],
      questions: [inquiryQuestion]
    })
  });
  assert.strictEqual(inquiryReturn.length, 1);
  assert.strictEqual(inquiryReturn[0].itemType, 'question');
  assert.strictEqual(inquiryReturn[0].questionId, 'question-downside');
  assert.strictEqual(inquiryReturn[0].articleId, '');
  assert.strictEqual(inquiryReturn[0].title, 'Who bears the downside?');
  assert.strictEqual(inquiryReturn[0].href, '/think?tab=questions&questionId=question-downside');
  assert.strictEqual(inquiryReturn[0].reason, 'Find an example that separates patience from avoidance.');
  assert.strictEqual(inquiryEntry.status, 'completed');
  assert.strictEqual(inquiryEntry.lastFiredOn, '2026-08-31');

  const missEntry = entry('q-miss', {
    itemType: 'question',
    itemId: 'question-miss',
    reason: 'bring this back'
  });
  const missReturn = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [missEntry],
      questions: [question('question-miss', {
        inquiry: { run: { status: 'miss', passages: [], silence: 'Nothing useful came back.' } }
      })]
    })
  });
  assert.deepStrictEqual(missReturn, []);
  assert.strictEqual(missEntry.status, 'pending');

  const answeredEntry = entry('q-answered', {
    itemType: 'question',
    itemId: 'question-answered'
  });
  const answeredReturn = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [answeredEntry],
      questions: [question('question-answered', { status: 'answered' })]
    })
  });
  assert.deepStrictEqual(answeredReturn, []);
  assert.strictEqual(answeredEntry.status, 'pending');

  const goneQuestion = entry('q-gone-question', {
    itemType: 'question',
    itemId: 'missing-question'
  });
  await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({ entries: [goneQuestion], questions: [] })
  });
  assert.strictEqual(goneQuestion.status, 'completed');
  assert.strictEqual(goneQuestion.fired, null);

  const crowded = await fireAskedBack({
    userId: USER,
    now: TODAY,
    timezone: 'UTC',
    models: modelsOf({
      entries: [
        entry('q-overdue-a', { itemId: 'a1', dueAt: new Date('2026-08-20T09:00:00.000Z') }),
        entry('q-overdue-b', { itemId: 'a2', dueAt: new Date('2026-08-21T09:00:00.000Z') }),
        entry('q-overdue-c', { itemId: 'a3', dueAt: new Date('2026-08-22T09:00:00.000Z') }),
        entry('q-inquiry-slot', {
          itemType: 'question',
          itemId: 'question-downside',
          reason: '',
          dueAt: new Date('2026-08-31T09:00:00.000Z')
        }),
        entry('q-inquiry-second', {
          itemType: 'question',
          itemId: 'question-second',
          reason: '',
          dueAt: new Date('2026-08-31T10:00:00.000Z')
        })
      ],
      articles: [
        article('a1', { title: 'Overdue A' }),
        article('a2', { title: 'Overdue B' }),
        article('a3', { title: 'Overdue C' })
      ],
      questions: [
        question('question-downside'),
        question('question-second', { text: 'Whose recoverable mistake is this?' })
      ]
    })
  });
  assert.deepStrictEqual(crowded.map((row) => row.title), [
    'Overdue A',
    'Overdue B',
    'Who bears the downside?'
  ]);
  assert.strictEqual(crowded.filter((row) => row.itemType === 'question').length, 1);
  assert.strictEqual(crowded[2].href, '/think?tab=questions&questionId=question-downside');

  console.log('kairosFireService tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
