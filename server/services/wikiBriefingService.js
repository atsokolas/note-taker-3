const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');
const {
  normalizeExistingWikiTitleForPresentation,
  sentenceBoundaryTrim
} = require('./wikiPresentationGuard');

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

const asString = (value = '') => String(value || '').trim();

const truncate = (value = '', limit = 200) => {
  const text = asString(value).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const isWithin = (timestamp, windowMs, now) => {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < windowMs;
};

const safeFind = async (Model, query = {}, limit = 200) => {
  if (!Model?.find) return [];
  try {
    const cursor = Model.find(query);
    const sorted = cursor.sort?.({ updatedAt: -1, createdAt: -1 }) || cursor;
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

const idString = (value) => {
  if (!value) return '';
  if (value._id) return idString(value._id);
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
    80
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
        title: truncate(normalizeExistingWikiTitleForPresentation(revision.after?.title), 140) || 'Untitled wiki page',
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
  pagesWithNewSourceMaterial = [],
  maintenanceChanges = [],
  limit = 5
}) => {
  if (!models.Question) return [];
  const questions = await safeFind(
    models.Question,
    {
      userId,
      status: 'open',
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true },
      archived: { $ne: true }
    },
    120
  );
  const evidencePages = pagesWithNewSourceMaterial.map(page => {
    const change = maintenanceChanges.find(item => item.pageId === page.pageId) || {};
    return {
      ...page,
      supportChanged: Number(change.supportChanged || 0),
      claimsChanged: Number(change.claimsChanged || 0)
    };
  });
  return questions
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
          evidencePageId: page.pageId,
          evidencePageTitle: page.title,
          evidenceCount: Number(page.addedSourceCount || 0),
          changedAt: page.changedAt,
          href: `/think?tab=questions&questionId=${idString(question._id)}`
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
      reason: `${drifting.driftSignals} drift signal${drifting.driftSignals === 1 ? '' : 's'} queued`,
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
    safeFind(models.Article, { userId }, 400),
    safeFind(models.NotebookEntry, { userId }, 400),
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
      title: truncate(normalizeExistingWikiTitleForPresentation(page.title), 140) || 'Untitled wiki page',
      lastDraftedAt: page.aiState?.lastDraftedAt || null
    }));
};

const collectDriftingPages = (pages = []) => {
  return pages
    .map(page => {
      const health = page?.aiState?.health || {};
      const driftSignals = ['newItems', 'unsupportedClaims', 'staleSections', 'contradictions']
        .reduce((total, key) => total + (Array.isArray(health[key]) ? health[key].length : 0), 0);
      return { page, driftSignals };
    })
    .filter(entry => entry.driftSignals > 0)
    .sort((a, b) => b.driftSignals - a.driftSignals)
    .slice(0, 8)
    .map(entry => ({
      _id: String(entry.page._id || ''),
      title: truncate(normalizeExistingWikiTitleForPresentation(entry.page.title), 140) || 'Untitled wiki page',
      driftSignals: entry.driftSignals
    }));
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
      indexingFailures: Number(metrics.indexingFailures || 0)
    },
    touched: touched.slice(0, 4).map(item => ({
      type: asString(item.type) || 'item',
      id: asString(item.id),
      title: truncate(item.title || 'Imported item', 90)
    })),
    nextAction: receipt.nextAction && typeof receipt.nextAction === 'object'
      ? {
        label: truncate(receipt.nextAction.label || '', 80),
        intent: asString(receipt.nextAction.intent)
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
  const rows = await safeFind(
    models.ImportSession,
    {
      userId,
      status: { $in: ['completed', 'completed_with_warnings', 'failed'] },
      receipt: { $ne: null }
    },
    20
  );
  return rows
    .map(row => sanitizeBriefingReceipt(row.receipt || row.result?.receipt || {}))
    .filter(receipt => receipt.id && receipt.completedAt && isWithin(receipt.completedAt, windowMs, now))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, limit);
};

