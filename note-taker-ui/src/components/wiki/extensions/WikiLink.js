import { Mark, mergeAttributes } from '@tiptap/core';

const safePageId = (value = '') => String(value || '').trim();

const WikiLink = Mark.create({
  name: 'wikiLink',
  priority: 1000,
  inclusive: false,

  addAttributes: () => ({
    pageId: {
      default: '',
      parseHTML: (element) => element.getAttribute('data-wiki-page-id') || '',
      renderHTML: (attrs) => ({ 'data-wiki-page-id': safePageId(attrs.pageId) })
    },
    title: {
      default: '',
      parseHTML: (element) => element.getAttribute('data-wiki-title') || '',
      renderHTML: (attrs) => (attrs.title ? { 'data-wiki-title': attrs.title } : {})
    }
  }),

  parseHTML: () => [
    { tag: 'a[data-wiki-page-id]' }
  ],

  renderHTML({ HTMLAttributes }) {
    const pageId = safePageId(HTMLAttributes['data-wiki-page-id']);
    return [
      'a',
      mergeAttributes(
        HTMLAttributes,
        {
          class: 'wiki-internal-link',
          href: pageId ? `/wiki/${pageId}` : '/wiki'
        }
      ),
      0
    ];
  }
});

export default WikiLink;
