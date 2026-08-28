import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui';
import { buildDossierCaseCover } from './wikiDossierCaseCoverModel';
import '../../styles/wiki-dossier-case-cover.css';

const WikiDossierCaseCover = ({
  page,
  pageId,
  shareBlocked = false,
  maintenanceActive = false,
  judgmentTrackBusy = false,
  judgmentTrackStatus = '',
  onMaintain,
  onTrackInJudgment
}) => {
  const cover = useMemo(
    () => buildDossierCaseCover({ page, shareBlocked }),
    [page, shareBlocked]
  );
  const reviewPending = cover.research.action === 'review';

  return (
    <section className="wiki-dossier-cover" aria-labelledby="wiki-dossier-cover-title">
      <div className="wiki-dossier-cover__heading">
        <div>
          <p className="wiki-dossier-cover__eyebrow">Investment dossier · case cover</p>
          <h2 id="wiki-dossier-cover-title">{cover.research.value}</h2>
          <p>{cover.research.detail}</p>
        </div>
        <div className="wiki-dossier-cover__actions">
          {reviewPending ? (
            <a className="wiki-dossier-cover__primary" href="#wiki-dossier-review">Review research update</a>
          ) : (
            <Button type="button" variant="secondary" onClick={onMaintain} disabled={maintenanceActive}>
              {maintenanceActive ? 'Checking research…' : 'Check for research updates'}
            </Button>
          )}
          {cover.tracked ? (
            <Link to={`/judgment/${pageId}`}>Open company case →</Link>
          ) : (
            <button
              className="wiki-dossier-cover__text-action"
              type="button"
              onClick={onTrackInJudgment}
              disabled={judgmentTrackBusy}
            >
              {judgmentTrackBusy ? 'Tracking…' : 'Track in Judgment'}
            </button>
          )}
        </div>
      </div>
      <dl className="wiki-dossier-cover__facts">
        {cover.facts.map(fact => (
          <div key={fact.id} className={fact.tone === 'attention' ? 'is-attention' : ''}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
            <small>{fact.detail}</small>
          </div>
        ))}
      </dl>
      {judgmentTrackStatus ? <p className="wiki-dossier-cover__status" role="alert">{judgmentTrackStatus}</p> : null}
    </section>
  );
};

export default WikiDossierCaseCover;
