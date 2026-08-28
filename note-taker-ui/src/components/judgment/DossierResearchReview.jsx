import React from 'react';
import { Link } from 'react-router-dom';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

const DossierResearchReview = ({ pageId, review, busy = false, error = '', onKeep, onRevise }) => {
  if (!review || review.status !== 'awaiting_review') return null;
  const comparison = review.provenance?.comparison || {};
  const changes = (Array.isArray(comparison.claimChanges) ? comparison.claimChanges : []).slice(0, 3);

  return (
    <section className="judgment-research-review" aria-labelledby="judgment-research-review-title">
      <p className="judgment-research-review__eyebrow">Accepted research · your view is unchanged</p>
      <h2 id="judgment-research-review-title">{clean(comparison.headline) || clean(review.title)}</h2>
      {clean(comparison.summary) ? <p>{comparison.summary}</p> : null}
      {changes.length ? (
        <ul>
          {changes.map((change, index) => (
            <li key={`${change.kind || 'change'}:${change.title || index}`}>
              <strong>{clean(change.title) || 'Decision-relevant claim changed'}</strong>
              {clean(change.detail) ? <span>{change.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {clean(comparison.expectations?.summary) ? (
        <p className="judgment-research-review__expectations">{comparison.expectations.summary}</p>
      ) : null}
      <div className="judgment-research-review__actions">
        <Link to={`/wiki/workspace?page=${encodeURIComponent(pageId)}#wiki-dossier-review`}>Read the accepted research</Link>
        <button type="button" disabled={busy} onClick={onKeep}>Keep this view</button>
        <button type="button" disabled={busy} onClick={onRevise}>Revise the view</button>
      </div>
      {error ? <p className="judgment-research-review__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default DossierResearchReview;
