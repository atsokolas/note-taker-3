import { buildJudgmentIndex, isJudgmentPage, isParked, namedTitle } from './judgmentModel';
import { wordBoundaryTrim } from '../utils/editorialText';

/**
 * What the paper hands back.
 *
 * The masthead used to open with an edition number, a press time, four
 * cadences, three place names and a count of each — six rows of the product
 * describing itself before it said anything. All of it was true and none of it
 * was a door: you could read that one thing was owed a move and still have no
 * way to reach it.
 *
 * So the top of the paper is where you were, not how you are doing. The page
 * you had open, the case still running, the piles, and one thing off the
 * shelf. Four sentences, every one of them a way back in.
 *
 * Each is silent when it is not known. A paper with nothing to hand back
 * prints nothing, which is the honest shape of a quiet morning.
 */

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const idOf = (page) => clean(page?._id || page?.id);

const time = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? NaN : at;
};

const newest = (page) => {
  const at = time(page?.updatedAt) || time(page?.createdAt);
  return Number.isNaN(at) ? 0 : at;
};

export const wikiHref = (page) => {
  const id = idOf(page);
  return id ? `/wiki/workspace?page=${encodeURIComponent(id)}` : '';
};

/**
 * The page you were last in.
 *
 * Judgments are wiki pages too, so they are held back for the clause that
 * knows how to talk about a case. Saying "you were last in AI Compute Bull"
 * directly above "AI Compute Bull is still open" is the page reading itself
 * out twice.
 */
export const lastWorked = (pages = []) => {
  const candidate = (Array.isArray(pages) ? pages : [])
    .filter((page) => idOf(page) && clean(page?.title) && !isJudgmentPage(page))
    .sort((left, right) => newest(right) - newest(left))[0];
  if (!candidate) return null;
  return { id: idOf(candidate), text: clean(candidate.title), href: wikiHref(candidate) };
};

/**
 * The case still running, most recently worked first.
 *
 * A parked case is not in progress — it is a decision to stop, and handing it
 * back every morning would be arguing with the reader about their own call.
 */
export const openCase = (pages = []) => {
  const live = (Array.isArray(pages) ? pages : []).filter((page) => isJudgmentPage(page) && !isParked(page));
  const [first] = buildJudgmentIndex(live, [], Date.now());
  if (!first) return null;
  return {
    id: first.id,
    text: first.title || first.sentence,
    href: `/judgment/${encodeURIComponent(first.id)}`
  };
};

/** Named for the reader, never "Untitled". */
const shelfTitle = (item) => clean(item?.title) || clean(namedTitle(item));

/*
 * A stable hand of cards.
 *
 * The shelf pick has to feel like chance and behave like print. A genuinely
 * random draw would deal a different thing every time the page repainted, so
 * glancing away and back would silently swap the one thing the morning had
 * offered you — and a paper that changes while you are holding it is a feed.
 *
 * The day is the seed. One pick per morning, the same on every device, a new
 * one tomorrow.
 */
const seedOf = (day) => {
  let hash = 0;
  for (let index = 0; index < day.length; index += 1) {
    hash = ((hash << 5) - hash + day.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

/** The morning's date, read in UTC so one edition is one day everywhere. */
export const editionDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * One thing off the shelf, chosen by the day.
 *
 * Ordered by id before choosing, because the order the server happened to
 * return things in is not stable and the pick has to be. Two readers of the
 * same shelf on the same morning get the same card.
 */
/* A headline is a headline. Some pieces carry a full standfirst in their
   title — one on the shelf runs to seven lines of display serif, which turns
   the lead into a wall. Trimmed at a word so it still reads as a sentence,
   and the piece itself is one click away. */
export const HEADLINE_LENGTH = 150;

export const shelfPick = (items = [], { now = Date.now() } = {}) => {
  const shelf = (Array.isArray(items) ? items : [])
    .filter((item) => idOf(item) && shelfTitle(item))
    .sort((left, right) => idOf(left).localeCompare(idOf(right)));
  if (!shelf.length) return null;
  const chosen = shelf[seedOf(editionDay(now)) % shelf.length];
  return {
    id: idOf(chosen),
    text: wordBoundaryTrim(shelfTitle(chosen), { maxLength: HEADLINE_LENGTH }),
    href: `/articles/${encodeURIComponent(idOf(chosen))}`
  };
};
