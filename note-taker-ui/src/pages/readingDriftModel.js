import { normalizeSpaces } from '../utils/editorialText';
import { isProceduralShelf, topLevelAncestor } from './folderTreeModel';

/* What counts as a filing tray is the cabinet's call — re-exported here so
   every surface that learned it from this model keeps reading it in the
   same place. */
export { isProceduralShelf };

/*
 * Where your reading is going.
 *
 * Everything else in this product asks you to decide something. This asks
 * nothing. It is the one surface that exists to be interesting rather than
 * useful — you look at it the way you look at a year of your own handwriting.
 *
 * The signal is what you filed things under and what you tagged them, over
 * time. No language model, no embedding, nothing inferred: if your reading has
 * moved from capacity to power, it is because you filed it that way, and the
 * product is only noticing out loud.
 *
 * It degrades honestly. Two topics do not make a trend and one bucket is not a
 * direction, so with too little to go on it says so rather than drawing a line
 * through noise.
 */

const DAY = 24 * 60 * 60 * 1000;
export const BUCKET_DAYS = 14;
export const BUCKETS = 6;
/* Below this there is not enough filed reading to say anything that would not
   be an accident of two articles. */
export const MIN_SOURCES = 8;
const TOP_TOPICS = 5;

const list = value => (Array.isArray(value) ? value : []);
const time = value => new Date(value || 0).getTime();

/**
 * What a source is about, as far as the reader has said.
 *
 * The shelf it is filed on first, because filing is a deliberate act. Tags
 * after that. A source that is neither filed nor tagged is about nothing the
 * product can honestly name, so it is left out rather than lumped into a
 * bucket called Other — a fake topic is worse than a smaller sample.
 *
 * Filing is exact but a trend is not: with the cabinet at hand, a piece
 * filed in `Costco` reads as `Investing`, the drawer it lives in, because a
 * trend measured per leaf is noise. Without the cabinet the filed name
 * stands as-is.
 */
export const topicsOf = (article = {}, folders = []) => {
  const topics = [];
  const folderId = normalizeSpaces(
    article?.folder?._id
    || article?.folderId
    || (typeof article?.folder === 'string' ? article.folder : '')
  );
  const ancestor = folderId ? topLevelAncestor(folders, folderId) : null;
  const drawer = normalizeSpaces(ancestor?.name) || normalizeSpaces(article?.folder?.name);
  if (drawer && !isProceduralShelf(drawer)) topics.push(drawer);
  list(article?.tags).forEach((tag) => {
    const name = normalizeSpaces(tag?.name || tag);
    if (!name || isProceduralShelf(name)) return;
    if (!topics.some(item => item.toLowerCase() === name.toLowerCase())) topics.push(name);
  });
  return topics;
};

const bucketIndexFor = (at, now) => {
  const age = now - at;
  if (age < 0) return 0;
  const index = Math.floor(age / (BUCKET_DAYS * DAY));
  return index >= BUCKETS ? -1 : index;
};

const periodFor = (index, now) => {
  const endsAt = now - index * BUCKET_DAYS * DAY;
  const startsAt = endsAt - BUCKET_DAYS * DAY;
  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString()
  };
};

const workOf = (article = {}) => ({
  id: normalizeSpaces(article?._id),
  title: normalizeSpaces(article?.title) || 'Untitled source',
  author: normalizeSpaces(article?.author),
  publication: normalizeSpaces(article?.siteName),
  url: normalizeSpaces(article?.url),
  savedAt: article?.createdAt || article?.savedAt || null
});

/**
 * The topic mix, fortnight by fortnight, most recent last.
 */
