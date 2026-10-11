import { isJudgmentPage } from '../../pages/judgmentModel';
import { parseSourceOrigin } from '../../utils/sourceRoutes';
import { folioHref, folioSentence } from './folioModel';

// Where the passages went.
//
// Under the source record, a few sentences that say what became of this
// piece: which of your views its passages sit under, which of your pages cite
// it. Built from what the pages already hold; a passage counts only when a
// view's Why or Against line names it, or a page's sources name it or the
// piece itself. Nothing linked is silence, not "not used yet".

const MAX_LINES = 3;
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const time = (value) => new Date(value || 0).getTime() || 0;
const countWord = (count) => NUMBER_WORDS[count] || String(count);

const pageHref = (page) => `/wiki/workspace?page=${encodeURIComponent(idOf(page))}`;

/* The passages of this piece a view holds as Why or Against. */
const heldPassages = (page, articleId, highlightIds) => {
  const refsById = new Map(list(page?.sourceRefs).map((ref) => [idOf(ref), ref]));
  const held = new Set();
  ['why', 'against'].forEach((field) => {
    list(page?.judgment?.[field]).forEach((line) => {
      const origin = parseSourceOrigin(line?.acceptedFrom);
      if (origin.highlightId && highlightIds.has(origin.highlightId)
        && (!origin.articleId || origin.articleId === articleId)) {
        held.add(origin.highlightId);
      }
      list(line?.sourceRefIds).forEach((refId) => {
        const ref = refsById.get(idOf(refId));
        if (ref?.type === 'highlight' && highlightIds.has(idOf(ref.objectId))) held.add(idOf(ref.objectId));
      });
    });
  });
  return held;
};

/* The passages of this piece a page cites, and whether it cites the piece. */
const citedPassages = (page, articleId, highlightIds) => {
  const cited = new Set();
  let piece = false;
  list(page?.sourceRefs).forEach((ref) => {
    const objectId = idOf(ref?.objectId);
    if (ref?.type === 'highlight' && highlightIds.has(objectId)) cited.add(objectId);
    if (ref?.type === 'article' && objectId === articleId) piece = true;
  });
  return { cited, piece };
};

const passagesPhrase = (count, first) => (
  `${countWord(count)} ${count === 1 ? 'passage' : 'passages'}${first ? ' from this piece' : ''}`
);

/**
 * Up to three sentences, views first, each ending in a link:
 * { id, lead, title, href, held: Set<highlightId> }. An empty list is silence.
 */
export const sourceWhereabouts = (pages, { articleId, highlights = [] } = {}) => {
  const article = idOf(articleId);
  const highlightIds = new Set(list(highlights).map(idOf).filter((id) => id && !id.startsWith('temp-')));
  if (!article) return [];

  const views = [];
  const cites = [];
  list(pages).forEach((page) => {
    if (!idOf(page)) return;
    if (isJudgmentPage(page) && folioSentence(page)) {
      const held = heldPassages(page, article, highlightIds);
      if (held.size) views.push({ page, held, count: held.size });
      return;
    }
    const { cited, piece } = citedPassages(page, article, highlightIds);
    if (cited.size || piece) cites.push({ page, held: cited, count: cited.size });
  });

  const byWeight = (left, right) => (right.count - left.count) || (time(right.page.updatedAt) - time(left.page.updatedAt));
  const rows = [...views.sort(byWeight), ...cites.sort(byWeight)].slice(0, MAX_LINES);
  return rows.map((row, index) => {
    const view = views.includes(row);
    const first = index === 0;
    const lead = view
      ? `${passagesPhrase(row.count, first)} ${row.count === 1 ? 'sits' : 'sit'} under your view on`
      : row.count
        ? `${passagesPhrase(row.count, first)} ${row.count === 1 ? 'is' : 'are'} cited on your page about`
        : 'This piece is cited on your page about';
    return {
      id: idOf(row.page),
      lead,
      title: String(row.page.title || '').trim() || folioSentence(row.page) || 'an untitled page',
      href: view ? folioHref(row.page) : pageHref(row.page),
      held: row.held
    };
  });
};

/** Every passage some view already holds, so its door is not said twice. */
export const heldHighlightIds = (lines) => new Set(
  list(lines).filter((line) => line.href.startsWith('/judgment/')).flatMap((line) => [...line.held])
);
