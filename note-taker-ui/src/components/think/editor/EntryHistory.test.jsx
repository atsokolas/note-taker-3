import { describeChange, historyLines } from './EntryHistory';

const p = (id, text) => ({ id, type: 'paragraph', text });
const passage = (highlightId, articleTitle) => ({ id: `q-${highlightId}`, type: 'highlight_embed', highlightId, text: 'Quoted.', articleTitle });

describe('what changed, in sentences', () => {
  it('counts what was added, with the sources of new passages', () => {
    expect(describeChange(
      { title: 'Costco', blocks: [p('a', 'Members renew.')] },
      { title: 'Costco', blocks: [p('a', 'Members renew.'), p('b', 'Fees are the business.'), p('c', 'Margins stay thin.'), passage('h1', 'Ben Carlson')] }
    )).toEqual(['Added two paragraphs and a passage from Ben Carlson.']);
  });

  it('names several sources once each', () => {
    expect(describeChange({ blocks: [] }, { blocks: [passage('h1', 'Ben Carlson'), passage('h2', 'Ben Carlson'), passage('h3', 'Stratechery')] }))
      .toEqual(['Added three passages from Ben Carlson and Stratechery.']);
  });

  it('tells a title, a revision and a removal apart', () => {
    expect(describeChange(
      { title: 'Costco', blocks: [p('a', 'Members renew.'), p('b', 'Margins are thin.'), passage('h1', 'Costco 10-K')] },
      { title: 'Costco membership', blocks: [p('a', 'Members renew every year.')] }
    )).toEqual([
      'Retitled it “Costco membership”.',
      'Revised a paragraph.',
      'Removed a paragraph and a passage from Costco 10-K.'
    ]);
    expect(describeChange({ title: '' }, { title: 'Moats' })).toEqual(['Titled it “Moats”.']);
    expect(describeChange({ title: 'Moats' }, { title: '' })).toEqual(['Took the title off.']);
  });

  it('reads a concept, written as a page rather than as blocks, the same way', () => {
    expect(describeChange(
      { title: 'Moats', html: '<p>Moats compound.</p>' },
      { title: 'Moats', html: '<p>Moats compound slowly.</p><h2>Evidence</h2><blockquote data-highlight-id="h1" data-article-title="Costco letter"></blockquote><p></p>' }
    )).toEqual(['Added a heading and a passage from Costco letter.', 'Revised a paragraph.']);
  });

  it('says only that something small moved when nothing countable did', () => {
    expect(describeChange({ blocks: [{ id: 'a', type: 'concept_ref', conceptName: 'Moats' }] }, { blocks: [] })).toEqual(['Small edits.']);
  });

  it('reads each revision against the one before it, and dates them', () => {
    const lines = historyLines([
      { id: 'r4', reason: 'restore', at: '2026-10-14T15:00:00', restoredFromAt: '2026-10-03T09:00:00', snapshot: { title: 'Costco', blocks: [p('a', 'Members renew.')] } },
      { id: 'r3', reason: 'edit', at: '2026-10-12T16:30:00', snapshot: { title: 'Costco', blocks: [p('a', 'Members renew.'), p('b', 'Fees.')] } },
      { id: 'r2', reason: 'edit', at: '2026-10-12T09:15:00', snapshot: { title: 'Costco', blocks: [p('a', 'Members renew.')] } },
      { id: 'r1', reason: 'before', at: '2026-10-03T09:00:00', snapshot: { title: 'Costco', blocks: [p('a', 'Members.'), passage('h1', 'Ben Carlson')] } }
    ]);
    expect(lines.map(line => line.text)).toEqual([
      'Restored the version from Oct 3.',
      'Added a paragraph.',
      'Revised a paragraph. Removed a passage from Ben Carlson.',
      'As it stood when history began: a paragraph and a passage from Ben Carlson.'
    ]);
    expect(lines.map(line => line.when)).toEqual(['Oct 14', expect.stringMatching(/^Oct 12, 4:30/), expect.stringMatching(/^Oct 12, 9:15/), 'Oct 3']);
    expect(historyLines([{ id: 'r1', reason: 'edit', at: '2026-10-12T09:00:00', snapshot: { title: '', blocks: [p('a', 'First.')] } }])[0].text)
      .toBe('Began with a paragraph.');
  });
});
