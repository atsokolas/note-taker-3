const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');
const { wordBoundaryTrim } = require('../lib/editorialText');
const {
  canonicalWikiTitle,
  editorialSentence,
  sentenceBoundaryTrim
} = require('./wikiPresentationGuard');
const {
  buildWikiOpenQuestionRows
} = require('./wikiOpenQuestionsService');

/**
 * wikiBriefingService — assembles the "Daily wiki briefing" surfaced
 * at the top of the wiki index. Computes counts and titles from the
 * last 24h of activity across the user's library + wiki pages and
 * (optionally) writes a 1–3 sentence agent-authored summary on top.
 *
 * Inputs are explicit so the route handler can pass the same Mongoose
 * models the maintenance service receives. Falls back to a deterministic
 * template when the HF client is unconfigured so the round-trip works
 * end-to-end in dev.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BRIEFING_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const asString = (value = '') => String(value || '').trim();

const truncate = (value = '', limit = 200) => wordBoundaryTrim(asString(value).replace(/\s+/g, ' '), { maxLength: limit });

const isWithin = (timestamp, windowMs, now) => {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < windowMs;
};

const safeFind = async (Model, query = {}, limit = 200, projection = '') => {
  if (!Model?.find) return [];
  try {
    const cursor = Model.find(query);
    const selected = projection && cursor.select ? cursor.select(projection) : cursor;
    const sorted = selected.sort?.({ updatedAt: -1, createdAt: -1 }) || selected;
    const limited = sorted.limit?.(limit) || sorted;
    const lean = limited.lean?.() || limited;
    const result = await lean;
    return Array.isArray(result) ? result : [];
  } catch (_err) {
    try {
      const result = await Model.find(query);
      return Array.isArray(result) ? result : [];
    } catch (__err) {
      return [];
    }
  }
};

const safeFindOne = async (Model, query = {}) => {
  if (!Model?.findOne) return null;
  try {
    const cursor = Model.findOne(query);
    const lean = cursor.lean?.() || cursor;
    return await lean;
  } catch (_err) {
    try {
      return await Model.findOne(query);
    } catch (__err) {
      return null;
    }
  }
};

const idString = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id && value._id !== value) return idString(value._id);
  }
  return String(value);
};

const normalizeKey = (value = '') => asString(value).toLowerCase().replace(/\s+/g, ' ').trim();

const toArray = (value) => (Array.isArray(value) ? value : []);

const countSupportedClaims = (claims = []) => {
  return toArray(claims).filter(claim => {
    const support = normalizeKey(claim?.support || claim?.status || claim?.evidenceStatus);
    return support === 'supported' || support === 'partial' || support === 'partially supported';
  }).length;
};

const sourceRefKey = (ref = {}) => {
  return [
    ref.id,
    ref._id,
    ref.sourceId,
    ref.sourceObjectId,
    ref.articleId,
    ref.highlightId,
    ref.url,
    ref.title,
    ref.sourceTitle
  ].map(idString).find(Boolean) || JSON.stringify(ref);
};

const sourceRefTitle = (ref = {}) => {
  return truncate(
    ref.title
    || ref.sourceTitle
    || ref.label
    || ref.url
    || ref.type
    || 'New source',
    90
  );
};

const collectRecentMaintenanceChanges = async ({
  userId,
  models = {},
  windowMs = ONE_DAY_MS,
  now = Date.now(),
  limit = 8
}) => {
  const revisions = await safeFind(
    models.WikiRevision,
    {
      userId,
      reason: { $in: ['agent_maintenance', 'source_event'] }
    },
    80,
    'pageId reason maintenanceRunId sourceEventId summary createdAt before.sourceRefs._id before.sourceRefs.objectId before.sourceRefs.url before.sourceRefs.title before.claims.support before.aiState.health after._id after.title after.sourceRefs._id after.sourceRefs.objectId after.sourceRefs.url after.sourceRefs.title after.claims.support after.aiState.health'
  );
  return revisions
    .filter(revision => (
      isWithin(revision.createdAt, windowMs, now)
      && ['agent_maintenance', 'source_event'].includes(asString(revision.reason))
    ))
    .map(revision => {
      const beforeRefs = toArray(revision.before?.sourceRefs);
      const afterRefs = toArray(revision.after?.sourceRefs);
      const beforeKeys = new Set(beforeRefs.map(sourceRefKey));
      const addedRefs = afterRefs.filter(ref => {
        const key = sourceRefKey(ref);
        return key && !beforeKeys.has(key);
      });
      const beforeClaims = toArray(revision.before?.claims);
      const afterClaims = toArray(revision.after?.claims);
      const beforeHealth = revision.before?.aiState?.health || {};
      const afterHealth = revision.after?.aiState?.health || {};
      return {
        pageId: idString(revision.pageId || revision.after?._id),
      title: asString(canonicalWikiTitle(revision.after)) || 'Untitled wiki page',
        summary: truncate(revision.summary || revision.after?.aiState?.lastMaintenanceSummary || '', 180),
        reason: asString(revision.reason),
        maintenanceRunId: idString(revision.maintenanceRunId),
        sourceEventId: idString(revision.sourceEventId),
        changedAt: revision.createdAt || null,
        sourceRefsAdded: addedRefs.length,
        sourceTitles: addedRefs.slice(0, 4).map(sourceRefTitle),
        claimsChanged: Math.max(0, afterClaims.length - beforeClaims.length),
        supportChanged: Math.max(0, countSupportedClaims(afterClaims) - countSupportedClaims(beforeClaims)),
        becameConflicted: toArray(afterHealth.contradictions).length > toArray(beforeHealth.contradictions).length
      };
    })
    .filter(change => change.pageId || change.title !== 'Untitled wiki page')
    .sort((a, b) => new Date(b.changedAt || 0).getTime() - new Date(a.changedAt || 0).getTime())
    .slice(0, limit);
};

const collectPagesWithNewSourceMaterial = (maintenanceChanges = [], { limit = 6 } = {}) => {
  return maintenanceChanges
    .filter(change => Number(change.sourceRefsAdded || 0) > 0)
    .map(change => ({
      pageId: change.pageId,
      title: change.title,
      addedSourceCount: Number(change.sourceRefsAdded || 0),
      sourceTitles: toArray(change.sourceTitles).slice(0, 4),
      changedAt: change.changedAt,
      sourceEventId: change.sourceEventId || null
    }))
    .slice(0, limit);
};

const questionHasEvidenceLinks = (question = {}) => {
  return Boolean(
    question.linkedHighlightId
    || question.linkedNotebookEntryId
    || toArray(question.linkedHighlightIds).length
    || toArray(question.blocks).some(block => block?.type === 'highlight-ref' || block?.highlightId)
  );
};

const collectAnswerableQuestions = async ({
  userId,
  models = {},
  wikiPages = [],
  pagesWithNewSourceMaterial = [],
  maintenanceChanges = [],
  limit = 5
}) => {
  const questions = models.Question
    ? await safeFind(
      models.Question,
      {
        userId,
        status: 'open',
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      },
      120,
      '_id text status conceptName linkedTagName sourceType sourcePageId sourcePageTitle linkedHighlightId linkedNotebookEntryId linkedHighlightIds blocks hiddenFromHome debugOnly archived'
    )
    : [];
  const wikiOpenQuestions = buildWikiOpenQuestionRows(wikiPages);
  const evidencePages = pagesWithNewSourceMaterial.map(page => {
    const change = maintenanceChanges.find(item => item.pageId === page.pageId) || {};
    return {
      ...page,
      supportChanged: Number(change.supportChanged || 0),
      claimsChanged: Number(change.claimsChanged || 0)
    };
  });
  return [...questions, ...wikiOpenQuestions]
    .filter(question => (
      question.status === 'open'
      && !question.hiddenFromHome
      && !question.debugOnly
      && !question.archived
    ))
    .flatMap(question => {
      const keys = [
        question.conceptName,
        question.linkedTagName
      ].map(normalizeKey).filter(Boolean);
      if (!keys.length) return [];
      return evidencePages
        .filter(page => {
          const pageTitle = normalizeKey(page.title);
          const matched = keys.some(key => pageTitle === key || pageTitle.includes(key) || key.includes(pageTitle));
          if (!matched) return false;
          return (
            Number(page.addedSourceCount || 0) >= 2
            || Number(page.supportChanged || 0) > 0
            || (Number(page.addedSourceCount || 0) > 0 && questionHasEvidenceLinks(question))
          );
        })
        .map(page => ({
          questionId: idString(question._id),
          text: truncate(question.text, 160),
          conceptName: truncate(question.conceptName || question.linkedTagName || '', 90),
          linkedTagName: truncate(question.linkedTagName || '', 90),
          sourceType: question.sourceType || 'question',
          sourcePageId: question.sourcePageId || '',
          sourcePageTitle: question.sourcePageTitle || '',
          evidencePageId: page.pageId,
          evidencePageTitle: page.title,
          evidenceCount: Number(page.addedSourceCount || 0),
          changedAt: page.changedAt,
          href: question.sourceType === 'wiki_open_question' && question.href
            ? question.href
            : `/think?tab=questions&questionId=${idString(question._id)}`
        }));
    })
    .sort((a, b) => Number(b.evidenceCount || 0) - Number(a.evidenceCount || 0))
    .slice(0, limit);
};

const buildBriefingNextAction = ({
  recentReceipts = [],
  answerableQuestions = [],
  pagesWithNewSourceMaterial = [],
  driftingPages = [],
  recentlyUpdatedPages = []
} = {}) => {
  const failedReceipt = recentReceipts.find(receipt => receipt.status === 'failed');
  if (failedReceipt) {
    return {
      type: 'review_import',
      label: failedReceipt.nextAction?.label || `Review ${failedReceipt.sourceLabel}`,
      href: '/connections',
      reason: failedReceipt.summary || `${failedReceipt.sourceLabel} needs attention`,
      target: { type: 'receipt', id: failedReceipt.id, title: failedReceipt.sourceLabel }
    };
  }
  const reviewReceipt = recentReceipts.find(receipt => receipt.status === 'needs_review');
  if (reviewReceipt) {
    return {
      type: 'review_maintenance',
      label: reviewReceipt.nextAction?.label || `Review ${reviewReceipt.sourceLabel} maintenance`,
      href: reviewReceipt.nextAction?.href || '/wiki',
      reason: reviewReceipt.summary || `${reviewReceipt.sourceLabel} maintenance needs review`,
      target: { type: 'receipt', id: reviewReceipt.id, title: reviewReceipt.sourceLabel }
    };
  }
  const question = answerableQuestions[0];
  if (question) {
    return {
      type: 'answer_question',
      label: 'Answer the question that now has evidence',
      href: question.href,
      reason: `${question.evidencePageTitle} gained ${question.evidenceCount} source${question.evidenceCount === 1 ? '' : 's'}`,
      target: { type: 'question', id: question.questionId, title: question.text }
    };
  }
  const sourcedPage = pagesWithNewSourceMaterial[0];
  if (sourcedPage) {
    return {
      type: 'review_page',
      label: `Review ${sourcedPage.title}`,
      href: `/wiki/workspace?page=${sourcedPage.pageId}`,
      reason: `${sourcedPage.addedSourceCount} new source${sourcedPage.addedSourceCount === 1 ? '' : 's'} reached this page`,
      target: { type: 'wiki_page', id: sourcedPage.pageId, title: sourcedPage.title }
    };
  }
  const drifting = driftingPages[0];
  if (drifting) {
    return {
      type: 'rebuild_page',
      label: `Rebuild ${drifting.title}`,
      href: `/wiki/workspace?page=${drifting._id}`,
      reason: describeDriftWait(drifting),
      target: { type: 'wiki_page', id: drifting._id, title: drifting.title }
    };
  }
  const updated = recentlyUpdatedPages[0];
  if (updated) {
    return {
      type: 'review_page',
      label: `Review ${updated.title}`,
      href: `/wiki/workspace?page=${updated._id}`,
      reason: 'The maintenance agent updated this page recently',
      target: { type: 'wiki_page', id: updated._id, title: updated.title }
    };
  }
  return null;
};

/**
 * Count library sources added in the last `windowMs` for one user.
 * Returns a flat number — the briefing card surfaces it as a chip;
 * we don't ship per-source detail in v1.
 */
