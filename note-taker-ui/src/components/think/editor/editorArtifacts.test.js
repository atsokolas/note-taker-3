import {
  buildArtifactBlockContent,
  insertArtifactBlock
} from './editorArtifacts';

describe('editorArtifacts', () => {
  it('builds a structured concept block scaffold', () => {
    expect(buildArtifactBlockContent('concept')).toEqual([
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Concept' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Core claim: ' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Why it matters: ' }]
      }
    ]);
  });

  it('inserts an evidence block as draft-ready structure', () => {
    const editor = {
      commands: {
        insertContent: jest.fn()
      }
    };

    insertArtifactBlock(editor, 'evidence');

    expect(editor.commands.insertContent).toHaveBeenCalledWith([
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Supporting evidence or quoted material.' }]
          }
        ]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Why it matters: ' }]
      }
    ]);
  });
});
