import React, { useEffect, useMemo, useRef } from 'react';

const dateLabel = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
};

const accountDates = account => [
  ['Observed', account.observedAt],
  ['Published', account.publishedAt],
  ['Available', account.availableAt],
  ['Source updated', account.sourceUpdatedAt],
  ['Recorded here', account.recordedAt]
].filter(([, value]) => value);

const allFamilies = lineage => [
  ...(Array.isArray(lineage?.families) ? lineage.families : []),
  ...(Array.isArray(lineage?.proposals) ? lineage.proposals : [])
];

const JudgmentObservationLineage = ({
  lineage,
  mode = 'lineage',
  accountId = '',
  returnAccountId = '',
  busyFamilyId = '',
  onBack,
  onOpenAccount,
  onReviewProposal
}) => {
  const accountRefs = useRef(new Map());
  const backRef = useRef(null);
  const families = useMemo(() => allFamilies(lineage), [lineage]);
  const account = useMemo(() => families
    .flatMap(family => family.accounts || [])
    .find(item => String(item.sourceEventId) === String(accountId)), [accountId, families]);

  useEffect(() => {
    const target = mode === 'lineage' && returnAccountId
      ? accountRefs.current.get(String(returnAccountId))
      : backRef.current;
    target?.focus({ preventScroll: true });
  }, [mode, returnAccountId]);

  if (mode === 'account') {
    return (
      <div className="judgment-observation-lineage judgment-observation-lineage--account">
        <button ref={backRef} type="button" className="judgment-context__back" onClick={onBack}>Back to common origin</button>
        {account ? (
          <article>
            <p className="judgment-research-review__eyebrow">{account.role === 'origin' ? 'Original account' : 'Related account'}</p>
            <h3>{account.title || 'Untitled source account'}</h3>
            {account.sourceVersion ? <p className="judgment-observation-lineage__version">Source version {account.sourceVersion}</p> : null}
            {account.excerpt ? <blockquote>{account.excerpt}</blockquote> : account.summary ? <p>{account.summary}</p> : (
              <p className="judgment-observation-lineage__missing">The retained source event has no inspectable text.</p>
            )}
            {account.note ? <p>{account.note}</p> : null}
            {accountDates(account).length ? (
              <dl>
                {accountDates(account).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{dateLabel(value)}</dd></div>
                ))}
              </dl>
            ) : <p className="judgment-observation-lineage__missing">No source dates were retained.</p>}
            {account.url ? <a href={account.url} target="_blank" rel="noreferrer">Open this source account</a> : null}
          </article>
        ) : <p role="alert">That source account is no longer available to this owner.</p>}
      </div>
    );
  }

  return (
    <div className="judgment-observation-lineage">
      <button ref={backRef} type="button" className="judgment-context__back" onClick={onBack}>Back to response</button>
      <header>
        <p className="judgment-research-review__eyebrow">Recorded common origin</p>
        <h3>{lineage?.state === 'mixed' ? 'Several origins remain distinct' : 'The accounts of this observation'}</h3>
        <p>These relationships were recorded explicitly. Opening an account changes nothing in the case.</p>
      </header>
      {(lineage?.families || []).map(family => (
        <section key={family.familyId}>
          <h4>{family.label || 'Recorded observation family'}</h4>
          <p>{family.documentCount} {family.documentCount === 1 ? 'document' : 'documents'}{family.partial ? ' · partial access' : ''}</p>
          <ol>
            {(family.accounts || []).map(item => (
              <li key={`${family.familyId}:${item.sourceEventId}`}>
                <button
                  ref={node => {
                    if (node) accountRefs.current.set(String(item.sourceEventId), node);
                    else accountRefs.current.delete(String(item.sourceEventId));
                  }}
                  type="button"
                  onClick={() => onOpenAccount(item.sourceEventId)}
                >
                  <span>{item.title || 'Untitled source account'}</span>
                  <small>{item.role === 'origin' ? 'original account' : item.role}</small>
                </button>
              </li>
            ))}
          </ol>
          {family.unavailableCount ? <p>{family.unavailableCount} additional {family.unavailableCount === 1 ? 'account is' : 'accounts are'} unavailable.</p> : null}
        </section>
      ))}
      {(lineage?.proposals || []).length ? (
        <section className="judgment-observation-lineage__proposed">
          <h4>Proposed relationships</h4>
          <p>These have not been accepted as a common origin.</p>
          {(lineage.proposals || []).map(family => (
            <div key={family.familyId} className="judgment-observation-lineage__proposal">
              <p>{family.label || 'Unnamed proposed relationship'} · {family.documentCount} documents</p>
              <span>
                <button
                  type="button"
                  disabled={busyFamilyId === family.familyId}
                  onClick={() => onReviewProposal?.(family, 'accept')}
                >Keep common origin</button>
                <button
                  type="button"
                  disabled={busyFamilyId === family.familyId}
                  onClick={() => onReviewProposal?.(family, 'reject')}
                >Leave separate</button>
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
};

export default JudgmentObservationLineage;
