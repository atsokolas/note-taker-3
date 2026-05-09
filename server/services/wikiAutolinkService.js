/**
 * wikiAutolinkService — for a given target wiki page, find every OTHER
 * page in the user's wiki whose title is mentioned in the target's
 * plainText. Mirror of wikiBacklinkService (which goes the other way:
 * "who mentions me?"). This one answers "who do I mention?" so the
 * editor can suggest pages to link to from the current draft.
 *
 * Same matching rules as backlinks: case-insensitive, word-boundary
 * substring against the target's plainText, capped per-candidate, top
 * N returned. Pure compute on demand; no schema changes.
 */

const SNIPPET_RADIUS = 70;
const MAX_SUGGESTIONS = 8;
const MIN_TITLE_LEN = 4;

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

const buildTitleMatcher = (title) => {
  const trimmed = String(title || '').trim();
  if (trimmed.length < MIN_TITLE_LEN) return null;
  // Treat hyphens / dashes as space-equivalent so multi-word titles match
  // their stylistic variations.
  const pattern = escapeRegExp(trimmed).replace(/[\s‐-―-]+/g, '[\\s\\u2010-\\u2015-]+');
  return new RegExp(`(?:^|[^a-z0-9])(${pattern})(?:$|[^a-z0-9])`, 'gi');
};

/**
 * Count title-of-candidate occurrences in target's plainText. Returns
 * { mentionCount, snippet } or null on no match.
 */
const scanTextForCandidate = ({ targetText, candidateTitle }) => {
  const matcher = buildTitleMatcher(candidateTitle);
  if (!matcher || !targetText) return null;
  matcher.lastIndex = 0;
  let mentionCount = 0;
  let firstIndex = -1;
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = matcher.exec(targetText)) !== null) {
    mentionCount += 1;
    if (firstIndex === -1) firstIndex = match.index + (match[0].length - match[1].length);
    if (mentionCount >= 12) break;
  }
  if (mentionCount === 0) return null;
  const start = Math.max(0, firstIndex - SNIPPET_RADIUS);
  const end = Math.min(targetText.length, firstIndex + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < targetText.length ? '…' : '';
  const snippet = `${prefix}${targetText.slice(start, end).trim()}${suffix}`;
  return { mentionCount, snippet };
};

/**
 * Compute the ranked autolink suggestions for one target page.
 *
 * @param {object} params
 * @param {object} params.targetPage  page whose body we scan for other titles
 * @param {string} params.userId      owner — narrows the candidate set
 * @param {object} params.models      mongoose models, must include WikiPage
 * @returns {Promise<{suggestions: Array, scanned: number}>}
 */
const findAutolinkSuggestions = async ({ targetPage, userId, models = {} } = {}) => {
  const targetText = String(targetPage?.plainText || '').replace(/\s+/g, ' ');
  if (!targetText) return { suggestions: [], scanned: 0 };

  const targetId = String(targetPage._id || targetPage.id || '');
  const candidates = await safeFind(
    models.WikiPage,
    {
      userId,
      status: { $ne: 'archived' },
      _id: { $ne: targetId }
    },
    600
  );

  const hits = [];
  for (const candidate of candidates) {
    const scan = scanTextForCandidate({ targetText, candidateTitle: candidate.title });
    if (!scan) continue;
    hits.push({
      pageId: String(candidate._id || ''),
      title: truncate(candidate.title, 200) || 'Untitled wiki page',
      slug: String(candidate.slug || ''),
      pageType: candidate.pageType || 'topic',
      mentionCount: scan.mentionCount,
      snippet: scan.snippet
    });
  }

  hits.sort((a, b) => {
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    return a.title.localeCompare(b.title);
  });

  return {
    suggestions: hits.slice(0, MAX_SUGGESTIONS),
    scanned: candidates.length
  };
};

module.exports = {
  findAutolinkSuggestions,
  __testables: {
    buildTitleMatcher,
    scanTextForCandidate,
    truncate,
    SNIPPET_RADIUS,
    MAX_SUGGESTIONS,
    MIN_TITLE_LEN
  }
};
