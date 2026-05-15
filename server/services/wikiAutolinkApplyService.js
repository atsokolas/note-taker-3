const { __testables } = require('./wikiAutolinkService');

const { buildTitleMatcher, titleAliases } = __testables;

const clone = (value) => JSON.parse(JSON.stringify(value));

const hasWikiLinkMark = (node, pageId) => (
  Array.isArray(node?.marks)
  && node.marks.some(mark => mark?.type === 'wikiLink' && String(mark?.attrs?.pageId || '') === String(pageId || ''))
);

const docHasWikiLink = (node, pageId) => {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(child => docHasWikiLink(child, pageId));
  if (typeof node !== 'object') return false;
  if (hasWikiLinkMark(node, pageId)) return true;
  return Array.isArray(node.content) && node.content.some(child => docHasWikiLink(child, pageId));
};

const addWikiLinkMark = (node, page) => ({
  ...node,
  marks: [
    ...(Array.isArray(node.marks) ? node.marks : []),
    {
      type: 'wikiLink',
      attrs: {
        pageId: String(page._id || page.id || ''),
        title: String(page.title || 'Wiki page').trim()
      }
    }
  ]
});

const splitTextNodeWithWikiLink = ({ node, start, end, targetPage }) => {
  const text = String(node.text || '');
  const before = text.slice(0, start);
  const match = text.slice(start, end);
  const after = text.slice(end);
  const base = { ...node };
  delete base.text;
  const out = [];
  if (before) out.push({ ...base, text: before });
  out.push(addWikiLinkMark({ ...base, text: match }, targetPage));
  if (after) out.push({ ...base, text: after });
  return out;
};

const applyWikiAutolinkToDoc = ({ doc, targetPage } = {}) => {
  if (!doc || typeof doc !== 'object' || !targetPage) return { doc, applied: false };
  const matchTexts = [
    targetPage.matchText,
    ...(Array.isArray(targetPage.aliases) ? targetPage.aliases : []),
    ...titleAliases(targetPage.title)
  ].map(value => String(value || '').trim()).filter(Boolean);
  const matchers = Array.from(new Set(matchTexts.map(value => value.toLowerCase())))
    .map(key => matchTexts.find(value => value.toLowerCase() === key))
    .map(buildTitleMatcher)
    .filter(Boolean);
  if (!matchers.length) return { doc, applied: false };
  const targetPageId = targetPage._id || targetPage.id;
  if (docHasWikiLink(doc, targetPageId)) return { doc, applied: false };
  let applied = false;

  const visit = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (applied) return node;
    if (node.type === 'text' && typeof node.text === 'string' && !hasWikiLinkMark(node, targetPageId)) {
      for (const matcher of matchers) {
        matcher.lastIndex = 0;
        const match = matcher.exec(node.text);
        if (match) {
          applied = true;
          const start = match.index + match[0].indexOf(match[1]);
          const end = start + match[1].length;
          return splitTextNodeWithWikiLink({ node, start, end, targetPage });
        }
      }
    }
    if (!Array.isArray(node.content)) return node;
    const nextContent = [];
    node.content.forEach((child) => {
      const next = visit(child);
      if (Array.isArray(next)) nextContent.push(...next);
      else nextContent.push(next);
    });
    return { ...node, content: nextContent };
  };

  const nextDoc = visit(clone(doc));
  return { doc: nextDoc, applied };
};

module.exports = {
  applyWikiAutolinkToDoc,
  __testables: {
    docHasWikiLink,
    splitTextNodeWithWikiLink
  }
};
