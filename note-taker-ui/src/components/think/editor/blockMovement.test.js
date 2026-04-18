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

    expect(moved).toBe(true);
    expect(setContent).toHaveBeenCalledWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] }
      ]
    }, false);
  });
});
