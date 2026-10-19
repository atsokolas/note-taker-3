/* Export files people already hold, read into one shape.

   Every reading app lets you take your reading with you, each in its own
   dialect: Kindle's My Clippings.txt, the notes Apple Books mails you, Pocket's
   HTML or CSV, Instapaper's CSV, Readwise's CSV, a folder of Markdown from
   Notion or Obsidian, an EPUB book, a PDF. Each parser here turns one dialect into the same two
   lists, and the import route lands those lists the same way whatever they
   came from:

     sources  [{ url, aliases, title, author, folderName, tags, savedAt, content,
                 highlights: [{ text, note, createdAt, location, page }] }]
     notes    [{ externalId, title, folderPath, tags, blocks, content }]

   Parsing is pure: no database, no network. A file nobody recognises comes
   back as `unknown`, never guessed at. */
const zlib = require('zlib');
const Papa = require('papaparse');
const { joinNotes } = require('../../utils/passages');

const KINDLE = 'kindle';
const APPLE_BOOKS = 'apple-books';
const POCKET = 'pocket';
const INSTAPAPER = 'instapaper';
const READWISE = 'readwise';
const MARKDOWN = 'markdown';
const EPUB = 'epub';
const PDF = 'pdf';
// A book started by hand at the reading desk, before any import knew it.
const BOOK = 'book';

const FORMAT_LABELS = {
  [KINDLE]: 'Kindle',
  [APPLE_BOOKS]: 'Apple Books',
  [POCKET]: 'Pocket',
  [INSTAPAPER]: 'Instapaper',
  [READWISE]: 'Readwise',
  [MARKDOWN]: 'Markdown',
  [EPUB]: 'EPUB',
  [PDF]: 'PDF'
};

const clean = (value = '') => String(value ?? '').replace(/﻿/g, '').replace(/\s+/g, ' ').trim();
const slug = (value = '') => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const validDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value).replace(/^[A-Za-z]+,\s*/, ''));
  return Number.isNaN(date.getTime()) ? null : date;
};
const unixDate = (value) => (/^\d{9,11}$/.test(clean(value)) ? validDate(Number(clean(value)) * 1000) : validDate(value));
const decodeEntities = (value = '') => String(value)
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&amp;/gi, '&');
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* A book has no URL, so it is addressed by what it is. The Readwise CSV import
   has always addressed books the same way (and, reading the wrong column,
   mostly without the author), so a book that came through Readwise first, or
   was started at the desk, is recognised rather than shelved twice. */
const bookSource = ({ provider, title, author }) => {
  const base = `${slug(title)}-${slug(author || 'source')}`;
  const aliases = [...new Set([`${READWISE}/${base}`, `${READWISE}/${slug(title)}-source`, `${BOOK}/${base}`])]
    .map(key => `import://${key}`)
    .filter(alias => alias !== `import://${provider}/${base}`);
  return {
    url: `import://${provider}/${base}`,
    aliases,
    title: clean(title) || 'Untitled book',
    author: clean(author),
    highlights: []
  };
};

const sourceBucket = (sources, make) => (key) => {
  if (!sources.has(key)) sources.set(key, make(key));
  return sources.get(key);
};

/* ---------- Kindle: My Clippings.txt ---------- */

const expandKindleRange = (start, end) => {
  if (!end) return [start, start];
  if (end >= start) return [start, end];
  // Older Kindles shorten the end: "Loc. 1702-05" means 1702–1705.
  const head = String(start).slice(0, String(start).length - String(end).length);
  return [start, Number(`${head}${end}`)];
};

const parseKindleMeta = (line = '') => {
  const kind = /bookmark/i.test(line) ? 'bookmark' : /\bnote\b/i.test(line) ? 'note' : 'highlight';
  const locationMatch = line.match(/(?:location|loc\.)\s*(\d+)(?:\s*-\s*(\d+))?/i);
  const pageMatch = line.match(/page\s+([\w-]+)/i);
  const [start, end] = locationMatch
    ? expandKindleRange(Number(locationMatch[1]), locationMatch[2] ? Number(locationMatch[2]) : 0)
    : [null, null];
  const addedMatch = line.match(/added on\s+(.+)$/i);
  return {
    kind,
    start,
    end,
    page: pageMatch ? pageMatch[1] : '',
    createdAt: addedMatch ? validDate(addedMatch[1]) : null
  };
};

