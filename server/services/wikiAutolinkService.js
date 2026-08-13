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
const MAX_TITLE_ALIASES = 8;
const AUTOLINK_CANDIDATE_PROJECTION = {
  title: 1,
  slug: 1,
  pageType: 1,
  plainText: 1,
  'body.content': 1
};
const GENERIC_ALIASES = new Set([
  'overview',
  'concept',
  'concepts',
  'ideas',
  'strategy',
  'strategies',
  'notes',
  'page',
  'wiki',
  'source',
  'sources',
  'question',
  'questions'
]);

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const safeFind = async (Model, query = {}, limit = 600, projection = null) => {
  if (!Model?.find) return [];
  try {
    const cursor = Model.find(query, projection || undefined);
    const sorted = cursor.sort?.({ updatedAt: -1, createdAt: -1 }) || cursor;
    const limited = sorted.limit?.(limit) || sorted;
    const lean = limited.lean?.() || limited;
    const result = await lean;
    return Array.isArray(result) ? result : [];
  } catch (_err) {
    try {
      const result = await Model.find(query, projection || undefined);
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

const candidateHasReadableContent = (candidate = {}) => {
  const hasPlainTextField = Object.prototype.hasOwnProperty.call(candidate, 'plainText');
  const hasBodyField = Object.prototype.hasOwnProperty.call(candidate, 'body');
  const plainText = String(candidate.plainText || '').trim();
  const bodyHasText = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'text' && String(node.text || '').trim()) return true;
    return Array.isArray(node.content) && node.content.some(bodyHasText);
  };
  if (hasBodyField) return bodyHasText(candidate.body);
  if (plainText) return true;
  // Older pages may predate both denormalized fields. Keep them linkable until
  // they are hydrated, but fail closed for a known-empty page.
  return !hasPlainTextField;
};

const buildTitleMatcher = (title) => {
  const trimmed = String(title || '').trim();
  if (trimmed.length < MIN_TITLE_LEN) return null;
  // Treat hyphens / dashes as space-equivalent so multi-word titles match
  // their stylistic variations.
  const pattern = escapeRegExp(trimmed).replace(/[\s‐-―-]+/g, '[\\s\\u2010-\\u2015-]+');
  return new RegExp(`(?:^|[^a-z0-9])(${pattern})(?:$|[^a-z0-9])`, 'gi');
};

const normalizeAlias = (value = '') => String(value || '')
  .replace(/[()[\]{}]/g, ' ')
  .replace(/[“”]/g, '"')
  .replace(/[’]/g, "'")
  .replace(/&/g, ' and ')
  .replace(/\s+/g, ' ')
  .trim();

const aliasScore = (value = '') => {
  const words = normalizeAlias(value).split(/\s+/).filter(Boolean);
  return words.length * 10 + normalizeAlias(value).length;
};

const titleAliases = (title = '') => {
  const raw = normalizeAlias(title);
  if (raw.length < MIN_TITLE_LEN) return [];
  const aliases = new Map();
  const add = (value) => {
    const alias = normalizeAlias(value).replace(/^[,;:]+|[,;:]+$/g, '').trim();
    if (alias.length < MIN_TITLE_LEN) return;
    const canonical = alias.toLowerCase();
    if (GENERIC_ALIASES.has(canonical)) return;
    if (/^(?:and|or)\s+/i.test(alias)) return;
    aliases.set(canonical, alias);
  };

  add(raw);
  if (/^the\s+/i.test(raw)) add(raw.replace(/^the\s+/i, ''));
  if (/\band\b/i.test(raw)) add(raw.replace(/\band\b/gi, '&'));
  raw
    .split(/\s+(?:[-–—:|/]|and|or)\s+/i)
    .forEach(add);

  const withoutParenthetical = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutParenthetical !== raw) add(withoutParenthetical);

  const commaParts = raw.split(/\s*,\s*/).filter(Boolean);
  if (commaParts.length > 1) commaParts.forEach(add);

  Array.from(aliases.values()).forEach((alias) => {
    const words = alias.split(/\s+/).filter(Boolean);
    if (words.length < 2) return;
    const last = words[words.length - 1];
    if (!/^[a-z][a-z-]{3,}$/i.test(last) || /(?:ss|us|is)$/i.test(last)) return;
    if (/ies$/i.test(last)) add([...words.slice(0, -1), last.replace(/ies$/i, 'y')].join(' '));
    else if (/s$/i.test(last)) add([...words.slice(0, -1), last.replace(/s$/i, '')].join(' '));
    else add([...words, ''].join(' ').trim().replace(new RegExp(`${escapeRegExp(last)}$`, 'i'), `${last}s`));
  });

  return Array.from(aliases.values())
    .sort((a, b) => aliasScore(b) - aliasScore(a))
    .slice(0, MAX_TITLE_ALIASES);
};

