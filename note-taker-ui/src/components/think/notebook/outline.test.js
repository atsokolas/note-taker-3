import { addPoint, dropBranch, moveBranch, removePoint, shiftBranch, toggleFold, visiblePoints, writeOut, writtenHtml } from './outline';
import { buildDocFromBlocks, serializeBlocksFromDoc } from '../../../utils/notebookBlocks';

const outline = (...rows) => rows.map(([text, depth], index) => ({ id: `p${index}`, text, depth, folded: false, blockId: '' }));
const texts = points => points.map(point => `${'  '.repeat(point.depth)}${point.text}`);

const essay = () => outline(
  ['Keeping', 0], ['The act', 1], ['By date', 1],
  ['Found by question', 0], ['Smart Notes', 1],
  ['Coming back', 0]
);

describe('the outline beside a draft', () => {
  it('moves a point with everything that hangs from it', () => {
    expect(texts(moveBranch(essay(), 3, 'up'))).toEqual(['Found by question', '  Smart Notes', 'Keeping', '  The act', '  By date', 'Coming back']);
    expect(texts(moveBranch(essay(), 0, 'down'))).toEqual(['Found by question', '  Smart Notes', 'Keeping', '  The act', '  By date', 'Coming back']);
    expect(moveBranch(essay(), 1, 'up')).toEqual(essay());
    expect(texts(moveBranch(essay(), 2, 'up'))).toEqual(['Keeping', '  By date', '  The act', 'Found by question', '  Smart Notes', 'Coming back']);
  });

  it('indents a branch no deeper than one under the point above', () => {
    expect(texts(shiftBranch(essay(), 3, 1))).toEqual(['Keeping', '  The act', '  By date', '  Found by question', '    Smart Notes', 'Coming back']);
    expect(shiftBranch(essay(), 0, 1)).toEqual(essay());
    expect(shiftBranch(essay(), 1, 1)).toEqual(essay());
    expect(texts(shiftBranch(essay(), 1, -1))).toEqual(['Keeping', 'The act', '  By date', 'Found by question', '  Smart Notes', 'Coming back']);
  });

  it('folds a point and hides only its branch', () => {
    const folded = toggleFold(essay(), 0);
    expect(visiblePoints(folded).map(({ point }) => point.text)).toEqual(['Keeping', 'Found by question', 'Smart Notes', 'Coming back']);
    expect(toggleFold(essay(), 5)).toEqual(essay());
  });

  it('adds under an open point with children, otherwise after its branch', () => {
    const fresh = { id: 'new', text: '', depth: 0 };
    expect(addPoint(essay(), 0, fresh)).toMatchObject({ index: 1, points: expect.arrayContaining([{ ...fresh, depth: 1 }]) });
    expect(addPoint(toggleFold(essay(), 0), 0, fresh).index).toBe(3);
    expect(addPoint([], -1, fresh)).toEqual({ points: [fresh], index: 0 });
  });

  it('keeps a point that still has children', () => {
    expect(removePoint(essay(), 0)).toEqual(essay());
    expect(texts(removePoint(essay(), 5))).toHaveLength(5);
  });

  it('drops a branch before another point, at that point’s depth', () => {
    expect(texts(dropBranch(essay(), 3, 2))).toEqual(['Keeping', '  The act', '  Found by question', '    Smart Notes', '  By date', 'Coming back']);
    expect(texts(dropBranch(essay(), 0, 6))).toEqual(['Found by question', '  Smart Notes', 'Coming back', 'Keeping', '  The act', '  By date']);
    expect(dropBranch(essay(), 0, 1)).toEqual(essay());
  });

  it('writes a branch out as a heading with pencil lines, and remembers the heading', () => {
    let id = 0;
    const result = writeOut(essay(), 0, () => `b${id += 1}`);
    expect(result.nodes.map(node => [node.type, node.attrs.pencil || false, node.content[0].text])).toEqual([
      ['heading', false, 'Keeping'], ['paragraph', true, 'The act'], ['paragraph', true, 'By date']
    ]);
    expect(result.points[0].blockId).toBe('b1');
    expect(writtenHtml(result.nodes)).toBe('<h2 data-block-id="b1">Keeping</h2><p data-block-id="b2" data-pencil="">The act</p><p data-block-id="b3" data-pencil="">By date</p>');
    expect(writeOut(outline(['  ', 0]), 0, () => 'x')).toBeNull();
  });
});

describe('saved lists', () => {
  it('come back nested after a reload, and pencil lines stay pencil', () => {
    const doc = buildDocFromBlocks([
      { id: 'h', type: 'heading', level: 2, text: 'Essay' },
      { id: 'a', type: 'bullet', indent: 0, text: 'Claim' },
      { id: 'b', type: 'bullet', indent: 1, text: 'Evidence' },
      { id: 'c', type: 'bullet', indent: 2, text: 'Page 41' },
      { id: 'd', type: 'bullet', indent: 0, text: 'Second claim' },
      { id: 'p', type: 'paragraph', text: 'The page it stands on', pencil: true }
    ]);
    expect(doc.content.map(node => node.type)).toEqual(['heading', 'bulletList', 'paragraph']);
    expect(doc.content[2].attrs.pencil).toBe(true);
    expect(serializeBlocksFromDoc(doc).map(block => [block.id, block.type, block.indent ?? null, block.pencil || false])).toEqual([
      ['h', 'heading', null, false], ['a', 'bullet', 0, false], ['b', 'bullet', 1, false], ['c', 'bullet', 2, false], ['d', 'bullet', 0, false], ['p', 'paragraph', null, true]
    ]);
  });

  it('never leaves an indented first bullet without a list', () => {
    const doc = buildDocFromBlocks([{ id: 'a', type: 'bullet', indent: 2, text: 'Orphan' }]);
    expect(doc.content[0]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem', attrs: { blockId: 'a' } }] });
  });
});
