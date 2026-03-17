#!/usr/bin/env node
const assert = require('assert');

const {
  buildNotebookPayloadFromLines,
  parseEnexNotes,
  parseEvernoteDate
} = require('../server/services/import/evernoteTransform');
const {
  blockToPlainText,
  buildNotionPropertyLines,
  extractNotionTitle,
  flattenNotionProperty
} = require('../server/services/import/notionTransform');
const {
  buildWarning,
  summarizeWarnings
} = require('../server/services/import/importDiagnostics');
const {
  buildReadwisePreviewSummary,
  getReadwiseDocumentKey,
  normalizeReadwiseDocumentTags
} = require('../server/services/import/readwiseTransform');

const testEvernoteTransforms = () => {
  const enex = `<?xml version="1.0" encoding="UTF-8"?>
  <en-export>
    <note>
      <title>Evernote Test</title>
      <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>Hello</div><div>- bullet</div></en-note>]]></content>
      <created>20260317T120000Z</created>
      <updated>20260317T120500Z</updated>
      <tag>alpha</tag>
      <tag>beta</tag>
      <source-url>https://example.com/note</source-url>
    </note>
  </en-export>`;

  const notes = parseEnexNotes(enex);
  assert.strictEqual(notes.length, 1, 'expected one parsed ENEX note');
  assert.strictEqual(notes[0].title, 'Evernote Test');
  assert.deepStrictEqual(notes[0].tags, ['alpha', 'beta']);
  assert.deepStrictEqual(notes[0].contentLines, ['Hello', '- bullet']);
  assert.strictEqual(notes[0].sourceUrl, 'https://example.com/note');

  const parsedDate = parseEvernoteDate('20260317T120000Z');
  assert.ok(parsedDate instanceof Date, 'expected compact Evernote date to parse');
  assert.strictEqual(parsedDate.toISOString(), '2026-03-17T12:00:00.000Z');
  assert.strictEqual(parseEvernoteDate('not-a-date'), null, 'invalid Evernote dates should return null');

  const { blocks, content } = buildNotebookPayloadFromLines({
    title: 'Evernote Test',
    lines: ['Hello', '- bullet'],
    createId: (() => {
      let next = 0;
      return () => `block-${++next}`;
    })()
  });
  assert.deepStrictEqual(
    blocks.map(block => ({ id: block.id, type: block.type, text: block.text })),
    [
      { id: 'block-1', type: 'paragraph', text: 'Hello' },
      { id: 'block-2', type: 'bullet', text: 'bullet' }
    ],
    'expected notebook blocks to preserve paragraph/bullet structure'
  );
  assert.ok(content.includes('<p>Hello</p>'), 'expected paragraph html in notebook payload');
  assert.ok(content.includes('<ul><li>bullet</li></ul>'), 'expected bullet html in notebook payload');
};

const testNotionTransforms = () => {
  const page = {
    properties: {
      Name: {
        type: 'title',
        title: [{ plain_text: 'Notion Page' }]
      },
      Status: {
        type: 'status',
        status: { name: 'In progress' }
      },
      Tags: {
        type: 'multi_select',
        multi_select: [{ name: 'alpha' }, { name: 'beta' }]
      },
      Count: {
        type: 'number',
        number: 3
      }
    }
  };

  assert.strictEqual(extractNotionTitle(page), 'Notion Page');
  assert.strictEqual(flattenNotionProperty(page.properties.Status), 'In progress');
  assert.deepStrictEqual(
    buildNotionPropertyLines(page),
    ['Name: Notion Page', 'Status: In progress', 'Tags: alpha, beta', 'Count: 3'],
    'expected notion property lines to flatten into readable text'
  );

  assert.strictEqual(
    blockToPlainText({
      type: 'to_do',
      to_do: {
        checked: true,
        rich_text: [{ plain_text: 'Ship importer' }]
      }
    }),
    '[x] Ship importer'
  );
  assert.strictEqual(
    blockToPlainText({
      type: 'child_data_source',
      child_data_source: { title: 'Knowledge DB' }
    }),
    'Database: Knowledge DB'
  );
};

const testImportDiagnostics = () => {
  const summary = summarizeWarnings([
    buildWarning('preview_sampled', 'Preview is sampled.'),
    'Indexing failed for one item.',
    buildWarning('preview_sampled', 'Preview is sampled again.')
  ]);

  assert.deepStrictEqual(
    summary.warningCodes,
    ['preview_sampled', 'general_warning'],
    'expected warning codes to dedupe while preserving first-seen order'
  );
  assert.deepStrictEqual(
    summary.warnings,
    ['Preview is sampled.', 'Indexing failed for one item.', 'Preview is sampled again.'],
    'expected warnings to preserve message order'
  );
};

const testReadwiseTransforms = () => {
  const results = [
    {
      id: 'doc-1',
      user_book_id: 'book-1',
      title: 'Deep Work',
      author: 'Cal Newport',
      book_tags: [{ name: 'Attention' }, { name: 'Focus' }]
    },
    {
      id: 'doc-2',
      user_book_id: 'book-1',
      title: 'Deep Work',
      author: 'Cal Newport',
      book_tags: ['Attention']
    },
    {
      id: 'doc-3',
      title: 'Systems Thinking',
      author: 'Donella Meadows',
      book_tags: [{ name: 'Systems' }]
    }
  ];

  assert.deepStrictEqual(
    normalizeReadwiseDocumentTags(results[0]),
    ['Attention', 'Focus'],
    'expected document tags to flatten cleanly'
  );
  assert.strictEqual(
    getReadwiseDocumentKey(results[0]),
    'book-1',
    'expected document key to prefer user_book_id'
  );

  const preview = buildReadwisePreviewSummary({ results, hasMore: true });
  assert.strictEqual(preview.items, 3);
  assert.strictEqual(preview.articles, 2, 'expected preview to dedupe repeated documents');
  assert.strictEqual(preview.highlights, 3);
  assert.deepStrictEqual(preview.sampleTitles, ['Deep Work', 'Systems Thinking']);
  assert.deepStrictEqual(preview.sampleAuthors, ['Cal Newport', 'Donella Meadows']);
  assert.deepStrictEqual(preview.sampleTags, ['Attention', 'Focus', 'Systems']);
  assert.deepStrictEqual(preview.warningCodes, ['preview_sampled']);
};

testEvernoteTransforms();
testNotionTransforms();
testImportDiagnostics();
testReadwiseTransforms();

console.log('import helper tests passed');