const describeKindleLocation = ({ page, start, end }) => [
  page ? `Page ${page}` : '',
  start ? `Location ${start}${end && end !== start ? `–${end}` : ''}` : ''
].filter(Boolean).join(' · ');

const splitKindleTitle = (line = '') => {
  const match = clean(line).match(/^(.*\S)\s*\(([^()]*)\)\s*$/);
  return match ? { title: match[1], author: match[2] } : { title: clean(line), author: '' };
};

const sameWords = (value = '') => clean(value).toLowerCase();

const parseKindleClippings = (text = '') => {
  const sources = new Map();
  const bookFor = sourceBucket(sources, (key) => bookSource({ provider: KINDLE, ...JSON.parse(key) }));
  const pendingNotes = [];
  let skipped = 0;

  String(text).split(/\r?\n==========\s*(?:\r?\n|$)/).forEach((raw) => {
    const lines = raw.replace(/﻿/g, '').split(/\r?\n/).map(line => line.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length < 2) return;
    const meta = parseKindleMeta(lines[1]);
    if (meta.kind === 'bookmark') return;
    const body = lines.slice(2).join('\n').trim();
    if (!body) {
      skipped += 1;
      return;
    }
    const book = bookFor(JSON.stringify(splitKindleTitle(lines[0])));
    if (meta.kind === 'note') {
      pendingNotes.push({ book, meta, body });
      return;
    }
    const highlight = { text: body, note: '', createdAt: meta.createdAt, location: describeKindleLocation(meta), page: Number(meta.page) || undefined, start: meta.start, end: meta.end };
    /* Changing a highlight on a Kindle adds a second clipping rather than
       replacing the first, and a repeated sync copies them again. The later
       clipping is the one the reader settled on. */
    const words = sameWords(body);
    book.highlights = book.highlights.filter((earlier) => {
      const overlaps = earlier.start && meta.start && earlier.start <= meta.end && meta.start <= earlier.end;
      const earlierWords = sameWords(earlier.text);
      return !(earlierWords === words || (overlaps && (words.includes(earlierWords) || earlierWords.includes(words))));
    });
    book.highlights.push(highlight);
  });

  /* A Kindle note is its own clipping, made at the end of the passage it is
     about. It sits beside the highlight it was written on. */
  let unattachedNotes = 0;
  pendingNotes.forEach(({ book, meta, body }) => {
    const home = [...book.highlights].reverse().find(highlight => (
      highlight.start && meta.start && highlight.start <= meta.start && meta.start <= highlight.end + 1
    ));
    if (!home) {
      unattachedNotes += 1;
      return;
    }
    home.note = joinNotes(home.note, body);
  });

  const books = [...sources.values()]
    .filter(book => book.highlights.length)
    .map(book => ({ ...book, highlights: book.highlights.map(({ start, end, ...highlight }) => highlight) }));
  return { sources: books, skipped, unattachedNotes };
};

/* ---------- Apple Books: the notes it mails you, or copied passages ---------- */

const classText = (html, name) => {
  const match = html.match(new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${name}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'i'));
  return match ? decodeEntities(match[2]).trim() : '';
};

const stripQuotes = (value = '') => value.trim().replace(/^[“"]\s*/, '').replace(/\s*[”"]$/, '').trim();

const parseAppleBooksHtml = (html = '') => {
  const title = classText(html, 'booktitle');
  const author = classText(html, 'bookauthor').replace(/^by\s+/i, '');
  const book = bookSource({ provider: APPLE_BOOKS, title, author });
  html.split(/<div[^>]*class="[^"]*\bannotation\b[^"]*"[^>]*>/i).slice(1).forEach((chunk) => {
    const text = stripQuotes(classText(chunk, 'annotationrepresentativetext') || classText(chunk, 'annotationselectiontext'));
    if (!text) return;
    book.highlights.push({
      text,
      note: classText(chunk, 'annotationnote'),
      createdAt: validDate(classText(chunk, 'annotationdate')),
      location: classText(chunk, 'annotationchapter')
    });
  });
  return { sources: book.highlights.length ? [book] : [], skipped: 0 };
};

