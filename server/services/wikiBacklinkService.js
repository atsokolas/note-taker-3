/**
 * wikiBacklinkService — for a given target wiki page, find every other
 * page in the user's wiki that mentions the target's title and return
 * a small ranked list with a snippet around the first mention.
 *
 * Match rule: case-insensitive, word-boundary substring match against
 * the candidate page's plainText. We don't try to be clever with
 * fuzzy matching or stemming in v1 — the title is usually a noun
 * phrase the user typed, and exact-substring catches every realistic
 * mention without false positives.
 *
 * Pure compute: takes models, returns a JSON-friendly array. No new
 * schema, no scheduled job. The route handler calls this on demand
 * when the editor opens a page.
 */

const SNIPPET_RADIUS = 70;
const MAX_BACKLINKS = 8;
const MAX_TITLE_LEN = 200;

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const safeFind = async (Model, query = {}, limit = 600) => {
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

const truncate = (value = '', limit = 200) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

/**
 * Build the regex used for matching the target title in candidate
 * page text. Uses word boundaries so "compounding" doesn't match
 * "compounded", but is forgiving about hyphens.
 *
 * Returns null when the title is too short / too generic to be useful
 * — single common words ("the", "and") would generate noise.
 */
const buildTitleMatcher = (title) => {
  const trimmed = String(title || '').trim();
  if (trimmed.length < 4) return null;
  // Treat hyphens / dashes as space-equivalent so "click-through" hits
  // "click through" too.
  const pattern = escapeRegExp(trimmed).replace(/[\s‐-―-]+/g, '[\\s\\u2010-\\u2015-]+');
  return new RegExp(`(?:^|[^a-z0-9])(${pattern})(?:$|[^a-z0-9])`, 'gi');
};

/**
 * Walk the candidate's plainText for matches of the target title.
 * Returns mention count + a single snippet around the first match.
 * Returns null when no match found.
 */
const scanCandidate = ({ candidate, matcher }) => {
  const text = String(candidate?.plainText || '').replace(/\s+/g, ' ');
  if (!text || !matcher) return null;
  matcher.lastIndex = 0;
  let mentionCount = 0;
  let firstIndex = -1;
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = matcher.exec(text)) !== null) {
    mentionCount += 1;
    if (firstIndex === -1) firstIndex = match.index + (match[0].length - match[1].length);
    if (mentionCount >= 12) break;
  }
  if (mentionCount === 0) return null;

  const startSnippet = Math.max(0, firstIndex - SNIPPET_RADIUS);
  const endSnippet = Math.min(text.length, firstIndex + SNIPPET_RADIUS);
  const prefix = startSnippet > 0 ? '…' : '';
  const suffix = endSnippet < text.length ? '…' : '';
  const snippet = `${prefix}${text.slice(startSnippet, endSnippet).trim()}${suffix}`;

  return {
    mentionCount,
    snippet,
    matchOffset: firstIndex
  };
};

/**
 * Compute the ranked backlinks for a single target page.
 *
 * @param {object} params
 * @param {object} params.targetPage  the wiki page whose backlinks we want
 * @param {string} params.userId      owner — narrows the candidate scan
 * @param {object} params.models      mongoose models, must include WikiPage
 * @returns {Promise<{backlinks: Array, scanned: number}>}
 */
const findWikiBacklinks = async ({ targetPage, userId, models = {} } = {}) => {
  if (!targetPage?.title) return { backlinks: [], scanned: 0 };
  const matcher = buildTitleMatcher(targetPage.title);
  if (!matcher) return { backlinks: [], scanned: 0 };

  const targetId = String(targetPage._id || targetPage.id || '');
  const candidates = await safeFind(
    models.WikiPage,
    {
      userId,
      status: { $ne: 'archived' },
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true },
      archived: { $ne: true },
      _id: { $ne: targetId }
    },
    600
  );

  const hits = [];
  for (const candidate of candidates) {
    const scan = scanCandidate({ candidate, matcher });
    if (!scan) continue;
    hits.push({
      pageId: String(candidate._id || ''),
      title: truncate(candidate.title, MAX_TITLE_LEN) || 'Untitled wiki page',
      slug: String(candidate.slug || ''),
      pageType: candidate.pageType || 'topic',
      updatedAt: candidate.updatedAt || candidate.createdAt || null,
      mentionCount: scan.mentionCount,
      snippet: scan.snippet
    });
  }

  hits.sort((a, b) => {
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    const at = new Date(b.updatedAt || 0).getTime();
    const bt = new Date(a.updatedAt || 0).getTime();
    return at - bt;
  });

  return {
    backlinks: hits.slice(0, MAX_BACKLINKS),
    scanned: candidates.length
  };
};

module.exports = {
  findWikiBacklinks,
  __testables: {
    buildTitleMatcher,
    scanCandidate,
    truncate,
    SNIPPET_RADIUS,
    MAX_BACKLINKS
  }
};
