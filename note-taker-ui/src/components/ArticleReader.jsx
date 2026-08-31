import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuietButton } from './ui';
import { createHighlight } from '../api/highlights';
import { listWikiPages } from '../api/wiki';
import EvergreenToggle from './EvergreenToggle';
import PlacementWord from './PlacementWord';
import useTourSignal from '../tour/useTourSignal';
import useTextSelection from './reader/useTextSelection';
import SelectionMenu from './reader/SelectionMenu';
import MagneticReadingRail from './reader/MagneticReadingRail';
import PassageDoor from './reader/PassageDoorView';
import {
  connectedJudgmentIds,
  pickFolioLine,
  rememberOpenedJudgment
} from './reader/folioModel';
import { handOffSentence, takeFirstPaint } from '../motion/columnMotion';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';
import { placementOf } from '../pages/placementModel';
import { renderArticleContentWithHighlights } from '../utils/highlightMarkup';
import { findExistingHighlightForSelection } from '../utils/libraryThinkSeam';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const hasReadableContent = (value) => String(value || '').replace(/<[^>]*>/g, '').trim().length > 0;

const highlightIdsOf = (highlights = []) => (
  (Array.isArray(highlights) ? highlights : [])
    .map((item) => String(item?._id || item?.id || '').trim())
    .filter(Boolean)
);

const ArticleFolioLine = ({ line, articleId }) => {
  const reduced = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const arriving = useMemo(
    () => Boolean(articleId) && takeFirstPaint(`article-folio:${articleId}`),
    [articleId]
  );
  if (!line?.text || !line?.href) return null;
  const motion = arriving
    ? (reduced || !finePointer ? ' is-arriving is-reduced' : ' is-arriving')
    : '';
  return (
    <Link
      to={line.href}
      className={`article-folio${motion}`}
      data-testid="article-folio"
      onClick={(event) => {
        rememberOpenedJudgment(line.id);
        handOffSentence(line.text, event.currentTarget);
      }}
    >
      {line.text}
    </Link>
  );
};

