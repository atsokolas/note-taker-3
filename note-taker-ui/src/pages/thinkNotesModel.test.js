import {
  begunLine,
  buildThinkEntries,
  countWords,
  isTarget,
  noteTitle,
  buildWritingResults,
  buildAuthoredShelf,
  namesAThinkObject,
  questionBlocksFromDoc,
  readThinkFilter,
  readThinkTarget,
  targetParams,
  readRecentNoteIds,
  resolveOpenNoteId
} from './thinkNotesModel';

const notes = [
  { _id: 'n1', title: 'Replication checklist', updatedAt: '2026-08-14T08:10:00.000Z' },
  { _id: 'n2', title: 'First principles', updatedAt: '2026-08-13T08:10:00.000Z' },
  { _id: 'n3', title: 'Reading map', updatedAt: '2026-06-01T08:10:00.000Z' }
];

const storage = (value) => ({ getItem: () => (value === undefined ? null : JSON.stringify(value)) });

describe('which note Think opens', () => {
  it('opens the note the URL names', () => {
    expect(resolveOpenNoteId({ requestedId: 'n3', notes, recentIds: ['n2'] })).toBe('n3');
  });

  it('otherwise opens the last note the human was actually in', () => {
    expect(resolveOpenNoteId({ notes, recentIds: ['n3', 'n2'] })).toBe('n3');
  });

  it('falls back to the most recently edited note, never to nothing', () => {
    expect(resolveOpenNoteId({ notes })).toBe('n1');
    expect(resolveOpenNoteId({ notes, recentIds: ['gone'] })).toBe('n1');
  });

  it('ignores a recent or requested note that no longer exists', () => {
    expect(resolveOpenNoteId({ requestedId: 'deleted', notes, recentIds: ['also-deleted'] })).toBe('n1');
  });

  it('has nothing to open only when there are no notes', () => {
    expect(resolveOpenNoteId({ notes: [] })).toBe('');
  });
});

describe('readRecentNoteIds', () => {
  it('reads notebook targets newest first and ignores the other postures', () => {
    const recents = [
      { id: 'c1', type: 'concept', openedAt: '2026-08-14T10:00:00.000Z' },
      { id: 'n2', type: 'notebook', openedAt: '2026-08-13T10:00:00.000Z' },
      { id: 'n1', type: 'notebook', openedAt: '2026-08-14T09:00:00.000Z' }
    ];

    expect(readRecentNoteIds(storage(recents))).toEqual(['n1', 'n2']);
  });

  it('survives an unreadable store', () => {
    expect(readRecentNoteIds({ getItem: () => 'not json' })).toEqual([]);
    expect(readRecentNoteIds(storage())).toEqual([]);
  });
});

describe('one list', () => {
  const concepts = [
    { _id: 'c1', name: 'Moats', updatedAt: '2026-08-13T20:00:00.000Z' },
    { _id: '', name: 'tag-only', count: 4 },
    { _id: 'c2', name: 'Hidden', hiddenFromHome: true, updatedAt: '2026-08-15T00:00:00.000Z' }
  ];
  const questions = [
    { _id: 'q1', text: 'What would change my mind?', status: 'answered', updatedAt: '2026-08-14T09:00:00.000Z' },
    { _id: 'q2', text: 'Archived', archived: true }
  ];

  it('holds notes, concepts and questions newest first, with the kind on each', () => {
    const entries = buildThinkEntries({ notes, concepts, questions });
    expect(entries.map(item => `${item.kind}:${item.title}`)).toEqual([
      'question:What would change my mind?',
      'note:Replication checklist',
      'concept:Moats',
      'note:First principles',
      'note:Reading map'
    ]);
    expect(entries[0].settled).toBe(true);
  });

  it('narrows to one kind, and only then shows tags that are not yet concepts', () => {
    expect(buildThinkEntries({ notes, concepts, questions, filter: 'concept' }).map(item => item.title)).toEqual(['Moats', 'tag-only']);
    expect(buildThinkEntries({ notes, concepts, questions, filter: 'note' })).toHaveLength(3);
  });

  it('reads the entry a link names, and keeps the old addresses', () => {
    const read = search => readThinkTarget(new URLSearchParams(search));
    expect(read('tab=concepts&concept=Moats&conceptId=c1')).toEqual({ kind: 'concept', id: 'Moats' });
    expect(read('tab=concepts&conceptId=c1')).toEqual({ kind: 'concept', id: 'c1' });
    expect(read('tab=questions&questionId=q1')).toEqual({ kind: 'question', id: 'q1' });
    expect(read('tab=notebook&entryId=n1')).toEqual({ kind: 'note', id: 'n1' });
    expect(read('tab=concepts')).toBeNull();
    expect(readThinkFilter(new URLSearchParams('tab=questions'))).toBe('question');
    expect(readThinkFilter(new URLSearchParams('tab=questions&questionId=q1'))).toBe('all');
    expect(readThinkFilter(new URLSearchParams('tab=notebook'))).toBe('all');
  });

  it('writes an entry back to the address other rooms already link to', () => {
    expect(targetParams({ kind: 'concept', id: 'Moats', recordId: 'c1' })).toEqual({ tab: 'concepts', concept: 'Moats', conceptId: 'c1' });
    expect(targetParams({ kind: 'question', id: 'q1' })).toEqual({ tab: 'questions', questionId: 'q1' });
    expect(targetParams({ kind: 'note', id: 'n1' })).toEqual({ tab: 'notebook', entryId: 'n1' });
    expect(isTarget({ kind: 'concept', id: 'Moats', recordId: 'c1' }, { kind: 'concept', id: 'c1' })).toBe(true);
    expect(isTarget({ kind: 'concept', id: 'Moats' }, { kind: 'concept', id: 'moats' })).toBe(true);
  });
});

