import {
  buildLessonsIndex,
  isParked,
  lessonLines,
  parkJudgment,
  projectJudgment,
  resumeJudgment,
  writeLessonIntoJudgment
} from './judgmentModel';

const page = (judgment = {}) => ({
  _id: 'p1',
  title: 'Compute',
  judgment: { currentJudgment: 'Compute is scarce.', ...judgment }
});

describe('parking a judgment', () => {
  it('is not retiring it — it says nothing about whether the claim is true', () => {
    const judgment = parkJudgment(page(), 'Announced capacity is not delivered capacity.');
    expect(judgment.status).toBe('parked');
    expect(judgment.currentJudgment).toBe('Compute is scarce.');
    expect(judgment.lessons).toHaveLength(1);
    expect(judgment.lessons[0]).toMatchObject({
      text: 'Announced capacity is not delivered capacity.',
      closedAs: 'parked'
    });
  });

  it('is reversible, and picking it back up keeps the lesson', () => {
    const parked = page(parkJudgment(page(), 'A thing I learned.'));
    expect(isParked(parked)).toBe(true);
    const resumed = resumeJudgment(parked);
    expect(resumed.status).toBe('monitoring');
    expect(resumed.parkedAt).toBeNull();
    expect(lessonLines(resumed)).toHaveLength(1);
  });

  it('can be parked without a lesson, because sometimes there is not one', () => {
    const judgment = parkJudgment(page(), '   ');
    expect(judgment.status).toBe('parked');
    expect(judgment.lessons).toEqual([]);
  });
});

describe('lessons', () => {
  it('can be written while you still hold the belief', () => {
    const judgment = writeLessonIntoJudgment(page(), 'Power, not silicon.');
    expect(judgment.lessons).toHaveLength(1);
    expect(judgment.lessons[0].closedAs).toBe('');
    expect(judgment.status).toBeUndefined();
  });

  it('accumulate rather than replace', () => {
    const first = page(writeLessonIntoJudgment(page(), 'One.'));
    const judgment = writeLessonIntoJudgment(first, 'Two.');
    expect(judgment.lessons.map(l => l.text)).toEqual(['One.', 'Two.']);
  });

  it('are ignored when empty', () => {
    const judgment = writeLessonIntoJudgment(page(), '  ');
    expect(lessonLines(judgment)).toEqual([]);
  });

  it('reach the page the reader is looking at', () => {
    const view = projectJudgment(page(parkJudgment(page(), 'A lesson.')));
    expect(view.parked).toBe(true);
    expect(view.lessons.map(l => l.text)).toEqual(['A lesson.']);
  });
});

describe('buildLessonsIndex', () => {
  it('gathers every lesson in the product, newest first, still naming its claim', () => {
    const index = buildLessonsIndex([
      { _id: 'a', judgment: { currentJudgment: 'Rates matter.', lessons: [
        { lessonId: 'l1', text: 'Older lesson.', at: '2026-01-01T00:00:00.000Z' }
      ] } },
      { _id: 'b', judgment: { currentJudgment: 'Compute is scarce.', lessons: [
        { lessonId: 'l2', text: 'Newer lesson.', at: '2026-08-01T00:00:00.000Z', closedAs: 'parked' }
      ] } },
      { _id: 'c', judgment: { currentJudgment: 'No lessons here.' } }
    ]);
    expect(index.map(item => item.text)).toEqual(['Newer lesson.', 'Older lesson.']);
    expect(index[0]).toMatchObject({ pageId: 'b', claim: 'Compute is scarce.', closedAs: 'parked' });
    expect(index[0].id).toBe('b:l2');
  });

  it('survives an empty library', () => {
    expect(buildLessonsIndex([])).toEqual([]);
    expect(buildLessonsIndex(undefined)).toEqual([]);
  });
});
