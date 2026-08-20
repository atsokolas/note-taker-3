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

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const list = value => (Array.isArray(value) ? value : []);
const time = value => new Date(value || 0).getTime();

/**
 * What a source is about, as far as the reader has said.
 *
 * The shelf it is filed on first, because filing is a deliberate act. Tags
 * after that. A source that is neither filed nor tagged is about nothing the
 * product can honestly name, so it is left out rather than lumped into a
 * bucket called Other — a fake topic is worse than a smaller sample.
 */
export const topicsOf = (article = {}) => {
  const topics = [];
  const folder = clean(article?.folder?.name);
  if (folder) topics.push(folder);
  list(article?.tags).forEach((tag) => {
    const name = clean(tag?.name || tag);
    if (name && !topics.some(item => item.toLowerCase() === name.toLowerCase())) topics.push(name);
  });
  return topics;
};

const bucketIndexFor = (at, now) => {
  const age = now - at;
  if (age < 0) return 0;
  const index = Math.floor(age / (BUCKET_DAYS * DAY));
  return index >= BUCKETS ? -1 : index;
};

/**
 * The topic mix, fortnight by fortnight, most recent last.
 */
export const buildDrift = (articles = [], now = Date.now()) => {
  const buckets = Array.from({ length: BUCKETS }, () => ({ total: 0, byTopic: new Map() }));
  let filed = 0;

  list(articles).forEach((article) => {
    const at = time(article?.createdAt || article?.savedAt);
    if (Number.isNaN(at)) return;
    const index = bucketIndexFor(at, now);
    if (index < 0) return;
    const topics = topicsOf(article);
    if (!topics.length) return;
    filed += 1;
    const bucket = buckets[index];
    bucket.total += 1;
    topics.forEach((topic) => {
      bucket.byTopic.set(topic, (bucket.byTopic.get(topic) || 0) + 1);
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
