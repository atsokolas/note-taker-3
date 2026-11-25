import React, { useEffect, useMemo, useState } from 'react';
import { getLibraryPeek } from '../../api/libraryCollection';
import { sourceTitle } from '../../utils/sourceDisplayText';
import { sourceLabel } from './libraryColumnModel';
import { renderArticleContentWithHighlights } from '../../utils/highlightMarkup';
import { previewPassage } from '../reader/articleReadingPlace';

export const sourcePassage = (article, row) => {
  const highlights = article.highlights || [];
  const target =
    !row.match || row.match.kind === 'title' ? row.trace : row.match;
  const highlight = highlights.find(
    (item) => String(item._id) === target?.highlightId
  );
  const doc = new DOMParser().parseFromString(
    renderArticleContentWithHighlights(article, highlights),
    'text/html'
  );
  const anchor = previewPassage(doc.body, {
    readingState: row.readingState,
    query: row.match?.query,
    highlightId: target?.highlightId
  });
  return {
    anchor,
    highlight,
    readable: Boolean(
      String(article.content || '')
        .replace(/<[^>]*>/g, '')
        .trim()
    )
  };
};

export default function LibrarySourcePeek({ row, onRead, onPlace, onMove, onClose }) {
  const { _id } = row;
  const [article, setArticle] = useState(null);
  const [error, setError] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    getLibraryPeek(_id)
      .then((source) => {
        if (!source) throw new Error('Missing source');
        if (active) setArticle(source);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [_id, attempt]);
  const passage = useMemo(() => article ? sourcePassage(article, row) : null, [article, row]);
  const label = sourceLabel(row);
  const place = async (next) => {
    setBusy(true);
    try {
      await onPlace(row._id, next);
      setReceipt(
        receipt?.previous === next ? null : { previous: row.placement, next }
      );
    } catch (_) {
      setReceipt({ error: 'That did not move. Please retry.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="library-catalogue-preview" id={`peek-${_id}`} tabIndex={-1} aria-labelledby={`peek-title-${_id}`}>
      <header>
        <span className="library-row-label">Source preview</span>
        <button type="button" className="library-peek-trigger" onClick={onClose}>Close preview</button>
      </header>
      <h2 id={`peek-title-${_id}`}>{sourceTitle(row)}</h2>
      {label ? <p className="library-source-meta">{label}</p> : null}
      {error ? (
        <p role="alert">
          This source could not open. Please retry.{' '}
          <button onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : !passage ? <p role="status">Opening this source…</p> : (
        <>
          {!passage.readable ? <p className="library-row-label">Link saved, but the page’s text couldn’t be read</p> : null}
          {passage.anchor ? (
            <blockquote>{passage.anchor.text}</blockquote>
          ) : (
            <p>
              Open the original to read it.
            </p>
          )}
          {passage.highlight?.note ? (
            <p className="library-peek-thought">
              <span>Your thought</span>
              {passage.highlight.note}
            </p>
          ) : null}
          <div className="library-peek-actions">
            <button
              onClick={() =>
                onRead(
                  row,
                  passage.anchor || passage.highlight
                    ? {
                        anchor: passage.anchor,
                        highlightId: passage.highlight?._id,
                        thought: Boolean(passage.highlight?.note)
                      }
                    : {}
                )
              }
            >
              {passage.anchor ? 'Read from here →' : passage.highlight ? 'Open mark →' : 'Details →'}
            </button>
            <button disabled={busy} onClick={() => place('later')}>
              Nightstand
            </button>
            <button onClick={() => onMove(row)}>File on a shelf…</button>
          </div>
          {receipt ? (
            <p className="library-placement-receipt" role="status">
              {receipt.error ||
                (receipt.next === 'later'
                  ? 'On your nightstand. Still in your collection.'
                  : 'Back in your collection.')}
              {!receipt.error ? (
                <button
                  disabled={busy}
                  onClick={() => place(receipt.previous || 'stream')}
                >
                  Undo
                </button>
              ) : null}
            </p>
          ) : null}
        </>
      )}
    </aside>
  );
}