/* Copying a passage out of Apple Books leaves the quotation followed by
   "Excerpt From", the title, the author and a copyright line (newer apps), or
   "Excerpt From: Author. “Title.” Apple Books." on one line (older ones). */
const parseAppleBooksExcerpts = (text = '') => {
  const sources = new Map();
  const bookFor = sourceBucket(sources, (key) => bookSource({ provider: APPLE_BOOKS, ...JSON.parse(key) }));
  const lines = String(text).replace(/﻿/g, '').split(/\r?\n/);
  let passage = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const oneLine = line.match(/^Excerpt From:\s*(.+?)\.\s*[“"](.+?)[.”"]+\s*(?:Apple Books|iBooks)/i);
    if (oneLine || /^Excerpt From\s*$/i.test(line)) {
      let title;
      let author;
      if (oneLine) {
        [author, title] = [oneLine[1], oneLine[2]];
      } else {
        title = (lines[index + 1] || '').trim();
        author = (lines[index + 2] || '').trim();
        index += 2;
        if (/copyright/i.test(lines[index + 1] || '')) index += 1;
      }
      const quote = stripQuotes(passage.join('\n'));
      if (quote) bookFor(JSON.stringify({ title, author })).highlights.push({ text: quote, note: '', createdAt: null, location: '' });
      passage = [];
      continue;
    }
    if (line || passage.length) passage.push(line);
  }
  return { sources: [...sources.values()], skipped: 0 };
};

/* ---------- Pocket and Instapaper: saved articles ---------- */

const httpUrl = (value = '') => (/^https?:\/\//i.test(clean(value)) ? clean(value) : '');

const savedArticle = ({ url, title, tags = [], folderName = '', savedAt = null, highlights = [] }) => ({
  url,
  aliases: [],
  title: clean(title) || url,
  author: '',
  tags,
  folderName,
  savedAt,
  highlights
});

const parsePocketHtml = (html = '') => {
  const sources = [];
  let skipped = 0;
  const anchor = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html))) {
    const attrs = match[1];
    const attr = (name) => (attrs.match(new RegExp(`${name}="([^"]*)"`, 'i')) || [])[1] || '';
    const url = httpUrl(decodeEntities(attr('href')));
    if (!url) {
      skipped += 1;
      continue;
    }
    sources.push(savedArticle({
      url,
      title: decodeEntities(match[2]),
      tags: decodeEntities(attr('tags')).split(',').map(clean).filter(Boolean),
      savedAt: unixDate(attr('time_added'))
    }));
  }
  return { sources, skipped };
};

const readCsv = (text = '') => {
  const parsed = Papa.parse(String(text).replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  const pick = (row, ...names) => {
    const key = Object.keys(row).find(field => names.includes(field.trim().toLowerCase()));
    return key ? clean(row[key]) : '';
  };
  return { rows, pick, headers: (parsed.meta?.fields || []).map(field => field.trim().toLowerCase()), parseErrors: parsed.errors?.length || 0 };
};

const parsePocketCsv = (text = '') => {
  const { rows, pick } = readCsv(text);
  const sources = [];
  let skipped = 0;
  rows.forEach((row) => {
    const url = httpUrl(pick(row, 'url'));
    if (!url) {
      skipped += 1;
      return;
    }
    sources.push(savedArticle({
      url,
      title: pick(row, 'title'),
      tags: pick(row, 'tags').split(/[|,]/).map(clean).filter(Boolean),
      savedAt: unixDate(pick(row, 'time_added'))
    }));
  });
  return { sources, skipped };
};

// Instapaper's own piles, not a folder anyone made.
const INSTAPAPER_PILES = new Set(['unread', 'archive', 'starred', '']);

const parseInstapaperTags = (value = '') => {
  if (!value || value === '[]') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(tag => clean(tag?.name || tag)).filter(Boolean);
  } catch (error) {
    // Not JSON: a plain comma list.
  }
  return value.split(',').map(clean).filter(Boolean);
};