const countNewSources = async ({ userId, models = {}, windowMs = ONE_DAY_MS, now = Date.now() }) => {
  const [articles, notebooks, highlightsArticles] = await Promise.all([
    safeFind(models.Article, { userId }, 400, 'createdAt highlights.createdAt'),
    safeFind(models.NotebookEntry, { userId }, 400, 'createdAt'),
    // Highlights live inside articles. We re-use the article list and
    // count highlights with a recent createdAt.
    Promise.resolve([])
  ]);
  let count = 0;
  for (const article of articles) {
    if (isWithin(article.createdAt, windowMs, now)) count += 1;
    if (Array.isArray(article.highlights)) {
      for (const highlight of article.highlights) {
        if (isWithin(highlight.createdAt, windowMs, now)) count += 1;
      }
    }
  }
  for (const notebook of notebooks) {
    if (isWithin(notebook.createdAt, windowMs, now)) count += 1;
  }
  // Touch the unused promise so the linter is happy and to make the
  // shape explicit if we add a separate Highlight model later.
  void highlightsArticles;
  return count;
};

const collectRecentlyUpdatedPages = (pages = [], { windowMs = ONE_DAY_MS, now = Date.now() } = {}) => {
  return pages
    .filter(page => isWithin(page?.aiState?.lastDraftedAt, windowMs, now))
    .slice(0, 8)
    .map(page => ({
      _id: String(page._id || ''),
      title: asString(canonicalWikiTitle(page)) || 'Untitled wiki page',
      lastDraftedAt: page.aiState?.lastDraftedAt || null
    }));
};

