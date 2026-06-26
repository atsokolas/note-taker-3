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

const buildFallbackSummary = ({ newSources, recentlyUpdatedPages, driftingPages }) => {
  const parts = [];
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

const buildPromptContext = ({ newSources, recentlyUpdatedPages, driftingPages, now }) => {
  return `You are writing a 1-2 sentence editorial summary of what's new in a personal knowledge base over the last 24 hours.

Signal counts:
- New library sources (articles, notes, highlights): ${newSources}
- Wiki pages rebuilt by the maintenance agent: ${recentlyUpdatedPages.length}
${recentlyUpdatedPages.slice(0, 5).map(page => `  · "${page.title}"`).join('\n')}
- Wiki pages drifting (signals queued, body not yet rebuilt): ${driftingPages.length}
${driftingPages.slice(0, 5).map(page => `  · "${page.title}" (${page.driftSignals} signal${page.driftSignals === 1 ? '' : 's'})`).join('\n')}

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
  const [newSources, recentlyUpdatedPages, driftingPages] = await Promise.all([
    countNewSources({ userId, models, windowMs, now }),
    Promise.resolve(collectRecentlyUpdatedPages(pages, { windowMs, now })),
    Promise.resolve(collectDriftingPages(pages))
  ]);

  const fallbackSummary = sentenceBoundaryTrim(
    buildFallbackSummary({ newSources, recentlyUpdatedPages, driftingPages }),
    { maxLength: 280 }
  );
  let summary = fallbackSummary;
  let model = 'stub';

  if (isConfigured && isConfigured() && (newSources || recentlyUpdatedPages.length || driftingPages.length)) {
    try {
      const completion = await chat({
        route: 'artifact_draft',
        maxTokens: 220,
        temperature: 0.4,
        reasoningEffort: 'low',
        messages: [
          { role: 'system', content: 'You write short, calm editorial summaries for a personal knowledge base briefing.' },
          { role: 'user', content: buildPromptContext({ newSources, recentlyUpdatedPages, driftingPages, now }) }
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
      driftingPages: driftingPages.length
    },
    recentlyUpdatedPages,
    driftingPages,
    totalPages: pages.length
  };
};

module.exports = {
  buildWikiBriefing,
  __testables: {
    countNewSources,
    collectRecentlyUpdatedPages,
    collectDriftingPages,
    buildFallbackSummary,
    buildPromptContext,
    isWithin,
    truncate
  }
};
