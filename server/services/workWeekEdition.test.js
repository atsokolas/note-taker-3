const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EDITION_TAG, entryDay, weekEntries, buildPrompt, parseEdition, renderEdition, draftWeekEdition } = require('./workWeekEdition');

// Fictional notes only. A Work note keeps dated meetings as level-two date headings.
const heading = text => ({ id: text, type: 'heading', level: 2, text });
const para = text => ({ id: text, type: 'paragraph', text });
const notes = [
  { _id: 'n1', title: 'Acme supplier', occurredOn: '2026-10-01', blocks: [para('Old context before any meeting.'), heading('3 November 2026'), para('Too early for this week.'), heading('9 Nov 2026'), para('Agreed the sample plan.'), { id: 'b', type: 'bullet', text: 'Samples due Friday' }, heading('2026-11-11'), para('Samples slipped a week.')] },
  { _id: 'n2', title: '', occurredOn: '2026-11-10', blocks: [para('Team sync'), para('Chose the blue option.')] },
  { _id: 'n3', title: 'Empty day', occurredOn: '2026-11-08', blocks: [heading('8 Nov 2026')] },
  { _id: 'n4', title: 'Planner task', occurredOn: '2026-11-10', workItem: { kind: 'task' }, blocks: [para('Not a note.')] },
  { _id: 'n5', title: 'Week of 2–8 Nov 2026', occurredOn: '2026-11-08', tags: [EDITION_TAG], blocks: [para('An earlier Edition.')] },
  { _id: 'n6', title: 'HTML only', occurredOn: '2026-11-06', content: '<p>Kept &amp; read</p><h2>12 Nov 2026</h2><p>Tomorrow, out of range.</p>' }
];

test('date headings read the way the Work editor reads them', () => {
  assert.equal(entryDay('9 Nov 2026'), '2026-11-09');
  assert.equal(entryDay('9 November 2026'), '2026-11-09');
  assert.equal(entryDay('2026-02-29'), '');
  assert.equal(entryDay('Decisions'), '');
});

test('the week is the dated sections and undated writing of the last seven days', () => {
  const week = weekEntries(notes, '2026-11-11');
  assert.equal(week.start, '2026-11-05');
  assert.deepEqual(week.entries.map(entry => [entry.id, entry.title, entry.day]), [
    ['e1', 'HTML only', '2026-11-06'],
    ['e2', 'Acme supplier', '2026-11-09'],
    ['e3', 'Team sync', '2026-11-10'],
    ['e4', 'Acme supplier', '2026-11-11']
  ]);
  assert.equal(week.entries[0].text, 'Kept & read');
  assert.equal(week.entries[1].text, 'Agreed the sample plan.\n- Samples due Friday');
  assert.equal(week.entries[2].text, 'Team sync\nChose the blue option.', 'an untitled note is named by its first line');
  assert.ok(!week.entries.some(entry => /earlier Edition|Not a note|Old context|Too early|out of range/.test(entry.text)), 'planner items, past Editions and other weeks stay out');
});

test('a long week is read from the newest entry back and says what it cut', () => {
  const long = Array.from({ length: 14 }, (_, index) => ({ _id: `l${index}`, title: `Long ${index}`, occurredOn: '2026-11-10', blocks: [para('x'.repeat(5000))] }));
  const week = weekEntries(long, '2026-11-11');
  assert.equal(week.entries.length, 12);
  assert.equal(week.skipped, 2);
  assert.equal(week.trimmed, 12);
  assert.ok(week.entries.every(entry => entry.text.length === 4000));
});

