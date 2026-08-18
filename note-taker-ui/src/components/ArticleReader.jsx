import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { QuietButton } from './ui';
import { createHighlight } from '../api/highlights';
import useTourSignal from '../tour/useTourSignal';
import useTextSelection from './reader/useTextSelection';
import SelectionMenu from './reader/SelectionMenu';
import MagneticReadingRail from './reader/MagneticReadingRail';
import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';
import { renderArticleContentWithHighlights } from '../utils/highlightMarkup';
import { findExistingHighlightForSelection } from '../utils/libraryThinkSeam';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const hasReadableContent = (value) => String(value || '').replace(/<[^>]*>/g, '').trim().length > 0;

const ArticleReader = forwardRef(({
  article,
  highlights = [],
  graphConnections = null,
  onMove,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove,
  onAskLibrarian,
  sourceTrace = null
}, ref) => {
  const contentRef = useRef(null);
  const readerRootRef = useRef(null);
  const menuRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const [draftColor, setDraftColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [saving, setSaving] = useState(false);
  const fireTourSignal = useTourSignal();
  const html = useMemo(
    () => renderArticleContentWithHighlights(article, highlights),
    [article, highlights]
  );
  const contentMarkup = useMemo(() => ({ __html: html }), [html]);
  const isHighlightOnlyImport = Boolean(article)
    && !hasReadableContent(article.content)
    && Array.isArray(highlights)
    && highlights.length > 0;
  const { selectionState, clearSelection } = useTextSelection({
    containerRef: contentRef,
    menuRef
  });
  const selectionKey = `${selectionState.text || ''}:${selectionState.anchor?.startOffsetApprox ?? ''}`;

  useEffect(() => {
    if (!selectionState.isOpen) return;
    setDraftColor(DEFAULT_HIGHLIGHT_COLOR);
    setSaveError('');
  }, [selectionKey, selectionState.isOpen]);

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

  const persistHighlight = async (afterSave) => {
    /* This used to return in silence. Pressing Highlight then did nothing at
       all: the menu stayed open, no request was made, and the console stayed
       empty — which is indistinguishable from a dead button. Whatever the
       cause, the reader should be told rather than left guessing. */
    if (!article || !selectionState.text) {
      setSaveError('That selection was lost before it could be saved. Select the sentence again.');
      return;
    }
    const highlightText = selectionState.text;
    const highlightAnchor = selectionState.anchor;
    const existingHighlight = findExistingHighlightForSelection({
      highlights,
      text: highlightText,
      anchor: highlightAnchor
    });
    if (existingHighlight) {
      clearSelection();
      afterSave?.(existingHighlight);
      return;
    }
    setSaveError('');
    setSaving(true);
    const tempId = `temp-${Date.now()}`;
    const optimisticHighlight = {
      _id: tempId,
      text: highlightText,
      tags: [],
      color: draftColor,
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
        anchor: highlightAnchor,
        color: draftColor
      });
      if (created?._id) {
        const normalizedCreated = {
          ...optimisticHighlight,
          ...created,
          _id: created._id
        };
        onHighlightReplace?.(tempId, normalizedCreated);
        afterSave?.(normalizedCreated);
        fireTourSignal('highlight_captured', { highlightId: created._id });
      } else {
        onHighlightRemove?.(tempId);
      }
    } catch (err) {
      onHighlightRemove?.(tempId);
      setSaveError(err.response?.data?.error || 'Failed to save highlight.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateHighlight = async () => {
    await persistHighlight();
  };

  const handleSaveAndOpen = async (callback, fallbackError) => {
    if (!callback) {
      setSaveError(fallbackError);
      return;
    }
    await persistHighlight(callback);
  };

  return (
    <div className="article-reader" ref={readerRootRef}>
      {selectionState.isOpen && (
        <SelectionMenu
          ref={menuRef}
          rect={selectionState.rect}
          color={draftColor}
          saving={saving}
          onColorChange={setDraftColor}
          onHighlight={handleCreateHighlight}
          onAskLibrarian={() => handleSaveAndOpen(onAskLibrarian, 'The agent is unavailable here.')}
        />
      )}
      <div className="article-reader-header">
        <div>
          <h1 className="article-reader-title">{article.title || 'Untitled article'}</h1>
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
      {isHighlightOnlyImport ? (
        <div className="article-reader-content reader article-reader-content--highlights" ref={contentRef}>
          <section className="article-highlight-edition" aria-label="Saved highlights">
            <div className="article-highlight-edition__lead">
              <span className="eyebrow">Highlight edition</span>
              <p>
                No full article text was imported for this source, so Noeis is showing the saved
                highlights as the reading body.
              </p>
            </div>
            <ol className="article-highlight-edition__list">
              {highlights.map((highlight, index) => {
                const highlightId = highlight?._id || highlight?.id || `${article?._id || 'article'}-${index}`;
                const tags = Array.isArray(highlight?.tags) ? highlight.tags.filter(Boolean) : [];
                const createdAt = formatDate(highlight?.createdAt || highlight?.highlightedAt);
                return (
                  <li
                    key={highlightId}
                    className="article-highlight-edition__item"
                    data-highlight-id={`highlight-${highlightId}`}
                  >
                    <blockquote>{highlight?.text || 'Untitled highlight'}</blockquote>
                    {(highlight?.note || createdAt || tags.length > 0) && (
                      <div className="article-highlight-edition__meta">
                        {createdAt && <span>{createdAt}</span>}
                        {tags.slice(0, 6).map(tag => <span key={`${highlightId}-${tag}`}>{tag}</span>)}
                      </div>
                    )}
                    {highlight?.note && (
                      <p className="article-highlight-edition__note">{highlight.note}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ) : (
        <div className="article-reader-content reader" ref={contentRef} dangerouslySetInnerHTML={contentMarkup} />
      )}
      {/* The source record — who wrote it, when it was saved, where else it is
          used — sat between the headline and the first paragraph, so every
          article opened onto a panel instead of onto its text. It is the same
          record; it is now at the end, where you read it after the piece
          rather than instead of starting it. */}
      {sourceTrace}
      <MagneticReadingRail rootRef={readerRootRef} contentRef={contentRef} />
      {saveError && <p className="status-message error-message">{saveError}</p>}
    </div>
  );
});

export default ArticleReader;