describe('begunLine', () => {
  const now = new Date('2026-10-11T12:00:00.000Z').getTime();
  it('names the day it began and, only here, the words', () => {
    expect(begunLine('2026-10-07T09:00:00.000Z', 640, now)).toBe('Begun Wednesday 7 October · 640 words');
    expect(begunLine('2025-10-07T09:00:00.000Z', 1, now)).toBe('Begun Tuesday 7 October 2025 · 1 word');
    expect(begunLine('2026-10-07T09:00:00.000Z', 0, now)).toBe('Begun Wednesday 7 October');
    expect(begunLine(null, 0, now)).toBe('');
  });
  it('counts words, not punctuation', () => {
    expect(countWords("It's the downside — not the upside — that matters.")).toBe(8);
  });
});

describe('question blocks', () => {
  it('keeps words and passages, and a block\'s earlier challenge', () => {
    const doc = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2, blockId: 'b1' }, content: [{ type: 'text', text: 'Why it matters' }] },
      { type: 'highlightRef', attrs: { blockId: 'b2', highlightId: '64b7f0f0f0f0f0f0f0f0f0f0', highlightText: 'A passage', articleId: '64b7f0f0f0f0f0f0f0f0f0f1', articleTitle: 'Source' } },
      { type: 'paragraph', attrs: { blockId: 'b3' } }
    ] };
    const blocks = questionBlocksFromDoc(doc, [{ id: 'b1', challenge: { enabled: true } }]);
    expect(blocks).toEqual([
      { id: 'b1', type: 'paragraph', text: 'Why it matters', challenge: { enabled: true } },
      expect.objectContaining({ id: 'b2', type: 'highlight-ref', text: 'A passage', articleTitle: 'Source' })
    ]);
  });
});

describe('namesAThinkObject', () => {
  it('sends every kind of writing to the one editor', () => {
    ['', '?tab=home', '?tab=notebook', '?tab=concepts', '?tab=questions', '?tab=concepts&concept=Moats',
      '?tab=questions&questionId=q1', '?tab=threads&threadId=t1', '?tab=insights'].forEach(search => {
      expect(namesAThinkObject(search)).toBe(false);
    });
  });
  it('leaves handoffs and learning paths to their own page', () => {
    expect(namesAThinkObject('?tab=handoffs&handoffId=h1')).toBe(true);
    expect(namesAThinkObject('?tab=paths&pathId=p1')).toBe(true);
  });
});

it('keeps private continuation identity and constructs an exact local link', () => {
  expect(buildAuthoredShelf(null)).toEqual([]);
  expect(buildAuthoredShelf([{ title: 'No identity' }])).toEqual([]);
  const [row] = buildAuthoredShelf([{ id: 'work-1', pageId: 'page/1', claimId: 'claim&1', title: 'My words', returnNote: 'Try the exception.', href: 'https://untrusted.example' }]);
  expect(row.href).toBe('/wiki/read/page%2F1?claimId=claim%261&exploration=1');
  expect(row.returnNote).toBe('Try the exception.');
});

it('returns Library writing to its own highlight without constructing a Wiki identity', () => {
  const [item] = buildAuthoredShelf([{ id: 'work-1', articleId: 'article-1', highlightId: 'highlight-1', title: 'My words' }]);
  expect(item.href).toBe('/library?articleId=article-1&highlightId=highlight-1&exploration=1');
});


describe('writing recognition', () => {
  it('uses a first-text preview only for an unnamed note, without modifying it', () => {
    const entry = { title: 'Untitled', snippet: 'The room & the question.' };
    expect(noteTitle(entry)).toBe('The room & the question.');
    expect(entry.title).toBe('Untitled');
    expect(noteTitle({ title: 'Untitled', snippet: 'Old preview', blocks: [{text:'The new beginning'}] })).toBe('The new beginning');
    expect(noteTitle({ title: 'Untitled', snippet: 'A < B and B > C' })).toBe('A < B and B > C');
    expect(noteTitle({ title: 'My title', snippet: 'Opening words' })).toBe('My title');
    expect(noteTitle({ title: 'Untitled note' })).toBe('Untitled');
  });
  it('constructs local result links from identity and keeps independent copies distinct', () => {
    const results = buildWritingResults([
      { kind:'notebook',id:'note-1',title:'Untitled',snippet:'A phrase I remember',href:'https://untrusted.test' },
      { kind:'exploration',id:'work-1',articleId:'article-1',highlightId:'highlight-1',title:'A phrase I remember' },
      { kind:'exploration',id:'broken',title:'Missing identity' }
    ]);
    expect(results.map(item => item.href)).toEqual(['/think?tab=notebook&entryId=note-1','/library?articleId=article-1&highlightId=highlight-1&exploration=1']);
    expect(results[0].title).toBe('A phrase I remember');
    expect(buildWritingResults([{kind:'notebook',id:'note-1',title:'My note'}], 'room + time')[0].href)
      .toBe('/think?tab=notebook&entryId=note-1&find=room+%2B+time');
  });
});