const pendingEventCount = (page = {}) => {
  const ids = page?.freshness?.pendingSourceEventIds;
  return Array.isArray(ids) ? ids.filter(Boolean).length : 0;
};

const collectDriftingPages = (pages = [], { now = Date.now() } = {}) => {
  // Standing aiState.health is a snapshot, not a rebuild queue. The live
  // queue is freshness.pendingSourceEventIds — treating health as news is
  // how "Survivorship Bias with 5" was re-served for 18 days.
  return pages
    .map(page => {
      const driftSignals = pendingEventCount(page);
      const lastSourceEventAt = page?.freshness?.lastSourceEventAt || null;
      const waitingMs = lastSourceEventAt
        ? Math.max(0, now - new Date(lastSourceEventAt).getTime())
        : 0;
      return { page, driftSignals, lastSourceEventAt, waitingDays: Math.floor(waitingMs / ONE_DAY_MS) };
    })
    .filter(entry => entry.driftSignals > 0)
    .sort((a, b) => b.driftSignals - a.driftSignals || b.waitingDays - a.waitingDays)
    .slice(0, 8)
    .map(entry => ({
      _id: String(entry.page._id || ''),
      title: asString(canonicalWikiTitle(entry.page)) || 'Untitled wiki page',
      driftSignals: entry.driftSignals,
      lastSourceEventAt: entry.lastSourceEventAt,
      waitingDays: entry.waitingDays,
      href: `/wiki/workspace?page=${encodeURIComponent(String(entry.page._id || ''))}`
    }));
};

