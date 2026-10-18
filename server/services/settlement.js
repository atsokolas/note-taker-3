const { classifyWikiPageQuality } = require('./wikiPageQualityGuard');
const { normalizeWikiTitleForPresentation } = require('./wikiPresentationGuard');
const { plainNotebookText } = require('./authoredWorkDiscovery');

/* Settling turns finished thinking in Think, a note or a concept, into the
   wiki page it was becoming. The page is a projection of what was written:
   settle again and the page follows as a new revision. Its createdFrom names
   the note or concept, and the label `settled-<noun>:<id>` is the link both
   ways (and what keeps maintenance from rewriting it). */

const QUOTE_TYPES = new Set(['highlight_embed', 'highlight-ref', 'highlight_ref', 'quote']);
const PLACEHOLDER_CODES = new Set(['placeholder_title', 'generated_qa_title', 'known_qa_junk_title']);

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = (value) => (value ? String(value) : '');

/* A concept's writing is editor HTML. Its blocks are its top-level elements;
   a held passage is a blockquote that carries the highlight it quotes. */
const ELEMENT = /<(h[1-6]|p|li|blockquote)\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/\1>/gi;
const attr = (attrs, name) => plainNotebookText((attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1]);

const blocksFromHtml = (html) => [...String(html || '').matchAll(ELEMENT)].map(([, tag, attrs, inner], index) => {
  const highlightId = attr(attrs, 'data-highlight-id');
  const id = attr(attrs, 'data-block-id') || highlightId || `block-${index}`;
  if (highlightId) {
    return { id, type: 'highlight_embed', highlightId, articleId: attr(attrs, 'data-article-id'), articleTitle: attr(attrs, 'data-article-title'), text: attr(attrs, 'data-highlight-text') };
  }
  const name = tag.toLowerCase();
  const type = name[0] === 'h' ? 'heading' : { li: 'bullet', blockquote: 'quote' }[name] || 'paragraph';
  return { id, type, level: Number(name[1]) || undefined, text: plainNotebookText(inner) };
});

/* What each kind of thinking settles from: who it is, and its writing as
   blocks. A concept is its description, its working draft, then the passages
   it holds that the draft does not already quote. */
const SETTLE_KINDS = {
  notebook: {
    noun: 'note',
    createdFrom: 'notebook',
    load: ({ NotebookEntry }, userId, id) => NotebookEntry.findOne({ _id: id, userId }),
    writing: async (_models, entry) => ({
      title: entry.title,
      blocks: entry.blocks?.length ? entry.blocks : [{ id: 'body', type: 'paragraph', text: plainNotebookText(entry.content) }]
    })
  },
  concepts: {
    noun: 'concept',
    createdFrom: 'concept',
    load: ({ TagMeta }, userId, id) => TagMeta.findOne({ _id: id, userId }),
    writing: async ({ Article }, concept) => {
      const draft = blocksFromHtml(concept.ideaWorkbench?.hypothesis?.html);
      const quoted = new Set(draft.map(block => idOf(block.highlightId)).filter(Boolean));
      const heldIds = (concept.pinnedHighlightIds || []).map(String).filter(id => !quoted.has(id));
      const articles = heldIds.length
        ? await Article.find({ userId: concept.userId, 'highlights._id': { $in: heldIds } }).select('title highlights._id highlights.text').lean()
        : [];
      const held = new Map(articles.flatMap(article => article.highlights
        .map(highlight => [String(highlight._id), { highlightId: highlight._id, articleId: article._id, articleTitle: article.title, text: highlight.text }])));
      return {
        title: concept.name,
        blocks: [
          { id: 'description', type: 'paragraph', text: concept.description },
          ...draft,
          ...heldIds.filter(id => held.has(id)).map(id => ({ id: `held-${id}`, type: 'highlight_embed', ...held.get(id) }))
        ]
      };
    }
  }
};

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
const settleDraftFrom = ({ title, blocks }) => {
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
    title: normalizeWikiTitleForPresentation(title, { maxLength: 180 }),
    body: { type: 'doc', content },
    sourceRefs
  };
};

/* The same bar any wiki page meets, said as what to do about it. */
const settleRefusal = (draft, noun) => {
  if (!draft.body.content.length) return 'Nothing is written here yet. Write the thought, then settle it.';
  const [blocked] = classifyWikiPageQuality(draft).blockingReasons;
  if (!blocked) return '';
  if (blocked.code === 'untitled_page') return `Give this ${noun} a title before it settles.`;
  if (PLACEHOLDER_CODES.has(blocked.code)) return `“${draft.title}” reads as a placeholder. Give the ${noun} its real title, then settle it.`;
  return `Wiki would not take this yet: ${blocked.message}`;
};

const settledLabel = (kind, id) => `settled-${SETTLE_KINDS[kind].noun}:${id}`;

const settledPageFor = ({ WikiPage, userId, kind, id }) => WikiPage.findOne({
  userId,
  'createdFrom.label': settledLabel(kind, id),
  status: { $ne: 'archived' }
});

module.exports = { SETTLE_KINDS, blocksFromHtml, settleDraftFrom, settleRefusal, settledLabel, settledPageFor };
