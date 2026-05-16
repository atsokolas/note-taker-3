const sanitizeFilename = (value = '') => {
  const base = String(value || 'untitled-wiki-page')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return base || 'untitled-wiki-page';
};

const yamlString = (value = '') => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\r?\n/g, ' ')
  .trim();

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const plainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(plainText).filter(Boolean).join(' ');
  if (typeof node !== 'object') return '';
  return [node.text, plainText(node.content)].filter(Boolean).join(' ').trim();
};

const normalizePage = (page = {}) => (
  page && typeof page.toObject === 'function' ? page.toObject({ virtuals: false }) : page
);

const sourceLabel = (source = {}, index = 0) => {
  const raw = source.citationLabel || source.title || source.url || source.type || `Source ${index + 1}`;
  return String(raw || `Source ${index + 1}`).trim();
};

const citationIndexesFromMarks = (marks = []) => {
  const indexes = new Set();
  marks.forEach((mark) => {
    const attrs = mark?.attrs || {};
    [
      ...(Array.isArray(attrs.citationIndexes) ? attrs.citationIndexes : []),
      ...(Array.isArray(attrs.contradictionIndexes) ? attrs.contradictionIndexes : [])
    ].forEach((value) => {
      const index = Number(value);
      if (Number.isInteger(index) && index > 0) indexes.add(index);
    });
  });
  return [...indexes].sort((a, b) => a - b);
};

const applyMarks = (text = '', marks = [], sourceRefs = []) => {
  let output = String(text || '');
  marks.forEach((mark) => {
    if (mark?.type === 'code') output = `\`${output}\``;
    if (mark?.type === 'bold' || mark?.type === 'strong') output = `**${output}**`;
    if (mark?.type === 'italic' || mark?.type === 'em') output = `_${output}_`;
    if (mark?.type === 'link' && mark.attrs?.href) output = `[${output}](${mark.attrs.href})`;
    if (mark?.type === 'wikiLink') {
      const label = mark.attrs?.title || mark.attrs?.pageTitle || output;
      output = `[[${label}]]`;
    }
  });
  const citationRefs = citationIndexesFromMarks(marks)
    .filter(index => sourceRefs[index - 1])
    .map(index => `[^${index}]`)
    .join('');
  return `${output}${citationRefs}`;
};

const inlineMarkdown = (nodes = [], sourceRefs = []) => {
  if (!Array.isArray(nodes)) return '';
  return nodes.map((node) => {
    if (!node) return '';
    if (node.type === 'text') return applyMarks(node.text || '', node.marks || [], sourceRefs);
    if (node.type === 'hardBreak') return '  \n';
    return inlineMarkdown(node.content || [], sourceRefs);
  }).join('');
};

const blockMarkdown = (node = {}, sourceRefs = [], depth = 0, orderedIndex = 1) => {
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node.content) ? node.content : [];
  if (node.type === 'doc') return children.map(child => blockMarkdown(child, sourceRefs)).filter(Boolean).join('\n\n');
  if (node.type === 'heading') {
    const level = Math.max(1, Math.min(Number(node.attrs?.level) || 2, 6));
    return `${'#'.repeat(level)} ${inlineMarkdown(children, sourceRefs).trim()}`.trim();
  }
  if (node.type === 'paragraph') return inlineMarkdown(children, sourceRefs).trim();
  if (node.type === 'blockquote') {
    return children
      .map(child => blockMarkdown(child, sourceRefs))
      .join('\n\n')
      .split('\n')
      .map(line => `> ${line}`.trimEnd())
      .join('\n');
  }
  if (node.type === 'codeBlock') return `\`\`\`\n${plainText(children)}\n\`\`\``;
  if (node.type === 'horizontalRule') return '---';
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return children
      .map((child, index) => blockMarkdown(child, sourceRefs, depth, node.type === 'orderedList' ? index + 1 : null))
      .filter(Boolean)
      .join('\n');
  }
  if (node.type === 'listItem') {
    const marker = orderedIndex ? `${orderedIndex}.` : '-';
    const first = children[0] ? blockMarkdown(children[0], sourceRefs).replace(/\n/g, '\n  ') : '';
    const rest = children.slice(1).map(child => blockMarkdown(child, sourceRefs, depth + 1)).filter(Boolean);
    return [`${marker} ${first}`.trimEnd(), ...rest.map(line => `  ${line}`)].join('\n');
  }
  return inlineMarkdown(children, sourceRefs).trim();
};

const sourceFootnotes = (sourceRefs = []) => sourceRefs
  .map((source, index) => {
    const label = sourceLabel(source, index);
    const parts = [
      source.type ? `Type: ${source.type}` : '',
      source.url ? `URL: ${source.url}` : '',
      source.snippet ? `Excerpt: ${String(source.snippet).replace(/\s+/g, ' ').trim().slice(0, 500)}` : ''
    ].filter(Boolean);
    return `[^${index + 1}]: ${label}${parts.length ? ` — ${parts.join('; ')}` : ''}`;
  })
  .join('\n');

const pageFrontmatter = (page = {}) => {
  const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  return [
    '---',
    `title: "${yamlString(page.title || 'Untitled Wiki Page')}"`,
    `id: "${yamlString(page._id || page.id || '')}"`,
    `slug: "${yamlString(page.slug || sanitizeFilename(page.title))}"`,
    `type: "${yamlString(page.pageType || 'topic')}"`,
    `status: "${yamlString(page.status || 'draft')}"`,
    `sources: ${sourceRefs.length}`,
    `claims: ${Array.isArray(page.claims) ? page.claims.length : 0}`,
    page.createdAt ? `created: "${formatDate(page.createdAt)}"` : '',
    page.updatedAt ? `updated: "${formatDate(page.updatedAt)}"` : '',
    '---'
  ].filter(Boolean).join('\n');
};

const renderWikiPageMarkdown = (rawPage = {}) => {
  const page = normalizePage(rawPage) || {};
  const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const body = blockMarkdown(page.body || { type: 'doc', content: [] }, sourceRefs).trim()
    || String(page.plainText || '').trim()
    || '_No article body yet._';
  const footnotes = sourceFootnotes(sourceRefs);
  return [
    pageFrontmatter(page),
    '',
    body,
    footnotes ? '\n## References\n' : '',
    footnotes
  ].filter(part => part !== '').join('\n').trimEnd() + '\n';
};

const renderWikiIndexMarkdown = (pages = []) => [
  '# Wiki Export',
  '',
  ...pages.map(page => `- [${page.title || 'Untitled Wiki Page'}](${sanitizeFilename(page.slug || page.title)}.md)`)
].join('\n') + '\n';

const renderWikiLogMarkdown = ({ pages = [], lintRuns = [] } = {}) => [
  '# Wiki Log',
  '',
  '## Pages',
  '',
  ...pages.map(page => `- ${formatDate(page.updatedAt) || 'unknown'} — ${page.title || 'Untitled Wiki Page'} (${page.status || 'draft'})`),
  '',
  '## Lint Runs',
  '',
  ...(lintRuns.length
    ? lintRuns.map(run => `- ${formatDate(run.completedAt || run.createdAt) || 'unknown'} — ${run.summary || 'Wiki lint run'}`)
    : ['- None'])
].join('\n') + '\n';

const renderWikiSchemaMarkdown = (settings = {}) => [
  '# Wiki Schema',
  '',
  settings?.content || '_No custom wiki schema saved._'
].join('\n') + '\n';

module.exports = {
  renderWikiIndexMarkdown,
  renderWikiLogMarkdown,
  renderWikiPageMarkdown,
  renderWikiSchemaMarkdown,
  sanitizeFilename
};