/** Two days is where a queue stops being news and starts being a debt. */
const AGED_AFTER_DAYS = 2;

/**
 * One description of a drift queue, so the return path and the aliveness line
 * can never tell the reader two different stories about the same page.
 * A fresh queue leads with the count; an aged one leads with the wait, because
 * by then the honest fact is the debt, not the news.
 */
const describeDriftWait = ({ driftSignals = 0, waitingDays = 0 } = {}) => {
  const signals = Math.max(0, Number(driftSignals) || 0);
  const days = Math.max(0, Number(waitingDays) || 0);
  const queued = `${signals} drift signal${signals === 1 ? '' : 's'} queued`;
  return days >= AGED_AFTER_DAYS ? `waiting ${days} days · ${queued}` : queued;
};

const alivenessFingerprint = (driftingPages = []) => (
  driftingPages
    .map(page => `${page._id}:${page.driftSignals}`)
    .sort()
    .join('|')
);

const buildAliveness = ({
  driftingPages = [],
  priorAliveness = null,
  now = Date.now()
} = {}) => {
  const fingerprint = alivenessFingerprint(driftingPages);
  if (!fingerprint) {
    return {
      register: 'quiet',
      fingerprint: '',
      firstSeenAt: null,
      waitingDays: 0,
      notable: null,
      copy: ''
    };
  }
  const notable = driftingPages[0];
  const sameAsLastVisit = Boolean(priorAliveness?.fingerprint && priorAliveness.fingerprint === fingerprint);
  const firstSeenAt = sameAsLastVisit && priorAliveness.firstSeenAt
    ? priorAliveness.firstSeenAt
    : new Date(now).toISOString();
  const waitingDays = Math.max(
    Number(notable?.waitingDays || 0),
    Math.floor((now - new Date(firstSeenAt).getTime()) / ONE_DAY_MS)
  );
  const register = sameAsLastVisit || waitingDays >= AGED_AFTER_DAYS ? 'aged' : 'new';
  const days = Math.max(1, waitingDays);
  const copy = register === 'aged'
    ? sentenceBoundaryTrim(
      waitingDays < 1
        ? `${notable.title} is still waiting on a rebuild — clear it?`
        : `${notable.title} has been waiting on a rebuild for ${days} day${days === 1 ? '' : 's'} — clear it?`,
      { maxLength: 280, fallback: '' }
    )
    : '';
  return {
    register,
    fingerprint,
    firstSeenAt,
    waitingDays,
    notable,
    copy
  };
};

const loadPriorBriefingAliveness = async ({ userId, WikiBriefingCache } = {}) => {
  if (!userId || !WikiBriefingCache) return null;
  const doc = await safeFindOne(WikiBriefingCache, { userId });
  return doc?.payload?.aliveness || null;
};

const normalizeReceiptStatus = (status = '') => {
  const value = asString(status).toLowerCase();
  return value || 'completed';
};

const summarizeReceiptMetric = (metrics = {}) => {
  const importedHighlights = Number(metrics.importedHighlights || 0);
  const importedArticles = Number(metrics.importedArticles || 0);
  const importedNotes = Number(metrics.importedNotes || 0);
  const parts = [];
  if (importedHighlights > 0) parts.push(`${importedHighlights} highlight${importedHighlights === 1 ? '' : 's'}`);
  if (importedArticles > 0) parts.push(`${importedArticles} article${importedArticles === 1 ? '' : 's'}`);
  if (importedNotes > 0) parts.push(`${importedNotes} note${importedNotes === 1 ? '' : 's'}`);
  const claimsChanged = Number(metrics.claimsChanged || 0);
  const claimsGainedSupport = Number(metrics.claimsGainedSupport || 0);
  const claimsContradicted = Number(metrics.claimsContradicted || 0);
  const claimsPreserved = Number(metrics.claimsPreserved || 0);
  if (claimsChanged > 0) parts.push(`${claimsChanged} claim${claimsChanged === 1 ? '' : 's'} changed`);
  if (claimsGainedSupport > 0) parts.push(`${claimsGainedSupport} gained support`);
  if (claimsContradicted > 0) parts.push(`${claimsContradicted} contradicted`);
  if (claimsPreserved > 0) parts.push(`${claimsPreserved} preserved`);
  return parts.join(', ');
};

