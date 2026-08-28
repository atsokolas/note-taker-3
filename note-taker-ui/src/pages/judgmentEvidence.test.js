import { fileEvidenceIntoJudgment, projectJudgment, writeLineIntoJudgment } from './judgmentModel';

const candidate = {
  id: 'highlight:a1:h1',
  text: 'Deliverable capacity lags demand by two years.',
  sourceLabel: 'On compute · FT'
};

describe('fileEvidenceIntoJudgment', () => {
  it('files a library passage under Why, carrying where it came from', () => {
    const judgment = fileEvidenceIntoJudgment({ judgment: {} }, candidate, 'why');
    expect(judgment.why).toHaveLength(1);
    expect(judgment.why[0]).toMatchObject({
      text: candidate.text,
      sourceLabel: 'On compute · FT',
      acceptedFrom: 'highlight:a1:h1'
    });
    expect(judgment.why[0].createdAt).toEqual(expect.any(String));
    expect(judgment.why[0].reasonId).toEqual(expect.stringMatching(/^why_/));
    expect(judgment.against || []).toHaveLength(0);
  });

  it('files under Against when that is the side the reader chose', () => {
    const judgment = fileEvidenceIntoJudgment({ judgment: {} }, candidate, 'against');
    expect(judgment.against).toHaveLength(1);
    expect(judgment.why || []).toHaveLength(0);
  });

  it('appends without disturbing what is already filed', () => {
    const page = { judgment: { why: [{ reasonId: 'r1', text: 'An earlier reason.', sourceRefIds: [], sourceLabel: '', createdAt: '2026-02-14T12:00:00.000Z' }] } };
    const judgment = fileEvidenceIntoJudgment(page, candidate, 'why');
    expect(judgment.why.map(line => line.text)).toEqual([
      'An earlier reason.',
      candidate.text
    ]);
    expect(judgment.why[0].createdAt).toBe('2026-02-14T12:00:00.000Z');
    expect(judgment.why[1].createdAt).toEqual(expect.any(String));
    expect(judgment.why[1].createdAt).not.toBe('2026-02-14T12:00:00.000Z');
  });

  it('refuses a candidate with nothing in it', () => {
    const judgment = fileEvidenceIntoJudgment({ judgment: { why: [] } }, { id: 'x', text: '  ' }, 'why');
    expect(judgment.why).toEqual([]);
  });

  it('lands on the page the reader is looking at', () => {
    const page = { _id: 'p1', judgment: { currentJudgment: 'Compute is scarce.' } };
    const next = { ...page, judgment: fileEvidenceIntoJudgment(page, candidate, 'against') };
    const view = projectJudgment(next);
    expect(view.against.map(line => line.text)).toContain(candidate.text);
    expect(view.against[0].sourceLabel).toBe('On compute · FT');
    expect(view.against[0].sources).toEqual([
      expect.objectContaining({
        n: 1,
        label: 'On compute · FT',
        href: '/library?articleId=a1&highlightId=h1'
      })
    ]);
  });

  it('keeps the passage origin when another line is written later', () => {
    const page = { judgment: {} };
    const filed = { ...page, judgment: fileEvidenceIntoJudgment(page, candidate, 'why') };
    const next = writeLineIntoJudgment(filed, 'Another reason.', 'why');
    expect(next.why[0].acceptedFrom).toBe('highlight:a1:h1');
    expect(next.why[1]).toMatchObject({ text: 'Another reason.' });
  });
});
