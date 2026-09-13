const express = require('express');
const crypto = require('crypto');
const { fetchReadableArticle, paragraphsToHtml } = require('../services/readableArticle');
const {
  EditionShapeError,
  collectInbox,
  emptySections,
  hashPublicEdition,
  normalizeEdition,
  normalizeItem,
  profileKeysFor,
  projectPublicEdition,
  READER_STATUSES,
  resolveEditionProfile,
  retainHeldItems,
  windowFor
} = require('../services/editionShape');

/**
 * The newsstand.
 *
 * An agent the reader already has writes the paper; this is where it lands,
 * where they read it, and where a source they liked crosses over into their
 * own library.
 *
 * No review ceremony. A bespoke paper only its reader sees does not need a
 * committee — it needs to be honest about being agent-written, which the
 * masthead does. Approval belongs to publishing something publicly, and
 * nothing here is public.
 */

/* Who is writing. The token's label is evidence; `name` was never set, so the
   masthead used to go blank and a non-ObjectId token id used to 500 the save. */
const scribe = (req = {}) => ({
  label: String(req.agentToken?.label || req.agentToken?.name || req.body?.writtenBy || '').trim().slice(0, 200),
  agentTokenId: String(req.agentToken?.id || req.agentToken?._id || '').trim()
});

/* Normalized against the same standard as a whole edition — a boundary is
   required here too, or the daily door becomes the way around it. */
const addToHeld = (held, incoming, profile, filedBy, filedAt) => {
  const kept = (held || []).map(item => (item.toObject ? item.toObject() : item));
  const keptUrls = new Set(kept.map(item => item.url));
  const usedIds = new Set(kept.map(item => item.itemId));
  const added = [];
  incoming.forEach((raw, index) => {
    const item = normalizeItem(raw, kept.length + index, profile);
    if (keptUrls.has(item.url)) return;
    if (usedIds.has(item.itemId)) {
      throw new EditionShapeError(`Two items share the id "${item.itemId}".`, { field: 'itemId' });
    }
    keptUrls.add(item.url);
    usedIds.add(item.itemId);
    added.push({ ...item, filedBy, filedAt });
  });
  return { added, items: [...kept, ...added] };
};

const serializeItem = (item) => {
  const row = item || {};
  return {
    itemId: row.itemId,
    title: row.title,
    url: row.url,
    sourceLabel: row.sourceLabel || '',
    sourceDate: row.sourceDate || '',
    section: row.section || '',
    finding: row.finding,
    boundary: row.boundary,
    note: row.note || '',
    filedBy: row.filedBy?.label || '',
    filedAt: row.filedAt || null,
    savedArticleId: row.savedArticleId ? String(row.savedArticleId) : null,
    readerStatus: row.readerState?.status || 'new'
  };
};

const serializeEdition = (edition = {}, { withItems = true, profiles = null } = {}) => {
  const profile = resolveEditionProfile(edition.profile, { profiles });
  const items = (Array.isArray(edition.items) ? edition.items : []).map(serializeItem);
  return {
    _id: String(edition._id),
    profile: edition.profile,
    profileLabel: profile?.titleLabel || edition.profile,
    issueLabel: profile?.issueLabel || 'Edition',
    sections: profile?.sections || [],
    title: edition.title,
    number: edition.number ?? null,
    windowStart: edition.windowStart,
    windowEnd: edition.windowEnd,
    standfirst: edition.standfirst || '',
    throughLine: edition.throughLine || '',
    watchNext: edition.watchNext || [],
    writtenBy: edition.writtenBy?.label || '',
    /* Said on every edition, on the stand and on the page: the sections this
       week never filled, and how many of its sources the reader has taken. */
    unfilled: emptySections({ profile: edition.profile, items, profiles }).map(section => section.label),
    itemCount: items.length,
    savedCount: items.filter(item => item.savedArticleId).length,
    createdAt: edition.createdAt,
    updatedAt: edition.updatedAt,
    ...(withItems ? { items } : {})
  };
};

/* Same length and alphabet as every other share slug here, so one public URL
   does not look guessable next to another. */
const SLUG_BYTES = 9;

const shareSlug = () => crypto.randomBytes(SLUG_BYTES)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const isDuplicateKey = (error) => Number(error?.code) === 11000;

