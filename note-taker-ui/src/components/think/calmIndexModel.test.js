import {
  applyReturnQueueToThreads,
  buildHomeIndexMotion,
  composeHomeIndexOrientation,
  describeQuestionMotionNote,
  filterShelfRailSections,
  getWikiOpenQuestionHref,
  getThreadMotionStateTag,
  isWikiOpenQuestion,
  isSuppressedFromReturnView
} from './calmIndexModel';

describe('calmIndexModel return surfaces', () => {
  it('suppresses objects explicitly hidden from the home return view', () => {
    expect(isSuppressedFromReturnView({ title: 'Good thread', raw: { hiddenFromHome: true } })).toBe(true);
    expect(isSuppressedFromReturnView({ title: 'Good thread', raw: { debugOnly: true } })).toBe(true);
    expect(isSuppressedFromReturnView({ title: 'Good thread', raw: { status: 'archived' } })).toBe(true);
  });

  it('suppresses known QA cruft from ranked home motion and shelf lists', () => {
    const motion = buildHomeIndexMotion({
      concepts: [
        { name: 'investing', count: 6, updatedAt: '2026-06-10T00:00:00.000Z' },
        { name: 'Blah', count: 1, updatedAt: '2026-06-12T00:00:00.000Z' },
        { name: 'Test', count: 1, updatedAt: '2026-06-11T00:00:00.000Z' }
      ],
      questions: [
        { _id: 'q-temp', text: 'TEMP MCP RETEST 2026-06-06 UPDATED: can be deleted.', status: 'open', updatedAt: '2026-06-13T00:00:00.000Z' },
        { _id: 'q-real', text: 'What is the relationship between risk and return?', status: 'open', updatedAt: '2026-06-09T00:00:00.000Z' },
        { _id: 'q-new', text: 'New question', status: 'open', updatedAt: '2026-06-08T00:00:00.000Z' }
      ],
      notebookEntries: [
        { _id: 'n-real', title: 'Playing to Win', updatedAt: '2026-06-07T00:00:00.000Z' }
      ]
    });

    const visibleTitles = [...motion.inMotion, ...motion.shelf].map(thread => thread.title);
    expect(visibleTitles).toEqual(expect.arrayContaining([
      'investing',
      'What is the relationship between risk and return?',
      'Playing to Win'
    ]));
    expect(visibleTitles).not.toEqual(expect.arrayContaining([
      'Blah',
      'Test',
      'TEMP MCP RETEST 2026-06-06 UPDATED: can be deleted.',
      'New question'
    ]));
  });

  it('folds return queue entries into home motion with inline return states', () => {
    const motion = buildHomeIndexMotion({
      concepts: [{
        name: 'investing',
        count: 4,
        freshness: { stale: true, statusLabel: '4 newer sources' },
        updatedAt: '2026-06-10T00:00:00.000Z'
      }],
      questions: [{
        _id: 'q-return',
        text: 'Should I rebalance now?',
        status: 'open',
        updatedAt: '2026-06-12T00:00:00.000Z'
      }],
      notebookEntries: [{
        _id: 'n-return',
        title: 'Draft memo',
        updatedAt: '2026-06-11T00:00:00.000Z'
      }],
      returnQueueEntries: [
        { _id: 'rq-1', itemType: 'question', itemId: 'q-return', status: 'pending' },
        { _id: 'rq-2', itemType: 'notebook', itemId: 'n-return', status: 'pending' }
      ]
    });

    const questionThread = motion.inMotion.find((thread) => thread.id === 'q-return');
    const notebookThread = motion.inMotion.find((thread) => thread.id === 'n-return');
    expect(getThreadMotionStateTag(motion.inMotion[0])).toMatch(/CONCEPT · WAITING MATERIAL/i);
    expect(getThreadMotionStateTag(questionThread)).toBe('QUESTION · RETURNING');
    expect(getThreadMotionStateTag(notebookThread)).toBe('NOTE · READY TO REOPEN');
  });

  it('composes a warm home opening sentence from real return and motion data', () => {
    const motion = buildHomeIndexMotion({
      concepts: [{
        name: 'investing',
        count: 4,
        freshness: { stale: true, statusLabel: '4 newer sources arrived' },
        updatedAt: '2026-06-10T00:00:00.000Z'
      }],
      questions: [{
        _id: 'q-ready',
        text: 'Is the thesis still valid?',
        status: 'open',
        updatedAt: '2026-06-12T00:00:00.000Z',
        blocks: [
          { type: 'highlight-ref', text: 'Evidence one' },
          { type: 'highlight-ref', text: 'Evidence two' }
        ]
      }]
    });

    const orientation = composeHomeIndexOrientation(motion, {
      returnQueueEntries: [{ _id: 'rq-1', itemType: 'question', itemId: 'q-ready', status: 'pending' }]
    });

    expect(orientation).toMatch(/"investing" thread is warm again/i);
    expect(orientation).toMatch(/4 newer sources arrived/i);
    expect(orientation).toMatch(/enough evidence to answer/i);
  });

  it('marks queued threads with return states via applyReturnQueueToThreads', () => {
    const [thread] = applyReturnQueueToThreads(
      [{ key: 'question:q-1', type: 'question', id: 'q-1', title: 'Open loop', status: 'open', raw: {} }],
      [{ _id: 'rq-1', itemType: 'question', itemId: 'q-1', status: 'pending' }]
    );
    expect(thread.returnQueued).toBe(true);
    expect(thread.returnState).toBe('RETURNING');
  });

  it('keeps hidden shelf items reachable through search', () => {
    const hidden = { _id: 'q-hidden', text: 'Blah' };
    const visible = { _id: 'q-real', text: 'What is risk?' };

    const browse = filterShelfRailSections({
      questions: [hidden, visible],
      searchQuery: ''
    });
    expect(browse.questions.map((item) => item._id)).toEqual(['q-real']);

    const searched = filterShelfRailSections({
      questions: [hidden, visible],
      searchQuery: 'blah'
    });
    expect(searched.questions.map((item) => item._id)).toEqual(['q-hidden']);
  });

  it('treats wiki open questions as source-page return prompts', () => {
    const question = {
      _id: 'wiki-open-question:page-1:0',
      text: 'The unresolved question is how to size concentrated positions.',
      sourceType: 'wiki_open_question',
      sourcePageTitle: 'Margin of Safety',
      href: '/wiki/workspace?page=page-1#open-questions'
    };

    expect(isWikiOpenQuestion(question)).toBe(true);
    expect(getWikiOpenQuestionHref(question)).toBe('/wiki/workspace?page=page-1#open-questions');
    expect(describeQuestionMotionNote(question)).toBe('from Margin of Safety');
  });
});
