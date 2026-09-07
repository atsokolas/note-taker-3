const express = require('express');
const crypto = require('crypto');
const { fetchReadableArticle } = require('../services/readableArticle');
const {
  EditionShapeError,
  emptySections,
  normalizeEdition,
  normalizeItem,
  profileKeysFor,
  resolveEditionProfile,
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

/* Who is writing. An agent's own claim about its name is not evidence, so
   this reads the token first and only falls back to what the caller said. */
const scribe = (req = {}) => ({
  label: String(req.agentToken?.name || req.body?.writtenBy || '').trim().slice(0, 200),
  agentTokenId: req.agentToken?.id || null
});

const serializeItem = (item = {}) => ({
  itemId: item.itemId,
  title: item.title,
  url: item.url,
  sourceLabel: item.sourceLabel || '',
  sourceDate: item.sourceDate || '',
  section: item.section || '',
  finding: item.finding,
  boundary: item.boundary,
  note: item.note || '',
  filedBy: item.filedBy?.label || '',
  filedAt: item.filedAt || null,
  savedArticleId: item.savedArticleId ? String(item.savedArticleId) : null
});

const serializeEdition = (edition = {}, { withItems = true, profiles = null } = {}) => {
  const profile = resolveEditionProfile(edition.profile, { profiles });
  const items = (edition.items || []).map(serializeItem);
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

/**
 * What a stranger sees.
 *
 * The paper, and nothing about the person who kept it. Not which sources they
 * took into their own library, not how many — a public edition is the reading,
 * and what the reader did with it afterwards is theirs.
 */
const serializePublicEdition = (edition = {}, ownerDisplayName = '', { profiles = null } = {}) => {
  const full = serializeEdition(edition, { profiles });
  const { savedCount, ...rest } = full;
  return {
    ...rest,
    ownerDisplayName,
    items: (full.items || []).map(({ savedArticleId, ...item }) => item)
  };
};

const serializeProfile = (profile = {}) => ({
  key: profile.key,
  title: profile.title,
  issueLabel: profile.issueLabel || 'Issue',
  cadence: profile.cadence || 'weekly',
  sections: (profile.sections || []).map(section => ({ key: section.key, label: section.label })),
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
      sections: (row.sections || []).map(section => ({ key: section.key, label: section.label })),
      minItems: Number.isFinite(row.minItems) ? row.minItems : 1,
      maxItems: Number.isFinite(row.maxItems) ? row.maxItems : 15
    }]));
  };

  const refuse = (res, error, fallback) => {
    if (error instanceof EditionShapeError) {
      return res.status(400).json({ error: error.message, field: error.field || '' });
    }
    console.error(`❌ ${fallback}`, error);
    return res.status(500).json({ error: fallback });
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
      const sections = (Array.isArray(req.body?.sections) ? req.body.sections : [])
        .map(section => ({
          key: String(section?.key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
          label: String(section?.label || '').trim().slice(0, 120)
        }))
        .filter(section => section.key && section.label)
        .slice(0, 8);
      if (!sections.length) {
        return res.status(400).json({
          error: 'At least one section is required. Sections are the argument a paper makes about its subject; a paper without them is a list.'
        });
      }
      const maxItems = Math.min(Math.max(Number(req.body?.maxItems) || 15, 1), 40);
      const minItems = Math.min(Math.max(Number(req.body?.minItems) || 1, 1), maxItems);
      const configuredBy = {
        label: String(req.body?.configuredBy || req.agentToken?.name || '').trim().slice(0, 200),
        agentTokenId: req.agentToken?.id || null
      };
      const existing = await EditionProfile.findOne({ userId: req.user.id, key });
      const doc = { key, title, issueLabel: String(req.body?.issueLabel || 'Issue').trim().slice(0, 60) || 'Issue', cadence, sections, minItems, maxItems, configuredBy };
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
      const existing = await Edition.findOne({ userId, profile: profile.key, windowStart, windowEnd });
      const kept = (existing?.items || []).map(item => (item.toObject ? item.toObject() : item));
      const keptUrls = new Set(kept.map(item => item.url));

      /* Normalized against the same standard as a whole edition — a boundary
         is required here too, or the daily door becomes the way around it. */
      const filedBy = scribe(req);
      const filedAt = new Date();
      const added = [];
      incoming.forEach((raw, index) => {
        const item = normalizeItem(raw, kept.length + index, profile);
        if (keptUrls.has(item.url)) return;
        keptUrls.add(item.url);
        added.push({ ...item, filedBy, filedAt });
      });

      const items = [...kept, ...added];
      if (items.length > profile.maxItems) {
        return res.status(400).json({
          error: `${profile.titleLabel} holds at most ${profile.maxItems} items; this issue would have ${items.length}. An edition that lists everything has chosen nothing.`
        });
      }

      const writtenBy = filedBy.label ? filedBy : (existing?.writtenBy || filedBy);

      const saved = existing
        ? await Edition.findOneAndUpdate({ _id: existing._id, userId }, { items, writtenBy }, { new: true })
        : await Edition.create({
          userId,
          profile: profile.key,
          title: String(req.body?.title || '').trim().slice(0, 300) || profile.titleLabel,
          windowStart,
          windowEnd,
          standfirst: String(req.body?.standfirst || '').trim().slice(0, 2400),
          items,
          writtenBy
        });

      return res.status(existing ? 200 : 201).json({
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
         made, and the byline an earlier filing earned. Both key on the link. */
      const held = new Map((existing?.items || []).map(item => [item.url, item]));
      const writtenBy = scribe(req);
      const now = new Date();
      const items = built.items.map((item) => {
        const before = held.get(item.url);
        return {
          ...item,
          filedBy: before?.filedBy?.label ? before.filedBy : writtenBy,
          filedAt: before?.filedAt || now,
          savedArticleId: before?.savedArticleId || null
        };
      });

      const saved = existing
        ? await Edition.findOneAndUpdate(
          { _id: existing._id, userId },
          { ...built, items, writtenBy },
          { new: true }
        )
        : await Edition.create({ ...built, items, writtenBy, userId });

      return res.status(existing ? 200 : 201).json(serializeEdition(saved, { profiles }));
    } catch (error) {
      return refuse(res, error, 'Failed to file the edition.');
    }
  });

  /* The stand. Newest window first, and each row carries the two sentences
     that matter: what the week left empty, and how much of it you took. */
  router.get('/api/editions', auth, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const profile = resolveEditionProfile(req.query?.profile);
      if (profile) query.profile = profile.key;
      const editions = await Edition.find(query)
        .sort({ windowEnd: -1, createdAt: -1 })
        .limit(Math.min(Number(req.query?.limit) || 40, 100))
        .lean();
      return res.status(200).json({ editions: editions.map(edition => serializeEdition(edition, { withItems: false })) });
    } catch (error) {
      return refuse(res, error, 'Failed to open the newsstand.');
    }
  });

  router.get('/api/editions/:id', auth, async (req, res) => {
    try {
      const edition = await Edition.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      return res.status(200).json(serializeEdition(edition));
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
      const userId = req.user.id;
      const edition = await Edition.findOne({ _id: req.params.id, userId });
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      const item = (edition.items || []).find(entry => entry.itemId === req.params.itemId);
      if (!item) return res.status(404).json({ error: 'No such item in this edition.' });

      /* Fetched before the row is written, so a source taken from an
         agent's paper arrives readable. This used to save a title and a URL
         and nothing else — a row you could file but not read, and certainly
         not highlight, which is the seam in "seamless".

         A failed fetch is not a failed save: a paywall answering 403 is
         still a source worth keeping, so the row is written either way and
         the reason is reported beside it. */
      const readable = await readArticle({ url: item.url });

      const article = await Article.findOneAndUpdate(
        { url: item.url, userId },
        {
          $setOnInsert: {
            url: item.url,
            userId,
            /* The page's own title beats the agent's, which is a headline
               written for the edition rather than the piece. */
            title: readable.title || item.title,
            content: readable.content || '',
            siteName: item.sourceLabel || '',
            publicationDate: item.sourceDate || '',
            highlights: []
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      item.savedArticleId = article._id;
      await edition.save();
      onArticleSaved(article, { userId });

      return res.status(200).json({
        articleId: String(article._id),
        /* Said plainly, because "saved" and "saved but empty" are different
           things to a reader about to go looking for the text. */
        readable: Boolean(readable.ok && readable.content),
        readError: readable.ok ? '' : readable.error,
        edition: serializeEdition(edition)
      });
    } catch (error) {
      return refuse(res, error, 'Failed to save that source.');
    }
  });

  /**
   * Share a paper.
   *
   * Human only, and idempotent — asking twice hands back the same link rather
   * than minting a second one, because a reader who has already sent the
   * first would then have two live URLs for one paper.
   */
  router.post('/api/editions/:id/share', auth, humanOnly, async (req, res) => {
    if (!SharedEdition) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const userId = req.user.id;
      const edition = await Edition.findOne({ _id: req.params.id, userId }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });

      const existing = await SharedEdition.findOne({ userId, editionId: edition._id }).lean();
      if (existing) return res.status(200).json({ shared: true, slug: existing.slug });

      let ownerDisplayName = '';
      if (User) {
        const owner = await User.findById(userId).select('name displayName').lean().catch(() => null);
        ownerDisplayName = String(owner?.displayName || owner?.name || '').trim();
      }
      const created = await SharedEdition.create({
        userId,
        editionId: edition._id,
        slug: shareSlug(),
        ownerDisplayName
      });
      return res.status(201).json({ shared: true, slug: created.slug });
    } catch (error) {
      return refuse(res, error, 'Failed to share that edition.');
    }
  });

  router.get('/api/editions/:id/share', auth, async (req, res) => {
    if (!SharedEdition) return res.status(200).json({ shared: false });
    try {
      const found = await SharedEdition
        .findOne({ userId: req.user.id, editionId: req.params.id })
        .lean();
      return res.status(200).json(found ? { shared: true, slug: found.slug } : { shared: false });
    } catch (error) {
      return refuse(res, error, 'Failed to read that share.');
    }
  });

  /* Revoking removes the row, so the link stops resolving rather than
     resolving to a refusal that confirms the paper exists. */
  router.delete('/api/editions/:id/share', auth, humanOnly, async (req, res) => {
    if (!SharedEdition) return res.status(200).json({ revoked: true });
    try {
      await SharedEdition.deleteOne({ userId: req.user.id, editionId: req.params.id });
      return res.status(200).json({ revoked: true });
    } catch (error) {
      return refuse(res, error, 'Failed to revoke that share.');
    }
  });

  /* The public read. No auth, and deliberately no trace of the reader beyond
     the name they publish under. */
  router.get('/api/public/editions/:slug', async (req, res) => {
    if (!SharedEdition) return res.status(404).json({ error: 'No such edition.' });
    try {
      const share = await SharedEdition.findOne({ slug: String(req.params.slug || '').trim() }).lean();
      if (!share) return res.status(404).json({ error: 'No such edition.' });
      const edition = await Edition.findOne({ _id: share.editionId, userId: share.userId }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      return res.status(200).json(serializePublicEdition(edition, share.ownerDisplayName));
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

module.exports = { buildEditionRouter, serializeEdition, serializePublicEdition, serializeItem };
