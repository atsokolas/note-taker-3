import { moveBlockInDocument, moveCurrentBlock } from './blockMovement';

describe('blockMovement', () => {
  it('moves a block down in a document', () => {
    const result = moveBlockInDocument({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'C' }] }
      ]
    }, 0, 'down');

    expect(result.moved).toBe(true);
    expect(result.doc.content.map((node) => node.content[0].text)).toEqual(['B', 'A', 'C']);
  });

  it('reorders the active editor block and writes the updated doc back', () => {
    const setContent = jest.fn();
    const editor = {
      getJSON: jest.fn(() => ({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'B' }] }
        ]
      })),
      state: {
        selection: {
          $from: {
            index: jest.fn(() => 0)
          }
        }
      },
      commands: {
        setContent
      }
    };

    const moved = moveCurrentBlock(editor, 'down');

    expect(moved.moved).toBe(true);
    expect(setContent).toHaveBeenCalledWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] }
      ]
    }, true);
  });

  it('moves a paragraph with the source quotation that belongs to it', () => {
    const setContent = jest.fn();
    const exception = {
      type: 'paragraph',
      attrs: { blockId: 'exception' },
      content: [{ type: 'text', text: 'The exception is when the downside lands on someone else.' }]
    };
    const citation = {
      type: 'blockquote',
      attrs: {
        blockId: 'quote',
        articleId: 'article-1',
        articleTitle: 'A beautiful source',
        sourcePath: '/library?articleId=article-1'
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted cost.' }] }]
    };
    const rule = {
      type: 'paragraph',
      attrs: { blockId: 'rule' },
      content: [{ type: 'text', text: 'Recoverable mistakes stay with the person who can reverse them.' }]
    };
    const editor = {
      getJSON: jest.fn(() => ({ type: 'doc', content: [rule, exception, citation] })),
      state: { selection: { $from: { index: jest.fn(() => 1) } } },
      commands: { setContent }
    };

    const moved = moveCurrentBlock(editor, 'up');

    expect(moved.moved).toBe(true);
    expect(moved.label).toMatch(/^The exception is when/);
    expect(setContent.mock.calls[0][0].content.map((node) => node.attrs.blockId)).toEqual([
      'exception',
      'quote',
      'rule'
    ]);
  });
});
