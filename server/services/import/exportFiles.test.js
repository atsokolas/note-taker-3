const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { detectFormat, parseExportFile } = require('./exportFiles');

const FIXTURES = path.join(__dirname, '../../fixtures/imports');
const fixture = (relative) => ({
  name: path.basename(relative),
  path: relative.startsWith('vault/') ? relative : '',
  text: fs.readFileSync(path.join(FIXTURES, relative), 'utf8')
});

test('Kindle clippings become books, with repeats and edits folded and notes beside their passage', async () => {
  const result = await parseExportFile(fixture('kindle-my-clippings.txt'));
  assert.equal(result.format, 'kindle');
  assert.deepEqual(result.sources.map(book => [book.title, book.author, book.highlights.length]), [
    ['The Origin of Species', 'Darwin, Charles', 2],
    ['Meditations', 'Marcus Aurelius', 1]
  ]);
  const [grandeur, selection] = result.sources[0].highlights;
  assert.equal(grandeur.note, 'The last line of the book, read first.');
  assert.equal(grandeur.location, 'Page 12 · Location 170–172');
  assert.equal(grandeur.createdAt.toISOString(), '2019-03-03T22:01:02.000Z');
  assert.match(selection.text, /accumulation of small inherited modifications\.$/, 'the edited, longer highlight is the one kept');
  assert.equal(result.sources[1].highlights[0].location, 'Location 1702–1705', 'old Kindles shorten the end location');
  assert.equal(result.unattachedNotes, 1, 'a note with no passage is counted, not invented');
  assert.ok(result.sources[0].aliases.includes('import://readwise/the-origin-of-species-darwin-charles'));
});

test('Apple Books: the mailed notes and copied excerpts both read', async () => {
  const mailed = await parseExportFile(fixture('apple-books-notes.html'));
  assert.equal(mailed.format, 'apple-books');
  assert.equal(mailed.sources[0].title, 'Walden');
  assert.equal(mailed.sources[0].author, 'Henry David Thoreau');
  assert.deepEqual(mailed.sources[0].highlights.map(h => [h.text, h.note, h.location]), [
    ['I went to the woods because I wished to live deliberately.', 'The sentence everyone quotes & still true.', 'Where I Lived, and What I Lived For'],
    ['I never found the companion that was so companionable as solitude.', '', 'Solitude']
  ]);

  const copied = await parseExportFile(fixture('apple-books-excerpts.txt'));
  assert.equal(copied.format, 'apple-books');
  assert.deepEqual(copied.sources.map(book => [book.title, book.author, book.highlights[0].text]), [
    ['Seven Gothic Tales', 'Isak Dinesen', 'The cure for anything is salt water: sweat, tears or the sea.'],
    ['Walden', 'Henry David Thoreau', 'Simplicity, simplicity, simplicity!']
  ]);
  assert.equal(copied.sources[1].url, mailed.sources[0].url, 'the same book is one address however it arrived');
});

test('Pocket HTML and CSV, and Instapaper CSV, become saved articles', async () => {
  const html = await parseExportFile(fixture('pocket-ril_export.html'));
  assert.equal(html.format, 'pocket');
  assert.deepEqual(html.sources.map(s => [s.url, s.title, s.tags]), [
    ['https://example.com/essays/attention', 'On Attention, Again', ['essays', 'attention']],
    ['https://example.com/science/tides', 'Why the Tides & the Moon', []],
    ['https://example.com/longform/cities', 'The Life of Cities', ['cities']]
  ]);
  assert.equal(html.sources[0].savedAt.toISOString(), '2019-01-01T00:00:00.000Z');

  const csv = await parseExportFile(fixture('pocket-part_000000.csv'));
  assert.equal(csv.format, 'pocket');
  assert.deepEqual(csv.sources[0].tags, ['essays', 'attention']);

  const instapaper = await parseExportFile(fixture('instapaper-export.csv'));
  assert.equal(instapaper.format, 'instapaper');
  assert.equal(instapaper.sources.length, 3);
  assert.equal(instapaper.skipped, 1, 'a row with no address is counted as unreadable');
  assert.equal(instapaper.sources[0].folderName, 'Essays');
  assert.equal(instapaper.sources[1].folderName, '', "Instapaper's own piles are not folders");
  assert.equal(instapaper.sources[0].highlights[0].text, 'Attention is the beginning of devotion.');
});

test('Readwise CSV groups highlights by book and reads the author column it ships', async () => {
  const result = await parseExportFile(fixture('readwise-export.csv'));
  assert.equal(result.format, 'readwise');
  assert.equal(result.sources[0].url, 'import://readwise/the-origin-of-species-darwin-charles');
  assert.ok(result.sources[0].aliases.includes('import://readwise/the-origin-of-species-source'), 'books the old import shelved without an author are still found');
  assert.equal(result.sources[1].highlights[0].note, 'Keep this near the desk.');
  assert.deepEqual(result.sources[1].highlights[0].tags, ['writing']);
});