const sanitizeBriefingReceipt = (receipt = {}) => {
  const status = normalizeReceiptStatus(receipt.status);
  const metrics = receipt.metrics && typeof receipt.metrics === 'object' ? receipt.metrics : {};
  const touched = Array.isArray(receipt.touched) ? receipt.touched : [];
  return {
    id: asString(receipt.id),
    kind: asString(receipt.kind) || 'import',
    source: asString(receipt.source) || 'import',
    sourceLabel: truncate(receipt.sourceLabel || receipt.source || 'Import', 80),
    status,
    summary: truncate(receipt.summary || summarizeReceiptMetric(metrics), 160),
    completedAt: receipt.completedAt || receipt.createdAt || null,
    metrics: {
      importedArticles: Number(metrics.importedArticles || 0),
      importedHighlights: Number(metrics.importedHighlights || 0),
      importedNotes: Number(metrics.importedNotes || 0),
      skippedRows: Number(metrics.skippedRows || 0),
      indexingQueued: Number(metrics.indexingQueued || 0),
      indexingFailures: Number(metrics.indexingFailures || 0),
      claimsAdded: Number(metrics.claimsAdded || 0),
      claimsChanged: Number(metrics.claimsChanged || 0),
      claimsGainedSupport: Number(metrics.claimsGainedSupport || 0),
      claimsContradicted: Number(metrics.claimsContradicted || 0),
      claimsPreserved: Number(metrics.claimsPreserved || 0),
      claimsRemoved: Number(metrics.claimsRemoved || 0),
      acceptedPages: Number(metrics.acceptedPages || 0),
      rejectedPages: Number(metrics.rejectedPages || 0),
      directSourceClaimMatches: Number(metrics.directSourceClaimMatches || 0)
    },
    touched: touched.slice(0, 4).map(item => ({
      type: asString(item.type) || 'item',
      id: asString(item.id),
      title: truncate(item.title || 'Imported item', 90)
    })),
    nextAction: receipt.nextAction && typeof receipt.nextAction === 'object'
      ? {
        label: truncate(receipt.nextAction.label || '', 80),
        intent: asString(receipt.nextAction.intent),
        href: /^\/(?:wiki|think|connections)(?:[/?#]|$)/.test(asString(receipt.nextAction.href))
          ? asString(receipt.nextAction.href)
          : ''
      }
      : null
  };
};

const collectRecentImportReceipts = async ({
  userId,
  models = {},
  windowMs = ONE_DAY_MS,
  now = Date.now(),
  limit = 4
}) => {
  if (models.NoeisReceipt) {
    const receiptRows = await safeFind(
      models.NoeisReceipt,
      { userId },
      40,
      'receiptId kind source sourceLabel status summary metrics touched nextAction error createdAtExternal createdAt completedAt'
    );
    const storedReceipts = receiptRows
      .map(row => sanitizeBriefingReceipt({
        id: row.receiptId || row.id,
        kind: row.kind,
        source: row.source,
        sourceLabel: row.sourceLabel || row.source,
        status: row.status,
        summary: row.summary,
        metrics: row.metrics,
        touched: row.touched,
        nextAction: row.nextAction,
        error: row.error,
        createdAt: row.createdAtExternal || row.createdAt,
        completedAt: row.completedAt
      }))
      .filter(receipt => receipt.id && receipt.completedAt && isWithin(receipt.completedAt, windowMs, now))
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, limit);
    if (storedReceipts.length > 0) return storedReceipts;
  }

  const rows = await safeFind(
    models.ImportSession,
    {
      userId,
      status: { $in: ['completed', 'completed_with_warnings', 'failed'] },
      receipt: { $ne: null }
    },
    20,
    'receipt result.receipt status'
  );
  return rows
    .map(row => sanitizeBriefingReceipt(row.receipt || row.result?.receipt || {}))
    .filter(receipt => receipt.id && receipt.completedAt && isWithin(receipt.completedAt, windowMs, now))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, limit);
};

const CONSEQUENTIAL_RETURN_KINDS = new Set([
  'company_dossier_judgment_review',
  'company_dossier_maintenance_accepted'
]);

/* One completed, owner-bound consequence—not an activity feed. */
const buildConsequentialReturn = (receipts = []) => toArray(receipts)
  .filter(receipt => CONSEQUENTIAL_RETURN_KINDS.has(receipt?.kind))
  .filter(receipt => receipt?.status === 'completed')
  .map(receipt => {
    const touched = toArray(receipt?.touched)
      .find(item => item?.type === 'wiki_page' && idString(item?.id));
    const summary = truncate(receipt?.summary, 220);
    if (!touched || !summary) return null;
    const reviewed = receipt.kind === 'company_dossier_judgment_review';
    const pageId = idString(touched.id);
    return {
      id: idString(receipt.id),
      pageId,
      title: truncate(touched.title || 'Maintained dossier', 120),
      summary,
      label: reviewed ? 'Judgment reviewed' : 'Research accepted',
      linkLabel: reviewed ? 'See the decision →' : 'See what changed →',
      href: reviewed ? `/judgment/${pageId}` : `/wiki/workspace?page=${pageId}`,
      completedAt: receipt.completedAt || null,
      priority: reviewed ? 2 : 1
    };
  })
  .filter(Boolean)
  .sort((left, right) => (
    right.priority - left.priority
    || new Date(right.completedAt || 0).getTime() - new Date(left.completedAt || 0).getTime()
  ))[0] || null;

