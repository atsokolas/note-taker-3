const normalizePage = (page = {}) => (
  page && typeof page.toObject === 'function' ? page.toObject({ virtuals: false }) : page
);

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const serializeId = (value) => (value ? String(value) : '');

const stableKey = (...parts) => parts
  .map(part => clean(part).toLowerCase())
  .filter(Boolean)
  .join(':')
  .replace(/[^a-z0-9:_-]+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 220);

const recommendedActionFor = (type) => {
  if (type === 'missing_page') return 'Create an overview page from the repeated concept signal.';
  if (type === 'missing_link') return 'Apply the suggested wiki link to the source page.';
  if (type === 'stale') return 'Run page maintenance to fold in pending freshness work.';
  if (type === 'contradiction') return 'Review the cited conflict and decide which claim survives.';
  if (type === 'gap') return 'Attach stronger sources or mark the weak claim as unresolved.';
  if (type === 'orphan') return 'Link this page from a related page or leave it isolated intentionally.';
  return 'Review this finding.';
};

const issue = ({
  type,
  severity = 'info',
  page = null,
  title = '',
  summary = '',
  targetPage = null,
  evidence = [],
  suggestedTitle = ''
}) => {
  const pageId = serializeId(page?._id || page?.id);
  const targetPageId = serializeId(targetPage?._id || targetPage?.id);
  const normalizedSuggestedTitle = clean(suggestedTitle);
  return {
    id: stableKey(type, pageId, targetPageId, normalizedSuggestedTitle || title),
    type,
    status: 'open',
    severity,
    actionability: ['missing_page', 'missing_link', 'stale'].includes(type) ? 'automatic' : 'review',
    recommendedAction: recommendedActionFor(type),
    pageId,
    pageTitle: page?.title || '',
    targetPageId,
    targetPageTitle: targetPage?.title || '',
    suggestedTitle: normalizedSuggestedTitle,
    title,
    summary,
    evidence: Array.isArray(evidence) ? evidence.filter(Boolean).slice(0, 6) : []
  };
};

const bodyHasLinkTo = (node, targetPageId = '') => {
  if (!node || !targetPageId) return false;
  if (Array.isArray(node)) return node.some(child => bodyHasLinkTo(child, targetPageId));
  if (typeof node !== 'object') return false;
  if ((node.marks || []).some(mark => (
    mark?.type === 'wikiLink'
    && String(mark.attrs?.pageId || mark.attrs?.id || '') === String(targetPageId)
  ))) return true;
  return bodyHasLinkTo(node.content || [], targetPageId);
};

const pageMentionsTitle = (page = {}, title = '') => {
  const needle = clean(title).toLowerCase();
  if (!needle || needle.length < 4) return false;
  return clean(page.plainText || '').toLowerCase().includes(needle);
};

const findRepeatedPhrases = (pages = [], existingTitles = new Set()) => {
  const counts = new Map();
  pages.forEach((page) => {
    const text = clean(page.plainText || '');
    const matches = text.match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,4}\b/g) || [];
    new Set(matches.map(clean).filter(phrase => (
      phrase.length >= 8
      && phrase.length <= 80
      && !existingTitles.has(phrase.toLowerCase())
      && !/^(The|This|That|These|Those|Source|Sources|Overview|Evidence)\b/.test(phrase)
    ))).forEach((phrase) => {
      const entry = counts.get(phrase) || { phrase, count: 0, pages: [] };
      entry.count += 1;
      entry.pages.push(page.title || 'Untitled Wiki Page');
      counts.set(phrase, entry);
    });
  });
  return [...counts.values()]
    .filter(entry => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
};

const summarizeRun = (findings = {}) => {
  const count = Object.values(findings).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  if (!count) return 'Wiki lint found no immediate structural issues.';
  const parts = Object.entries(findings)
    .map(([key, rows]) => `${Array.isArray(rows) ? rows.length : 0} ${key}`)
    .filter(part => !part.startsWith('0 '))
    .join(', ');
  return `Wiki lint found ${count} issue${count === 1 ? '' : 's'}: ${parts}.`;
};

const persistLintRun = async ({ WikiLintRun, userId, scope, pageId, findings, summary, startedAt, completedAt }) => {
  if (!WikiLintRun) return null;
  const run = new WikiLintRun({
    userId,
    scope,
    pageId: pageId || null,
    status: 'completed',
    findings,
    resolutions: {},
    actions: [],
    summary,
    startedAt,
    completedAt
  });
  await run.save();
  return normalizePage(run);
};

