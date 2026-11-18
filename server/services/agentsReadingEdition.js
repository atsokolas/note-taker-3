const { connect, apiFor } = require('./handoffWorker');
const { windowFor } = require('./editionShape');
const { stripHtmlToLines } = require('./import/evernoteTransform');

/* What the reader's agents read for them last week, as an Edition: each page
   an agent saved, with the line that mattered (the passage the agent marked,
   or the page's opening) and who read it. Noeis files it itself, through
   the same Editions API any agent uses, once the week is over; a week no
   agent read anything is no issue at all. Inking stays where pencil is
   inked, on Handed off. */

const PROFILE = 'agents_reading';
const ITEMS = 12;
const LINE_CHARS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

const lastWeek = now => windowFor('weekly', new Date(now - 7 * DAY_MS));
const day = date => date.toISOString().slice(0, 10);
const opening = html => stripHtmlToLines(html || '').join(' ').replace(/\s+/g, ' ').trim().slice(0, LINE_CHARS);

const lineThatMattered = (article) => {
  const marked = (article.highlights || []).find(mark => mark.pencil?.agent && String(mark.text || '').trim());
  return marked ? marked.text.slice(0, LINE_CHARS) : opening(article.content);
};

const itemFor = article => ({
  itemId: String(article._id),
  title: article.title,
  url: article.url,
  sourceLabel: article.pencil.agent,
  finding: lineThatMattered(article) || article.title,
  boundary: `${article.pencil.agent} read this for you; you have not read it yourself yet.`
});

const onTheWeb = article => /^https?:\/\//i.test(String(article.url || ''));

const fileAgentsReading = async ({ userId, models: { Article, Edition, AgentToken }, apiUrl, now = Date.now() }) => {
  const { windowStart, windowEnd } = lastWeek(now);
  if (await Edition.exists({ userId, profile: PROFILE, windowStart })) return null;
  const read = (await Article.find({
    userId,
    'pencil.agent': { $nin: ['', null] },
    'pencil.at': { $gte: windowStart, $lt: new Date(windowEnd.getTime() + DAY_MS) }
  }).sort({ 'pencil.at': -1 }).limit(ITEMS).select('_id title url content highlights pencil').lean()).filter(onTheWeb);
  if (!read.length) return null;

  const { token, secret } = await connect({ AgentToken, userId });
  try {
    return await apiFor(apiUrl, secret)('/api/editions', {
      method: 'POST',
      body: {
        profile: PROFILE,
        windowStart: day(windowStart),
        windowEnd: day(windowEnd),
        headline: `${read.length} page${read.length === 1 ? '' : 's'} your agents read`,
        items: read.map(itemFor)
      }
    });
  } finally {
    await AgentToken.deleteOne({ _id: token._id });
  }
};

// Everyone whose agents read something last week gets last week's issue, once.
const fileAgentsReadingEditions = async ({ models, apiUrl, now = Date.now() }) => {
  const { windowStart, windowEnd } = lastWeek(now);
  const readers = await models.Article.distinct('userId', {
    'pencil.agent': { $nin: ['', null] },
    'pencil.at': { $gte: windowStart, $lt: new Date(windowEnd.getTime() + DAY_MS) }
  });
  for (const userId of readers) {
    await fileAgentsReading({ userId, models, apiUrl, now })
      .catch(error => console.error('[agents-reading] edition failed', error.message));
  }
};

module.exports = { fileAgentsReading, fileAgentsReadingEditions, PROFILE };