const buildReceiptSummaryPart = (receipts = []) => {
  const successful = receipts.find(receipt => (
    receipt.status === 'completed'
    || receipt.status === 'completed_with_warnings'
  ));
  if (successful) {
    if (successful.kind === 'wiki_maintenance' && successful.summary) {
      return `${successful.sourceLabel} maintenance: ${successful.summary}`;
    }
    const metric = summarizeReceiptMetric(successful.metrics);
    const touchedItem = (Array.isArray(successful.touched) ? successful.touched : [])
      .find(item => asString(item?.title));
    const firstStop = touchedItem?.title
      ? `; first stop: ${truncate(touchedItem.title, 72)}`
      : '';
    if (metric) return `${successful.sourceLabel} added ${metric}${firstStop}`;
    return `${successful.sourceLabel} finished syncing${firstStop}`;
  }
  const needsReview = receipts.find(receipt => receipt.status === 'needs_review');
  if (needsReview) return `${needsReview.sourceLabel} maintenance needs review: ${needsReview.summary}`;
  const failed = receipts.find(receipt => receipt.status === 'failed');
  if (failed) return `${failed.sourceLabel} needs attention`;
  return '';
};

const buildFallbackSummary = ({
  newSources,
  recentlyUpdatedPages,
  driftingPages,
  recentReceipts = [],
  pagesWithNewSourceMaterial = [],
  answerableQuestions = [],
  aliveness = null
}) => {
  const parts = [];
  const receiptPart = buildReceiptSummaryPart(recentReceipts);
  if (receiptPart) parts.push(receiptPart);
  if (answerableQuestions.length > 0) {
    parts.push(`${answerableQuestions.length} open question${answerableQuestions.length === 1 ? ' now has' : 's now have'} fresh evidence`);
  }
  if (pagesWithNewSourceMaterial.length > 0) {
    parts.push(`${pagesWithNewSourceMaterial.length} wiki page${pagesWithNewSourceMaterial.length === 1 ? '' : 's'} gained source material`);
  }
  if (newSources > 0) parts.push(`${newSources} new source${newSources === 1 ? '' : 's'} arrived in your library today`);
  if (recentlyUpdatedPages.length > 0) {
    parts.push(`${recentlyUpdatedPages.length} wiki page${recentlyUpdatedPages.length === 1 ? '' : 's'} updated`);
  }
  if (driftingPages.length > 0 && aliveness?.register === 'new') {
    parts.push(`${driftingPages.length} page${driftingPages.length === 1 ? '' : 's'} queued for rebuild`);
  }
  if (parts.length === 0) {
    if (aliveness?.register === 'aged' && aliveness.copy) return aliveness.copy;
    return 'Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours.';
  }
  return `${parts.join(' · ')}.`;
};

const buildPromptContext = ({
  newSources,
  recentlyUpdatedPages,
  driftingPages,
  recentReceipts,
  pagesWithNewSourceMaterial,
  answerableQuestions,
  nextAction,
  aliveness = null,
  now
}) => {
  const newsDrift = aliveness?.register === 'new' ? driftingPages : [];
  return `You are writing a 1-2 sentence editorial summary of what's new in a personal knowledge base over the last 24 hours.

Signal counts:
- New library sources (articles, notes, highlights): ${newSources}
- Recent import receipts: ${recentReceipts.length}
${recentReceipts.slice(0, 3).map(receipt => `  · ${receipt.sourceLabel}: ${receipt.summary}`).join('\n')}
${recentReceipts.slice(0, 3).map(receipt => {
  const touched = (Array.isArray(receipt.touched) ? receipt.touched : [])
    .map(item => item.title)
    .filter(Boolean)
    .slice(0, 2);
  return touched.length ? `    touched: ${touched.join(', ')}` : '';
}).filter(Boolean).join('\n')}
- Wiki pages rebuilt by the maintenance agent: ${recentlyUpdatedPages.length}
${recentlyUpdatedPages.slice(0, 5).map(page => `  · "${page.title}"`).join('\n')}
- Wiki pages that gained source material: ${pagesWithNewSourceMaterial.length}
${pagesWithNewSourceMaterial.slice(0, 4).map(page => `  · "${page.title}" gained ${page.addedSourceCount} source${page.addedSourceCount === 1 ? '' : 's'}`).join('\n')}
- Open questions with newly attached evidence: ${answerableQuestions.length}
${answerableQuestions.slice(0, 3).map(question => `  · "${question.text}" via "${question.evidencePageTitle}"`).join('\n')}
- Wiki pages newly queued for rebuild: ${newsDrift.length}
${newsDrift.slice(0, 5).map(page => `  · "${page.title}" (${page.driftSignals} pending event${page.driftSignals === 1 ? '' : 's'})`).join('\n')}
- Suggested next action: ${nextAction ? `${nextAction.label} — ${nextAction.reason}` : 'none'}

Constraints:
- 1 to 2 sentences, max 280 characters total.
- Plain prose, no markdown, no headings, no trailing "[1, 2]" citations.
- Tone: a librarian briefing the owner; specific, calm, not breathless.
- Do not re-report unchanged queued rebuilds as news. Aged waiting state is handled separately.
- If all counts are zero, return exactly: "Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours."
- Output the summary text only, no surrounding JSON or quotes.`;
};

