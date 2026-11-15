const crypto = require('crypto');
const { chatComplete, isClaudeConfigured, parseStructuredText } = require('../ai/hfTextClient');
const { validDay } = require('./workPlanner');

/**
 * A week of Work, read back as an Edition.
 *
 * The Edition standard holds here too: every line says where it came from,
 * and a section nobody's week filled is printed as silence, never padded.
 * The draft is an ordinary Work note, so it stays inside Work: nothing about
 * it reaches the personal Editions, the agents or a public share.
 *
 * Work is a firm room, so only Claude reads it. The free fallback routes the
 * rest of Noeis can fall through to are never offered these notes.
 */

const EDITION_TAG = 'work-edition';
const DAYS = 7;
const ENTRY_CHARS = 4000;
const WEEK_CHARS = 48000;

const SECTIONS = Object.freeze([
  { key: 'done', label: 'What got done', ask: 'what was finished, shipped, sent or settled', max: 8 },
  { key: 'decisions', label: 'Decisions', ask: 'what was decided, and by whom when the entry says', max: 6 },
  { key: 'open', label: 'Open threads', ask: 'what is still unresolved, waiting on someone, or due next', max: 8 },
  // A theme is something the week kept returning to, so one entry is never enough.
  { key: 'themes', label: 'Themes', ask: 'what ran through two or more entries', max: 3, minSources: 2 }
]);

