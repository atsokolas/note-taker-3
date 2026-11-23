// Notebook blocks: their ids, plain text and tags, Markdown, and the references one note makes to another.
const crypto = require('crypto');
const { NotebookEntry, ReferenceEdge } = require('../models/index');
const { asObjectIdOrNull } = require('../utils/notebookIdentity');

const createBlockId = () => (
  (crypto.randomUUID ? crypto.randomUUID() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`)
);

const ITEM_TYPES = new Set(['claim', 'evidence', 'note']);

const normalizeItemType = (value, fallback = 'note') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (ITEM_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeTags = (input) => {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const output = [];
  input.forEach(tag => {
    const value = String(tag || '').trim();
    if (!value || seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());
    output.push(value);
  });
  return output.slice(0, 40);
};

const slugify = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
);

const extractConceptTags = (text = '') => {
  const matches = String(text).match(/#([a-zA-Z0-9_-]+)/g) || [];
  return Array.from(new Set(matches.map(tag => tag.slice(1).toLowerCase())));
};

const stripHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildConceptMarkdown = ({ concept, related, questions }) => {
  const lines = [`# ${concept?.name || 'Concept'}`, ''];
  if (concept?.description) {
    lines.push(concept.description);
    lines.push('');
  }
  if (related?.highlights?.length) {
    lines.push('## Highlights');
    related.highlights.forEach(h => {
      lines.push(`- ${h.text || 'Highlight'}${h.articleTitle ? ` — ${h.articleTitle}` : ''}`);
    });
    lines.push('');
  }
  if (related?.articles?.length) {
    lines.push('## Source articles');
    related.articles.forEach(article => {
      lines.push(`- ${article.title || 'Untitled article'} (${article.highlightCount || 0} highlights)`);
    });
    lines.push('');
  }
  if (questions?.length) {
    lines.push('## Questions');
    questions.forEach(question => {
      lines.push(`- ${question.text}`);
    });
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
};

const ensureNotebookBlocks = (entry, createId) => {
  if (!entry) return entry;
  if (Array.isArray(entry.blocks) && entry.blocks.length > 0) return entry;
  const text = stripHtml(entry.content || '');
  if (!text) return entry;
  const blockId = createId ? createId() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  entry.blocks = [{ id: blockId, type: 'paragraph', text }];
  return entry;
};

const buildNotebookBlocksFromEdges = async ({ userId, edges }) => {
  if (!edges || edges.length === 0) return [];
  const entryIds = Array.from(new Set(edges.map(edge => String(edge.sourceId))));
  const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
    .select('title updatedAt')
    .lean();
  const entryMap = new Map(entries.map(entry => [String(entry._id), entry]));

  const seen = new Set();
  return edges.reduce((acc, edge) => {
    const key = `${edge.sourceId}:${edge.sourceBlockId || ''}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    const entry = entryMap.get(String(edge.sourceId));
    acc.push({
      notebookEntryId: edge.sourceId,
      notebookTitle: entry?.title || 'Untitled',
      blockId: edge.sourceBlockId,
      blockPreviewText: edge.blockPreviewText || '',
      updatedAt: entry?.updatedAt
    });
    return acc;
  }, []);
};

const loadNotebookBacklinks = async ({ userId, targetType, targetId, targetTagName }) => {
  const query = { userId, targetType };
  if (targetId) query.targetId = targetId;
  if (targetTagName) query.targetTagName = targetTagName;
  const edges = await ReferenceEdge.find(query).lean();
  return buildNotebookBlocksFromEdges({ userId, edges });
};

const syncNotebookReferences = async (userId, entryId, blocks = []) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: entryId });
    return;
  }

  await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: entryId });
  const edges = [];

  blocks.forEach((block) => {
    const blockId = block.id || block.blockId;
    if (!blockId) return;
    const preview = String(block.text || '').slice(0, 180);

    const blockType = block.type || '';
    if ((blockType === 'highlight-ref' || blockType === 'highlight_embed') && asObjectIdOrNull(block.highlightId)) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'highlight',
        targetId: asObjectIdOrNull(block.highlightId),
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'article_ref' || blockType === 'article-ref') && asObjectIdOrNull(block.articleId)) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'article',
        targetId: asObjectIdOrNull(block.articleId),
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'concept_ref' || blockType === 'concept-ref') && block.conceptName) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'concept',
        targetTagName: String(block.conceptName).toLowerCase(),
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'question_ref' || blockType === 'question-ref') && asObjectIdOrNull(block.questionId)) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'question',
        targetId: asObjectIdOrNull(block.questionId),
        blockPreviewText: preview,
        userId
      });
    }

    const tags = extractConceptTags(block.text || '');
    tags.forEach((tagName) => {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'concept',
        targetTagName: tagName,
        blockPreviewText: preview,
        userId
      });
    });
  });

  if (edges.length > 0) {
    await ReferenceEdge.insertMany(edges);
  }
};

module.exports = {
  createBlockId,
  normalizeItemType,
  normalizeTags,
  slugify,
  stripHtml,
  buildConceptMarkdown,
  ensureNotebookBlocks,
  buildNotebookBlocksFromEdges,
  loadNotebookBacklinks,
  syncNotebookReferences
};
