const { __testables } = require('./wikiMaintenanceService');

const {
  attachClaimCitationIds,
  collectClaimsFromDoc,
  docFromArticle,
  resolveClaimCitationIds
} = __testables;

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

const headings = (doc) => {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (node.type === 'heading') {
      out.push((node.content || []).map(child => child.text || '').join(''));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return out;
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

  it('fills canonical question sections before rendering', () => {
    const { alignArticleToPageStructure } = require('./wikiPageStructureService');
    const article = alignArticleToPageStructure({
      pageType: 'question',
      article: {
        summary: { text: 'Short answer text.', citationIndexes: [1] },
        sections: [{ heading: 'Evidence', paragraphs: [{ text: 'Evidence text.', citationIndexes: [1] }] }]
      }
    });
    const doc = docFromArticle({ title: 'Why compound?', article });
    expect(headings(doc).slice(1, 6)).toEqual([
      'Short Answer',
      'Why It Matters',
      'Evidence',
      'What Would Change This',
      'Open Questions'
    ]);
  });

  it('extracts citation indexes from claim marks before persistence', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Claim with two sources.', citationIndexes: [1, 2] }
      }
    });
    const claims = collectClaimsFromDoc(doc);
    expect(claims[0].citationIndexes).toEqual([1, 2]);
  });

  it('maps claim citation indexes to persisted citation ids', () => {
    const citationIds = resolveClaimCitationIds({
      citationIndexes: [2, 1, 2, 99],
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [
        { _id: 'source-a' },
        { _id: 'source-b' }
      ]
    });
    expect(citationIds).toEqual(['citation-b', 'citation-a']);
  });

  it('ignores invalid and out-of-range citation indexes', () => {
    const citationIds = resolveClaimCitationIds({
      citationIndexes: [0, -1, 'bad', 2, 9],
      citations: [{ _id: 'citation-a' }, { _id: 'citation-b' }],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }]
    });
    expect(citationIds).toEqual(['citation-b']);
  });

  it('attaches citation ids and removes transient citation indexes from claims', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A claim.',
        support: 'supported',
        citationIndexes: [1]
      }],
      citations: [{ _id: 'citation-a', sourceRefId: 'source-a' }],
      sourceRefs: [{ _id: 'source-a' }]
    });
    expect(claims[0].citationIds).toEqual(['citation-a']);
    expect(claims[0].citationIndexes).toBeUndefined();
  });

  it('normalizes frontend contradicted support to backend conflicted support', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A disputed claim.',
        support: 'contradicted',
        citationIndexes: []
      }]
    });
    expect(claims[0].support).toBe('conflicted');
  });
});
