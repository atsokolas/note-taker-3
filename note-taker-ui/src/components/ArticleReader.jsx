import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { QuietButton } from './ui';
import { createHighlight } from '../api/highlights';
import useTourSignal from '../tour/useTourSignal';
import useTextSelection from './reader/useTextSelection';
import SelectionMenu from './reader/SelectionMenu';
import MagneticReadingRail from './reader/MagneticReadingRail';
import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';
import { renderArticleContentWithHighlights } from '../utils/highlightMarkup';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const parseTags = (value) => {
  const seen = new Set();
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
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
  onOpenConcept,
  onOpenNotebook,
  onOpenQuestion,
  onDumpToWorkingMemory
}, ref) => {
  const contentRef = useRef(null);
  const readerRootRef = useRef(null);
  const menuRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const [draftColor, setDraftColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [draftTagsInput, setDraftTagsInput] = useState('');
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
    setDraftTagsInput('');
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
    if (!article || !selectionState.text) return;
    const highlightText = selectionState.text;
    const highlightAnchor = selectionState.anchor;
    const draftTags = parseTags(draftTagsInput);
    setSaveError('');
    setSaving(true);
    const tempId = `temp-${Date.now()}`;
    const optimisticHighlight = {
      _id: tempId,
      text: highlightText,
      tags: draftTags,
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
        tags: draftTags,
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
          tagInput={draftTagsInput}
          saving={saving}
          onColorChange={setDraftColor}
          onTagInputChange={setDraftTagsInput}
          onHighlight={handleCreateHighlight}
          onAddNotebook={() => handleSaveAndOpen(onOpenNotebook, 'Add to Notebook is unavailable here.')}
          onAddConcept={() => handleSaveAndOpen(onOpenConcept, 'Add to Concept is unavailable here.')}
          onAddQuestion={() => handleSaveAndOpen(onOpenQuestion, 'Add to Question is unavailable here.')}
          onAddDump={() => handleSaveAndOpen(onDumpToWorkingMemory, 'Dump is unavailable here.')}
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
      <MagneticReadingRail rootRef={readerRootRef} contentRef={contentRef} />
      {saveError && <p className="status-message error-message">{saveError}</p>}
    </div>
  );
});

export default ArticleReader;
