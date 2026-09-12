const defaultId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

export const isMongoObjectId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));

const objectIdOrNull = (value) => (isMongoObjectId(value) ? String(value) : null);

export const ensureBlockIds = (node, createId = defaultId) => {
  if (!node) return { node, changed: false };
  let changed = false;
  const next = { ...node };
  const needsId = ['paragraph', 'heading', 'blockquote', 'listItem', 'highlightRef', 'articleRef', 'conceptRef', 'questionRef', 'wikiRef', 'codeBlock'].includes(node.type);
  if (needsId) {
    next.attrs = { ...(node.attrs || {}) };
    if (!next.attrs.blockId) {
      next.attrs.blockId = createId();
      changed = true;
    }
  }
  if (node.content) {
    next.content = node.content.map(child => {
      const result = ensureBlockIds(child, createId);
      if (result.changed) changed = true;
      return result.node;
    });
  }
  return { node: next, changed };
};

const extractText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(extractText).join('');
};

const wikiIdFromSourcePath = (path = '') => {
  const match = String(path || '').match(/[?&]page=([^&]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (_error) {
    return match[1];
  }
};

export const serializeBlocksFromDoc = (doc, createId = defaultId) => {
  const blocks = [];
  const walk = (node, indent = 0) => {
    if (!node) return;
    if (node.type === 'paragraph') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'paragraph',
        text: extractText(node)
      });
      return;
    }
    if (node.type === 'heading') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'heading',
        level: node.attrs?.level || 1,
        text: extractText(node)
      });
      return;
    }
    if (node.type === 'highlightRef') {
      const highlightId = objectIdOrNull(node.attrs?.highlightId);
      const articleId = objectIdOrNull(node.attrs?.articleId);
      const articleTitle = node.attrs?.articleTitle || '';
      const rawArticleId = node.attrs?.articleId || '';
      const rawHighlightId = node.attrs?.highlightId || '';
      const sourcePath = node.attrs?.sourcePath || (
        rawArticleId
          ? `/library?articleId=${encodeURIComponent(rawArticleId)}${rawHighlightId ? `&highlightId=${encodeURIComponent(rawHighlightId)}` : ''}`
          : ''
      );
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'highlight_embed',
        highlightId,
        text: node.attrs?.highlightText || '',
        ...(articleId ? { articleId } : {}),
        ...(articleTitle ? { articleTitle } : {}),
        ...(sourcePath ? { sourcePath } : {})
      });
      return;
    }
    if (node.type === 'articleRef') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'article_ref',
        articleId: objectIdOrNull(node.attrs?.articleId),
        articleTitle: node.attrs?.articleTitle || '',
        text: node.attrs?.articleTitle || ''
      });
      return;
    }
    if (node.type === 'conceptRef') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'concept_ref',
        conceptId: objectIdOrNull(node.attrs?.conceptId),
        conceptName: node.attrs?.conceptName || '',
        text: node.attrs?.conceptName || ''
      });
      return;
    }
    if (node.type === 'questionRef') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'question_ref',
        questionId: objectIdOrNull(node.attrs?.questionId),
        questionText: node.attrs?.questionText || '',
        text: node.attrs?.questionText || ''
      });
      return;
    }
    if (node.type === 'wikiRef') {
      const wikiId = node.attrs?.wikiId || '';
      const wikiTitle = node.attrs?.wikiTitle || '';
      const wikiMeta = node.attrs?.wikiMeta || '';
      const sourcePath = wikiId
        ? `/wiki/workspace?page=${encodeURIComponent(wikiId)}`
        : '';
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'wiki_ref',
        text: wikiTitle,
        articleTitle: wikiTitle,
        ...(sourcePath ? { sourcePath } : {}),
        ...(wikiMeta ? { conceptName: wikiMeta } : {})
      });
      return;
    }
    if (node.type === 'codeBlock') {
      const language = String(node.attrs?.language || '').trim();
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'code',
        text: extractText(node),
        // Pre-nodes schema has no language field; sourcePath is the surviving string.
        ...(language ? { sourcePath: language } : {})
      });
      return;
    }
    if (node.type === 'horizontalRule') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'divider',
        text: ''
      });
      return;
    }
    if (node.type === 'blockquote') {
      const highlightId = objectIdOrNull(node.attrs?.highlightId);
      const articleId = objectIdOrNull(node.attrs?.articleId);
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: node.attrs?.highlightId ? 'highlight_embed' : 'quote',
        ...(highlightId ? { highlightId } : {}),
        ...(node.attrs?.sourcePath ? { sourcePath: node.attrs.sourcePath } : {}),
        ...(articleId ? { articleId } : {}),
        ...(node.attrs?.articleTitle ? { articleTitle: node.attrs.articleTitle } : {}),
        text: extractText(node)
      });
      return;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      (node.content || []).forEach(child => walk(child, indent));
      return;
    }
    if (node.type === 'listItem') {
      const paragraph = (node.content || []).find(child => child.type === 'paragraph');
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'bullet',
        indent,
        text: paragraph ? extractText(paragraph) : extractText(node)
      });
      (node.content || []).forEach(child => {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          (child.content || []).forEach(grandchild => walk(grandchild, indent + 1));
        }
      });
      return;
    }
    (node.content || []).forEach(child => walk(child, indent));
  };
  walk(doc, 0);
  return blocks;
};