const parseInstapaperCsv = (text = '') => {
  const { rows, pick } = readCsv(text);
  const sources = [];
  let skipped = 0;
  rows.forEach((row) => {
    const url = httpUrl(pick(row, 'url'));
    if (!url) {
      skipped += 1;
      return;
    }
    const folder = pick(row, 'folder');
    const savedAt = unixDate(pick(row, 'timestamp'));
    const selection = pick(row, 'selection');
    sources.push(savedArticle({
      url,
      title: pick(row, 'title'),
      tags: parseInstapaperTags(pick(row, 'tags')),
      folderName: INSTAPAPER_PILES.has(folder.toLowerCase()) ? '' : folder,
      savedAt,
      // The passage chosen when the page was saved is the reader's own pick.
      highlights: selection ? [{ text: selection, note: '', createdAt: savedAt, location: '' }] : []
    }));
  });
  return { sources, skipped };
};

/* ---------- Readwise CSV ---------- */

const parseReadwiseCsv = (text = '') => {
  const { rows, pick, parseErrors } = readCsv(text);
  const sources = new Map();
  let skipped = 0;
  rows.forEach((row) => {
    const highlightText = pick(row, 'highlight', 'text', 'highlight text');
    if (!highlightText) {
      skipped += 1;
      return;
    }
    const title = pick(row, 'book title', 'title', 'article title');
    const author = pick(row, 'book author', 'author');
    const url = httpUrl(pick(row, 'url', 'source url', 'link'));
    const key = url || `book:${slug(title)}-${slug(author || 'source')}`;
    if (!sources.has(key)) {
      sources.set(key, url
        ? { url, aliases: [], title: title || url, author, highlights: [] }
        : bookSource({ provider: READWISE, title, author }));
    }
    sources.get(key).highlights.push({
      text: highlightText,
      note: pick(row, 'note', 'notes'),
      tags: pick(row, 'tags', 'tag').split(',').map(clean).filter(Boolean),
      createdAt: validDate(pick(row, 'highlighted at', 'created at', 'added', 'date')),
      location: pick(row, 'location') ? `Location ${pick(row, 'location')}` : ''
    });
  });
  return { sources: [...sources.values()], skipped: skipped + parseErrors };
};

/* ---------- Markdown: Notion and Obsidian ---------- */

// Notion appends a 32-character id to every exported file and folder name.
const withoutNotionId = (value = '') => clean(value).replace(/\s+[0-9a-f]{32}$/i, '');
const stem = (name = '') => String(name).replace(/\.[^.]+$/, '');