const PREVIEW_STALE = 'The issue changed since you previewed it. Refresh the preview before sharing.';

const noStore = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
};

const shareState = (share, { preview = null, currentHash = '' } = {}) => {
  if (!share) {
    return {
      shared: false,
      ownerDisplayName: preview?.ownerDisplayName || '',
      preview,
      currentHash
    };
  }
  return {
    shared: true,
    slug: share.slug,
    ownerDisplayName: share.ownerDisplayName || preview?.ownerDisplayName || '',
    publishedAt: share.publishedAt || null,
    contentHash: share.contentHash || '',
    currentHash,
    stale: Boolean(share.contentHash && currentHash && share.contentHash !== currentHash),
    preview,
    snapshot: share.snapshot || null
  };
};

const serializeProfile = (profile = {}) => ({
  key: profile.key,
  title: profile.title,
  issueLabel: profile.issueLabel || 'Issue',
  cadence: profile.cadence || 'weekly',
  sections: (profile.sections || [])
    .filter(section => section && section.key && section.label)
    .map(section => ({ key: section.key, label: section.label })),
  minItems: profile.minItems ?? 1,
  maxItems: profile.maxItems ?? 15,
  configuredBy: profile.configuredBy?.label || ''
});

const buildEditionRouter = ({
  auth,
  humanOnly = (_req, _res, next) => next(),
  Edition,
  EditionProfile = null,
  Article,
  /* Optional: without it, editions simply cannot be shared. */
  SharedEdition = null,
  User = null,
  /* Injected so the save door can be tested without reaching the network. */
  readArticle = fetchReadableArticle,
  onArticleSaved = () => {}
} = {}) => {
  const router = express.Router();

  /* The reader's own topics, shaped like the two Noeis ships with so that
     everything downstream — validation, sections, the empty-section sentence —
     cannot tell the difference. */
  const loadProfiles = async (userId) => {
    if (!EditionProfile) return null;
    const rows = await EditionProfile.find({ userId }).lean();
    if (!rows.length) return null;
    return Object.fromEntries(rows.map(row => [row.key, {
      key: row.key,
      titleLabel: row.title,
      issueLabel: row.issueLabel || 'Issue',
      cadence: row.cadence || 'weekly',
      sections: (row.sections || [])
        .filter(section => section && section.key && section.label)
        .map(section => ({ key: section.key, label: section.label })),
      minItems: Number.isFinite(row.minItems) ? row.minItems : 1,
      maxItems: Number.isFinite(row.maxItems) ? row.maxItems : 15
    }]));
  };

  const ownerNameOf = async (userId) => {
    if (!User) return '';
    const owner = await User.findById(userId).select('name displayName').lean().catch(() => null);
    return String(owner?.displayName || owner?.name || '').trim();
  };

  const livePreviewOf = async (edition, userId) => {
    const profiles = await loadProfiles(userId);
    const ownerDisplayName = await ownerNameOf(userId);
    const preview = projectPublicEdition(edition, ownerDisplayName, { profiles });
    return { preview, currentHash: hashPublicEdition(preview), ownerDisplayName };
  };

  const takeSource = async (item, userId) => {
    const readable = await readArticle({ url: item.url });
    const article = await Article.findOneAndUpdate(
      { url: item.url, userId },
      {
        $setOnInsert: {
          url: item.url,
          userId,
          title: readable.title || item.title,
          content: paragraphsToHtml(readable.content),
          siteName: item.sourceLabel || '',
          publicationDate: item.sourceDate || '',
          highlights: []
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return {
      article,
      readable: Boolean(readable.ok && readable.content),
      readError: readable.ok ? '' : readable.error
    };
  };

  const placeLater = async (article, userId) => {
    if (article.placement === 'later') return article;
    const now = new Date();
    const updated = await Article.findOneAndUpdate(
      { _id: article._id, userId },
      { $set: { placement: 'later', placementAt: now } },
      { new: true }
    );
    if (updated) return updated;
    article.placement = 'later';
    article.placementAt = now;
    return article;
  };

  const ownedItem = async (req, res) => {
    const edition = await Edition.findOne({ _id: req.params.id, userId: req.user.id });
    if (!edition) {
      res.status(404).json({ error: 'No such edition.' });
      return null;
    }
    const item = (edition.items || []).find(entry => entry.itemId === req.params.itemId);
    if (!item) {
      res.status(404).json({ error: 'No such item in this edition.' });
      return null;
    }
    return { edition, item };
  };

  const refuse = (res, error, fallback) => {
    if (error instanceof EditionShapeError) {
      return res.status(400).json({ error: error.message, field: error.field || '' });
    }
    /* A profile key or "undefined" used as an edition id is not an edition.
       Mongoose throws CastError; the in-memory tests never saw it, and OpenClaw
       reported HTTP 500 on the required read. */
    if (error?.name === 'CastError' && (error.path === '_id' || error.path === 'id')) {
      return res.status(404).json({ error: 'No such edition.' });
    }
    if (error?.name === 'ValidationError') {
      const first = Object.values(error.errors || {})[0];
      return res.status(400).json({
        error: first?.message || 'That edition could not be saved.',
        field: first?.path || ''
      });
    }
    console.error(`❌ ${fallback}`, error);
    return res.status(500).json({ error: fallback });
  };

  /* Whole-issue rewrite. Filing does not use this: replacing `items` after a
     duplicate-key miss lets a later loser discard an earlier loser's item. */
  const putIssue = async ({ existing, userId, doc }) => {
    if (existing) {
      return {
        saved: await Edition.findOneAndUpdate({ _id: existing._id, userId }, doc, { new: true }),
        created: false
      };
    }
    return { saved: await Edition.create({ ...doc, userId }), created: true };
  };

  /* Atomic unique append. Filter + $push so concurrent filers cannot overwrite
     each other; a miss reloads and retries with only what is still absent. */
  const appendUniqueItems = async ({ existing, userId, incoming, profile, filedBy, filedAt, writtenBy }) => {
    let held = existing;
    let merged = addToHeld(held?.items, incoming, profile, filedBy, filedAt);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (merged.items.length > profile.maxItems) {
        throw new EditionShapeError(
          `${profile.titleLabel} holds at most ${profile.maxItems} items; this issue would have ${merged.items.length}. An edition that lists everything has chosen nothing.`
        );
      }
      const remaining = merged.added;
      if (!remaining.length) return { saved: held, added: [] };

      const saved = await Edition.findOneAndUpdate(
        {
          _id: held._id,
          userId,
          'items.url': { $nin: remaining.map(item => item.url) },
          'items.itemId': { $nin: remaining.map(item => item.itemId) },
          $expr: {
            $lte: [
              { $add: [{ $size: { $ifNull: ['$items', []] } }, remaining.length] },
              profile.maxItems
            ]
          }
        },
        {
          $push: { items: { $each: remaining } },
          $set: { writtenBy, updatedAt: new Date() }
        },
        { new: true }
      );
      if (saved) return { saved, added: remaining };

      held = await Edition.findOne({ _id: held._id, userId });
      if (!held) throw new Error('No such edition.');
      merged = addToHeld(held.items, incoming, profile, filedBy, filedAt);
    }
    throw new Error('Could not file into this edition.');
  };

  /**
   * An agent hands over a week.
   *
   * Asked twice for the same window, it replaces its own edition rather than
   * printing Tuesday twice — a maintained paper is a thing an agent keeps
   * current, not a pile of drafts. Saves the reader already made survive the
   * rewrite, because those are the reader's, not the agent's.
   */
  /* The reader's standing instruction: this topic, these sections, this often.

     Written by the agent, because the reader tells their agent what they are
     interested in rather than filling in a form. Configuring a topic twice
     edits it — a reader who says "make the biotech one monthly" is changing
     their mind, not opening a second paper. */
  router.post('/api/edition-profiles', auth, async (req, res) => {
    try {
      if (!EditionProfile) return res.status(503).json({ error: 'Edition topics are not available.' });
      const key = String(req.body?.key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!key) return res.status(400).json({ error: 'key is required: a short slug for the topic, like "biotech".' });
      const title = String(req.body?.title || '').trim().slice(0, 300);
      if (!title) return res.status(400).json({ error: 'title is required: what this paper is called on its masthead.' });
      const cadence = ['daily', 'weekly', 'monthly'].includes(String(req.body?.cadence || '').trim())
        ? String(req.body.cadence).trim()
        : 'weekly';
      const hasSectionsField = Array.isArray(req.body?.sections);
      const sections = (hasSectionsField ? req.body.sections : [])
        .map(section => ({
          key: String(section?.key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
          label: String(section?.label || '').trim().slice(0, 120)
        }))
        .filter(section => section.key && section.label)
        .slice(0, 8);
      const existing = await EditionProfile.findOne({ userId: req.user.id, key });
      /* Omitted sections keep the standing shape. An explicit empty list is
         silence — not an invented evidence / counter-evidence layout. */
      const nextSections = hasSectionsField
        ? sections
        : (existing?.sections || []).map(section => ({ key: section.key, label: section.label }));
      const maxItems = Math.min(Math.max(Number(req.body?.maxItems) || 15, 1), 40);
      const minItems = Math.min(Math.max(Number(req.body?.minItems) || 1, 1), maxItems);
      const configuredBy = {
        label: String(req.body?.configuredBy || req.agentToken?.label || req.agentToken?.name || '').trim().slice(0, 200),
        agentTokenId: String(req.agentToken?.id || req.agentToken?._id || '').trim()
      };
      const doc = { key, title, issueLabel: String(req.body?.issueLabel || 'Issue').trim().slice(0, 60) || 'Issue', cadence, sections: nextSections, minItems, maxItems, configuredBy };
      const saved = existing
        ? await EditionProfile.findOneAndUpdate({ _id: existing._id, userId: req.user.id }, doc, { new: true })
        : await EditionProfile.create({ ...doc, userId: req.user.id });
      return res.status(existing ? 200 : 201).json(serializeProfile(saved));
    } catch (error) {
      return refuse(res, error, 'Failed to configure that edition topic.');
    }
  });

  router.get('/api/edition-profiles', auth, async (req, res) => {
    try {
      const rows = EditionProfile ? await EditionProfile.find({ userId: req.user.id }).sort({ createdAt: 1 }).lean() : [];
      return res.status(200).json({
        profiles: rows.map(serializeProfile),
        builtIn: profileKeysFor(null).filter(key => !rows.some(row => row.key === key))
      });
    } catch (error) {
      return refuse(res, error, 'Failed to list edition topics.');
    }
  });

  router.delete('/api/edition-profiles/:key', auth, humanOnly, async (req, res) => {
    try {
      if (!EditionProfile) return res.status(503).json({ error: 'Edition topics are not available.' });
      const removed = await EditionProfile.findOneAndDelete({ userId: req.user.id, key: String(req.params.key || '').trim() });
      if (!removed) return res.status(404).json({ error: 'No such edition topic.' });
      return res.status(200).json({ key: removed.key, removed: true });
    } catch (error) {
      return refuse(res, error, 'Failed to remove that edition topic.');
    }
  });

  /* Add to the issue this moment belongs to.

     The whole point of a maintained paper: an agent files what it found this
     morning without having to know, or resend, what it filed on Monday. The
     window comes from the topic's cadence rather than from the caller, so two
     agents filing the same day file into the same issue. */
  router.post('/api/editions/file', auth, async (req, res) => {
    try {
      const userId = req.user.id;
      const profiles = await loadProfiles(userId);
      const profile = resolveEditionProfile(req.body?.profile, { profiles });
      if (!profile) {
        return res.status(400).json({
          error: `Unknown edition topic "${req.body?.profile || ''}". Known topics: ${profileKeysFor(profiles).join(', ')}. Configure a new one before filing into it.`
        });
      }
      const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!incoming.length) return res.status(400).json({ error: 'items is required: what you found, with a boundary on each.' });

      const { windowStart, windowEnd } = windowFor(profile.cadence || 'weekly', req.body?.now ? new Date(req.body.now) : new Date());
      const filedBy = scribe(req);
      const filedAt = new Date();
      const title = String(req.body?.title || '').trim().slice(0, 300) || profile.titleLabel;
      const standfirst = String(req.body?.standfirst || '').trim().slice(0, 2400);

      let existing = await Edition.findOne({ userId, profile: profile.key, windowStart, windowEnd });
      let saved;
      let created = false;
      let added = [];
      if (!existing) {
        const prepared = addToHeld([], incoming, profile, filedBy, filedAt);
        if (prepared.items.length > profile.maxItems) {
          return res.status(400).json({
            error: `${profile.titleLabel} holds at most ${profile.maxItems} items; this issue would have ${prepared.items.length}. An edition that lists everything has chosen nothing.`
          });
        }
        try {
          saved = await Edition.create({
            userId,
            profile: profile.key,
            title,
            windowStart,
            windowEnd,
            standfirst,
            items: prepared.items,
            writtenBy: filedBy
          });
          created = true;
          added = prepared.added;
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
          existing = await Edition.findOne({ userId, profile: profile.key, windowStart, windowEnd });
          if (!existing) throw error;
        }
      }
      if (!created) {
        const writtenBy = filedBy.label ? filedBy : (existing.writtenBy || filedBy);
        const appended = await appendUniqueItems({
          existing,
          userId,
          incoming,
          profile,
          filedBy,
          filedAt,
          writtenBy
        });
        saved = appended.saved;
        added = appended.added;
      }

      return res.status(created ? 201 : 200).json({
        ...serializeEdition(saved, { profiles }),
        added: added.length,
        alreadyHeld: incoming.length - added.length
      });
    } catch (error) {
      return refuse(res, error, 'Failed to file into that edition.');
    }
  });

  router.post('/api/editions', auth, async (req, res) => {
    try {
      const userId = req.user.id;
      const profiles = await loadProfiles(userId);
      const built = normalizeEdition(req.body, { profiles });
      const existing = await Edition.findOne({
        userId,
        profile: built.profile,
        windowStart: built.windowStart,
        windowEnd: built.windowEnd
      });

      /* A rewrite keeps what the reader did and who did the work: a save they
         made, a reading choice, and the byline an earlier filing earned.
         Identity follows the source URL, so a reorder does not mint a new item. */
      const writtenBy = scribe(req);
      const now = new Date();
      let held = existing;
      let saved;
      let created = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const items = retainHeldItems(built.items, held?.items || [], writtenBy, now);
        try {
          const put = await putIssue({
            existing: held,
            userId,
            doc: { ...built, items, writtenBy }
          });
          saved = put.saved;
          created = put.created;
          break;
        } catch (error) {
          if (!isDuplicateKey(error) || held || attempt === 1) throw error;
          held = await Edition.findOne({
            userId,
            profile: built.profile,
            windowStart: built.windowStart,
            windowEnd: built.windowEnd
          });
          if (!held) throw error;
        }
      }

      return res.status(created ? 201 : 200).json(serializeEdition(saved, { profiles }));
    } catch (error) {
      return refuse(res, error, 'Failed to file the edition.');
    }
  });

  /* The stand. Newest window first, and each row carries the two sentences
     that matter: what the week left empty, and how much of it you took. */
  router.get('/api/editions', auth, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const profiles = await loadProfiles(req.user.id);
      const profile = resolveEditionProfile(req.query?.profile, { profiles });
      if (profile) query.profile = profile.key;
      const editions = await Edition.find(query)
        .sort({ windowEnd: -1, createdAt: -1 })
        .limit(Math.min(Number(req.query?.limit) || 40, 100))
        .lean();
      return res.status(200).json({
        editions: editions.map(edition => serializeEdition(edition, { withItems: false, profiles }))
      });
    } catch (error) {
      return refuse(res, error, 'Failed to open the newsstand.');
    }
  });

  /* New arrivals across every paper. Bounded, newest filing first. Missing
     reader state means new, so a legacy item still shows up. */
  router.get('/api/editions/inbox', auth, async (req, res) => {
    try {
      const userId = req.user.id;
      const profiles = await loadProfiles(userId);
      const editions = await Edition.find({ userId })
        .sort({ windowEnd: -1, createdAt: -1 })
        .limit(200)
        .lean();
      return res.status(200).json(collectInbox(editions, {
        cursor: String(req.query?.cursor || ''),
        limit: Number(req.query?.limit) || 20,
        profiles
      }));
    } catch (error) {
      return refuse(res, error, 'Failed to open new items.');
    }
  });

  router.get('/api/editions/:id', auth, async (req, res) => {
    try {
      const edition = await Edition.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      const profiles = await loadProfiles(req.user.id);
      return res.status(200).json(serializeEdition(edition, { profiles }));
    } catch (error) {
      return refuse(res, error, 'Failed to open the edition.');
    }
  });

  /**
   * The save door.
   *
   * Every other surface in this product reads library to wiki: a page cites
   * what you already own. An edition runs the other way — it cites what an
   * agent found and you have not taken. This is the one crossing, and it is
   * what makes the paper an intake surface rather than something you read and
   * close.
   *
   * The row it makes is the same row the extension makes, keyed on the URL,
   * so saving a source you already own adopts your copy instead of forking it.
   */
  router.post('/api/editions/:id/items/:itemId/save', auth, humanOnly, async (req, res) => {
    try {
      const found = await ownedItem(req, res);
      if (!found) return undefined;
      const { edition, item } = found;
      const userId = req.user.id;
      const profiles = await loadProfiles(userId);

      const taken = await takeSource(item, userId);
      item.savedArticleId = taken.article._id;
      await edition.save();
      onArticleSaved(taken.article, { userId });

      return res.status(200).json({
        articleId: String(taken.article._id),
        readable: taken.readable,
        readError: taken.readError,
        edition: serializeEdition(edition, { profiles })
      });
    } catch (error) {
      return refuse(res, error, 'Failed to save that source.');
    }
  });

  /* Save, move to Later, and take the arrival out of New — in that order.
     The arrival is not acknowledged until both the row and the placement hold. */
  router.post('/api/editions/:id/items/:itemId/later', auth, humanOnly, async (req, res) => {
    try {
      const found = await ownedItem(req, res);
      if (!found) return undefined;
      const { edition, item } = found;
      const userId = req.user.id;
      const profiles = await loadProfiles(userId);

      const taken = await takeSource(item, userId);
      item.savedArticleId = taken.article._id;
      onArticleSaved(taken.article, { userId });

      const previous = taken.article.placement || 'stream';
      let placed = true;
      try {
        await placeLater(taken.article, userId);
      } catch (_placeError) {
        placed = false;
      }

      if (placed) item.readerState = { status: 'later', at: new Date() };
      await edition.save();

      return res.status(200).json({
        articleId: String(taken.article._id),
        readable: taken.readable,
        readError: taken.readError,
        placed,
        fromSetAside: previous === 'setAside',
        edition: serializeEdition(edition, { profiles }),
        error: placed ? '' : 'Saved to Library; could not move to Later — Retry'
      });
    } catch (error) {
      return refuse(res, error, 'Failed to save that source for later.');
    }
  });

  router.post('/api/editions/:id/items/:itemId/state', auth, humanOnly, async (req, res) => {
    try {
      const status = String(req.body?.status || '').trim();
      if (status === 'later') {
        return res.status(400).json({ error: 'Use the later door to save and place the source.' });
      }
      if (status !== 'new' && !READER_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'status must be opened, dismissed, or new.' });
      }
      const found = await ownedItem(req, res);
      if (!found) return undefined;
      const { edition, item } = found;
      item.readerState = status === 'new' ? undefined : { status, at: new Date() };
      await edition.save();
      const profiles = await loadProfiles(req.user.id);
      return res.status(200).json({
        itemId: item.itemId,
        readerStatus: item.readerState?.status || 'new',
        edition: serializeEdition(edition, { profiles })
      });
    } catch (error) {
      return refuse(res, error, 'Failed to remember that choice.');
    }
  });

  /**
   * Share a paper.
   *
   * Human only, and idempotent — asking twice hands back the same link rather
   * than minting a second one, because a reader who has already sent the
   * first would then have two live URLs for one paper. The snapshot is frozen
   * at create; asking twice does not quietly republish later private edits.
   */
  router.post('/api/editions/:id/share', auth, humanOnly, async (req, res) => {
    if (!SharedEdition) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const userId = req.user.id;
      const edition = await Edition.findOne({ _id: req.params.id, userId }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });

      const { preview, currentHash, ownerDisplayName } = await livePreviewOf(edition, userId);
      const previewHash = String(req.body?.previewHash || '').trim();
      if (previewHash && previewHash !== currentHash) {
        return res.status(409).json({ error: PREVIEW_STALE, field: 'previewHash' });
      }

      const existing = await SharedEdition.findOne({ userId, editionId: edition._id }).lean();
      if (existing) {
        return res.status(200).json(shareState(existing, { preview, currentHash }));
      }

      const now = new Date();
      try {
        const created = await SharedEdition.create({
          userId,
          editionId: edition._id,
          slug: shareSlug(),
          ownerDisplayName,
          snapshot: preview,
          contentHash: currentHash,
          publishedAt: now
        });
        return res.status(201).json(shareState(created, { preview, currentHash }));
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const raced = await SharedEdition.findOne({ userId, editionId: edition._id }).lean();
        if (!raced) throw error;
        return res.status(200).json(shareState(raced, { preview, currentHash }));
      }
    } catch (error) {
      return refuse(res, error, 'Failed to share that edition.');
    }
  });

  router.get('/api/editions/:id/share', auth, async (req, res) => {
    if (!SharedEdition) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const userId = req.user.id;
      const edition = await Edition.findOne({ _id: req.params.id, userId }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      const { preview, currentHash } = await livePreviewOf(edition, userId);
      const found = await SharedEdition.findOne({ userId, editionId: edition._id }).lean();
      return res.status(200).json(shareState(found, { preview, currentHash }));
    } catch (error) {
      return refuse(res, error, 'Failed to read that share.');
    }
  });

  /* Replace the published version under the same URL. Bound to the preview
     the owner just approved, so a rewrite that landed while the panel was
     open cannot publish unseen changes. */
  router.put('/api/editions/:id/share', auth, humanOnly, async (req, res) => {
    if (!SharedEdition) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const userId = req.user.id;
      const edition = await Edition.findOne({ _id: req.params.id, userId }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });

      const { preview, currentHash, ownerDisplayName } = await livePreviewOf(edition, userId);
      const previewHash = String(req.body?.previewHash || '').trim();
      if (!previewHash || previewHash !== currentHash) {
        return res.status(409).json({ error: PREVIEW_STALE, field: 'previewHash' });
      }

      const existing = await SharedEdition.findOne({ userId, editionId: edition._id }).lean();
      if (!existing) return res.status(404).json({ error: 'This paper is not shared.' });

      const now = new Date();
      const updated = await SharedEdition.findOneAndUpdate(
        { userId, editionId: edition._id },
        {
          $set: {
            snapshot: preview,
            contentHash: currentHash,
            publishedAt: now,
            ownerDisplayName: ownerDisplayName || existing.ownerDisplayName || ''
          }
        },
        { new: true }
      );
      const row = updated && typeof updated.toObject === 'function' ? updated.toObject() : updated;
      return res.status(200).json(shareState(row, { preview, currentHash }));
    } catch (error) {
      return refuse(res, error, 'Failed to update that share.');
    }
  });

  /* Revoking removes the row, so the link stops resolving rather than
     resolving to a refusal that confirms the paper exists. Sharing again
     mints a new slug; the old URL stays dead. */
  router.delete('/api/editions/:id/share', auth, humanOnly, async (req, res) => {
    if (!SharedEdition) return res.status(200).json({ revoked: true });
    try {
      await SharedEdition.deleteOne({ userId: req.user.id, editionId: req.params.id });
      return res.status(200).json({ revoked: true });
    } catch (error) {
      return refuse(res, error, 'Failed to revoke that share.');
    }
  });

  /* The public read. The snapshot, and nothing live. A revoked or never-
     minted slug is the same unanswered link. */
  router.get('/api/public/editions/:slug', async (req, res) => {
    noStore(res);
    if (!SharedEdition) return res.status(404).json({ error: 'No such edition.' });
    try {
      const share = await SharedEdition.findOne({ slug: String(req.params.slug || '').trim() }).lean();
      if (!share?.snapshot) return res.status(404).json({ error: 'No such edition.' });
      return res.status(200).json(share.snapshot);
    } catch (error) {
      return refuse(res, error, 'Failed to open that edition.');
    }
  });

  /* A paper you did not want. Human only: an agent that could delete its own
     back issues could quietly rewrite what it told you last week. */
  router.delete('/api/editions/:id', auth, humanOnly, async (req, res) => {
    try {
      const removed = await Edition.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
      if (!removed) return res.status(404).json({ error: 'No such edition.' });
      return res.status(200).json({ removed: true });
    } catch (error) {
      return refuse(res, error, 'Failed to remove the edition.');
    }
  });

  return router;
};

module.exports = { buildEditionRouter, serializeEdition, serializeItem };
