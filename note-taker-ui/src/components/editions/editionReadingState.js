// Small, account-scoped device state. Server sync can replace this boundary.
import { currentAccountId, scopedKey } from '../../utils/browserScope';
const key = (issueId, kind) =>
  currentAccountId() ? scopedKey(`noeis:edition:${issueId}:${kind}`) : null;
export const readEditionLocal = (issueId, kind) => {
  try {
    const name = key(issueId, kind);
    return name ? JSON.parse(localStorage.getItem(name)) : null;
  } catch (_) {
    return null;
  }
};
export const writeEditionLocal = (issueId, kind, value) => {
  try {
    const name = key(issueId, kind);
    if (!name) return false;
    localStorage.setItem(name, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
};
export const findingAnchor = (id) => `edition-item-${id}`;
export const findingHash = (id) => `#${encodeURIComponent(findingAnchor(id))}`;
export const editionIssuePath = (id) => `/editions/${encodeURIComponent(id)}`;
export const editionFindingPath = (issueId, itemId) => `${editionIssuePath(issueId)}${findingHash(itemId)}`;
export const FINDING_LIMIT = 'What it doesn’t show';
export const editionClip = (item, issueId, credit, excerpt) => {
  const text = (excerpt ?? item.finding)?.trim();
  if (!text || !issueId) return '';
  const limit = excerpt == null && item.boundary?.trim();
  const href = `${window.location.origin}${editionFindingPath(issueId, item.itemId)}`;
  return [item.plain || item.title, text, limit && `${FINDING_LIMIT}\n${limit}`, [credit, href].filter(Boolean).join('\n')]
    .filter(Boolean).join('\n\n');
};
export const readingPosition = (root) => {
  const items = [...(root?.querySelectorAll('[data-reading-item]') || [])];
  return items.find((el) => el.getBoundingClientRect().bottom > 160) || items[items.length - 1];
};
