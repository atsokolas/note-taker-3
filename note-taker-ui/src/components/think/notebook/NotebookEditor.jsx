import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Button, QuietButton } from '../../ui';
import HighlightBlock from '../../blocks/HighlightBlock';
import InsertHighlightModal from './InsertHighlightModal';
import InsertReferenceModal from './InsertReferenceModal';
import useHighlights from '../../../hooks/useHighlights';
import useArticles from '../../../hooks/useArticles';
import useConcepts from '../../../hooks/useConcepts';
import useQuestions from '../../../hooks/useQuestions';
import { buildDocFromBlocks, ensureBlockIds, serializeBlocksFromDoc } from '../../../utils/notebookBlocks';

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

const ReferenceCard = ({ label, title, meta, href }) => (
  <div className="notebook-ref-card">
    <div className="notebook-ref-label">{label}</div>
    {href ? (
      <a className="notebook-ref-title" href={href}>{title}</a>
    ) : (
      <div className="notebook-ref-title">{title}</div>
    )}
    {meta ? <div className="notebook-ref-meta">{meta}</div> : null}
  </div>
);

const createReferenceNode = ({ name, label, idKey, titleKey, metaKey, buildHref }) => Node.create({
  name,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      [idKey]: {
        default: null,
        parseHTML: element => element.getAttribute(`data-${idKey}`),
        renderHTML: attributes => (
          attributes[idKey] ? { [`data-${idKey}`]: attributes[idKey] } : {}
        )
      },
      [titleKey]: {
        default: '',
        parseHTML: element => element.getAttribute(`data-${titleKey}`) || '',
        renderHTML: attributes => (
          attributes[titleKey] ? { [`data-${titleKey}`]: attributes[titleKey] } : {}
        )
      },
      [metaKey]: {
        default: '',
        parseHTML: element => element.getAttribute(`data-${metaKey}`) || '',
        renderHTML: attributes => (
          attributes[metaKey] ? { [`data-${metaKey}`]: attributes[metaKey] } : {}
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
      { tag: `div[data-${idKey}]` }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node }) => {
      const title = node.attrs[titleKey] || 'Untitled';
      const meta = metaKey ? node.attrs[metaKey] : '';
      const href = buildHref ? buildHref(node.attrs) : '';
      return (
        <NodeViewWrapper className="notebook-ref-node" contentEditable={false}>
          <ReferenceCard label={label} title={title} meta={meta} href={href} />
        </NodeViewWrapper>
      );
    });
  }
});

const ArticleRefNode = createReferenceNode({
  name: 'articleRef',
  label: 'Article',
  idKey: 'articleId',
  titleKey: 'articleTitle',
  metaKey: 'articleMeta',
  buildHref: (attrs) => (attrs.articleId ? `/articles/${attrs.articleId}` : '')
});

const ConceptRefNode = createReferenceNode({
  name: 'conceptRef',
  label: 'Concept',
  idKey: 'conceptId',
  titleKey: 'conceptName',
  metaKey: 'conceptMeta',
  buildHref: (attrs) => (attrs.conceptName ? `/think?tab=concepts&concept=${encodeURIComponent(attrs.conceptName)}` : '')
});

const QuestionRefNode = createReferenceNode({
  name: 'questionRef',
  label: 'Question',
  idKey: 'questionId',
  titleKey: 'questionText',
  metaKey: 'questionMeta',
  buildHref: (attrs) => (attrs.questionId ? `/think?tab=questions&questionId=${attrs.questionId}` : '')
});

