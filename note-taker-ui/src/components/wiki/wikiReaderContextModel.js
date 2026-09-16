import { collectWikiText } from './wikiPageMetrics';

const clone = (value) => JSON.parse(JSON.stringify(value));

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
  const after = revision?.after;
  const before = revision?.before;
  const snapshot = after || before;
  if (!snapshot) return null;
  return clone({
    ...snapshot,
    rev: snapshot.rev || revision?.to || revision?._id,
    title: snapshot.title || revision?.summary?.title || '',
    updatedAt: snapshot.updatedAt || revision?.createdAt || null
  });
};

export default compareWikiPages;
