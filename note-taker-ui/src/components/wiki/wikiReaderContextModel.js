import { collectWikiText } from './wikiPageMetrics';
import { surroundingFromArticle } from './open-sentence/openSentenceJourney';
import { citationOccurrence } from './wikiCopyReference';

const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value) => String(value || '').trim();
const normalizeClaimText = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const MAX_PANEL_TRAIL = 5;

export const pushReaderPanel = (stack = [], panel = null) => {
  if (!panel?.type) return Array.isArray(stack) ? stack : [];
  const next = [...(Array.isArray(stack) ? stack : []), panel];
  return next.length > MAX_PANEL_TRAIL ? next.slice(-MAX_PANEL_TRAIL) : next;
};

export const popReaderPanel = (stack = []) => {
  const trail = Array.isArray(stack) ? stack : [];
  if (!trail.length) return { panel: null, trail: [] };
  const next = trail.slice(0, -1);
  return { panel: next[next.length - 1] || null, trail: next };
};

export const sourceSurrounding = ({
  excerpt = '',
  aroundBefore = '',
  aroundAfter = ''
} = {}) => ({
  excerpt: String(excerpt || '').trim(),
  aroundBefore: String(aroundBefore || '').trim(),
  aroundAfter: String(aroundAfter || '').trim(),
  canExpand: Boolean(String(aroundBefore || '').trim() || String(aroundAfter || '').trim())
});

export const surroundingFromSource = (source = {}) => sourceSurrounding({
  excerpt: source?.snippet || source?.quote || source?.excerpt || source?.text || '',
  aroundBefore: source?.aroundBefore || source?.before || source?.contextBefore || '',
  aroundAfter: source?.aroundAfter || source?.after || source?.contextAfter || ''
});

export const sourceArticleId = (source = {}) => {
  const type = clean(source?.type || source?.sourceType).toLowerCase();
  const objectId = clean(source?.objectId || source?.sourceObjectId || source?.sourceId || source?.articleId);
  const parentId = clean(source?.parentObjectId || source?.parentArticleId || source?.articleId || source?.metadata?.articleId);
  if (type === 'article' && objectId) return objectId;
  if (type === 'highlight') return parentId;
  return parentId || (type !== 'highlight' ? objectId : '');
};

export const sourceHighlightId = (source = {}) => {
  const type = clean(source?.type || source?.sourceType).toLowerCase();
  const highlightId = clean(source?.highlightId || source?.objectId || source?.sourceObjectId);
  if (type === 'highlight') return highlightId;
  return clean(source?.highlightId);
};

export const resolveLibraryHighlight = ({ source = {}, highlights = [] } = {}) => {
  const highlightId = sourceHighlightId(source);
  if (!highlightId) return null;
  return (Array.isArray(highlights) ? highlights : []).find((entry) => (
    clean(entry?._id || entry?.id) === highlightId
  )) || null;
};

export const surroundingFromLibrarySource = ({
  source = {},
  article = null,
  highlight = null
} = {}) => {
  const quoted = clean(
    highlight?.text
    || highlight?.anchor?.text
    || source?.quote
    || source?.excerpt
    || source?.snippet
    || source?.text
  );
  const saved = surroundingFromSource(source);
  const around = surroundingFromArticle({
    article,
    highlight: highlight || {
      text: quoted,
      anchor: {
        text: quoted,
        prefix: saved.aroundBefore,
        suffix: saved.aroundAfter,
        startOffsetApprox: source?.startOffsetApprox
      }
    }
  });
  return sourceSurrounding({
    excerpt: quoted,
    aroundBefore: around.aroundBefore || saved.aroundBefore,
    aroundAfter: around.aroundAfter || saved.aroundAfter
  });
};

export const citedSourceOccurrence = ({
  page = null,
  source = null,
  claimId = '',
  citationIndex = 0
} = {}) => citationOccurrence({
  pageId: page?._id || page?.id,
  revisionId: page?.rev || '',
  claimId,
  sourceId: source?._id || source?.id || '',
  citationIndex
});

