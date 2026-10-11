import React from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import HighlightBlock from '../../blocks/HighlightBlock';
import { QuietButton } from '../../ui';

// The pieces every Think entry is written with — a note, a concept, a
// question. One editor shell; these are its shared parts.

export const BlockIdExtension = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock'],
        attributes: {
          blockId: {
            default: null,
            parseHTML: element => element.getAttribute('data-block-id'),
            renderHTML: attributes => (
              attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
            )
          },
          highlightId: {
            default: null,
            parseHTML: element => element.getAttribute('data-highlight-id'),
            renderHTML: attributes => (
              attributes.highlightId ? { 'data-highlight-id': attributes.highlightId } : {}
            )
          }
        }
      },
      {
        types: ['blockquote'],
        attributes: {
          sourcePath: {
            default: null,
            parseHTML: element => element.getAttribute('data-source-path'),
            renderHTML: attributes => (
              attributes.sourcePath ? { 'data-source-path': attributes.sourcePath } : {}
            )
          },
          articleId: {
            default: null,
            parseHTML: element => element.getAttribute('data-article-id'),
            renderHTML: attributes => (
              attributes.articleId ? { 'data-article-id': attributes.articleId } : {}
            )
          },
          articleTitle: {
            default: '',
            parseHTML: element => element.getAttribute('data-article-title') || '',
            renderHTML: attributes => (
              attributes.articleTitle ? { 'data-article-title': attributes.articleTitle } : {}
            )
          }
        }
      }
    ];
  }
});

export const HighlightRefNode = Node.create({
  name: 'highlightRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      highlightId: {
        default: null,
        parseHTML: element => element.getAttribute('data-highlight-id'),
        renderHTML: attributes => (
          attributes.highlightId ? { 'data-highlight-id': attributes.highlightId } : {}
        )
      },
      highlightText: {
        default: '',
        parseHTML: element => element.getAttribute('data-highlight-text') || '',
        renderHTML: attributes => (
          attributes.highlightText ? { 'data-highlight-text': attributes.highlightText } : {}
        )
      },
      articleTitle: {
        default: '',
        parseHTML: element => element.getAttribute('data-article-title') || '',
        renderHTML: attributes => (
          attributes.articleTitle ? { 'data-article-title': attributes.articleTitle } : {}
        )
      },
      articleId: {
        default: '',
        parseHTML: element => element.getAttribute('data-article-id') || '',
        renderHTML: attributes => (
          attributes.articleId ? { 'data-article-id': attributes.articleId } : {}
        )
      },
      tags: {
        default: '',
        parseHTML: element => element.getAttribute('data-highlight-tags') || '',
        renderHTML: attributes => (
          attributes.tags ? { 'data-highlight-tags': attributes.tags } : {}
        )
      },
      sourcePath: {
        default: '',
        parseHTML: element => element.getAttribute('data-source-path') || '',
        renderHTML: attributes => (
          attributes.sourcePath ? { 'data-source-path': attributes.sourcePath } : {}
        )
      },
      blockId: {
        default: null,
        parseHTML: element => element.getAttribute('data-block-id'),
        renderHTML: attributes => (
          attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
        )
      }
    };
  },
  parseHTML() {
    return [
      { tag: 'blockquote[data-highlight-id]' }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node, extension }) => {
      const highlight = extension.options.getHighlightById(node.attrs.highlightId) || {
        id: node.attrs.highlightId,
        text: node.attrs.highlightText || 'Highlight',
        tags: node.attrs.tags ? node.attrs.tags.split(',').filter(Boolean) : [],
        articleTitle: node.attrs.articleTitle || '',
        articleId: node.attrs.articleId || ''
      };
      return (
        <NodeViewWrapper
          className="highlight-ref-node notebook-source-quote"
          contentEditable={false}
          aria-label={highlight.articleTitle ? `Source quotation from ${highlight.articleTitle}` : 'Source quotation'}
        >
          <HighlightBlock highlight={highlight} compact />
        </NodeViewWrapper>
      );
    });
  }
});

export const passageNode = (highlight = {}) => ({
  type: 'highlightRef',
  attrs: {
    highlightId: highlight._id,
    highlightText: highlight.text || '',
    articleTitle: highlight.articleTitle || '',
    articleId: highlight.articleId || '',
    sourcePath: highlight.articleId
      ? `/library?articleId=${encodeURIComponent(highlight.articleId)}${highlight._id ? `&highlightId=${encodeURIComponent(highlight._id)}` : ''}`
      : '',
    tags: (highlight.tags || []).join(',')
  }
});

const timeOf = (value) => {
  const at = value ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime())
    ? at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
};

/* The bar above an entry: what kind it is, when it last saved (a timestamp
   that fades rather than a standing "Saved"), the partner, and one menu. */
export const EntryBar = ({ kind = 'note', saveState = 'idle', savedAt = null, onRetry, partnerOpen = false, onPartner, children }) => (
  <div className="think-notebook-utility" aria-label="Note utilities">
    <span className="think-notebook-utility__kind">{kind}</span>
    <span className={`think-notebook-save-state is-${saveState}`} role="status" aria-live="polite">
      {saveState === 'saving' ? 'Saving…'
        : saveState === 'error' ? <>Not saved {onRetry ? <QuietButton onClick={onRetry}>Retry</QuietButton> : null}</>
          : savedAt ? <span key={String(savedAt)} className="think-notebook-save-state__time">Saved {timeOf(savedAt)}</span> : null}
    </span>
    {onPartner ? <QuietButton data-context-trigger="partner" aria-pressed={partnerOpen} onClick={onPartner}>Partner</QuietButton> : null}
    {children ? (
      <details className="think-notebook-utility__more">
        <summary className="ui-quiet-button" aria-label="More">…</summary>
        <div>{children}</div>
      </details>
    ) : null}
  </div>
);
