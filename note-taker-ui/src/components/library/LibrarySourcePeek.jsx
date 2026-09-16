import React, { useEffect, useState } from 'react';
import { getLibraryPeek } from '../../api/libraryCollection';
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

export default function LibrarySourcePeek({ row, onRead, onPlace, onMove }) {
  const [state, setState] = useState({ loading: true });
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    getLibraryPeek(row._id)
      .then((article) => {
        if (active)
          setState({ ...sourcePassage(article, row), loading: false });
      })
      .catch(() => {
        if (active)
          setState({
            error: 'This source could not open. Please retry.',
            loading: false
          });
      });
    return () => {
      active = false;
    };
  }, [row, attempt]);
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
    <div className="library-inline-peek" id={`peek-${row._id}`}>
      {state.loading ? (
        <p role="status">Opening this source…</p>
      ) : state.error ? (
        <p role="alert">
          {state.error}{' '}
          <button onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : (
        <>
          <p className="library-row-label">
            {state.readable
              ? 'Inside this source'
              : 'Link saved · text unavailable'}
          </p>
          {state.anchor ? (
            <blockquote>{state.anchor.text}</blockquote>
          ) : (
            <p>
              Readable source text is unavailable. The saved source record is
              still here.
            </p>
          )}
          {state.highlight?.note ? (
            <p className="library-peek-thought">
              <span>Your thought</span>
              {state.highlight.note}
            </p>
          ) : null}
          <div className="library-peek-actions">
            <button
              onClick={() =>
                onRead(
                  row,
                  state.anchor
                    ? {
                        anchor: state.anchor,
                        highlightId: state.highlight?._id,
                        thought: Boolean(state.highlight?.note)
                      }
                    : {}
                )
              }
            >
              {state.anchor ? 'Read from here →' : 'Open source record →'}
            </button>
            <button disabled={busy} onClick={() => place('later')}>
              Later
            </button>
            <button onClick={() => onMove(row)}>File on a shelf…</button>
          </div>
          {receipt ? (
            <p className="library-placement-receipt" role="status">
              {receipt.error ||
                (receipt.next === 'later'
                  ? 'In Later. Still in your collection.'
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
    </div>
  );
}
