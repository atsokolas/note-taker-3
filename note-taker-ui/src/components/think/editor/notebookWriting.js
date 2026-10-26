import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';
import { BlockIdExtension } from './writingParts';
import { UniqueBlockIds } from '../notebook/uniqueBlockIds';

const ListIndentExtension = Extension.create({
  name: 'listIndent',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList')) {
          return this.editor.commands.sinkListItem('listItem');
        }
        return false;
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList')) {
          return this.editor.commands.liftListItem('listItem');
        }
        return false;
      }
    };
  }
});


export const notebookWritingExtensions = () => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Placeholder.configure({ placeholder: 'Start writing…', showOnlyWhenEditable: false }),
  ListIndentExtension, BlockIdExtension, UniqueBlockIds
];