const readFrontMatter = (text) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: text, tags: [], title: '' };
  const yaml = match[1];
  const title = clean((yaml.match(/^title:\s*(.+)$/m) || [])[1] || '').replace(/^["']|["']$/g, '');
  const inline = yaml.match(/^tags:\s*\[(.*)\]\s*$/m) || yaml.match(/^tags:\s*(\S.*)$/m);
  const listed = yaml.match(/^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m);
  const tags = (listed ? listed[1].split(/\r?\n/).map(line => line.replace(/^\s*-\s*/, '')) : (inline ? inline[1].split(',') : []))
    .map(tag => clean(tag).replace(/^["'#]|["']$/g, ''))
    .filter(Boolean);
  return { body: text.slice(match[0].length), tags, title };
};

/* Inline marks, read once into both shapes a note keeps: plain text for the
   blocks, light HTML for the page. Wikilinks keep the words they show;
   Markdown links keep their address. Embedded images are files we were not
   given, so they are left out rather than shown broken. */
const emphasis = (value, strong, em) => value
  .replace(/(\*\*|__)(?=\S)(.+?)\1/g, strong)
  .replace(/\*(?=\S)([^*]+?)\*/g, em)
  .replace(/(^|[^\w])_(?=\S)([^_]+?)_(?=[^\w]|$)/g, (_, lead, inner) => `${lead}${em(null, inner)}`);

const renderInline = (source = '') => {
  const text = source
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, page, alias) => (alias || page).trim())
    .trim();
  const plain = emphasis(
    text.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '$1'),
    (_, __, inner) => inner,
    (_, inner) => inner
  ).replace(/`([^`]+)`/g, '$1');
  const html = emphasis(
    escapeHtml(text).replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, label, href) => (
      /^(https?:|mailto:)/i.test(href) ? `<a href="${href}">${label}</a>` : label
    )),
    (_, __, inner) => `<strong>${inner}</strong>`,
    (_, inner) => `<em>${inner}</em>`
  ).replace(/`([^`]+)`/g, '<code>$1</code>');
  return { plain, html };
};

const parseMarkdownNote = ({ name = '', path = '', text = '' }) => {
  const relative = clean(path || name).replace(/\\/g, '/');
  const { body, tags, title: metaTitle } = readFrontMatter(String(text).replace(/^﻿/, ''));
  const lines = body.split(/\r?\n/);
  const firstHeading = lines.findIndex(line => /^#\s+\S/.test(line));
  const title = metaTitle
    || (firstHeading >= 0 ? renderInline(lines[firstHeading].replace(/^#\s+/, '')).plain : '')
    || withoutNotionId(stem(relative.split('/').pop())) || 'Untitled note';
  if (!metaTitle && firstHeading >= 0) lines.splice(firstHeading, 1);

  const blocks = [];
  const html = [];
  let paragraph = [];
  let list = [];
  let fence = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const { plain, html: inner } = renderInline(paragraph.join(' '));
    if (plain) {
      blocks.push({ type: 'paragraph', text: plain });
      html.push(`<p>${inner}</p>`);
    }
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map(item => `<li>${item.html}</li>`).join('')}</ul>`);
    list = [];
  };

  lines.forEach((line) => {
    if (fence) {
      if (/^\s*(```|~~~)/.test(line)) {
        blocks.push({ type: 'paragraph', text: fence.join('\n') });
        html.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else {
        fence.push(line);
      }
      return;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      flushParagraph();
      flushList();
      fence = [];
      return;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (!line.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const { plain, html: inner } = renderInline(heading[2]);
      const level = Math.min(heading[1].length, 4);
      if (plain) {
        blocks.push({ type: 'heading', level, text: plain });
        html.push(`<h${level}>${inner}</h${level}>`);
      }
    } else if (bullet) {
      flushParagraph();
      const { plain, html: inner } = renderInline(bullet[2]);
      if (plain) {
        blocks.push({ type: 'bullet', indent: Math.min(Math.floor(bullet[1].replace(/\t/g, '  ').length / 2), 4), text: plain });
        list.push({ html: inner });
      }
    } else {
      flushList();
      paragraph.push(line.replace(/^\s*>\s?/, '').trim());
    }
  });
  if (fence) blocks.push({ type: 'paragraph', text: fence.join('\n') });
  flushParagraph();
  flushList();

  const folderPath = relative.split('/').slice(0, -1).map(withoutNotionId).filter(Boolean);
  return {
    externalId: relative,
    title,
    folderPath,
    tags,
    blocks: blocks.length ? blocks : [{ type: 'paragraph', text: title }],
    content: html.join('') || `<p>${escapeHtml(title)}</p>`
  };
};

/* ---------- A saved email ---------- */

/* Apple Books mails its notes as HTML. Saved as a message (.eml), that HTML
   travels encoded for the wire; this finds the HTML part and decodes it. */
const MAIL_HEADER = /^(?:return-path|received|from|to|subject|date|mime-version|message-id|content-type|x-[\w-]+):/i;
const decodeQuotedPrintable = (body = '') => {
  const flat = body.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let index = 0; index < flat.length; index += 1) {
    const hex = flat.slice(index + 1, index + 3);
    if (flat[index] === '=' && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(...Buffer.from(flat[index], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
};

const unwrapMail = (text = '') => {
  if (!MAIL_HEADER.test(text)) return text;
  const headerBlocks = /((?:[\w-]+:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*\r?\n)+)\r?\n/g;
  let match;
  while ((match = headerBlocks.exec(text))) {
    if (!/content-type:\s*text\/html/i.test(match[1])) continue;
    const start = match.index + match[0].length;
    const boundary = text.slice(start).search(/\r?\n--\S/);
    const body = boundary >= 0 ? text.slice(start, start + boundary) : text.slice(start);
    const encoding = ((match[1].match(/content-transfer-encoding:\s*([\w-]+)/i) || [])[1] || '').toLowerCase();
    if (encoding === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (encoding === 'quoted-printable') return decodeQuotedPrintable(body);
    return body;
  }
  return text;
};

/* ---------- EPUB ----------
   A book you own, whole. An EPUB is a zip: container.xml names the package,
   the package names the book and lists its chapters in reading order. The
   chapters become one article, kept to the tags a reader needs, addressed
   like any other book so its Kindle or Readwise highlights find it. */

const unzip = (buffer) => {
  const files = new Map();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) return files;
  let at = buffer.readUInt32LE(end + 16);
  for (let count = buffer.readUInt16LE(end + 10); count > 0; count -= 1) {
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files.set(name, () => (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'));
    at += 46 + nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
  }
  return files;
};

const READER_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b', 'blockquote', 'ul', 'ol', 'li', 'br', 'hr', 'pre', 'code', 'sup', 'sub']);
const readerHtml = (xhtml = '') => (/<body[^>]*>([\s\S]*)<\/body>/i.exec(xhtml) || [, xhtml])[1]
  .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/?([a-z][a-z0-9]*)[^>]*>/gi, (tag, name) => {
    const lower = name.toLowerCase();
    return READER_TAGS.has(lower) ? `<${tag[1] === '/' ? '/' : ''}${lower}>` : '';
  })
  .replace(/\s+/g, ' ')
  .trim();

const parseEpub = (buffer) => {
  const files = unzip(buffer);
  const read = name => (files.get(name) || (() => ''))();
  const packagePath = (/full-path="([^"]+)"/.exec(read('META-INF/container.xml')) || [])[1] || '';
  const opf = read(packagePath);
  if (!opf) return { sources: [], skipped: 1 };
  const base = packagePath.includes('/') ? packagePath.replace(/[^/]*$/, '') : '';
  const meta = name => decodeEntities((new RegExp(`<dc:${name}[^>]*>([\\s\\S]*?)</dc:${name}>`, 'i').exec(opf) || [])[1] || '');
  const hrefs = new Map([...opf.matchAll(/<item\b[^>]*>/gi)].map(([item]) => [
    (/\bid="([^"]+)"/.exec(item) || [])[1],
    (/\bhref="([^"]+)"/.exec(item) || [])[1]
  ]));
  const chapters = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/gi)]
    .map(([, id]) => hrefs.get(id))
    .filter(Boolean)
    .map(href => readerHtml(read(base + decodeURIComponent(href))))
    .filter(Boolean);
  return {
    sources: [{ ...bookSource({ provider: EPUB, title: meta('title'), author: meta('creator') }), content: chapters.join('\n') }],
    skipped: 0
  };
};

