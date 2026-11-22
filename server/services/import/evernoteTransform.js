const toTrimmedString = (value = '') => String(value || '').trim();

const decodeXmlEntities = (value = '') => (
  String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
);

const stripHtmlToLines = (value = '') => {
  const normalized = decodeXmlEntities(String(value || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|ul|ol|h1|h2|h3|h4|h5|h6|tr)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^<>]*>/g, ' ');
  return normalized
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

/* An export is read with indexOf, never a lazy regex: a lazy match that
   fails rescans to the end from every opening tag, and one upload of
   unclosed tags would hold the server for hours. */
const between = (text, open, close, from = 0) => {
  const start = text.indexOf(open, from);
  if (start < 0) return null;
  const end = text.indexOf(close, start + open.length);
  return end < 0 ? null : { inner: text.slice(start + open.length, end), next: end + close.length };
};
const tagText = (xml, name) => between(xml, `<${name}>`, `</${name}>`)?.inner || '';
const tagTexts = (xml, name) => {
  const found = [];
  for (let hit = between(xml, `<${name}>`, `</${name}>`); hit; hit = between(xml, `<${name}>`, `</${name}>`, hit.next)) found.push(hit.inner);
  return found;
};
const CDATA = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/;

const parseEnexNotes = (xmlText = '') => tagTexts(String(xmlText || ''), 'note').map((noteXml) => {
  const content = tagText(noteXml, 'content');
  return {
    title: toTrimmedString(decodeXmlEntities(tagText(noteXml, 'title'))) || 'Untitled',
    created: toTrimmedString(tagText(noteXml, 'created')),
    updated: toTrimmedString(tagText(noteXml, 'updated')),
    tags: tagTexts(noteXml, 'tag').map(tag => toTrimmedString(decodeXmlEntities(tag))).filter(Boolean),
    contentLines: stripHtmlToLines((CDATA.exec(content) || [, content])[1]),
    sourceUrl: toTrimmedString(decodeXmlEntities(tagText(noteXml, 'source-url')))
  };
});

const parseEvernoteDate = (value = '') => {
  const safeValue = toTrimmedString(value);
  if (!safeValue) return null;
  const compactMatch = safeValue.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  );
  const normalized = compactMatch
    ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}T${compactMatch[4]}:${compactMatch[5]}:${compactMatch[6]}Z`
    : safeValue;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildNotebookPayloadFromLines = ({ title, lines = [], createId }) => {
  const makeId = typeof createId === 'function'
    ? createId
    : (() => `block-${Math.random().toString(36).slice(2, 10)}`);
  const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  const blocks = (safeLines.length > 0 ? safeLines : [title]).map((text) => ({
    id: makeId(),
    type: text.startsWith('- ') ? 'bullet' : 'paragraph',
    indent: 0,
    text: text.startsWith('- ') ? text.slice(2).trim() : text
  }));
  const content = blocks.map((block) => {
    const safeText = String(block.text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (block.type === 'bullet') return `<ul><li>${safeText}</li></ul>`;
    return `<p>${safeText}</p>`;
  }).join('');
  return { blocks, content };
};

module.exports = {
  buildNotebookPayloadFromLines,
  decodeXmlEntities,
  parseEnexNotes,
  parseEvernoteDate,
  stripHtmlToLines
};
