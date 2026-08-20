import {
  activityNote,
  claimSentence,
  isJudgmentPage,
  judgmentActivity,
  lessonLines
} from './judgmentModel';

/*
 * The week, in five lines.
 *
 * This is a summary of what the surfaces already showed, not the only place
 * you find out — a signal that lives solely in a weekly digest becomes email
 * you ignore. The judgment index carries its own marks; this gathers them into
 * something you can read on a Friday and be done with.
 *
 * It counts what happened. It asks for nothing, and when the week was quiet it
 * says the week was quiet, because a quiet week is a real answer and a brief
 * that manufactures urgency to justify itself is worse than no brief.
 */

const DAY = 24 * 60 * 60 * 1000;
export const WEEK = 7 * DAY;

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = value => String(value?._id || value?.id || value || '');
const time = value => new Date(value || 0).getTime();
const list = value => (Array.isArray(value) ? value : []);
const within = (value, since) => {
  const at = time(value);
  return !Number.isNaN(at) && at >= since;
};

const row = (page, activity) => ({
  id: idOf(page),
  claim: claimSentence(page),
  state: activity.state,
  note: activityNote(activity),
  arrived: activity.arrived
});

/**
 * @param {object} params
 * @param {Array} params.pages wiki pages, summary projection is enough
 * @param {Array} params.articles sources saved, for the reading count
 * @param {Array} params.events wiki source events
 * @param {number} [params.now]
 */
export const buildWeeklyBrief = ({ pages = [], articles = [], events = [], now = Date.now() } = {}) => {
  const since = now - WEEK;

  const read = list(articles).filter(article => within(article?.createdAt || article?.savedAt, since));
  const judgments = list(pages).filter(isJudgmentPage);
  const graded = judgments.map(page => ({ page, activity: judgmentActivity(page, events, now) }));

  /* Bore on what you hold: sources that arrived this week and touched a claim.
     Counted by event, because that is the thing that actually connected a
     reading to a belief. */
  const boreOnBeliefs = new Set(
    list(events)
      .filter(event => clean(event?.status) !== 'ignored')
      .filter(event => within(event?.sourceUpdatedAt || event?.createdAt, since))
      .flatMap(event => list(event?.affectedPageIds).map(idOf))
      .filter(Boolean)
  ).size;

  const learned = list(pages)
    .flatMap(page => lessonLines(page?.judgment || {}).map(lesson => ({ ...lesson, claim: claimSentence(page), pageId: idOf(page) })))
    .filter(lesson => within(lesson.at, since))
    .sort((left, right) => (time(right.at) || 0) - (time(left.at) || 0));

  const byState = state => graded.filter(item => item.activity.state === state).map(item => row(item.page, item.activity));

  const brief = {
    since: new Date(since).toISOString(),
    read: read.length,
    boreOnBeliefs,
    working: byState('live'),
    avoided: byState('avoided'),
    quiet: byState('quiet'),
    unfalsifiable: byState('unfalsifiable'),
    kept: list(pages).filter(page => page?.evergreen).length
      + list(articles).filter(article => article?.evergreen).length,
    learned
  };

  /* A week is quiet when nothing arrived, nothing was learned, and nothing is
     being avoided. Saying so is the honest answer, and it is also what makes
     the brief worth opening on the weeks it does have something. */
  brief.isQuiet = !brief.read && !brief.boreOnBeliefs && !brief.learned.length && !brief.avoided.length;
  return brief;
};

/** The opening line, which is a count and not a rallying cry. */
export const briefOpening = (brief = {}) => {
  if (brief.isQuiet) return 'A quiet week. Nothing arrived, and nothing needed you.';
  const read = brief.read === 1 ? 'You read one thing' : `You read ${brief.read} things`;
  if (!brief.boreOnBeliefs) return `${read}. None of it touched what you hold.`;
  const bore = brief.boreOnBeliefs === 1 ? 'one' : String(brief.boreOnBeliefs);
  const claims = brief.boreOnBeliefs === 1 ? 'claim' : 'claims';
  return `${read}, and it bore on ${bore} ${claims} you hold.`;
};
