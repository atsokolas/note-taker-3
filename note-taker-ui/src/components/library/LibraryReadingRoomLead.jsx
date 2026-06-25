import React, { useMemo } from 'react';
import { QuietButton } from '../ui';
import {
  buildMaintenanceSummary,
  composeReopenLead,
  countSuppressedInCollection,
  pickReopenCandidate
} from './libraryReadingRoomModel';

const LibraryReadingRoomLead = ({
  articles = [],
  allArticles = [],
  unfiledCount = 0,
  suppressedVisible = false,
  onSelectArticle,
  onReviewFiling,
  filingLaunching = false,
  filingReceipt = null,
  onToggleSuppressed
}) => {
  const reopen = useMemo(() => {
    const candidate = pickReopenCandidate(allArticles.length ? allArticles : articles);
    return composeReopenLead(candidate);
  }, [allArticles, articles]);

  const maintenance = useMemo(
    () => buildMaintenanceSummary({
      allArticles: allArticles.length ? allArticles : articles,
      unfiledCount,
      suppressedCount: countSuppressedInCollection(allArticles.length ? allArticles : articles)
    }),
    [allArticles, articles, unfiledCount]
  );

  return (
    <section className="library-reading-room-lead" aria-label="Reading room">
      <div className="library-reading-room-lead__hero">
        <span className="library-reading-room-lead__eyebrow">Worth reopening</span>
        {reopen.articleId ? (
          <button
            type="button"
            className="library-reading-room-lead__headline"
            aria-label={`Open in Reading Room: ${reopen.headline}`}
            data-testid="library-reopen-headline"
            onClick={() => onSelectArticle?.(reopen.articleId)}
          >
            {reopen.headline}
          </button>
        ) : (
          <h2 className="library-reading-room-lead__headline is-static">{reopen.headline}</h2>
        )}
        <p className="library-reading-room-lead__detail">{reopen.detail}</p>
        {reopen.articleId ? (
          <QuietButton
            type="button"
            className="library-reading-room-lead__open"
            aria-label="Open in Reading Room"
            data-testid="library-open-reading-room"
            onClick={() => onSelectArticle?.(reopen.articleId)}
          >
            Open in reading room
          </QuietButton>
        ) : null}
      </div>

      <aside
        className="library-reading-room-lead__maintenance library-reading-room-lead__maintenance-strip"
        data-maintenance-state={maintenance.status}
        aria-label="Corpus maintenance"
      >
        <div className="library-reading-room-lead__maintenance-copy">
          <span className="library-reading-room-lead__maintenance-label">Corpus maintenance</span>
          <p>{maintenance.message}</p>
        </div>
        <div className="library-reading-room-lead__stats" aria-label="Library maintenance counts">
          <span>{maintenance.total} sources</span>
          <span>{maintenance.unfiled} unfiled</span>
          {maintenance.readyToClassify > 0 ? (
            <span>{maintenance.readyToClassify} ready to classify</span>
          ) : null}
        </div>
        {maintenance.actionLabel ? (
          <QuietButton
            type="button"
            className="library-reading-room-lead__filing-action"
            onClick={onReviewFiling}
            disabled={filingLaunching}
          >
            {filingLaunching ? 'Classifying…' : maintenance.actionLabel}
          </QuietButton>
        ) : null}
        {filingReceipt?.summary ? (
          <p
            className="library-reading-room-lead__filing-receipt muted small"
            data-testid="library-filing-receipt"
            data-filing-stage={filingReceipt.stage || 'ready'}
          >
            {filingReceipt.summary}
          </p>
        ) : null}
        {maintenance.cruftNotice || suppressedVisible ? (
          <div className="library-reading-room-lead__cruft">
            {maintenance.cruftNotice ? (
              <p className="library-reading-room-lead__cruft-notice muted small" data-testid="library-cruft-notice">
                {maintenance.cruftNotice}
              </p>
            ) : suppressedVisible ? (
              <p className="library-reading-room-lead__cruft-notice muted small" data-testid="library-cruft-notice">
                Showing low-signal items for review.
              </p>
            ) : null}
            {onToggleSuppressed ? (
              <QuietButton
                type="button"
                className="library-reading-room-lead__suppressed-action"
                onClick={onToggleSuppressed}
              >
                {suppressedVisible ? 'Hide low-signal items' : 'Show low-signal items'}
              </QuietButton>
            ) : null}
          </div>
        ) : null}
      </aside>
    </section>
  );
};

export default React.memo(LibraryReadingRoomLead);