test('only lines that point at real entries survive, and themes need two', () => {
  const { entries } = weekEntries(notes, '2026-11-11');
  const sections = parseEdition(JSON.stringify({
    done: [{ line: 'Agreed the sample plan.', from: ['e2'] }, { line: 'Invented win.', from: ['e99'] }, { line: 'No source.' }],
    decisions: [{ line: 'Chose the blue option.', from: ['e3', 'e3'] }],
    open: 'not a list',
    themes: [{ line: 'Samples kept slipping.', from: ['e2'] }, { line: 'Samples, twice.', from: ['e2', 'e4'] }]
  }), entries);
  assert.deepEqual(sections.map(section => section.lines.map(item => [item.line, item.from.map(entry => entry.id)])), [
    [['Agreed the sample plan.', ['e2']]],
    [['Chose the blue option.', ['e3']]],
    [],
    [['Samples, twice.', ['e2', 'e4']]]
  ]);
  const { title, blocks, content } = renderEdition({ sections, week: weekEntries(notes, '2026-11-11') });
  assert.equal(title, 'Week of 5–11 Nov 2026');
  assert.equal(blocks[0].text, 'Drafted by Claude from 4 entries in 3 notes, 5–11 Nov 2026. Each line names the entry it came from. Edit anything.');
  assert.deepEqual(blocks.filter(block => block.type === 'heading').map(block => block.text), ['What got done', 'Decisions', 'Open threads', 'Themes']);
  assert.ok(blocks.some(block => block.text === 'Agreed the sample plan. · Acme supplier, 9 Nov'), 'the citation is written from the entry, not the model');
  assert.ok(blocks.some(block => block.text === 'Nothing in this week’s notes.'), 'an empty section prints its silence');
  assert.ok(blocks.every(block => block.type !== 'heading' || !entryDay(block.text)), 'section heads are never mistaken for date entries next week');
  assert.match(content, /<h2>Open threads<\/h2><p>Nothing in this week’s notes\.<\/p>/);
  assert.ok(new Set(blocks.map(block => block.id)).size === blocks.length);
});

test('a quiet week makes no model call; a busy one sends only that week', async () => {
  let calls = 0;
  const quiet = await draftWeekEdition({ notes, through: '2026-10-20', generate: async () => { calls += 1; return '{}'; } });
  assert.equal(calls, 0);
  assert.equal(quiet.silence, 'No Work entries between 14 Oct and 20 Oct. Nothing to draft.');
  let prompt = '';
  const busy = await draftWeekEdition({ notes, through: '2026-11-11', generate: async input => { prompt = input.prompt; return '```json\n{"done":[{"line":"Agreed the sample plan.","from":["e2"]}]}\n```'; } });
  assert.equal(busy.draft.title, 'Week of 5–11 Nov 2026');
  assert.match(prompt, /\[e4\] Acme supplier · 11 Nov\nSamples slipped a week\./);
  assert.doesNotMatch(prompt, /earlier Edition|Too early/);
  assert.equal(buildPrompt(weekEntries(notes, '2026-11-11')), prompt);
});

test('spanning a month or a year names both ends', () => {
  const sections = parseEdition('{}', []);
  assert.equal(renderEdition({ sections, week: { start: '2026-10-29', end: '2026-11-04', entries: [], trimmed: 0, skipped: 0 } }).title, 'Week of 29 Oct – 4 Nov 2026');
  assert.equal(renderEdition({ sections, week: { start: '2026-12-29', end: '2027-01-04', entries: [], trimmed: 0, skipped: 0 } }).title, 'Week of 29 Dec 2026 – 4 Jan 2027');
});

test('Work never falls through to the other upstreams', async () => {
  const { chatComplete } = require('../ai/hfTextClient');
  const saved = { key: process.env.ANTHROPIC_API_KEY, hf: process.env.HF_TOKEN, fetch: global.fetch };
  let fetched = 0;
  try {
    delete process.env.ANTHROPIC_API_KEY; process.env.HF_TOKEN = 'fictional';
    global.fetch = async () => { fetched += 1; throw new Error('no network in tests'); };
    await assert.rejects(chatComplete({ onlyClaude: true, messages: [{ role: 'user', content: 'Fictional week.' }] }), error => error.status === 503);
    await assert.rejects(draftWeekEdition({ notes, through: '2026-11-11' }), error => error.status === 503);
    assert.equal(fetched, 0);
  } finally {
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.hf === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = saved.hf;
    global.fetch = saved.fetch;
  }
});
