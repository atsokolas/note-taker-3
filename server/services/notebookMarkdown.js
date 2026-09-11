const stripTags = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const sourceHref = (block = {}) => {
  const path = String(block.sourcePath || '').trim();
  if (path.startsWith('/')) return path;
  const articleId = String(block.articleId || '').trim();
  const highlightId = String(block.highlightId || '').trim();
  if (articleId && highlightId) {
    return `/library?articleId=${encodeURIComponent(articleId)}&highlightId=${encodeURIComponent(highlightId)}`;
  }
  if (articleId) return `/library?articleId=${encodeURIComponent(articleId)}`;
  return '';
};

const pushBlank = (lines) => {
  if (lines[lines.length - 1] !== '') lines.push('');
};

const quoteLines = (block) => {
  const text = String(block.text || '').trim();
  const title = String(block.articleTitle || '').trim();
  const href = sourceHref(block);
  const lines = [];
  if (text) {
    text.split(/\n/).forEach((line) => lines.push(`> ${line}`));
  }
  if (title || href) {
    if (text) lines.push('>');
    if (title && href) lines.push(`> — [${title}](${href})`);
    else if (title) lines.push(`> — ${title}`);
    else lines.push(`> — [Source](${href})`);
  }
  return lines;
};

const buildNotebookMarkdown = (entry) => {
  const title = String(entry?.title || 'Untitled').trim() || 'Untitled';
  const blocks = Array.isArray(entry?.blocks) && entry.blocks.length > 0
    ? entry.blocks
    : [{ type: 'paragraph', text: stripTags(entry?.content || '') }];
  const lines = [`# ${title}`, ''];

  blocks.forEach((block) => {
    const type = block.type || 'paragraph';
    const text = String(block.text || '').trim();
    if (type === 'heading') {
      const level = Math.min(Math.max(Number(block.level) || 1, 1), 4);
      lines.push(`${'#'.repeat(level)} ${text}`);
      pushBlank(lines);
      return;
    }
    if (type === 'bullet') {
      const indent = '  '.repeat(block.indent || 0);
      lines.push(`${indent}- ${text}`);
      return;
    }
    if (type === 'highlight_embed' || type === 'highlight-ref' || type === 'quote') {
      const quoted = quoteLines(block);
      if (quoted.length) {
        lines.push(...quoted);
        pushBlank(lines);
      }
      return;
    }
    if (type === 'article_ref' || type === 'article-ref') {
      const label = block.articleTitle || text || 'Untitled article';
      const href = block.articleId ? `/articles/${block.articleId}` : sourceHref(block);
      lines.push(href ? `[${label}](${href})` : label);
      pushBlank(lines);
      return;
    }
    if (type === 'concept_ref' || type === 'concept-ref') {
      lines.push(`Concept: ${block.conceptName || text || 'Concept'}`);
      pushBlank(lines);
      return;
    }
    if (type === 'question_ref' || type === 'question-ref') {
      lines.push(`Question: ${block.questionText || text || 'Question'}`);
      pushBlank(lines);
      return;
    }
    if (text) {
      lines.push(text);
      pushBlank(lines);
    }
  });

  return `${lines.join('\n').trim()}\n`;
};

module.exports = {
  buildNotebookMarkdown,
  sourceHref
};