/* ---------- PDF ----------
   A paper or a book laid out for print. A PDF keeps no paragraphs, only
   words placed on a page, so they are read back from the page: a line is
   text on one baseline, a paragraph ends where the next line drops further
   than a line's height or changes size, and lines set larger than the body
   are headings. A bare number on its own line is a page number. Without a
   title in its metadata, the first heading names it. */

const pdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');

const pdfLines = async (page) => {
  const lines = [];
  (await page.getTextContent()).items.forEach(({ str, transform: [, , , size, , y] }) => {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - y) < 1) {
      line.text += str;
      line.size = Math.max(line.size, str.trim() ? size : 0);
    } else {
      lines.push({ text: str, size: str.trim() ? size : 0, y });
    }
  });
  return lines.map(line => ({ ...line, text: clean(line.text) })).filter(line => line.text && !/^\d+$/.test(line.text));
};

const pdfBlocks = (pages) => {
  const sizes = new Map();
  pages.flat().forEach(({ text, size }) => sizes.set(size, (sizes.get(size) || 0) + text.length));
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0][0];
  const blocks = [];
  pages.forEach((lines) => {
    lines.forEach((line, index) => {
      const previous = index ? lines[index - 1] : null;
      const block = blocks[blocks.length - 1];
      const heading = line.size > body * 1.2;
      const continues = previous
        ? previous.size === line.size && previous.y > line.y && previous.y - line.y < line.size * 1.6
        // A sentence left unfinished at the foot of a page goes on over the leaf.
        : block && !block.heading && !heading && !/[.!?:"”’)]$/.test(block.text);
      if (!continues) {
        blocks.push({ heading, text: line.text });
      } else if (/\p{L}-$/u.test(block.text) && /^\p{Ll}/u.test(line.text)) {
        // A word the layout broke across two lines is one word again.
        block.text = block.text.slice(0, -1) + line.text;
      } else {
        block.text += ` ${line.text}`;
      }
    });
  });
  return blocks;
};

