const { cleanText } = require('../utils/searchSnippet');
const { validDay, captureFields } = require('./workPlanner');
const fail = message => Object.assign(new Error(message), { status: 400 });
const sourceText = html => cleanText(String(html).replace(/<\/?(?:strong|b|em|i|s|u|a|span|code|mark)\b[^>]*>/gi, ''));
const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
const escapeRegex = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Read the source element and its following writing. HTML retains hard breaks
// and paragraph boundaries which legacy flat blocks cannot represent.
function sourcePassage(html, id) {
  const opening = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bdata-block-id\\s*=\\s*["']${escapeRegex(id)}["'][^>]*>`, 'i').exec(html);
  if (!opening) return null;
  const tags = new RegExp(`</?${opening[1]}\\b[^>]*>`, 'gi'); tags.lastIndex = opening.index;
  let depth = 0, end = html.length, tag;
  while ((tag = tags.exec(html))) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (!depth) { end = tags.lastIndex; break; }
  }
  return { before: html.slice(0, opening.index), text: normalize(sourceText(html.slice(opening.index, end))), suffix: normalize(sourceText(html.slice(opening.index))) };
}
const months = Array.from({ length: 12 }, (_, i) => ['long', 'short'].map(month => new Intl.DateTimeFormat('en', { month, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))).toLowerCase()));
const entryDay = text => {
  if (validDay(text)) return text;
  const match = String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const month = months.findIndex(names => names.includes(match[2].toLowerCase()));
  const day = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return month >= 0 && validDay(day) ? day : '';
};

// The owner supplies a passage; its notebook, date and title come from the saved source.
// The receipt is immutable, so moving or editing either note cannot rewrite its origin.
async function workOrigin(input, note, findFolder) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.quote !== 'string' || !input.quote.trim() || input.quote.length > 4000 || (input.blockId != null && (typeof input.blockId !== 'string' || input.blockId.length > 160))) throw fail('Select up to 4,000 characters from the source note.');
  const quote = normalize(input.quote), blocks = note.blocks || [];
  const originalDay = note.occurredOn || note.takenOn || (note.createdAt ? captureFields({ capturedAt: new Date(note.createdAt).toISOString(), timeZone: note.timeZone || 'UTC' }).takenOn : '');
  const blockDay = index => blocks.slice(0, index + 1).reduce((day, block) => block.type === 'heading' && block.level === 2 ? entryDay(block.text) || day : day, originalDay);
  let index = -1, day = originalDay, blockId = null;
  const passage = input.blockId && sourcePassage(note.content || '', input.blockId);
  if (passage) {
    const start = passage.suffix.indexOf(quote);
    if (start < 0 || start >= passage.text.length) throw fail('The source passage changed. Select it again before adding this follow-up.');
    const savedIndex = blocks.findIndex(block => block.id === input.blockId);
    day = savedIndex >= 0 ? blockDay(savedIndex) : [...passage.before.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].reduce((day, match) => entryDay(sourceText(match[1])) || day, originalDay);
    if (input.day && input.day !== day) throw fail('The source meeting date changed. Select the passage again.');
    blockId = input.blockId;
  } else if (blocks.length) {
    index = blocks.findIndex((block, at) => {
      if ((input.blockId && block.id !== input.blockId) || (input.day && blockDay(at) !== input.day)) return false;
      const passage = block.id && sourcePassage(note.content || '', block.id);
      const suffix = passage?.suffix ?? normalize(blocks.slice(at).map(value => value.text || '').join('\n'));
      const start = suffix.indexOf(quote);
      return start >= 0 && start < (passage?.text ?? normalize(block.text)).length;
    });
    if (index < 0) throw fail('The source passage changed. Select it again before adding this follow-up.');
    blockId = blocks[index].id || null;
    day = blockDay(index);
  } else {
    const html = note.content || '';
    if (!normalize(sourceText(html)).includes(quote)) throw fail('The source passage changed. Select it again before adding this follow-up.');
    // Legacy HTML-only notes still retain their original meeting section without a migration.
    const sections = html.split(/<h2\b[^>]*>/i);
    let found = false;
    for (const section of sections) {
      const [heading] = section.split(/<\/h2>/i);
      const sectionDay = entryDay(sourceText(heading));
      if (sectionDay) day = sectionDay;
      if (normalize(sourceText(section)).includes(quote) && (!input.day || input.day === day)) { found = true; break; }
    }
    if (!found) {
      if (input.day && input.day !== originalDay) throw fail('The source meeting date changed. Select the passage again.');
      day = originalDay;
    }
  }
  const folderId = note.folder ? String(note.folder._id || note.folder) : null;
  const folder = folderId && await findFolder(folderId);
  return { noteId: String(note._id), notebookId: folderId, notebookName: folder?.name || 'Work inbox', noteTitle: note.title || 'Untitled note', day, blockId, quote: input.quote.trim() };
}
module.exports = { workOrigin };
