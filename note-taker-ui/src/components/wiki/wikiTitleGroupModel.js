import { countWikiClaims, countWikiSources, isWikiScaffoldPage } from './wikiPageMetrics';
import { wikiPageId } from './wikiRepoDedupeModel';
import { displayWikiPageTitle } from './wikiRepoDossierModel';

/*
 * Same-title wiki pages, folded into one row.
 *
 * A wiki that drafts pages from ideas, sources, and repos will draft the same
 * page more than once. The list then reads as if the library holds five things
 * when it holds one, and the copy the reader lands on is whichever was touched
 * last rather than the one their library actually grounds.
 *
 * This is a reading rule, not a filing one. Nothing is deleted or merged: every
 * page stays exactly where it was, and the ones folded behind the count are one
 * click away.
 */

const stripEdges = (value = '') => String(value || '')
  .replace(/^["'‘’“”([\s]+/, '')
  .replace(/["'‘’“”)\]\s.,;:!?]+$/, '');

/**
 * The key two pages share when they are, to a reader, the same title.
 * Case, surrounding punctuation, and whitespace do not make a page distinct.
 */
export const titleKeyForPage = (page = {}) => stripEdges(
  displayWikiPageTitle(page, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
).toLowerCase();

/*
 * Which copy the reader should meet first. Grounded in the library beats
 * ungrounded; more evidence beats less; a written page beats a scaffold; and
 * only after all of that does recency decide. The point is that the surviving
 * row is the one that can answer for itself.
 */
const groundingRank = (page = {}) => {
  const sources = countWikiSources(page);
  return [
    sources > 0 ? 1 : 0,
    sources,
    countWikiClaims(page),
    isWikiScaffoldPage(page) ? 0 : 1,
    new Date(page?.updatedAt || page?.createdAt || 0).getTime() || 0
  ];
};

const isMoreCanonical = (candidate, incumbent) => {
  const left = groundingRank(candidate);
  const right = groundingRank(incumbent);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return wikiPageId(candidate) > wikiPageId(incumbent);
};

/**
 * Order the pages of one title so the canonical copy comes first.
 */
export const orderByGrounding = (pages = []) => (Array.isArray(pages) ? [...pages] : [])
  .sort((left, right) => (isMoreCanonical(left, right) ? -1 : 1));

/**
 * Fold a list of wiki pages into title groups.
 *
 * Each group keeps the reader's order: the group sits where its canonical page
 * sat, so the visible rows stay in the same order they were already sorted in.
 */
export const groupWikiPagesByTitle = (pages = []) => {
  const list = Array.isArray(pages) ? pages : [];
  const byKey = new Map();
  const loose = [];

  list.forEach((page, index) => {
    const key = titleKeyForPage(page);
    // An untitled page shares nothing with another untitled page.
    if (!key) {
      loose.push({ key: `untitled:${wikiPageId(page) || index}`, pages: [page], index });
      return;
    }
    if (byKey.has(key)) byKey.get(key).pages.push(page);
    else byKey.set(key, { key, pages: [page] });
  });

  return [...byKey.values(), ...loose]
    .map((group) => {
      const ordered = orderByGrounding(group.pages);
      const [canonical, ...others] = ordered;
      return {
        key: group.key,
        title: displayWikiPageTitle(canonical),
        canonical,
        others,
        count: ordered.length,
        index: list.indexOf(canonical)
      };
    })
    .sort((left, right) => left.index - right.index);
};

/**
 * The pages that actually reach the list — one per title.
 * Facet counts read from this so the numbers match the rows.
 */
export const canonicalWikiPages = (pages = []) => groupWikiPagesByTitle(pages)
  .map(group => group.canonical);

export const sameTitleToggleLabel = (count = 0, open = false) => {
  if (count <= 0) return '';
  if (open) return `Hide the other ${count}`;
  return `${count} more with this title`;
};