const lintWiki = async ({
  userId,
  scope = 'all',
  pageId = '',
  models = {},
  findAutolinkSuggestions = null,
  now = new Date(),
  onProgress = null
} = {}) => {
  const startedAt = now;
  const { WikiPage, WikiLintRun } = models;
  if (!WikiPage) throw new Error('WikiPage model is required.');

  onProgress?.({ stage: 'loading_pages', summary: 'Loading wiki pages for lint.' });
  const query = { userId, status: { $ne: 'archived' } };
  const allPages = (await WikiPage.find(query).sort({ updatedAt: -1 }).limit(600).lean()).map(normalizePage);
  const scopedPages = pageId
    ? allPages.filter(page => String(page._id || page.id) === String(pageId))
    : allPages;
  const pageById = new Map(allPages.map(page => [String(page._id || page.id), page]));
  const existingTitles = new Set(allPages.map(page => clean(page.title).toLowerCase()).filter(Boolean));

  const inboundCounts = new Map(allPages.map(page => [String(page._id || page.id), 0]));
  allPages.forEach((sourcePage) => {
    allPages.forEach((targetPage) => {
      if (String(sourcePage._id || sourcePage.id) === String(targetPage._id || targetPage.id)) return;
      if (bodyHasLinkTo(sourcePage.body, String(targetPage._id || targetPage.id)) || pageMentionsTitle(sourcePage, targetPage.title)) {
        inboundCounts.set(String(targetPage._id || targetPage.id), (inboundCounts.get(String(targetPage._id || targetPage.id)) || 0) + 1);
      }
    });
  });

  const contradictions = [];
  const stale = [];
  const gaps = [];
  const orphans = [];
  const missingLinks = [];

  for (const [index, page] of scopedPages.entries()) {
    onProgress?.({
      stage: 'analyzing_page',
      summary: `Analyzing ${page.title || 'Untitled Wiki Page'}.`,
      pageId: serializeId(page._id || page.id),
      pageTitle: page.title || '',
      index: index + 1,
      total: scopedPages.length
    });
    const health = page.aiState?.health || {};
    const quality = page.aiState?.quality || page.quality || {};
    const claims = Array.isArray(page.claims) ? page.claims : [];
    const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];

    const conflictedClaims = claims.filter(claim => (
      claim.support === 'conflicted'
      || (Array.isArray(claim.contradictedByCitationIds) && claim.contradictedByCitationIds.length)
    ));
    if (conflictedClaims.length || (Array.isArray(health.contradictions) && health.contradictions.length)) {
      contradictions.push(issue({
        type: 'contradiction',
        severity: 'high',
        page,
        title: 'Conflicting evidence needs resolution',
        summary: `${conflictedClaims.length || health.contradictions.length} contradiction signal${(conflictedClaims.length || health.contradictions.length) === 1 ? '' : 's'} found.`,
        evidence: [
          ...conflictedClaims.map(claim => claim.text),
          ...(health.contradictions || []).map(item => item.title || item.text || item.summary)
        ]
      }));
    }

    const pendingEvents = Array.isArray(page.freshness?.pendingSourceEventIds) ? page.freshness.pendingSourceEventIds.length : 0;
    const staleSections = Array.isArray(health.staleSections) ? health.staleSections : [];
    if (pendingEvents || staleSections.length || ['needs_rebuild', 'fail', 'failed'].includes(String(quality.status || '').toLowerCase())) {
      stale.push(issue({
        type: 'stale',
        severity: pendingEvents > 0 ? 'medium' : 'info',
        page,
        title: 'Page has pending freshness work',
        summary: `${pendingEvents} pending source event${pendingEvents === 1 ? '' : 's'} and ${staleSections.length} stale section${staleSections.length === 1 ? '' : 's'}.`,
        evidence: staleSections.map(section => section.title || section.section || section)
      }));
    }

    const unsupportedClaims = claims.filter(claim => claim.support === 'unsupported' || !(claim.citationIds || []).length);
    if (unsupportedClaims.length || sourceRefs.length < 2 || clean(page.plainText).length < 500) {
      gaps.push(issue({
        type: 'gap',
        severity: unsupportedClaims.length ? 'medium' : 'info',
        page,
        title: 'Evidence coverage is thin',
        summary: `${unsupportedClaims.length} weak claim${unsupportedClaims.length === 1 ? '' : 's'}, ${sourceRefs.length} source${sourceRefs.length === 1 ? '' : 's'}, ${clean(page.plainText).split(/\s+/).filter(Boolean).length} words.`,
        evidence: unsupportedClaims.map(claim => claim.text)
      }));
    }

    const inbound = inboundCounts.get(String(page._id || page.id)) || 0;
    const isOnlyPage = allPages.length <= 1;
    if (!isOnlyPage && inbound === 0 && page.pageType !== 'overview') {
      orphans.push(issue({
        type: 'orphan',
        severity: 'info',
        page,
        title: 'Page is isolated',
        summary: 'No other active wiki page links to or mentions this page title.'
      }));
    }

    if (findAutolinkSuggestions) {
      const result = await findAutolinkSuggestions({ targetPage: page, userId, models });
      (result?.suggestions || []).slice(0, 6).forEach((suggestion) => {
        const targetPage = pageById.get(String(suggestion.pageId)) || { _id: suggestion.pageId, title: suggestion.title };
        missingLinks.push(issue({
          type: 'missing_link',
          severity: 'info',
          page,
          targetPage,
          title: 'Possible wiki link missing',
          summary: `The page text mentions "${suggestion.title}" without linking it.`,
          evidence: [suggestion.reason]
        }));
      });
    }
  }

  const missingPages = findRepeatedPhrases(scopedPages.length ? scopedPages : allPages, existingTitles)
    .map(entry => issue({
      type: 'missing_page',
      severity: 'info',
      suggestedTitle: entry.phrase,
      title: `Potential page: ${entry.phrase}`,
      summary: `"${entry.phrase}" appears across ${entry.count} page${entry.count === 1 ? '' : 's'}.`,
      evidence: entry.pages
    }));

  const findings = {
    contradictions,
    orphans,
    stale,
    missingPages,
    missingLinks,
    gaps
  };
  const summary = summarizeRun(findings);
  const completedAt = new Date();
  onProgress?.({ stage: 'persisting', summary: 'Saving wiki lint run.' });
  const run = await persistLintRun({
    WikiLintRun,
    userId,
    scope,
    pageId: pageId || null,
    findings,
    summary,
    startedAt,
    completedAt
  });

  onProgress?.({ stage: 'completed', summary, runId: serializeId(run?._id) });
  return {
    runId: serializeId(run?._id),
    runAt: completedAt.toISOString(),
    scope,
    pageId: pageId || '',
    summary,
    findings
  };
};

module.exports = {
  lintWiki,
  summarizeRun
};