const parsePdf = async ({ name = '', buffer }) => {
  const { getDocument } = await pdfjs();
  const loading = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 });
  try {
    const pdf = await loading.promise;
    const { info = {} } = await pdf.getMetadata();
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) pages.push(await pdfLines(await pdf.getPage(number)));
    if (!pages.flat().length) return { sources: [], skipped: 1 };
    const blocks = pdfBlocks(pages);
    const title = clean(info.Title) || blocks.find(block => block.heading)?.text || stem(name);
    if (blocks[0].heading && sameWords(blocks[0].text) === sameWords(title)) blocks.shift();
    const content = blocks.map(({ heading, text }) => (heading ? `<h2>${escapeHtml(text)}</h2>` : `<p>${escapeHtml(text)}</p>`)).join('');
    return { sources: [{ ...bookSource({ provider: PDF, title, author: info.Author }), content }], skipped: 0 };
  } catch (error) {
    // Damaged, or locked with a password.
    return { sources: [], skipped: 1 };
  } finally {
    await loading.destroy();
  }
};

/* ---------- Recognising a file ---------- */

const detectFormat = ({ name = '', text = '' }) => {
  const lowerName = String(name).toLowerCase();
  const head = String(text).slice(0, 4000);
  if (/\.(md|markdown)$/.test(lowerName)) return MARKDOWN;
  if (/\.(html?|eml)$/.test(lowerName) || /^\s*<(!doctype|html)/i.test(head)) {
    if (/annotationrepresentativetext|class="[^"]*booktitle/i.test(text)) return APPLE_BOOKS;
    if (/pocket export|time_added=/i.test(head) || /time_added=/i.test(text)) return POCKET;
    return null;
  }
  if (/\r?\n==========/.test(head) && /-\s*(your\s+)?(highlight|note|bookmark|clip)/i.test(head)) return KINDLE;
  if (/^\s*Excerpt From\b/im.test(text)) return APPLE_BOOKS;
  if (/\.csv$/.test(lowerName) || /,/.test(head.split(/\r?\n/)[0] || '')) {
    const { headers } = readCsv(head.split(/\r?\n/)[0] || '');
    if (headers.includes('selection') && headers.includes('folder')) return INSTAPAPER;
    if (headers.includes('time_added') && headers.includes('url')) return POCKET;
    if (headers.some(field => ['highlight', 'highlight text'].includes(field))) return READWISE;
  }
  if (/\.txt$/.test(lowerName)) return MARKDOWN;
  return null;
};

const parseExportFile = async (file = {}) => {
  if (/\.epub$/i.test(file.name || '') && file.buffer) return { format: EPUB, notes: [], ...parseEpub(file.buffer) };
  if (file.buffer?.subarray(0, 5).toString('latin1') === '%PDF-') return { format: PDF, notes: [], ...(await parsePdf(file)) };
  const text = unwrapMail(String(file.text || ''));
  const format = detectFormat({ name: file.name, text });
  const isHtml = /^\s*</.test(text);
  switch (format) {
    case KINDLE: return { format, ...parseKindleClippings(text) };
    case APPLE_BOOKS: return { format, ...(isHtml ? parseAppleBooksHtml(text) : parseAppleBooksExcerpts(text)) };
    case POCKET: return { format, ...(isHtml ? parsePocketHtml(text) : parsePocketCsv(text)) };
    case INSTAPAPER: return { format, ...parseInstapaperCsv(text) };
    case READWISE: return { format, ...parseReadwiseCsv(text) };
    case MARKDOWN: return { format, sources: [], notes: [parseMarkdownNote(file)], skipped: 0 };
    default: return { format: 'unknown', sources: [], notes: [], skipped: 0 };
  }
};

module.exports = {
  BOOK,
  FORMAT_LABELS,
  bookSource,
  detectFormat,
  parseAppleBooksExcerpts,
  parseAppleBooksHtml,
  parseEpub,
  parseExportFile,
  parseInstapaperCsv,
  parseKindleClippings,
  parseMarkdownNote,
  parsePocketCsv,
  parsePocketHtml,
  parseReadwiseCsv
};