export const buildDocFromBlocks = (blocks = []) => ({
  type: 'doc',
  content: blocks.map(block => {
    if (block.type === 'heading') {
      return {
        type: 'heading',
        attrs: { level: block.level || 1, blockId: block.id },
        content: block.text ? [{ type: 'text', text: block.text }] : []
      };
    }
    const savedHighlight = block.type === 'highlight-ref' || block.type === 'highlight_embed';
    if (block.type === 'quote' || (savedHighlight && block.sourcePath)) {
      return {
        type: 'blockquote',
        attrs: {
          blockId: block.id,
          ...(savedHighlight ? { highlightId: block.highlightId || null } : {}),
          sourcePath: block.sourcePath || null,
          articleId: block.articleId || null,
          articleTitle: block.articleTitle || ''
        },
        content: block.text
          ? [{ type: 'paragraph', content: [{ type: 'text', text: block.text }] }]
          : []
      };
    }
    if (savedHighlight) {
      return {
        type: 'highlightRef',
        attrs: {
          highlightId: block.highlightId || null,
          highlightText: block.text || '',
          blockId: block.id
        }
      };
    }
    if (block.type === 'article_ref' || block.type === 'article-ref') {
      return {
        type: 'articleRef',
        attrs: {
          articleId: block.articleId || null,
          articleTitle: block.articleTitle || block.text || '',
          blockId: block.id
        }
      };
    }
    if (block.type === 'concept_ref' || block.type === 'concept-ref') {
      return {
        type: 'conceptRef',
        attrs: {
          conceptId: block.conceptId || null,
          conceptName: block.conceptName || block.text || '',
          blockId: block.id
        }
      };
    }
    if (block.type === 'question_ref' || block.type === 'question-ref') {
      return {
        type: 'questionRef',
        attrs: {
          questionId: block.questionId || null,
          questionText: block.questionText || block.text || '',
          blockId: block.id
        }
      };
    }
    if (block.type === 'wiki_ref' || block.type === 'wiki-ref' || block.type === 'wikiRef') {
      return {
        type: 'wikiRef',
        attrs: {
          wikiId: wikiIdFromSourcePath(block.sourcePath),
          wikiTitle: block.articleTitle || block.text || '',
          wikiMeta: block.conceptName || '',
          blockId: block.id
        }
      };
    }
    if (block.type === 'code' || block.type === 'codeBlock') {
      return {
        type: 'codeBlock',
        attrs: {
          language: block.sourcePath || null,
          blockId: block.id
        },
        content: block.text ? [{ type: 'text', text: block.text }] : []
      };
    }
    if (block.type === 'divider' || block.type === 'horizontalRule') {
      return {
        type: 'horizontalRule',
        attrs: { blockId: block.id }
      };
    }
    return {
      type: 'paragraph',
      attrs: { blockId: block.id },
      content: block.text ? [{ type: 'text', text: block.text }] : []
    };
  })
});
