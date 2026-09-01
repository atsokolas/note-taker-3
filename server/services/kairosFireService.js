const ASKED_BACK_CAP = 3;

const localDateForTimezone = (date = new Date(), timezone = 'UTC') => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch (_error) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
};

const idOf = (value) => String(value?._id || value || '');

const clean = (value = '', limit = 280) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

const loadRows = async (query) => {
  if (!query) return [];
  if (Array.isArray(query)) return query;
  const rows = await query;
  if (Array.isArray(rows)) return rows;
  return rows ? [rows] : [];
};

const normalizeCadence = (value) => {
  const raw = value === undefined || value === null ? '' : String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'weekly' || raw === 'monthly') return raw;
  const error = new Error(raw === 'daily'
    ? 'cadence cannot be daily.'
    : 'cadence must be weekly, monthly, or empty.');
  error.statusCode = 400;
  throw error;
};

const isQualityArticle = (article) => {
  if (!article) return false;
  if (article.hiddenFromHome || article.debugOnly || article.archived) return false;
  return Boolean(clean(article.title));
};

const homeOf = (article, folder) => (
  folder?.asFeed === true ? 'feed' : 'imbox'
);

const articleHref = (articleId) => `/library?articleId=${encodeURIComponent(articleId)}`;

const localDay = (value, timezone, today) => {
  if (!value) return today;
  return localDateForTimezone(new Date(value), timezone);
};

const isDue = (entry, timezone, today) => {
  if (!entry?.dueAt) return true;
  return localDay(entry.dueAt, timezone, today) <= today;
};

const isOverdue = (entry, timezone, today) => {
  if (!entry?.dueAt) return true;
  return localDay(entry.dueAt, timezone, today) < today;
};

const advanceDueAt = (dueAt, cadence, now) => {
  const next = new Date(dueAt || now);
  if (cadence === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (cadence === 'monthly') {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, last));
    return next;
  }
  return next;
};

const rankEntries = (left, right, timezone, today) => {
  const leftOverdue = isOverdue(left, timezone, today) ? 0 : 1;
  const rightOverdue = isOverdue(right, timezone, today) ? 0 : 1;
  if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
  return new Date(left.dueAt || 0).getTime() - new Date(right.dueAt || 0).getTime();
};

const snapshotOf = ({ entry, article, folder }) => {
  const articleId = idOf(article) || String(entry.itemId || '');
  return {
    title: clean(article.title, 280),
    href: articleHref(articleId),
    reason: clean(entry.reason) || clean(article.placementReason),
    fromPlacement: article.placement === 'later' || article.placement === 'setAside'
      ? article.placement
      : 'stream',
    home: homeOf(article, folder),
    fromAt: article.placementAt || null
  };
};

const askedBackItem = (entry, snapshot, lastFiredOn) => ({
  articleId: String(entry.itemId || ''),
  queueId: idOf(entry),
  title: snapshot.title,
  href: snapshot.href,
  reason: snapshot.reason,
  fromPlacement: snapshot.fromPlacement,
  home: snapshot.home,
  fromAt: snapshot.fromAt || null,
  lastFiredOn
});

const completeQuietly = async (entry, now) => {
  entry.status = 'completed';
  entry.completedAt = now;
  if (typeof entry.save === 'function') await entry.save();
};

const fireAskedBack = async ({
  userId,
  models = {},
  now = new Date(),
  timezone = 'UTC'
} = {}) => {
  if (!models.ReturnQueueEntry?.find) return [];
  const today = localDateForTimezone(now, timezone);
  const entries = await loadRows(models.ReturnQueueEntry.find({
    userId,
    itemType: 'article',
    $or: [{ status: 'pending' }, { lastFiredOn: today }]
  }));
  if (!entries.length) return [];

  const articleIds = [...new Set(entries.map((row) => String(row.itemId || '')).filter(Boolean))];
  const articles = await loadRows(models.Article?.find?.({
    _id: { $in: articleIds },
    userId
  }));
  const articlesById = new Map(articles.map((row) => [idOf(row), row]));

  const folderIds = [...new Set(articles
    .map((row) => idOf(row.folder))
    .filter(Boolean))];
  const folders = folderIds.length && models.Folder?.find
    ? await loadRows(models.Folder.find({ _id: { $in: folderIds }, userId }))
    : [];
  const foldersById = new Map(folders.map((row) => [idOf(row), row]));

  const reprints = [];
  const due = [];

  for (const entry of entries) {
    if (String(entry.itemType || '') !== 'article') continue;
    const article = articlesById.get(String(entry.itemId || ''));
    const alreadyFired = String(entry.lastFiredOn || '') === today;

    if (alreadyFired) {
      if (!isQualityArticle(article) || !entry.fired?.title) {
        if (entry.status === 'pending') await completeQuietly(entry, now);
        continue;
      }
      reprints.push({ entry, article });
      continue;
    }

    if (entry.status !== 'pending' || !isDue(entry, timezone, today)) continue;
    if (!article) {
      await completeQuietly(entry, now);
      continue;
    }
    if (!isQualityArticle(article)) continue;
    due.push({ entry, article });
  }

  reprints.sort((left, right) => rankEntries(left.entry, right.entry, timezone, today));
  due.sort((left, right) => rankEntries(left.entry, right.entry, timezone, today));

  const askedBack = reprints
    .slice(0, ASKED_BACK_CAP)
    .map(({ entry }) => askedBackItem(entry, entry.fired, today));

  const remaining = ASKED_BACK_CAP - askedBack.length;
  for (const { entry, article } of due.slice(0, remaining)) {
    const folder = foldersById.get(idOf(article.folder));
    const snapshot = snapshotOf({ entry, article, folder });
    article.placement = 'stream';
    article.placementAt = null;
    article.placementReason = '';
    if (typeof article.save === 'function') await article.save();

    entry.lastFiredOn = today;
    entry.fired = snapshot;
    if (entry.cadence === 'weekly' || entry.cadence === 'monthly') {
      entry.status = 'pending';
      entry.completedAt = null;
      entry.dueAt = advanceDueAt(entry.dueAt, entry.cadence, now);
    } else {
      entry.status = 'completed';
      entry.completedAt = now;
    }
    if (typeof entry.save === 'function') await entry.save();
    askedBack.push(askedBackItem(entry, snapshot, today));
  }

  return askedBack;
};

module.exports = {
  ASKED_BACK_CAP,
  fireAskedBack,
  normalizeCadence
};
