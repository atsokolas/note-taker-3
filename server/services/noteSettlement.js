const { classifyWikiPageQuality } = require('./wikiPageQualityGuard');
const { normalizeWikiTitleForPresentation } = require('./wikiPresentationGuard');
const { plainNotebookText } = require('./authoredWorkDiscovery');

/* Settling turns a finished Think note into the wiki page it was becoming.
   The page is a projection of the note: settle again and the page follows the
   note as a new revision. Its createdFrom names the note, and that one field
   is the link both ways. */

const QUOTE_TYPES = new Set(['highlight_embed', 'highlight-ref', 'highlight_ref', 'quote']);
const PLACEHOLDER_CODES = new Set(['placeholder_title', 'generated_qa_title', 'known_qa_junk_title']);

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = (value) => (value ? String(value) : '');

const paragraph = (text, marks) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }]
});

const sourceRefOf = (block) => ({
  type: block.highlightId ? 'highlight' : 'article',
  objectId: block.highlightId || block.articleId,
  parentObjectId: block.highlightId ? block.articleId || null : null,
  title: clean(block.articleTitle),
  snippet: clean(block.text),
  addedBy: 'user'
});

/* A quote that names where it came from becomes a cited passage: the source
   ledger holds the highlight, and the passage's claim mark points at it, so
   its footnote opens the Library at those words. The claim id follows the
   block, so settling again keeps each passage's history. */
const settleDraftFrom = (entry = {}) => {
  const blocks = Array.isArray(entry.blocks) && entry.blocks.length
    ? entry.blocks
    : [{ id: 'body', type: 'paragraph', text: plainNotebookText(entry.content) }];
  const sourceRefs = [];
  const cited = new Map();
  const cite = (block) => {
    const key = `${idOf(block.highlightId)}:${idOf(block.articleId)}`;
    if (!cited.has(key)) cited.set(key, sourceRefs.push(sourceRefOf(block)));
    return cited.get(key);
  };
  const content = [];
  let list = null;
  blocks.forEach((block) => {
    const type = block?.type || 'paragraph';
    const text = clean(block?.text);
    if (type !== 'bullet') list = null;
    if (!text) return;
    if (type === 'bullet') {
      if (!list) content.push(list = { type: 'bulletList', content: [] });
      list.content.push({ type: 'listItem', content: [paragraph(text)] });
    } else if (type === 'heading') {
      content.push({ type: 'heading', attrs: { level: Math.min(4, (Number(block.level) || 1) + 1) }, content: [{ type: 'text', text }] });
    } else if (QUOTE_TYPES.has(type)) {
      const marks = block.highlightId || block.articleId
        ? [{ type: 'claim', attrs: { claimId: `settled-${block.id}`, support: 'supported', citationIndexes: [cite(block)] } }]
        : undefined;
      const attribution = clean(block.articleTitle);
      content.push({ type: 'pullquote', ...(attribution ? { attrs: { attribution } } : {}), content: [paragraph(text, marks)] });
    } else {
      content.push(paragraph(text));
    }
  });
  return {
    title: normalizeWikiTitleForPresentation(entry.title, { maxLength: 180 }),
    body: { type: 'doc', content },
    sourceRefs
  };
};

/* The same bar any wiki page meets, said as what to do about it. */
const settleRefusal = (draft) => {
  if (!draft.body.content.length) return 'Nothing is written here yet. Write the thought, then settle it.';
  const [blocked] = classifyWikiPageQuality(draft).blockingReasons;
  if (!blocked) return '';
  if (blocked.code === 'untitled_page') return 'Give this note a title before it settles.';
  if (PLACEHOLDER_CODES.has(blocked.code)) return `“${draft.title}” reads as a placeholder. Give the note its real title, then settle it.`;
  return `Wiki would not take this yet: ${blocked.message}`;
};

const settledPageFor = ({ WikiPage, userId, entryId }) => WikiPage.findOne({
  userId,
  'createdFrom.type': 'notebook',
  'createdFrom.objectId': entryId,
  status: { $ne: 'archived' }
});

module.exports = { settleDraftFrom, settleRefusal, settledPageFor };