const canUseTextGeneration = (isConfigured) => {
  if (!isConfigured || typeof isConfigured !== 'function') return false;
  try {
    return Boolean(isConfigured());
  } catch (_err) {
    return false;
  }
};

const normalizeCacheTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const isFreshBriefingCache = (cacheDoc = {}, {
  now = Date.now(),
  maxAgeMs = DEFAULT_BRIEFING_CACHE_MAX_AGE_MS
} = {}) => {
  if (!cacheDoc || !cacheDoc.payload || typeof cacheDoc.payload !== 'object') return false;
  const expiresAt = normalizeCacheTime(cacheDoc.expiresAt);
  if (expiresAt && expiresAt > now) return true;
  const generatedAt = normalizeCacheTime(cacheDoc.generatedAt || cacheDoc.payload.generatedAt || cacheDoc.updatedAt);
  return Boolean(generatedAt && now - generatedAt < Math.max(60 * 1000, Number(maxAgeMs) || DEFAULT_BRIEFING_CACHE_MAX_AGE_MS));
};

const loadCachedWikiBriefing = async ({
  userId,
  WikiBriefingCache,
  now = Date.now(),
  maxAgeMs = DEFAULT_BRIEFING_CACHE_MAX_AGE_MS
} = {}) => {
  if (!userId || !WikiBriefingCache) return null;
  const cacheDoc = await safeFindOne(WikiBriefingCache, { userId });
  if (!isFreshBriefingCache(cacheDoc, { now, maxAgeMs })) return null;
  // A cache row can outlive a model-quality repair. Revalidate on read so a
  // previously accepted scratchpad cannot keep leaking until its TTL expires.
  if (!editorialSentence(cacheDoc.payload.summary, { maxLength: 280, fallback: '' })) return null;
  return cacheDoc.payload;
};

