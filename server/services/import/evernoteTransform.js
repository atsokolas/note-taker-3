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
    .replace(/<[^>]+>/g, ' ');
  return normalized
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

const parseEnexNotes = (xmlText = '') => {
  const notes = [];
  const noteMatches = String(xmlText || '').match(/<note>[\s\S]*?<\/note>/g) || [];
  noteMatches.forEach((noteXml) => {
    const getTag = (tagName) => {
      const match = noteXml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
      return match ? match[1] : '';
    };
    const getTags = () => {
      const tags = [];
      const regex = /<tag>([\s\S]*?)<\/tag>/gi;
      let match = regex.exec(noteXml);
      while (match) {
        const value = toTrimmedString(decodeXmlEntities(match[1]));
        if (value) tags.push(value);
        match = regex.exec(noteXml);
      }
      return tags;
    };
    const title = toTrimmedString(decodeXmlEntities(getTag('title'))) || 'Untitled';
    const contentMatch = noteXml.match(/<content><!\[CDATA\[([\s\S]*?)\]\]><\/content>/i)
      || noteXml.match(/<content>([\s\S]*?)<\/content>/i);
    const contentXml = contentMatch ? contentMatch[1] : '';
    const lines = stripHtmlToLines(contentXml);
    const sourceUrlMatch = noteXml.match(/<source-url>([\s\S]*?)<\/source-url>/i);
    const sourceUrl = sourceUrlMatch ? toTrimmedString(decodeXmlEntities(sourceUrlMatch[1])) : '';
    notes.push({
      title,
      created: toTrimmedString(getTag('created')),
      updated: toTrimmedString(getTag('updated')),
      tags: getTags(),
      contentLines: lines,
      sourceUrl
    });
  });
  return notes;
};

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
