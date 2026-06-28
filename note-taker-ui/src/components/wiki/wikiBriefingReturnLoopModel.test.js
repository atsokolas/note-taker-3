import {
  formatAnswerableQuestionNote,
  formatSourcePageNote,
  isSafeBriefingHref,
  normalizeBriefingNextAction,
  selectPrimaryReturnLoopNote
} from './wikiBriefingReturnLoopModel';

describe('wikiBriefingReturnLoopModel', () => {
  it('normalizes only local next-action links', () => {
    expect(normalizeBriefingNextAction({
      nextAction: {
        type: 'answer_question',
        label: 'Answer the question',
        href: '/think?tab=questions&questionId=q1',
        reason: 'Opportunity Cost gained 2 sources'
      }
    })).toMatchObject({
      label: 'Answer the question',
      href: '/think?tab=questions&questionId=q1',
      reason: 'Opportunity Cost gained 2 sources'
    });

    expect(isSafeBriefingHref('/wiki/workspace?page=p1')).toBe(true);
    expect(isSafeBriefingHref('https://example.com')).toBe(false);
    expect(isSafeBriefingHref('//example.com')).toBe(false);
    expect(normalizeBriefingNextAction({
      nextAction: { label: 'Bad', href: 'https://example.com' }
    })).toBe(null);
  });

  it('selects one primary return-loop note by product priority', () => {
    const note = selectPrimaryReturnLoopNote({
      answerableQuestions: [{
        questionId: 'q1',
        text: 'How do hidden tradeoffs show up?',
        href: '/think?tab=questions&questionId=q1',
        evidencePageTitle: 'Opportunity Cost',
        evidenceCount: 2
      }],
      pagesWithNewSourceMaterial: [{
        pageId: 'p1',
        title: 'Opportunity Cost',
        addedSourceCount: 2
      }]
    });

    expect(note).toMatchObject({
      type: 'question',
      label: 'How do hidden tradeoffs show up?',
      href: '/think?tab=questions&questionId=q1',
      detail: 'Fresh evidence via Opportunity Cost (2 sources)'
    });
  });

  it('formats source and question evidence compactly', () => {
    expect(formatSourcePageNote({
      addedSourceCount: 2,
      sourceTitles: ['Tradeoff note', 'Capital allocation note', 'Ignored third']
    })).toBe('2 new sources — Tradeoff note, Capital allocation note');

    expect(formatAnswerableQuestionNote({
      evidencePageTitle: 'Opportunity Cost',
      evidenceCount: 1
    })).toBe('Fresh evidence via Opportunity Cost (1 source)');
  });
});