/**
 * Count title-of-candidate occurrences in target's plainText. Returns
 * { mentionCount, snippet } or null on no match.
 */
const scanTextForCandidate = ({ targetText, candidateTitle }) => {
  const aliases = titleAliases(candidateTitle);
  if (!aliases.length || !targetText) return null;
  let mentionCount = 0;
  let firstIndex = -1;
  let matchedAlias = '';
  for (const alias of aliases) {
    const matcher = buildTitleMatcher(alias);
    if (!matcher) continue;
    matcher.lastIndex = 0;
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = matcher.exec(targetText)) !== null) {
      mentionCount += 1;
      const index = match.index + (match[0].length - match[1].length);
      if (firstIndex === -1 || index < firstIndex) {
        firstIndex = index;
        matchedAlias = match[1];
      }
      if (mentionCount >= 12) break;
    }
    if (mentionCount >= 12) break;
  }
  if (mentionCount === 0) return null;
  const start = Math.max(0, firstIndex - SNIPPET_RADIUS);
  const end = Math.min(targetText.length, firstIndex + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < targetText.length ? '…' : '';
  const snippet = `${prefix}${targetText.slice(start, end).trim()}${suffix}`;
  return { mentionCount, snippet, matchedAlias };
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
// The candidate set depends only on the owner and the page being linked, never
// on its prose. A maintenance build re-links after every repair attempt, so
// fetching inside the matcher meant scanning the wiki two or three times per
// build to answer an identical question. Callers that link repeatedly can load
// the candidates once and hand them back.
const loadAutolinkCandidates = async ({ targetPage, userId, models = {}, limit = 600 } = {}) => (
  safeFind(
    models.WikiPage,
    {
      userId,
      status: { $ne: 'archived' },
      _id: { $ne: String(targetPage?._id || targetPage?.id || '') }
    },
    Math.max(1, Math.min(Number(limit) || 600, 600)),
    AUTOLINK_CANDIDATE_PROJECTION
  )
);

const findAutolinkSuggestions = async ({
  targetPage,
  userId,
  models = {},
  limit = 600,
  candidatePages = null
} = {}) => {
  const targetText = String(targetPage?.plainText || '').replace(/\s+/g, ' ');
  if (!targetText) return { suggestions: [], scanned: 0 };

  const candidates = Array.isArray(candidatePages)
    ? candidatePages
    : await loadAutolinkCandidates({ targetPage, userId, models, limit });

  const hits = [];
  for (const candidate of candidates) {
    if (!candidateHasReadableContent(candidate)) continue;
    const scan = scanTextForCandidate({ targetText, candidateTitle: candidate.title });
    if (!scan) continue;
    hits.push({
      pageId: String(candidate._id || ''),
      title: truncate(candidate.title, 200) || 'Untitled wiki page',
      slug: String(candidate.slug || ''),
      pageType: candidate.pageType || 'topic',
      mentionCount: scan.mentionCount,
      matchedAlias: scan.matchedAlias,
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
  loadAutolinkCandidates,
  __testables: {
    buildTitleMatcher,
    scanTextForCandidate,
    titleAliases,
    truncate,
    candidateHasReadableContent,
    SNIPPET_RADIUS,
    MAX_SUGGESTIONS,
    MIN_TITLE_LEN,
    MAX_TITLE_ALIASES,
    AUTOLINK_CANDIDATE_PROJECTION
  }
};