const buildReceiptSummaryPart = (receipts = []) => {
  const successful = receipts.find(receipt => (
    receipt.status === 'completed'
    || receipt.status === 'completed_with_warnings'
  ));
  if (successful) {
    const metric = summarizeReceiptMetric(successful.metrics);
    if (metric) return `${successful.sourceLabel} added ${metric}`;
    return `${successful.sourceLabel} finished syncing`;
  }
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
  answerableQuestions = []
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
  if (driftingPages.length > 0) {
    parts.push(`${driftingPages.length} page${driftingPages.length === 1 ? '' : 's'} drifting and ready for review`);
  }
  if (parts.length === 0) {
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
  now
}) => {
  return `You are writing a 1-2 sentence editorial summary of what's new in a personal knowledge base over the last 24 hours.

Signal counts:
- New library sources (articles, notes, highlights): ${newSources}
- Recent import receipts: ${recentReceipts.length}
${recentReceipts.slice(0, 3).map(receipt => `  · ${receipt.sourceLabel}: ${receipt.summary}`).join('\n')}
- Wiki pages rebuilt by the maintenance agent: ${recentlyUpdatedPages.length}
${recentlyUpdatedPages.slice(0, 5).map(page => `  · "${page.title}"`).join('\n')}
- Wiki pages that gained source material: ${pagesWithNewSourceMaterial.length}
${pagesWithNewSourceMaterial.slice(0, 4).map(page => `  · "${page.title}" gained ${page.addedSourceCount} source${page.addedSourceCount === 1 ? '' : 's'}`).join('\n')}
- Open questions with newly attached evidence: ${answerableQuestions.length}
${answerableQuestions.slice(0, 3).map(question => `  · "${question.text}" via "${question.evidencePageTitle}"`).join('\n')}
- Wiki pages drifting (signals queued, body not yet rebuilt): ${driftingPages.length}
${driftingPages.slice(0, 5).map(page => `  · "${page.title}" (${page.driftSignals} signal${page.driftSignals === 1 ? '' : 's'})`).join('\n')}
- Suggested next action: ${nextAction ? `${nextAction.label} — ${nextAction.reason}` : 'none'}

Constraints:
- 1 to 2 sentences, max 280 characters total.
- Plain prose, no markdown, no headings, no trailing "[1, 2]" citations.
- Tone: a librarian briefing the owner; specific, calm, not breathless.
- If all counts are zero, return exactly: "Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours."
- Output the summary text only, no surrounding JSON or quotes.`;
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
  const rawPages = await safeFind(models.WikiPage, { userId, status: { $ne: 'archived' } }, 600);
  const pages = rawPages.filter(isWikiPageSurfaceEligible);
  const [newSources, recentlyUpdatedPages, driftingPages, recentReceipts, recentMaintenanceChanges] = await Promise.all([
    countNewSources({ userId, models, windowMs, now }),
    Promise.resolve(collectRecentlyUpdatedPages(pages, { windowMs, now })),
    Promise.resolve(collectDriftingPages(pages)),
    collectRecentImportReceipts({ userId, models, windowMs, now }),
    collectRecentMaintenanceChanges({ userId, models, windowMs, now })
  ]);
  const pagesWithNewSourceMaterial = collectPagesWithNewSourceMaterial(recentMaintenanceChanges);
  const answerableQuestions = await collectAnswerableQuestions({
    userId,
    models,
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
      answerableQuestions
    }),
    { maxLength: 280 }
  );
  let summary = fallbackSummary;
  let model = 'stub';

  if (
    isConfigured
    && isConfigured()
    && (
      newSources
      || recentlyUpdatedPages.length
      || driftingPages.length
      || recentReceipts.length
      || pagesWithNewSourceMaterial.length
      || answerableQuestions.length
    )
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
              now
            })
          }
        ]
      });
      const raw = typeof completion === 'string' ? completion : completion?.text || '';
      const cleaned = sentenceBoundaryTrim(raw, { maxLength: 280, fallback: fallbackSummary });
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
    summary,
    model,
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
  __testables: {
    countNewSources,
    collectRecentImportReceipts,
    collectRecentMaintenanceChanges,
    collectPagesWithNewSourceMaterial,
    collectAnswerableQuestions,
    buildBriefingNextAction,
    sanitizeBriefingReceipt,
    collectRecentlyUpdatedPages,
    collectDriftingPages,
    buildFallbackSummary,
    buildPromptContext,
    isWithin,
    truncate
  }
};