const ArticleReader = ({
  article,
  highlights = [],
  focusedHighlightId = '',
  graphConnections = null,
  preferredClaimId = '',
  onMove,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove,
  onAskLibrarian,
  onToggleEvergreen,
  onTogglePlacement,
  sourceTrace = null
}) => {
  const contentRef = useRef(null);
  const readerRootRef = useRef(null);
  const menuRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  /* Kept lives here rather than being read straight off the prop, so pressing
     it settles immediately instead of waiting for the article list to refetch.
     It resets when a different source is opened. */
  const [kept, setKept] = useState(Boolean(article?.evergreen));
  const [placement, setPlacement] = useState(() => placementOf(article));
  const [folioPages, setFolioPages] = useState([]);
  useEffect(() => { setKept(Boolean(article?.evergreen)); }, [article?._id, article?.evergreen]);
  useEffect(() => { setPlacement(placementOf(article)); }, [article?._id, article?.placement]);
  useEffect(() => {
    const articleId = article?._id;
    const replacePages = (next) => {
      setFolioPages((current) => (current.length || next.length ? next : current));
    };
    if (!articleId) {
      replacePages([]);
      return undefined;
    }
    let cancelled = false;
    replacePages([]);
    listWikiPages({ limit: 500, summary: 1 })
      .then((pages) => {
        if (!cancelled) replacePages(Array.isArray(pages) ? pages : []);
      })
      .catch(() => {
        if (!cancelled) replacePages([]);
      });
    return () => { cancelled = true; };
  }, [article?._id]);
  const fireTourSignal = useTourSignal();
  const html = useMemo(
    () => renderArticleContentWithHighlights(article, highlights),
    [article, highlights]
  );
  const contentMarkup = useMemo(() => ({ __html: html }), [html]);
  const focusedHighlight = useMemo(() => (
    highlights.find((item) => String(item?._id || item?.id || '') === String(focusedHighlightId)) || null
  ), [focusedHighlightId, highlights]);
  const focusedPassageIsInArticle = Boolean(focusedHighlightId)
    && html.includes(`data-highlight-id="highlight-${focusedHighlightId}"`);
  const isHighlightOnlyImport = Boolean(article)
    && !hasReadableContent(article.content)
    && Array.isArray(highlights)
    && highlights.length > 0;
  const focusedPassage = focusedHighlight && !focusedPassageIsInArticle && !isHighlightOnlyImport
    ? focusedHighlight
    : null;
  const { selectionState, clearSelection } = useTextSelection({
    containerRef: contentRef,
    menuRef
  });
  const selectionKey = `${selectionState.text || ''}:${selectionState.anchor?.startOffsetApprox ?? ''}`;
  const folioLine = useMemo(() => pickFolioLine(folioPages, {
    articleId: article?._id,
    highlightIds: highlightIdsOf(highlights),
    connectedPageIds: connectedJudgmentIds(graphConnections),
    preferredId: preferredClaimId,
    search: typeof window === 'undefined' ? '' : window.location.search
  }), [article?._id, folioPages, graphConnections, highlights, preferredClaimId]);
  const passageDoorFor = (highlight, index) => {
    const highlightId = highlight?._id || highlight?.id || '';
    if (!highlightId) return null;
    return (
      <PassageDoor
        key={`passage-door-${highlightId}-${index}`}
        articleId={article?._id || ''}
        highlightId={highlightId}
        pages={folioPages}
        preferredId={preferredClaimId}
        text={highlight?.text || ''}
      />
    );
  };

  useEffect(() => {
    if (!selectionState.isOpen) return;
    setSaveError('');
  }, [selectionKey, selectionState.isOpen]);

  useEffect(() => {
    if (!focusedHighlightId || !readerRootRef.current) return undefined;
    const target = readerRootRef.current.querySelector(
      `[data-highlight-id="highlight-${focusedHighlightId}"]`
    );
    if (!target) return undefined;
    target.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    target.classList.add('is-cited-passage');
    const timeout = window.setTimeout(() => target.classList.remove('is-cited-passage'), 1600);
    return () => window.clearTimeout(timeout);
  }, [focusedHighlightId, focusedPassage, html, reducedMotion]);

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
      color: DEFAULT_HIGHLIGHT_COLOR,
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
        color: DEFAULT_HIGHLIGHT_COLOR
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
          saving={saving}
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
          {folioLine ? <ArticleFolioLine line={folioLine} articleId={article._id} /> : null}
        </div>
        {/* Keeping a source for life is something you do to it, so it sits
            with the other thing you can do to it. In the meta line it was a
            grey word between a date and a link, reading as another label
            rather than an action — findable only if you already knew it was
            there. */}
        <div className="article-reader-decisions">
          {onTogglePlacement ? (
            <PlacementWord
              placement="later"
              active={placement === 'later'}
              onChange={async (next) => {
                const saved = await onTogglePlacement(article._id, next);
                setPlacement(placementOf({ placement: saved?.placement ?? next }));
              }}
            />
          ) : null}
          {onTogglePlacement ? (
            <PlacementWord
              placement="setAside"
              active={placement === 'setAside'}
              onChange={async (next) => {
                const saved = await onTogglePlacement(article._id, next);
                setPlacement(placementOf({ placement: saved?.placement ?? next }));
              }}
            />
          ) : null}
          {onToggleEvergreen ? (
            <EvergreenToggle
              evergreen={kept}
              label={kept ? 'Kept for good' : 'Keep for good'}
              onChange={async (next) => {
                const saved = await onToggleEvergreen(article._id, next);
                setKept(Boolean(saved?.evergreen ?? next));
              }}
            />
          ) : null}
          {onMove && (
            <QuietButton onClick={onMove}>
              Move
            </QuietButton>
          )}
        </div>
      </div>
      {focusedPassage ? (
        <aside
          className="article-cited-passage"
          data-highlight-id={`highlight-${focusedHighlightId}`}
          aria-label="Saved passage"
        >
          <span className="eyebrow">Saved passage</span>
          <blockquote>{focusedPassage.text || 'Untitled highlight'}</blockquote>
          {focusedPassage.note ? <p>{focusedPassage.note}</p> : null}
        </aside>
      ) : null}
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
                    {passageDoorFor(highlight, index)}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ) : (
        <>
          <div className="article-reader-content reader" ref={contentRef} dangerouslySetInnerHTML={contentMarkup} />
          <div className="article-passage-threads" aria-label="Connections to held judgments">
            {highlights.map(passageDoorFor)}
          </div>
        </>
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
};

export default ArticleReader;
