import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { QuietButton } from './ui';
import { createHighlight } from '../api/highlights';
import useTextSelection from './reader/useTextSelection';
import SelectionMenu from './reader/SelectionMenu';

const processArticleContent = (article, highlights = []) => {
  if (!article?.content) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(article.content, 'text/html');

  doc.querySelectorAll('script, style, noscript').forEach(node => node.remove());

  const origin = article.url ? new URL(article.url).origin : '';
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('/') && origin) {
      img.src = `${origin}${src}`;
    }
  });

  highlights.forEach(h => {
    const highlightId = `highlight-${h._id}`;
    const escaped = h.text
      ?.trim()
      .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    if (!escaped) return;
    const regex = new RegExp(`(?<!<mark[^>]*>)${escaped}(?!<\\/mark>)`, 'gi');
    doc.body.innerHTML = doc.body.innerHTML.replace(
      regex,
      match => `<mark class="highlight" data-highlight-id="${highlightId}">${match}</mark>`
    );
  });

  return doc.body.innerHTML;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const ArticleReader = forwardRef(({
  article,
  highlights = [],
  onMove,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove
}, ref) => {
  const contentRef = useRef(null);
  const menuRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const html = useMemo(
    () => processArticleContent(article, highlights),
    [article, highlights]
  );
  const { selectionState, clearSelection } = useTextSelection({
    containerRef: contentRef,
    menuRef
  });

  useImperativeHandle(ref, () => ({
    scrollToHighlight: (highlightId) => {
      if (!contentRef.current) return;
      const target = contentRef.current.querySelector(`[data-highlight-id="highlight-${highlightId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }));

  if (!article) {
    return (
      <div className="article-reader-empty">
        <p className="muted">Select an article to start reading.</p>
      </div>
    );
  }

  const handleCreateHighlight = async () => {
    if (!article || !selectionState.text) return;
    const highlightText = selectionState.text;
    const highlightAnchor = selectionState.anchor;
    setSaveError('');
    const tempId = `temp-${Date.now()}`;
    const optimisticHighlight = {
      _id: tempId,
      text: highlightText,
      tags: [],
      articleId: article._id,
      articleTitle: article.title,
      createdAt: new Date().toISOString(),
      anchor: highlightAnchor
    };
    onHighlightOptimistic?.(optimisticHighlight);
    clearSelection();
    try {
      const created = await createHighlight({
        articleId: article._id,
        text: highlightText,
        tags: [],
        anchor: highlightAnchor
      });
      if (created?._id) {
        onHighlightReplace?.(tempId, created);
      } else {
        onHighlightRemove?.(tempId);
      }
    } catch (err) {
      onHighlightRemove?.(tempId);
      setSaveError(err.response?.data?.error || 'Failed to save highlight.');
    }
  };

  return (
    <div className="article-reader">
      {selectionState.isOpen && (
        <SelectionMenu
          ref={menuRef}
          rect={selectionState.rect}
          onHighlight={handleCreateHighlight}
          onAddNote={() => setSaveError('Add to Notebook is coming soon.')}
          onAddQuestion={() => setSaveError('Add to Question is coming soon.')}
          onAddTag={() => setSaveError('Add Tag is coming soon.')}
        />
      )}
      <div className="article-reader-header">
        <div>
          <div className="article-reader-title">{article.title || 'Untitled article'}</div>
          <div className="article-reader-meta">
            {article.createdAt && <span>{formatDate(article.createdAt)}</span>}
            {article.url && (
              <a href={article.url} target="_blank" rel="noopener noreferrer">Open source</a>
            )}
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          {onMove && (
            <QuietButton onClick={onMove}>
              Move
            </QuietButton>
          )}
        </div>
      </div>
      <div className="article-reader-content reader" ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />
      {saveError && <p className="status-message error-message">{saveError}</p>}
    </div>
  );
});

export default ArticleReader;
