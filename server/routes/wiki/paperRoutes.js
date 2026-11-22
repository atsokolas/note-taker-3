// A judgment started from a highlight, and the morning paper's columns.
const { buildClaimPage } = require('../../services/claimFromHighlight');
const { createWikiRevision } = require('../../services/wikiRevisionService');
const { paperColumns, openTargets } = require('../../services/paperColumns');
const {
  dayOf,
  assertionsFrom,
  askedBefore,
  quietStreak,
  closings
} = require('../../services/paperLedger');

module.exports = (router, {
  EVENT_NAMES,
  MorningPaperRecord,
  WikiBriefingCache,
  WikiPage,
  WikiRevision,
  buildUniqueSlug,
  findHighlightById,
  trackWikiEvent,
  wikiAuth
}) => {
  /* Contradiction as a view, not a tag.
     Every claim in the wiki that something in the library argues with, with
     both passages and both publications — so a disagreement can be read as a
     disagreement instead of being inferred from a colour inside one article
     you had to already be reading. */
  /**
   * The four things only this product can print.
   *
   * A belief you have not looked at in a year, your own sources caught
   * arguing, a claim you reversed, and the page that has gone longest without
   * a word. Each is absent when there is nothing true to say, which is what
   * makes a quiet morning's paper short.
   */
  /**
   * A belief, born from a sentence you marked.
   *
   * The one door into the ledger from the Library. Everything the morning
   * paper reads — the anniversary, the calibration line — reads claims, and until now a highlight could become a question, a
   * note, a concept or a wiki section, but never a claim.
   */
  router.post('/api/judgment/from-highlight', wikiAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const claim = String(req.body?.claim || '').trim();
      if (!claim) return res.status(400).json({ error: 'A claim needs a sentence of your own.' });

      const highlightId = String(req.body?.highlightId || '').trim();
      const highlight = highlightId && findHighlightById
        ? await findHighlightById(userId, highlightId).catch(() => null)
        : null;

      const page = new WikiPage(buildClaimPage({
        userId,
        claim,
        highlight: highlight || {},
        resolutionCriteria: req.body?.resolutionCriteria,
        horizon: req.body?.horizon || null,
        slug: await buildUniqueSlug(userId, claim.slice(0, 120))
      }));
      await page.save();

      if (WikiRevision) {
        await createWikiRevision({
          WikiRevision,
          userId,
          page,
          reason: 'created',
          actorType: 'user',
          summary: 'Claim held from a highlight.'
        }).catch(() => null);
      }
      if (WikiBriefingCache) await WikiBriefingCache.deleteOne({ userId }).catch(() => null);
      trackWikiEvent(req, EVENT_NAMES.VIEW_HELD, { pageId: String(page._id), from: 'highlight' });

      return res.status(201).json({
        pageId: String(page._id),
        claimId: page.claims?.[0]?.claimId || '',
        title: page.title,
        href: `/judgment/${page._id}`
      });
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status === 500) console.error('Error holding a claim from a highlight:', error);
      return res.status(status).json({ error: error?.message || 'Could not hold that claim.' });
    }
  });

  router.get('/api/morning-paper/columns', wikiAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      /* Exactly the fields the columns read, and nothing else.
         `claims` and `sourceRefs` are the two fat arrays on a wiki page: a
         source ref carries a title, a snippet, a url and Mixed metadata, and
         this only ever asks whether the page has any; a history entry carries
         text, a summary, a note and a Mixed evidence delta, and this only
         reads when it happened and what was done. Pulling all of it for three
         hundred pages on every load of the paper is a lot of heap for an
         instance that is already short of it. */
      const pages = await WikiPage.find({ userId, status: { $ne: 'archived' } })
        .select([
          'title updatedAt status',
          'sourceRefs._id',
          'claims.claimId claims.text claims.bornAt claims.createdAt',
          'claims.checkInStatus claims.retiredAt claims.lastCheckedAt claims.lastReviewedAt',
          'claims.support claims.contradictedByCitationIds',
          'claims.history.at claims.history.action',
          'claims.verdicts.at',
          /* What the reader said would change their mind. */
          'judgment.falsifiers',
          /* The oldest thing still open. */
          'judgment.unknowns',
          /* What the calibration instrument reads to score a settled case:
             the held sentence, the confidence it was held at, and the verdict
             that later met it. `createdAt` and `userId` are its fallbacks for
             when the judgment names no birthday and for ownership. */
          'userId createdAt adapterId',
          'judgment.currentJudgment judgment.confidence judgment.adapterId',
          'judgment.bornAt judgment.startedAt',
          'judgment.verdicts judgment.outcomes'
        ].join(' '))
        .sort({ updatedAt: -1 })
        .limit(300)
        .lean();
      /* The client names the edition, because the reader's Saturday is where
         the reader is and this server reads UTC. Anything but the weekend is
         today. */
      const weekend = String(req.query?.edition || '').trim().toLowerCase() === 'weekend';
      const columns = paperColumns({ pages, userId, weekend });

      /* The paper joins the ledger. Without a record of what it said, it
         cannot count its own asking and cannot notice when you answered — and
         a product built on holding you to your past claims had exempted its
         own daily surface from that standard.

         The write happens on read because the paper has one reader and one
         moment: it is an upsert keyed on the day, so refreshing five times
         still leaves one morning on the record. */
      let asked = 0;
      let closed = [];
      let streak = 0;
      if (MorningPaperRecord) {
        const today = dayOf();
        const assertions = assertionsFrom(columns);
        const history = await MorningPaperRecord
          .find({ userId })
          .sort({ day: -1 })
          .limit(60)
          .lean();

        const lead = assertions[0] || null;
        asked = lead ? askedBefore({ history, assertion: lead, today }) : 0;
        streak = quietStreak({ history });
        closed = closings({
          history,
          open: openTargets({ pages }),
          known: new Set(pages.map(page => String(page._id))),
          now: Date.now()
        });

        if (assertions.length) {
          await MorningPaperRecord.findOneAndUpdate(
            { userId, day: today },
            { userId, day: today, assertions },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }

      return res.status(200).json({ ...columns, asked, closed, streak });
    } catch (error) {
      console.error('Error reading the morning columns:', error);
      return res.status(500).json({ error: 'Could not read what the paper has to say.' });
    }
  });
};