const NotebookEditor = ({
  entry,
  saving,
  error,
  onSave,
  onDelete,
  onRegisterInsert,
  onCreate,
  onSynthesize,
  onDump
}) => {
  const [titleDraft, setTitleDraft] = useState(entry?.title || '');
  const [insertMode, setInsertMode] = useState('');
  const { highlights, highlightMap, loading: highlightsLoading, error: highlightsError } = useHighlights();
  const { articles } = useArticles({ enabled: insertMode === 'article' });
  const { concepts } = useConcepts();
  const { questions } = useQuestions({ status: 'open', enabled: insertMode === 'question' });
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
      highlightExtension,
      ArticleRefNode,
      ConceptRefNode,
      QuestionRefNode
    ],
    content: entry?.blocks?.length ? buildDocFromBlocks(entry.blocks) : (entry?.content || '<p></p>'),
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
      const content = entry.blocks?.length ? buildDocFromBlocks(entry.blocks) : (entry.content || '<p></p>');
      editor.commands.setContent(content, false);
    }
  }, [entry, editor]);

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

  const handleInsertArticle = (article) => {
    if (!editor) return;
    editor.commands.insertContent({
      type: 'articleRef',
      attrs: {
        articleId: article._id,
        articleTitle: article.title || 'Untitled article',
        articleMeta: article.source || '',
        blockId: createId()
      }
    });
  };

  const handleInsertConcept = (concept) => {
    if (!editor) return;
    editor.commands.insertContent({
      type: 'conceptRef',
      attrs: {
        conceptId: concept._id || '',
        conceptName: concept.name || 'Concept',
        conceptMeta: concept.description || '',
        blockId: createId()
      }
    });
  };

  const handleInsertQuestion = (question) => {
    if (!editor) return;
    editor.commands.insertContent({
      type: 'questionRef',
      attrs: {
        questionId: question._id,
        questionText: question.text || 'Question',
        questionMeta: question.linkedTagName || question.conceptName || '',
        blockId: createId()
      }
    });
  };

  const handleExport = async () => {
    if (!entry?._id) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/export/notebook/${entry._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Failed to export notebook entry.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${entry.title || 'notebook-entry'}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  if (!entry) {
    return (
      <div className="think-notebook-editor think-notebook-editor--empty">
        <p className="muted small">Select a note to start editing.</p>
        {onCreate && (
          <Button variant="secondary" onClick={onCreate}>
            New note
          </Button>
        )}
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
          <div className="think-notebook-editor-actions-left">
            {onCreate && (
              <Button variant="secondary" onClick={onCreate}>
                New note
              </Button>
            )}
            <div className="notebook-insert-group">
              <div className="notebook-insert-labels">
                <span className="notebook-insert-label">Insert blocks</span>
                <span className="notebook-insert-hint">Highlights, articles, concepts, questions</span>
              </div>
              <div className="notebook-insert-buttons">
                <QuietButton
                  className={insertMode === 'highlight' ? 'is-active' : ''}
                  onClick={() => setInsertMode('highlight')}
                >
                  Highlight
                </QuietButton>
                <QuietButton
                  className={insertMode === 'article' ? 'is-active' : ''}
                  onClick={() => setInsertMode('article')}
                >
                  Article
                </QuietButton>
                <QuietButton
                  className={insertMode === 'concept' ? 'is-active' : ''}
                  onClick={() => setInsertMode('concept')}
                >
                  Concept
                </QuietButton>
                <QuietButton
                  className={insertMode === 'question' ? 'is-active' : ''}
                  onClick={() => setInsertMode('question')}
                >
                  Question
                </QuietButton>
              </div>
            </div>
          </div>
          <div className="think-notebook-editor-actions-right">
            <QuietButton onClick={handleExport}>Export</QuietButton>
            {onDump && (
              <QuietButton onClick={onDump}>Dump to Working Memory</QuietButton>
            )}
            {onSynthesize && (
              <QuietButton onClick={() => onSynthesize(entry)}>Synthesize</QuietButton>
            )}
            <QuietButton onClick={() => onDelete(entry)} disabled={saving}>Delete</QuietButton>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
      {error && <p className="status-message error-message">{error}</p>}
      {editor && <EditorContent editor={editor} />}
      <InsertHighlightModal
        open={insertMode === 'highlight'}
        highlights={highlights}
        loading={highlightsLoading}
        error={highlightsError}
        onClose={() => setInsertMode('')}
        onSelect={(highlight) => {
          handleInsertHighlight(highlight);
          setInsertMode('');
        }}
      />
      <InsertReferenceModal
        open={insertMode === 'article'}
        title="Insert Article"
        subtitle="Search by title."
        items={articles}
        getLabel={(item) => item.title || 'Untitled article'}
        getMeta={(item) => item.source || ''}
        placeholder="Search articles..."
        onClose={() => setInsertMode('')}
        onSelect={(item) => {
          handleInsertArticle(item);
          setInsertMode('');
        }}
      />
      <InsertReferenceModal
        open={insertMode === 'concept'}
        title="Insert Concept"
        subtitle="Search by name or description."
        items={concepts}
        getLabel={(item) => item.name || 'Concept'}
        getMeta={(item) => item.description || ''}
        placeholder="Search concepts..."
        onClose={() => setInsertMode('')}
        onSelect={(item) => {
          handleInsertConcept(item);
          setInsertMode('');
        }}
      />
      <InsertReferenceModal
        open={insertMode === 'question'}
        title="Insert Question"
        subtitle="Search open questions."
        items={questions}
        getLabel={(item) => item.text || 'Question'}
        getMeta={(item) => item.linkedTagName || item.conceptName || ''}
        placeholder="Search questions..."
        onClose={() => setInsertMode('')}
        onSelect={(item) => {
          handleInsertQuestion(item);
          setInsertMode('');
        }}
      />
    </div>
  );
};

export default NotebookEditor;