test('Markdown keeps paragraphs, headings, lists and links, titles from the heading or the file name', async () => {
  const note = (await parseExportFile(fixture('vault/Reading/On reading slowly.md'))).notes[0];
  assert.equal(note.title, 'On reading slowly');
  assert.deepEqual(note.folderPath, ['vault', 'Reading']);
  assert.deepEqual(note.tags, ['reading', 'attention']);
  assert.deepEqual(note.blocks.map(block => block.type), ['paragraph', 'heading', 'bullet', 'bullet', 'bullet']);
  assert.equal(note.blocks[0].text, 'Slow reading is not a speed. It is a way of staying with a sentence.');
  assert.equal(note.blocks[2].text, 'Thoreau on deliberate living', 'a wikilink keeps the words it shows');
  assert.equal(note.blocks[4].indent, 1);
  assert.match(note.content, /<a href="https:\/\/example.com\/essays\/attention">good essay<\/a>/);
  assert.doesNotMatch(note.content, /diagram\.png/, 'embedded files we were not given are left out');

  const notion = (await parseExportFile(fixture('vault/Project Notes 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md'))).notes[0];
  assert.equal(notion.title, 'Project Notes', "Notion's id suffix is not part of the title");
  assert.match(notion.content, /snake_case_word/, 'underscores inside words are not emphasis');
});

test('a file nobody recognises is unknown, never guessed at', async () => {
  assert.equal(detectFormat({ name: 'photo.html', text: '<html><body>hello</body></html>' }), null);
  assert.equal(detectFormat({ name: 'data.csv', text: 'a,b\n1,2' }), null);
  const result = await parseExportFile({ name: 'data.csv', text: 'a,b\n1,2' });
  assert.deepEqual(result, { format: 'unknown', sources: [], notes: [], skipped: 0 });
});

test('Apple Books notes saved as an email message read the same as the HTML', async () => {
  const mailed = await parseExportFile(fixture('apple-books-notes.html'));
  const saved = await parseExportFile(fixture('apple-books-notes.eml'));
  assert.equal(saved.format, 'apple-books');
  assert.deepEqual(saved.sources, mailed.sources);
});


test('an EPUB is the whole book, chapters in reading order, addressed so its highlights find it', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'origin-of-species.epub'));
  const result = await parseExportFile({ name: 'origin-of-species.epub', buffer, text: buffer.toString('utf8') });
  assert.equal(result.format, 'epub');
  const [book] = result.sources;
  assert.equal(book.title, 'The Origin of Species');
  assert.equal(book.author, 'Darwin, Charles');
  assert.equal(
    book.content,
    '<p>Introduction</p>\n<h1>Variation under Domestication</h1><p>There is grandeur in this <em>view</em> of life.</p>',
    'spine order, only the tags a reader needs, no scripts, styles or images'
  );
  assert.ok(book.aliases.includes('import://readwise/the-origin-of-species-darwin-charles'), 'the address Kindle and Readwise give the book');
  assert.deepEqual((await parseExportFile({ name: 'broken.epub', buffer: Buffer.from('not a zip') })).sources, [], 'a file that is not a book is skipped');
});

test('a PDF is read back into paragraphs, titled by its metadata or else its first heading', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'on-reading-slowly.pdf'));
  const result = await parseExportFile({ name: 'on-reading-slowly.pdf', buffer, text: buffer.toString('utf8') });
  assert.equal(result.format, 'pdf');
  const [document] = result.sources;
  assert.equal(document.title, 'On Reading Slowly');
  assert.equal(document.author, 'Ada Reader');
  assert.equal(document.url, 'import://pdf/on-reading-slowly-ada-reader');
  assert.equal(
    document.content,
    '<p>A page read twice is a page read once with attention. The first pass finds the words; the second finds the argument underneath them.</p>'
      + '<p>Slowness is not a virtue in itself, but it leaves room for the reader to disagree.</p>'
      + '<h2>Margins</h2><p>Write in them.</p>',
    'lines joined into paragraphs, a broken word mended, page numbers dropped, the title not repeated'
  );

  const untitled = await new Promise((resolve) => {
    const pdf = new PDFDocument({ info: {} });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks)));
    pdf.fontSize(24).text('Notes on Attention').fontSize(11).text('Look twice, then look again, slower.');
    pdf.end();
  });
  const [headed] = (await parseExportFile({ name: 'scan-0001.pdf', buffer: untitled })).sources;
  assert.equal(headed.title, 'Notes on Attention', 'no title in the metadata: the first heading names it');
  assert.equal(headed.content, '<p>Look twice, then look again, slower.</p>');

  const broken = await parseExportFile({ name: 'broken.pdf', buffer: Buffer.from('%PDF-1.4 not really') });
  assert.deepEqual([broken.sources, broken.skipped], [[], 1], 'a damaged PDF is skipped, not guessed at');
});
