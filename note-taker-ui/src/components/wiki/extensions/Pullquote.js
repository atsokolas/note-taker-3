import { Node, mergeAttributes } from '@tiptap/core';

const Pullquote = Node.create({
  name: 'pullquote',

  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML: () => [
    { tag: 'blockquote[data-node-type="pullquote"]' },
    { tag: 'blockquote.wiki-read-pullquote' }
  ],

  renderHTML({ HTMLAttributes }) {
    return [
      'blockquote',
      mergeAttributes(HTMLAttributes, {
        'data-node-type': 'pullquote',
        class: 'wiki-read-pullquote'
      }),
      0
    ];
  },

  addCommands() {
    return {
      insertPullquote: (text = '') => ({ commands }) => commands.insertContent({
        type: this.name,
        content: [{
          type: 'paragraph',
          content: text ? [{ type: 'text', text }] : []
        }]
      })
    };
  }
});

export default Pullquote;
