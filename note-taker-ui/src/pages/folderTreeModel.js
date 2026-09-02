import { isProceduralShelf } from './readingDriftModel';
import { normalizeSpaces } from '../utils/editorialText';

/**
 * The cabinet, as a tree.
 *
 * Folders are the desk's spine and two products read them: the drift's topics
 * *are* folders, and a screened folder *is* the feed. So the cabinet is the
 * single source of truth and everything else — piles, scrolls, the shelf — is
 * a lens over it. Making it nest is what lets `Costco` sit inside `Investing`
 * without either of those products needing a second idea of what a topic is.
 *
 * Three rules the nesting has to keep, and each of them is a place where the
 * obvious implementation would be wrong:
 *
 *   **Counts roll up.** A parent shows what is in it and everything beneath
 *   it, because that is what a drawer means.
 *
 *   **Living ink does not.** Screening applies to the exact folder: `Costco`
 *   can be a scroll while `Investing` stays working material. A parent that
 *   glowed because a child was screened would be claiming something about
 *   itself that is not true.
 *
 *   **The drift reads the top-level ancestor.** Filing is exact — a piece goes
 *   in `Costco` — but a reading trend measured per leaf is noise. The honest
 *   topic is the drawer the leaf lives in.
 */

const idOf = (value) => normalizeSpaces(value?._id || value?.id || value);

/** Procedural shelves are machinery, not places, and never enter the tree. */
const isPlace = (folder) => Boolean(idOf(folder)) && !isProceduralShelf(folder?.name);

/**
 * The tree, from a flat list. A folder whose parent is missing or unreachable
 * is hung at the top rather than dropped: a folder you cannot see is a folder
 * you have lost, and orphaning is a data problem the reader should still be
 * able to open.
 */
export const buildFolderTree = (folders = [], counts = {}) => {
  const places = (Array.isArray(folders) ? folders : []).filter(isPlace);
  const byId = new Map(places.map(folder => [idOf(folder), folder]));

  const nodeOf = (folder) => ({
    id: idOf(folder),
    name: normalizeSpaces(folder.name),
    asFeed: Boolean(folder.asFeed),
    own: Number(counts[idOf(folder)] || 0),
    children: []
  });

  const nodes = new Map(places.map(folder => [idOf(folder), nodeOf(folder)]));
  const roots = [];

  places.forEach((folder) => {
    const node = nodes.get(idOf(folder));
    const parentId = idOf(folder.parentFolderId);
    // A cycle would hang the walk; a folder cannot be inside itself.
    const parent = parentId && parentId !== node.id ? nodes.get(parentId) : null;
    if (parent && byId.has(parentId)) parent.children.push(node);
    else roots.push(node);
  });

  const byName = (left, right) => left.name.localeCompare(right.name);
  const settle = (node) => {
    node.children.sort(byName).forEach(settle);
    // Counts roll up: what is in this drawer, and in every drawer inside it.
    node.total = node.children.reduce((sum, child) => sum + child.total, node.own);
    return node;
  };

  return roots.sort(byName).map(settle);
};

/**
 * The honest topic for a piece filed in this folder: the drawer it lives in,
 * however deep it actually sits. Filing is exact; a trend is not.
 */
export const topLevelAncestor = (folders = [], folderId = '') => {
  const places = (Array.isArray(folders) ? folders : []).filter(isPlace);
  const byId = new Map(places.map(folder => [idOf(folder), folder]));
  let current = byId.get(normalizeSpaces(folderId)) || null;
  const walked = new Set();

  while (current) {
    const id = idOf(current);
    if (walked.has(id)) return current;   // a cycle stops here rather than spinning
    walked.add(id);
    const parentId = idOf(current.parentFolderId);
    const parent = parentId && parentId !== id ? byId.get(parentId) : null;
    if (!parent) return current;
    current = parent;
  }
  return null;
};

/**
 * Living ink is a fact about the exact folder and never rolls up. A parent is
 * living only when the parent itself was screened.
 */
export const isLivingFolder = (node = {}) => Boolean(node.asFeed);

/** Every folder in the tree, depth-first, for the surfaces that want a list. */
export const flattenFolderTree = (nodes = [], depth = 0) => (
  (Array.isArray(nodes) ? nodes : []).flatMap(node => [
    { ...node, depth },
    ...flattenFolderTree(node.children, depth + 1)
  ])
);

/**
 * What a cabinet count means, spelled out.
 *
 * The number in the tree is scannable and says nothing: 7 of what, since when.
 * The rule is that no number appears without a noun and a time, so the number
 * stays where the eye wants it and the sentence lives on the tooltip, where
 * the reader who actually wants to know can find it.
 *
 * A drawer with children says what it holds directly and what it holds in
 * total, because those are different facts and a parent showing only the
 * total looks empty when it is not.
 */
export const folderCountPhrase = (node = {}) => {
  const total = Number(node?.total || 0);
  if (!total) return '';
  const things = total === 1 ? '1 source' : `${total} sources`;
  const own = Number(node?.own || 0);
  const nested = total - own;
  return nested > 0
    ? `${things} in ${node.name} — ${own} filed here, ${nested} in the drawers inside it`
    : `${things} filed in ${node.name}`;
};
