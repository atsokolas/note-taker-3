import { Mark, mergeAttributes } from '@tiptap/core';

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
 *  - support   one of: 'supported' | 'partial' | 'unsupported' | 'contradicted'
 *              renders as a colored underline.
 *  - citationIndexes  array of 1-based indexes into page.sourceRefs
 *              the popover resolves these against the current page.
 */

export const SUPPORT_STATES = new Set(['supported', 'partial', 'unsupported', 'contradicted']);

const sanitizeIndexes = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const num = Number(item);
    if (Number.isFinite(num) && num >= 1 && num <= 200) out.push(num);
  }
  return out.slice(0, 8);
};

const sanitizeSupport = (value) => (SUPPORT_STATES.has(value) ? value : 'supported');

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
        citationIndexes: sanitizeIndexes(attributes.citationIndexes)
      }),
      unsetClaim: () => ({ commands }) => commands.unsetMark(this.name)
    };
  }
});

export default Claim;