const shiftDay = (day, offset) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const format = (day, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
const short = day => format(day, { day: 'numeric', month: 'short' });

// The same reading of a date heading the Work editor uses: ISO, or "11 November 2026" / "11 Nov 2026".
const MONTHS = Array.from({ length: 12 }, (_, index) => ['long', 'short'].map(month => format(`2000-${String(index + 1).padStart(2, '0')}-01`, { month }).toLowerCase()));
function entryDay(text) {
  const value = String(text || '').trim();
  if (validDay(value)) return value;
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const month = MONTHS.findIndex(names => names.includes(match[2].toLowerCase()));
  const day = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return month >= 0 && validDay(day) ? day : '';
}

const decode = text => text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Work saves blocks beside its HTML; an older note that has only HTML is read the same way.
function blocksOf(note) {
  if (Array.isArray(note.blocks) && note.blocks.length) return note.blocks;
  return String(note.content || '').split(/(?=<h2\b)|<\/h2>/i).flatMap((part) => {
    const heading = part.match(/^<h2\b[^>]*>([\s\S]*)$/i);
    if (heading) return [{ type: 'heading', level: 2, text: decode(heading[1].replace(/<[^>]+>/g, '')).trim() }];
    return decode(part.replace(/<\/(p|li|blockquote|pre|h[1-6])>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).split('\n').map(text => ({ type: 'paragraph', text: text.trim() }));
  });
}
const lineOf = (block) => {
  const text = String(block.text || '').trim();
  if (!text) return '';
  if (block.type === 'bullet') return `${'  '.repeat(block.indent || 0)}- ${text}`;
  if (block.type === 'quote') return `> ${text}`;
  return text;
};
const isDateHeading = block => block.type === 'heading' && Number(block.level) === 2 && entryDay(block.text);
const titleOf = note => String(note.title || '').trim() || blocksOf(note).find(block => !isDateHeading(block) && String(block.text || '').trim())?.text.trim().slice(0, 80) || 'Untitled note';

/* An entry is one dated section of a note, or the writing above a note's first
   date heading, which belongs to the day the note itself was written for. */
function weekEntries(notes, through) {
  const start = shiftDay(through, -(DAYS - 1));
  const entries = [];
  for (const note of notes) {
    if (note.workItem || (note.tags || []).includes(EDITION_TAG)) continue;
    const title = titleOf(note);
    let section = { day: note.occurredOn || note.takenOn || '', lines: [] };
    const sections = [section];
    for (const block of blocksOf(note)) {
      const day = isDateHeading(block);
      if (day) { section = { day, lines: [] }; sections.push(section); continue; }
      const line = lineOf(block);
      if (line) section.lines.push(line);
    }
    for (const { day, lines } of sections) {
      if (day >= start && day <= through && lines.length) entries.push({ noteId: String(note._id || ''), title, day, text: lines.join('\n') });
    }
  }
  entries.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
  // Long weeks are read from the most recent entry back; whatever is cut is counted, never hidden.
  let room = WEEK_CHARS, trimmed = 0;
  for (const entry of [...entries].reverse()) {
    const allowed = Math.max(0, Math.min(ENTRY_CHARS, room));
    if (entry.text.length > allowed) { entry.text = entry.text.slice(0, allowed); if (allowed) trimmed += 1; }
    room -= entry.text.length;
  }
  const read = entries.filter(entry => entry.text);
  read.forEach((entry, index) => { entry.id = `e${index + 1}`; });
  return { start, end: through, entries: read, trimmed, skipped: entries.length - read.length };
}

const buildPrompt = ({ entries, start, end }) => `These are one person's Work notes for ${short(start)} to ${short(end)} ${end.slice(0, 4)}, one entry per dated section. Read them as their chief of staff and draft the week's Edition.

Return JSON only:
{${SECTIONS.map(section => `"${section.key}":[{"line":"one sentence","from":["e1"]}]`).join(',')}}

Sections:
${SECTIONS.map(section => `- ${section.key}: ${section.ask}. At most ${section.max}.${section.minSources ? ` Each needs at least ${section.minSources} entries in "from".` : ''}`).join('\n')}

Rules:
- Say only what the entries say. No new facts, names, numbers or advice.
- Keep the writer's own words and names where you can. One plain sentence per line, under 200 characters.
- "from" lists the ids of the entries the line rests on. A line with no entry behind it is left out.
- An empty list is the right answer for a section the week did not fill. Never pad.
- Do not wrap the JSON in markdown.

Entries:
${entries.map(entry => `[${entry.id}] ${entry.title} · ${short(entry.day)}\n${entry.text}`).join('\n\n')}`;

/* What the model says is kept only where it points at entries it was given;
   the citation printed beside each line is written from those entries, not by the model. */
function parseEdition(text, entries) {
  const parsed = typeof text === 'object' && text ? text : parseStructuredText(text) || {};
  const known = new Map(entries.map(entry => [entry.id, entry]));
  return SECTIONS.map(section => ({
    ...section,
    lines: (Array.isArray(parsed[section.key]) ? parsed[section.key] : []).map((item) => {
      const line = String(item?.line || '').replace(/\s+/g, ' ').trim().slice(0, 280);
      const from = [...new Set(Array.isArray(item?.from) ? item.from.map(String) : [])].filter(id => known.has(id)).map(id => known.get(id));
      return { line, from };
    }).filter(item => item.line && item.from.length >= (section.minSources || 1)).slice(0, section.max)
  }));
}

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const span = ({ start, end }) => {
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${format(start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (start.slice(0, 7) !== end.slice(0, 7)) return `${short(start)} – ${short(end)} ${end.slice(0, 4)}`;
  return `${Number(start.slice(8))}–${short(end)} ${end.slice(0, 4)}`;
};
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const cite = from => from.slice(0, 3).map(entry => `${entry.title}, ${short(entry.day)}`).join('; ') + (from.length > 3 ? `; and ${from.length - 3} more` : '');

function renderEdition({ sections, week }) {
  const notes = new Set(week.entries.map(entry => entry.noteId || entry.title)).size;
  const partial = [
    week.trimmed ? `${plural(week.trimmed, 'long entry', 'long entries')} ${week.trimmed === 1 ? 'was' : 'were'} read only in part.` : '',
    week.skipped ? `${plural(week.skipped, 'older entry', 'older entries')} did not fit and ${week.skipped === 1 ? 'was' : 'were'} left out.` : ''
  ].filter(Boolean).join(' ');
  const receipt = `Drafted by Claude from ${plural(week.entries.length, 'entry', 'entries')} in ${plural(notes, 'note')}, ${span(week)}. Each line names the entry it came from. Edit anything.${partial ? ` ${partial}` : ''}`;
  const id = () => `week-${crypto.randomUUID()}`;
  const blocks = [{ id: id(), type: 'paragraph', text: receipt }];
  let html = `<p>${escape(receipt)}</p>`;
  for (const section of sections) {
    blocks.push({ id: id(), type: 'heading', level: 2, text: section.label });
    html += `<h2>${escape(section.label)}</h2>`;
    if (!section.lines.length) {
      const silence = 'Nothing in this week’s notes.';
      blocks.push({ id: id(), type: 'paragraph', text: silence });
      html += `<p>${escape(silence)}</p>`;
      continue;
    }
    const lines = section.lines.map(item => `${item.line} · ${cite(item.from)}`);
    lines.forEach(text => blocks.push({ id: id(), type: 'bullet', indent: 0, text }));
    html += `<ul>${lines.map(text => `<li><p>${escape(text)}</p></li>`).join('')}</ul>`;
  }
  return { title: `Week of ${span(week)}`, blocks, content: html };
}

const unavailable = message => Object.assign(new Error(message), { status: 503 });

/* Returns the note to create, or the silence when the week holds nothing to read.
   No entries means no model call: filler is never the answer. */
async function draftWeekEdition({ notes, through, signal, generate = null }) {
  const week = weekEntries(notes, through);
  if (!week.entries.length) return { silence: `No Work entries between ${short(week.start)} and ${short(week.end)}. Nothing to draft.`, week };
  let text;
  if (typeof generate === 'function') text = await generate({ prompt: buildPrompt(week), week });
  else {
    if (!isClaudeConfigured()) throw unavailable('Week Editions need Claude, and Claude is not connected on this server.');
    const completion = await chatComplete({
      onlyClaude: true,
      route: 'structure_planner',
      maxTokens: 2400,
      messages: [
        { role: 'system', content: 'You read a person’s own work notes back to them as a short, faithful weekly Edition. You return JSON only.' },
        { role: 'user', content: buildPrompt(week) }
      ],
      signal
    });
    text = completion?.text;
  }
  return { draft: renderEdition({ sections: parseEdition(text, week.entries), week }), week };
}

module.exports = { EDITION_TAG, SECTIONS, entryDay, weekEntries, buildPrompt, parseEdition, renderEdition, draftWeekEdition };