const claimMap = (page = {}) => {
  const map = new Map();
  (Array.isArray(page?.claims) ? page.claims : []).forEach((claim) => {
    const id = String(claim?.claimId || claim?._id || claim?.id || '').trim();
    if (id) map.set(id, claim);
  });
  return map;
};

export const compareWikiPages = (current = null, next = null) => {
  if (!current || !next) return [];
  const before = claimMap(current);
  const after = claimMap(next);
  const changes = [];
  after.forEach((claim, id) => {
    const prior = before.get(id);
    if (!prior) {
      changes.push({ id, kind: 'Added passage', before: null, after: claim });
      return;
    }
    if (String(prior.text || '') !== String(claim.text || '')) {
      changes.push({ id, kind: 'Reworded passage', before: prior, after: claim });
      return;
    }
    const priorCites = JSON.stringify(prior.citationIds || prior.citationIndexes || []);
    const nextCites = JSON.stringify(claim.citationIds || claim.citationIndexes || []);
    if (priorCites !== nextCites) {
      changes.push({ id, kind: 'Sources changed', before: prior, after: claim });
    }
  });
  before.forEach((claim, id) => {
    if (!after.has(id)) changes.push({ id, kind: 'Removed passage', before: claim, after: null });
  });
  if (!changes.length) {
    const currentText = collectWikiText(current.body || current.plainText || '');
    const nextText = collectWikiText(next.body || next.plainText || '');
    if (currentText !== nextText) {
      changes.push({
        id: 'body',
        kind: 'Reworded passage',
        before: { text: currentText },
        after: { text: nextText }
      });
    }
  }
  return changes;
};

export const changedClaimIdsFromPages = (current = null, next = null) => (
  compareWikiPages(current, next)
    .map((change) => clean(change?.id))
    .filter((id) => id && id !== 'body')
);

export const changedClaimIdsFromVisit = ({
  page = null,
  added = [],
  changed = []
} = {}) => {
  const addedSet = new Set((Array.isArray(added) ? added : []).map(normalizeClaimText).filter(Boolean));
  const changedSet = new Set((Array.isArray(changed) ? changed : [])
    .map((entry) => normalizeClaimText(entry?.text || entry))
    .filter(Boolean));
  if (!addedSet.size && !changedSet.size) return [];
  return (Array.isArray(page?.claims) ? page.claims : [])
    .filter((claim) => {
      const text = normalizeClaimText(claim?.text);
      return text && (addedSet.has(text) || changedSet.has(text));
    })
    .map((claim) => clean(claim?.claimId || claim?._id || claim?.id))
    .filter(Boolean);
};

export const candidateFootprint = ({ current = null, candidate = null } = {}) => {
  const changes = compareWikiPages(current, candidate);
  const currentSourceIds = new Set(
    (Array.isArray(current?.sourceRefs) ? current.sourceRefs : [])
      .map(source => String(source?._id || source?.id || source?.url || ''))
      .filter(Boolean)
  );
  const addedSources = (Array.isArray(candidate?.sourceRefs) ? candidate.sourceRefs : [])
    .filter(source => !currentSourceIds.has(String(source?._id || source?.id || source?.url || '')));
  const currentPassages = Math.max(
    (Array.isArray(current?.claims) ? current.claims : []).length,
    collectWikiText(current?.body || '').split(/\n+/).filter(Boolean).length
  );
  return {
    changes,
    changedCount: changes.length,
    addedSourceCount: addedSources.length,
    untouchedCount: Math.max(0, currentPassages - changes.filter(change => change.after).length)
  };
};

export const historicalRevisionSnapshot = (revision = null) => {
  const after = revision?.after || null;
  const before = revision?.before || null;
  const hasArticle = (page) => Boolean(collectWikiText(page?.body || page?.plainText || ''));
  const snapshot = hasArticle(after) ? after : (hasArticle(before) ? before : null);
  if (!snapshot) return null;
  return clone({
    ...snapshot,
    rev: snapshot.rev || revision?.to || revision?._id,
    title: snapshot.title || revision?.summary?.title || after?.title || before?.title || '',
    updatedAt: snapshot.updatedAt || revision?.createdAt || null
  });
};

export default compareWikiPages;
