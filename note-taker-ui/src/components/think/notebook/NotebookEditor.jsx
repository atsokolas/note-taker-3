import React, { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';
import { Button, QuietButton } from '../../ui';

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

const createBlockId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const ensureBlockIds = (node) => {
  if (!node) return { node, changed: false };
  let changed = false;
  const next = { ...node };
  if (['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type)) {
    next.attrs = { ...(node.attrs || {}) };
    if (!next.attrs.blockId) {
      next.attrs.blockId = createBlockId();
      changed = true;
    }
  }
  if (node.content) {
    next.content = node.content.map(child => {
      const result = ensureBlockIds(child);
      if (result.changed) changed = true;
      return result.node;
    });
  }
  return { node: next, changed };
};

const extractText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(extractText).join('');
};

const extractBlocksFromDoc = (doc) => {
  const blocks = [];
  const walk = (node, indent = 0) => {
    if (!node) return;
    if (node.type === 'paragraph') {
      blocks.push({
        id: node.attrs?.blockId || createBlockId(),
        type: 'paragraph',
        text: extractText(node)
      });
      return;
    }
    if (node.type === 'heading') {
      blocks.push({
        id: node.attrs?.blockId || createBlockId(),
        type: 'heading',
        level: node.attrs?.level || 1,
        text: extractText(node)
      });
      return;
    }
    if (node.type === 'blockquote') {
      blocks.push({
        id: node.attrs?.blockId || createBlockId(),
        type: node.attrs?.highlightId ? 'highlight-ref' : 'quote',
        highlightId: node.attrs?.highlightId || null,
        text: extractText(node)
      });
      return;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      (node.content || []).forEach(child => walk(child, indent));
      return;
    }
    if (node.type === 'listItem') {
      const paragraph = (node.content || []).find(child => child.type === 'paragraph');
      blocks.push({
        id: node.attrs?.blockId || createBlockId(),
        type: 'bullet',
        indent,
        text: paragraph ? extractText(paragraph) : extractText(node)
      });
      (node.content || []).forEach(child => {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          (child.content || []).forEach(grandchild => walk(grandchild, indent + 1));
        }
      });
      return;
    }
    (node.content || []).forEach(child => walk(child, indent));
  };
  walk(doc, 0);
  return blocks;
};

const NotebookEditor = ({ entry, saving, error, onSave, onDelete }) => {
  const [titleDraft, setTitleDraft] = useState(entry?.title || '');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Write freely…' }),
      ListIndentExtension,
      BlockIdExtension
    ],
    content: entry?.content || '<p></p>',
    editorProps: {
      attributes: { class: 'think-notebook-editor-body' }
    }
  });

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
    const blocks = extractBlocksFromDoc(normalized.node);
    onSave({
      id: entry._id,
      title: titleDraft.trim() || 'Untitled note',
      content: editor.getHTML(),
      blocks,
      tags: entry.tags || [],
      linkedArticleId: entry.linkedArticleId || null
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
          <QuietButton onClick={() => onDelete(entry)} disabled={saving}>Delete</QuietButton>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      {error && <p className="status-message error-message">{error}</p>}
      {editor && <EditorContent editor={editor} />}
    </div>
  );
};

export default NotebookEditor;