export const buildDrift = (articles = [], now = Date.now(), folders = []) => {
  const buckets = Array.from({ length: BUCKETS }, (_, index) => ({
    index,
    total: 0,
    byTopic: new Map(),
    worksByTopic: new Map()
  }));
  let filed = 0;

  list(articles).forEach((article) => {
    const at = time(article?.createdAt || article?.savedAt);
    if (Number.isNaN(at)) return;
    const index = bucketIndexFor(at, now);
    if (index < 0) return;
    const topics = topicsOf(article, folders);
    if (!topics.length) return;
    filed += 1;
    const bucket = buckets[index];
    bucket.total += 1;
    topics.forEach((topic) => {
      bucket.byTopic.set(topic, (bucket.byTopic.get(topic) || 0) + 1);
      const works = bucket.worksByTopic.get(topic) || [];
      works.push(workOf(article));
      bucket.worksByTopic.set(topic, works);
    });
  });

  /* Oldest first, so the chart reads left to right like time does. */
  const ordered = [...buckets].reverse();

  const totals = new Map();
  ordered.forEach(bucket => bucket.byTopic.forEach((count, topic) => {
    totals.set(topic, (totals.get(topic) || 0) + count);
  }));

  const topics = [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TOP_TOPICS)
    .map(([name]) => name);

  const series = topics.map(name => ({
    topic: name,
    counts: ordered.map(bucket => bucket.byTopic.get(name) || 0),
    shares: ordered.map(bucket => (bucket.total ? (bucket.byTopic.get(name) || 0) / bucket.total : 0)),
    periods: ordered.map(bucket => {
      const count = bucket.byTopic.get(name) || 0;
      return {
        ...periodFor(bucket.index, now),
        count,
        total: bucket.total,
        share: bucket.total ? count / bucket.total : 0,
        works: (bucket.worksByTopic.get(name) || [])
          .sort((left, right) => time(right.savedAt) - time(left.savedAt))
      };
    }),
    total: totals.get(name) || 0
  }));

  return {
    filed,
    enough: filed >= MIN_SOURCES && topics.length >= 2,
    bucketDays: BUCKET_DAYS,
    totals: ordered.map(bucket => bucket.total),
    series
  };
};

/* Rising, fading, or steady — measured as the share in the recent half against
   the share in the older half, so one busy fortnight does not read as a trend. */
const halves = (shares = []) => {
  const middle = Math.floor(shares.length / 2);
  const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  return { older: mean(shares.slice(0, middle)), recent: mean(shares.slice(middle)) };
};

export const MOVE_THRESHOLD = 0.08;

export const directionOf = (shares = []) => {
  const { older, recent } = halves(shares);
  const delta = recent - older;
  if (delta > MOVE_THRESHOLD) return 'rising';
  if (delta < -MOVE_THRESHOLD) return 'fading';
  return 'steady';
};

export const withDirections = (drift = {}) => ({
  ...drift,
  series: list(drift.series).map(item => ({ ...item, direction: directionOf(item.shares) }))
});

const joinNames = (names = []) => {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * When the current fortnight closes.
 *
 * The drift runs on the corpus's own clock rather than the world's: buckets
 * are fourteen days wide, counted from the day the account began, so the close
 * lands on the same weekday forever and the masthead can print it. A paper
 * that said "the drift closes soon" would be a paper guessing.
 */
export const driftClosesAt = ({ beganAt = null, now = Date.now() } = {}) => {
  const began = beganAt ? new Date(beganAt).getTime() : NaN;
  if (Number.isNaN(began)) return null;
  const elapsed = now - began;
  if (elapsed < 0) return null;
  const buckets = Math.floor(elapsed / (BUCKET_DAYS * DAY)) + 1;
  return new Date(began + buckets * BUCKET_DAYS * DAY).toISOString();
};

/**
 * Whether the drift prints this morning.
 *
 * The drift keeps the corpus's clock, not the world's: it prints on the day
 * its fortnight closes and is silent the other thirteen. Compared as local
 * calendar days on both sides, so a close at midnight UTC is still today's
 * paper west of it.
 */
export const isDriftCloseDay = ({ driftClosesAt: closesAt = null, now = Date.now() } = {}) => {
  const closes = new Date(closesAt || 0).getTime();
  if (Number.isNaN(closes)) return false;
  const day = (at) => {
    const date = new Date(at);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };
  return day(closes) === day(now);
};

/**
 * The product noticing out loud. One sentence, and it only speaks when
 * something actually moved.
 */
export const driftSentence = (drift = {}) => {
  if (!drift.enough) return '';
  const series = list(drift.series).map(item => ({ ...item, direction: directionOf(item.shares) }));
  const rising = series.filter(item => item.direction === 'rising').map(item => item.topic);
  const fading = series.filter(item => item.direction === 'fading').map(item => item.topic);

  if (!rising.length && !fading.length) {
    const steady = series[0];
    return steady
      ? `Three months of reading, and it has not moved: still mostly ${steady.topic}.`
      : '';
  }
  if (rising.length && fading.length) {
    return `You are reading less about ${joinNames(fading)} and more about ${joinNames(rising)}.`;
  }
  if (rising.length) return `${joinNames(rising)} is taking up more of your reading than it was.`;
  return `You have drifted away from ${joinNames(fading)}.`;
};

/** What to say instead when there is not enough filed reading to say anything. */
export const driftShortfall = (drift = {}) => {
  if (drift.enough) return '';
  if (!drift.filed) {
    return 'Nothing here yet. Drift is read from the shelves you file things on, so this fills in as you file.';
  }
  return `Only ${drift.filed} filed source${drift.filed === 1 ? '' : 's'} in the last three months — not enough to call it a direction yet.`;
};