const persistWikiBriefingCache = async ({
  userId,
  WikiBriefingCache,
  briefing,
  now = Date.now(),
  maxAgeMs = DEFAULT_BRIEFING_CACHE_MAX_AGE_MS
} = {}) => {
  if (!userId || !WikiBriefingCache || !briefing || typeof briefing !== 'object') return null;
  const generatedAt = new Date(briefing.generatedAt || now);
  const expiresAt = new Date(now + Math.max(60 * 1000, Number(maxAgeMs) || DEFAULT_BRIEFING_CACHE_MAX_AGE_MS));
  if (typeof WikiBriefingCache.findOneAndUpdate === 'function') {
    return WikiBriefingCache.findOneAndUpdate(
      { userId },
      {
        $set: {
          payload: briefing,
          generatedAt,
          expiresAt
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return null;
};

const invalidateWikiBriefingCache = async ({ userId, WikiBriefingCache } = {}) => {
  if (!userId || !WikiBriefingCache?.deleteOne) return false;
  await WikiBriefingCache.deleteOne({ userId });
  return true;
};

/**
 * Build the briefing for one user. Pure orchestration:
 *   1. Read the user's wiki pages + library counts.
 *   2. Bucket them into newSources / recentlyUpdatedPages / driftingPages.
 *   3. Ask the agent for a 1-2 sentence summary, or fall back to a template.
 *   4. Return a small JSON-friendly object the route can serve directly.
 */
const buildWikiBriefing = async ({
  userId,
  models = {},
  now = Date.now(),
  windowMs = ONE_DAY_MS,
  chat = chatComplete,
  isConfigured = isTextGenerationConfigured
} = {}) => {
  if (!userId) {
    throw new Error('buildWikiBriefing requires a userId.');
  }
  /* The day this account began, for the edition number. Read defensively:
     a paper that cannot number itself simply does not, which is better than
     one numbered from a guess. */
  let beganAt = null;
  try {
    const account = models.User?.findById
      ? await models.User.findById(userId).select('createdAt').lean()
      : null;
    beganAt = account?.createdAt || null;
  } catch (_unreadable) {
    beganAt = null;
  }

  const rawPages = await safeFind(
    models.WikiPage,
    { userId, status: { $ne: 'archived' } },
    600,
    '_id title status hiddenFromHome debugOnly archived plainText sourceRefs._id aiState.draftStatus aiState.lastError aiState.errorCode aiState.quality aiState.lastDraftedAt aiState.health freshness.pendingSourceEventIds freshness.lastSourceEventAt freshness.status createdAt updatedAt'
  );
  const pages = rawPages.filter(isWikiPageSurfaceEligible);
  const receiptLimit = Math.min(20, Math.max(4, Math.ceil(windowMs / ONE_DAY_MS) * 4));
  const [newSources, recentlyUpdatedPages, driftingPages, recentReceipts, recentMaintenanceChanges, priorAliveness] = await Promise.all([
    countNewSources({ userId, models, windowMs, now }),
    Promise.resolve(collectRecentlyUpdatedPages(pages, { windowMs, now })),
    Promise.resolve(collectDriftingPages(pages, { now })),
    collectRecentImportReceipts({ userId, models, windowMs, now, limit: receiptLimit }),
    collectRecentMaintenanceChanges({ userId, models, windowMs, now }),
    loadPriorBriefingAliveness({ userId, WikiBriefingCache: models.WikiBriefingCache })
  ]);
  const aliveness = buildAliveness({ driftingPages, priorAliveness, now });
  const consequentialReturn = buildConsequentialReturn(recentReceipts);
  const pagesWithNewSourceMaterial = collectPagesWithNewSourceMaterial(recentMaintenanceChanges);
  const answerableQuestions = await collectAnswerableQuestions({
    userId,
    models,
    wikiPages: pages,
    pagesWithNewSourceMaterial,
    maintenanceChanges: recentMaintenanceChanges
  });
  const nextAction = buildBriefingNextAction({
    recentReceipts,
    answerableQuestions,
    pagesWithNewSourceMaterial,
    driftingPages,
    recentlyUpdatedPages
  });

  const fallbackSummary = sentenceBoundaryTrim(
    buildFallbackSummary({
      newSources,
      recentlyUpdatedPages,
      driftingPages,
      recentReceipts,
      pagesWithNewSourceMaterial,
      answerableQuestions,
      aliveness
    }),
    { maxLength: 280 }
  );
  let summary = fallbackSummary;
  let model = 'stub';
  const hasFreshNews = Boolean(
    newSources
    || recentlyUpdatedPages.length
    || recentReceipts.length
    || pagesWithNewSourceMaterial.length
    || answerableQuestions.length
    || (aliveness.register === 'new' && driftingPages.length)
  );

  if (
    canUseTextGeneration(isConfigured)
    && hasFreshNews
  ) {
    try {
      const completion = await chat({
        route: 'artifact_draft',
        maxTokens: 220,
        temperature: 0.4,
        reasoningEffort: 'low',
        messages: [
          { role: 'system', content: 'You write short, calm editorial summaries for a personal knowledge base briefing.' },
          {
            role: 'user',
            content: buildPromptContext({
              newSources,
              recentlyUpdatedPages,
              driftingPages,
              recentReceipts,
              pagesWithNewSourceMaterial,
              answerableQuestions,
              nextAction,
              aliveness,
              now
            })
          }
        ]
      });
      const raw = typeof completion === 'string' ? completion : completion?.text || '';
      /* A fallback model once answered with its own reasoning and the paper
         printed it as the morning's editorial line. The deterministic summary
         is always standing by, so anything that reads as working-out is
         refused rather than published. */
      const cleaned = editorialSentence(raw, { maxLength: 280, fallback: '' });
      if (cleaned) {
        summary = cleaned;
        model = completion?.model || 'hf';
      }
    } catch (_err) {
      // Keep the deterministic fallback; no need to surface the LLM error in the briefing card.
    }
  }

  return {
    generatedAt: new Date(now).toISOString(),
    /* When this account began, so the masthead can number the morning. Never
       resets, so it is read from the account itself rather than counted from
       anything the reader could delete. */
    beganAt: beganAt ? new Date(beganAt).toISOString() : null,
    summary,
    model,
    aliveness,
    counts: {
      newSources,
      recentlyUpdatedPages: recentlyUpdatedPages.length,
      driftingPages: driftingPages.length,
      recentReceipts: recentReceipts.length,
      recentMaintenanceChanges: recentMaintenanceChanges.length,
      pagesWithNewSourceMaterial: pagesWithNewSourceMaterial.length,
      answerableQuestions: answerableQuestions.length
    },
    recentReceipts,
    consequentialReturn,
    recentMaintenanceChanges,
    pagesWithNewSourceMaterial,
    answerableQuestions,
    nextAction,
    recentlyUpdatedPages,
    driftingPages,
    totalPages: pages.length
  };
};

module.exports = {
  buildWikiBriefing,
  DEFAULT_BRIEFING_CACHE_MAX_AGE_MS,
  loadCachedWikiBriefing,
  persistWikiBriefingCache,
  invalidateWikiBriefingCache,
  __testables: {
    countNewSources,
    collectRecentImportReceipts,
    collectRecentMaintenanceChanges,
    collectPagesWithNewSourceMaterial,
    collectAnswerableQuestions,
    buildBriefingNextAction,
    buildConsequentialReturn,
    sanitizeBriefingReceipt,
    collectRecentlyUpdatedPages,
    collectDriftingPages,
    describeDriftWait,
    buildAliveness,
    buildFallbackSummary,
    buildPromptContext,
    canUseTextGeneration,
    isFreshBriefingCache,
    idString,
    isWithin,
    truncate
  }
};
