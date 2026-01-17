import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Button, QuietButton } from '../../ui';
import HighlightBlock from '../../blocks/HighlightBlock';
import InsertHighlightModal from './InsertHighlightModal';
import useHighlights from '../../../hooks/useHighlights';
import { ensureBlockIds, serializeBlocksFromDoc } from '../../../utils/notebookBlocks';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

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

const BlockIdExtension = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'listItem'],
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
      }
    ];
  }
});

const HighlightRefNode = Node.create({
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
        <NodeViewWrapper className="highlight-ref-node" contentEditable={false}>
          <HighlightBlock highlight={highlight} compact />
        </NodeViewWrapper>
      );
    });
  }
});

const NotebookEditor = ({ entry, saving, error, onSave, onDelete, onRegisterInsert }) => {
  const [titleDraft, setTitleDraft] = useState(entry?.title || '');
  const [insertOpen, setInsertOpen] = useState(false);
  const { highlights, highlightMap, loading: highlightsLoading, error: highlightsError } = useHighlights();
  const highlightLookupRef = useRef((id) => highlightMap.get(String(id)));

  useEffect(() => {
    highlightLookupRef.current = (id) => highlightMap.get(String(id));
  }, [highlightMap]);

  const highlightExtension = useMemo(
    () => HighlightRefNode.configure({
      getHighlightById: (id) => highlightLookupRef.current?.(id)
    }),
    []
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Write freely…' }),
      ListIndentExtension,
      BlockIdExtension,
      highlightExtension
    ],
    content: entry?.content || '<p></p>',
    editorProps: {
      attributes: { class: 'think-notebook-editor-body' }
    }
  });

  useEffect(() => {
    if (!onRegisterInsert) return;
    const insert = (highlight) => {
      if (!editor) return;
      editor.commands.insertContent({
        type: 'highlightRef',
        attrs: {
          highlightId: highlight._id,
          highlightText: highlight.text || '',
          articleTitle: highlight.articleTitle || '',
          articleId: highlight.articleId || '',
          tags: (highlight.tags || []).join(','),
          blockId: createId()
        }
      });
    };
    onRegisterInsert(insert);
    return () => onRegisterInsert(null);
  }, [editor, onRegisterInsert]);

  useEffect(() => {
    if (!entry) return;
    setTitleDraft(entry.title || '');
    if (editor) {
      editor.commands.setContent(entry.content || '<p></p>', false);
    }
  }, [entry?._id, editor]);

  const handleSave = () => {
    if (!entry || !editor) return;
    const currentDoc = editor.getJSON();
    const normalized = ensureBlockIds(currentDoc);
    if (normalized.changed) {
      editor.commands.setContent(normalized.node, false);
    }
    const blocks = serializeBlocksFromDoc(normalized.node);
    onSave({
      id: entry._id,
      title: titleDraft.trim() || 'Untitled note',
      content: editor.getHTML(),
      blocks,
      tags: entry.tags || [],
      linkedArticleId: entry.linkedArticleId || null
    });
  };

  const handleInsertHighlight = (highlight) => {
    if (!editor) return;
    editor.commands.insertContent({
      type: 'highlightRef',
      attrs: {
        highlightId: highlight._id,
        highlightText: highlight.text || '',
        articleTitle: highlight.articleTitle || '',
        articleId: highlight.articleId || '',
        tags: (highlight.tags || []).join(',')
      }
    });
  };

  if (!entry) {
    return (
      <div className="think-notebook-editor think-notebook-editor--empty">
        <p className="muted small">Select a note to start editing.</p>
      </div>
    );
  }

  return (
    <div className="think-notebook-editor">
      <div className="think-notebook-editor-header">
        <input
          type="text"
          className="think-notebook-title-input"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          placeholder="Untitled note"
        />
        <div className="think-notebook-editor-actions">
          <Button variant="secondary" onClick={() => setInsertOpen(true)}>
            Insert highlight
          </Button>
          <QuietButton onClick={() => onDelete(entry)} disabled={saving}>Delete</QuietButton>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      {error && <p className="status-message error-message">{error}</p>}
      {editor && <EditorContent editor={editor} />}
      <InsertHighlightModal
        open={insertOpen}
        highlights={highlights}
        loading={highlightsLoading}
        error={highlightsError}
        onClose={() => setInsertOpen(false)}
        onSelect={(highlight) => {
          handleInsertHighlight(highlight);
          setInsertOpen(false);
        }}
      />
    </div>
  );
};

export default NotebookEditor;
