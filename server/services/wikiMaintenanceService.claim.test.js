const { __testables } = require('./wikiMaintenanceService');

const { docFromArticle } = __testables;

const findClaimMarks = (doc) => {
  const marks = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks
        .filter(mark => mark?.type === 'claim')
        .forEach(mark => marks.push({ text: node.text, attrs: mark.attrs }));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return marks;
};

describe('wikiMaintenanceService — claim marks in docFromArticle', () => {
  it('wraps article summary text in a claim mark with citation indexes', () => {
    const doc = docFromArticle({
      title: 'Compounding interest',
      article: {
        summary: { text: 'Compounders need patience.', citationIndexes: [1, 2] },
        sections: []
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks).toHaveLength(1);
    expect(marks[0].text).toBe('Compounders need patience.');
    expect(marks[0].attrs.citationIndexes).toEqual([1, 2]);
    expect(marks[0].attrs.support).toBe('supported');
    expect(marks[0].attrs.claimId).toMatch(/^claim-/);
  });

  it('infers "partial" support when only one citation is attached', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A claim with one source.', citationIndexes: [1] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs.support).toBe('partial');
  });

  it('infers "unsupported" when no citations are attached', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A bare claim.', citationIndexes: [] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs.support).toBe('unsupported');
  });

  it('emits claim marks for each section paragraph', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              { text: 'First claim.', citationIndexes: [1] },
              { text: 'Second claim.', citationIndexes: [2, 3] }
            ]
          }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks).toHaveLength(2);
    expect(marks[0].text).toBe('First claim.');
    expect(marks[0].attrs.support).toBe('partial');
    expect(marks[1].text).toBe('Second claim.');
    expect(marks[1].attrs.support).toBe('supported');
  });

  it('emits claim marks for bullet items with their own citation indexes', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        sections: [
          {
            heading: 'Signals',
            paragraphs: [],
            bullets: [
              { text: 'A bullet point.', citationIndexes: [1] }
            ]
          }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks.find(m => m.text === 'A bullet point.')?.attrs.citationIndexes).toEqual([1]);
  });

  it('does not append the legacy "[1, 2]" suffix into the claim text', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Clean claim text.', citationIndexes: [1, 2] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].text).not.toMatch(/\[/);
  });

  it('gives each emitted claim a unique claimId', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A.', citationIndexes: [1] },
        sections: [
          { heading: 'Section', paragraphs: [{ text: 'B.', citationIndexes: [1] }] }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    const ids = marks.map(m => m.attrs.claimId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
