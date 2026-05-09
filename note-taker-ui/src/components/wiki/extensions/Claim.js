import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Claim — a TipTap mark that wraps a span of prose representing one
 * source-backed assertion. Stored on the doc so the editor surfaces the
 * agent's confidence and citations inline.
 *
 * Why a mark and not a node:
 *  - Marks compose naturally with the editor's text flow — selection,
 *    backspace, and copy/paste behave like normal prose.
 *  - The user can keep editing the surrounding paragraph; only the
 *    annotated stretch carries the citation/support metadata.
 *
 * Attributes:
 *  - claimId   stable id so re-renders / diffs / popovers can address the
 *              same claim across edits.
 *  - support   one of: 'supported' | 'partial' | 'unsupported' | 'conflicted'
 *              renders as a colored underline.
 *  - citationIndexes  array of 1-based indexes into page.sourceRefs
 *              the popover resolves these against the current page.
 *  - contradictionIndexes  optional array of 1-based indexes into page.sourceRefs
 *              that challenge the claim. Preserved for backend ledger refresh.
 */

export const SUPPORT_STATES = new Set(['supported', 'partial', 'unsupported', 'conflicted']);

const sanitizeIndexes = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const num = Number(item);
    if (Number.isFinite(num) && num >= 1 && num <= 200) out.push(num);
  }
  return out.slice(0, 8);
};

const sanitizeSupport = (value) => {
  if (value === 'contradicted') return 'conflicted';
  return SUPPORT_STATES.has(value) ? value : 'supported';
};

const citationLabel = (indexes = []) => `[${indexes.join(',')}]`;

const buildCitationMarker = ({ claimId, support, citationIndexes, contradictionIndexes = [] }) => {
  const visibleIndexes = citationIndexes.length ? citationIndexes : contradictionIndexes;
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'wiki-claim-citation';
  marker.contentEditable = 'false';
  marker.dataset.claimId = claimId || '';
  marker.dataset.support = sanitizeSupport(support);
  marker.dataset.citationIndexes = citationIndexes.join(',');
  marker.dataset.contradictionIndexes = contradictionIndexes.join(',');
  marker.setAttribute('aria-label', `Backlink to source${visibleIndexes.length === 1 ? '' : 's'} ${visibleIndexes.join(', ')}`);
  marker.textContent = citationLabel(visibleIndexes);
  return marker;
};

let claimIdCounter = 0;
const generateClaimId = () => {
  claimIdCounter += 1;
  return `claim-${Date.now()}-${claimIdCounter}`;
};

const Claim = Mark.create({
  name: 'claim',

  // Lower priority than links so they nest correctly.
  priority: 900,
  inclusive: false,

  addOptions: () => ({
    HTMLAttributes: {}
  }),

  addAttributes: () => ({
    claimId: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-claim-id'),
      renderHTML: (attrs) => ({ 'data-claim-id': attrs.claimId || generateClaimId() })
    },
    support: {
      default: 'supported',
      parseHTML: (element) => sanitizeSupport(element.getAttribute('data-support')),
      renderHTML: (attrs) => ({ 'data-support': sanitizeSupport(attrs.support) })
    },
    citationIndexes: {
      default: [],
      parseHTML: (element) => {
        const raw = element.getAttribute('data-citation-indexes') || '';
        return sanitizeIndexes(raw.split(',').map(token => token.trim()).filter(Boolean));
      },
      renderHTML: (attrs) => {
        const indexes = sanitizeIndexes(attrs.citationIndexes);
        return indexes.length ? { 'data-citation-indexes': indexes.join(',') } : {};
      }
    },
    contradictionIndexes: {
      default: [],
      parseHTML: (element) => {
        const raw = element.getAttribute('data-contradiction-indexes') || '';
        return sanitizeIndexes(raw.split(',').map(token => token.trim()).filter(Boolean));
      },
      renderHTML: (attrs) => {
        const indexes = sanitizeIndexes(attrs.contradictionIndexes);
        return indexes.length ? { 'data-contradiction-indexes': indexes.join(',') } : {};
      }
    }
  }),

  parseHTML: () => [
    { tag: 'span[data-claim-id]' }
  ],

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { class: 'wiki-claim' },
        HTMLAttributes
      ),
      0
    ];
  },

  addCommands() {
    return {
      setClaim: (attributes = {}) => ({ commands }) => commands.setMark(this.name, {
        claimId: attributes.claimId || generateClaimId(),
        support: sanitizeSupport(attributes.support),
        citationIndexes: sanitizeIndexes(attributes.citationIndexes),
        contradictionIndexes: sanitizeIndexes(attributes.contradictionIndexes)
      }),
      unsetClaim: () => ({ commands }) => commands.unsetMark(this.name)
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const decorations = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const claimMark = node.marks.find(mark => mark.type.name === this.name);
              if (!claimMark) return;
              const citationIndexes = sanitizeIndexes(claimMark.attrs?.citationIndexes);
              const contradictionIndexes = sanitizeIndexes(claimMark.attrs?.contradictionIndexes);
              if (!citationIndexes.length && !contradictionIndexes.length) return;
              const claimId = claimMark.attrs?.claimId || '';
              const support = sanitizeSupport(claimMark.attrs?.support);
              decorations.push(Decoration.widget(
                pos + node.nodeSize,
                () => buildCitationMarker({ claimId, support, citationIndexes, contradictionIndexes }),
                {
                  key: `${claimId || pos}-${citationIndexes.join(',')}-${contradictionIndexes.join(',')}`,
                  side: 1
                }
              ));
            });
            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
});

export default Claim;
