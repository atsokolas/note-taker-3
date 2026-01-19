const defaultId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

export const ensureBlockIds = (node, createId = defaultId) => {
  if (!node) return { node, changed: false };
  let changed = false;
  const next = { ...node };
  const needsId = ['paragraph', 'heading', 'blockquote', 'listItem', 'highlightRef', 'articleRef', 'conceptRef', 'questionRef'].includes(node.type);
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
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'highlight_embed',
        highlightId: node.attrs?.highlightId || null,
        text: node.attrs?.highlightText || ''
      });
      return;
    }
    if (node.type === 'articleRef') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'article_ref',
        articleId: node.attrs?.articleId || null,
        articleTitle: node.attrs?.articleTitle || '',
        text: node.attrs?.articleTitle || ''
      });
      return;
    }
    if (node.type === 'conceptRef') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'concept_ref',
        conceptId: node.attrs?.conceptId || null,
        conceptName: node.attrs?.conceptName || '',
        text: node.attrs?.conceptName || ''
      });
      return;
    }
    if (node.type === 'questionRef') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: 'question_ref',
        questionId: node.attrs?.questionId || null,
        questionText: node.attrs?.questionText || '',
        text: node.attrs?.questionText || ''
      });
      return;
    }
    if (node.type === 'blockquote') {
      blocks.push({
        id: node.attrs?.blockId || createId(),
        type: node.attrs?.highlightId ? 'highlight_embed' : 'quote',
        highlightId: node.attrs?.highlightId || null,
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
    if (block.type === 'highlight-ref' || block.type === 'highlight_embed') {
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
    return {
      type: 'paragraph',
      attrs: { blockId: block.id },
      content: block.text ? [{ type: 'text', text: block.text }] : []
    };
  })
});
