import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const outlineKey = new PluginKey('workOutline');
export function noteOutline(doc) {
  const headings = [];
  doc.forEach((node, position) => {
    if (node.type.name === 'heading') headings.push({ position, size: node.nodeSize, level: node.attrs.level, title: node.textContent || 'Untitled section', id: node.attrs.blockId });
  });
  return headings.map((heading, index) => ({ ...heading, end: headings.slice(index + 1).find(next => next.level <= heading.level)?.position ?? doc.content.size }));
}
export const foldedHeadings = editor => outlineKey.getState(editor.state) || new Set();
export const WorkOutline = Extension.create({
  name: 'workOutline',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: outlineKey,
      state: {
        init: () => new Set(),
        apply(tr, previous) {
          const folded = new Set([...previous].map(position => tr.mapping.mapResult(position)).filter(result => !result.deleted).map(result => result.pos));
          const action = tr.getMeta(outlineKey), outline = noteOutline(tr.doc);
          if (action?.type === 'toggle') { if (folded.has(action.position)) folded.delete(action.position); else folded.add(action.position); }
          if (action?.type === 'level') { folded.clear(); outline.filter(heading => heading.level === action.level).forEach(heading => folded.add(heading.position)); }
          if (action?.type === 'expand') folded.clear();
          if (action?.type === 'restore') outline.filter(heading => heading.id && action.ids.includes(heading.id)).forEach(heading => folded.add(heading.position));
          // Typing, keyboard navigation and date/contents jumps always reveal their destination.
          if (tr.selectionSet || tr.docChanged || action?.type === 'reveal') {
            const position = action?.position ?? tr.selection.from;
            outline.filter(heading => heading.position + heading.size <= position && heading.end > position).forEach(heading => folded.delete(heading.position));
          }
          return folded;
        }
      },
      props: { decorations(state) {
        const outline = noteOutline(state.doc), folded = outlineKey.getState(state), decorations = [];
        state.doc.forEach((node, position) => {
          if (outline.some(heading => folded.has(heading.position) && position > heading.position && position < heading.end)) decorations.push(Decoration.node(position, position + node.nodeSize, { hidden: 'hidden', 'aria-hidden': 'true', class: 'work-folded-block' }));
        });
        return DecorationSet.create(state.doc, decorations);
      } }
    })];
  }
});
