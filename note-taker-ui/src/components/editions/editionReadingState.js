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
export const readingPosition = (root) => {
  const items = [...(root?.querySelectorAll('[data-reading-item]') || [])];
  return items.find((el) => el.getBoundingClientRect().bottom > 160) || items[items.length - 1];
};
