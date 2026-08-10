import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConceptInvestigation } from '../../../api/concepts';
import { disposeWikiClaimRevision } from '../../../api/wikiClaimDisposition';

const safeInternalHref = value => (
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
);

const ReviewLink = ({ reference }) => {
  const label = reference?.title || 'Source evidence';
  return safeInternalHref(reference?.href)
    ? <Link to={reference.href}>{label}</Link>
    : <span>{label}</span>;
};

const ClaimDetails = ({ claim }) => {
  const hasConfidence = claim?.confidence !== null
    && claim?.confidence !== undefined
    && claim?.confidence !== ''
    && Number.isFinite(Number(claim.confidence));
  const details = [
    ['Section', claim?.section || 'Not recorded'],
    ['Support', claim?.support || 'Not recorded'],
    ['Confidence', hasConfidence ? String(claim.confidence) : 'Not recorded'],
    ['Epistemic status', claim?.epistemicStatus || 'Not recorded'],
    ['Materiality', claim?.materiality || 'Not recorded']
  ];

  return (
    <dl className="claim-revision-review__details">
      {details.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
};

const ClaimState = ({ label, claim, proposed = false }) => (
  <section className={`claim-revision-review__claim${proposed ? ' is-proposed' : ''}`}>
    <span className="claim-revision-review__label">{label}</span>
    <p>{claim?.text || 'No claim text is recorded.'}</p>
    <ClaimDetails claim={claim} />
  </section>
);

const SemanticDiff = ({ diff }) => {
  const segments = Array.isArray(diff?.segments) ? diff.segments : [];
  const changedFields = Array.isArray(diff?.changedFields) ? diff.changedFields : [];

  return (
    <section className="claim-revision-review__diff" aria-labelledby="claim-revision-diff-title">
      <div className="claim-revision-review__section-heading">
        <h4 id="claim-revision-diff-title">What changed</h4>
        {changedFields.length ? (
          <ul aria-label="Changed claim fields">
            {changedFields.map(field => <li key={field}>{field}</li>)}
          </ul>
        ) : null}
      </div>
      {segments.length ? (
        <p className="claim-revision-review__diff-copy" aria-label="Claim text changes">
          {segments.map((segment, index) => {
            const key = `${segment?.kind || 'equal'}:${index}`;
            if (segment?.kind === 'removed') return <del key={key}>{segment.text}</del>;
            if (segment?.kind === 'added') return <ins key={key}>{segment.text}</ins>;
            return <span key={key}>{segment?.text}</span>;
          })}
        </p>
      ) : <p className="claim-revision-review__quiet">No text comparison is available.</p>}
      {diff?.boundedExplanation ? (
        <p className="claim-revision-review__explanation">{diff.boundedExplanation}</p>
      ) : null}
    </section>
  );
};

const EvidenceGroup = ({ title, items = [], empty }) => (
  <section className="claim-revision-review__evidence-group">
    <header>
      <h5>{title}</h5>
      <span aria-label={`${items.length} ${title.toLowerCase()} sources`}>{items.length}</span>
    </header>
    {items.length ? (
      <ul>
        {items.map((item, index) => (
          <li key={`${item?.type || 'source'}:${item?.id || index}`}>
            <ReviewLink reference={item} />
          </li>
        ))}
      </ul>
    ) : <p className="claim-revision-review__quiet">{empty}</p>}
  </section>
);

const ReferenceList = ({ title, items = [] }) => (
  items.length ? (
    <section className="claim-revision-review__references">
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={`${item?.type || title}:${item?.id || index}`}>
            <ReviewLink reference={item} />
          </li>
        ))}
      </ul>
    </section>
  ) : null
);

const formatDeferredUntil = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const headerCopyFor = (review) => {
  const state = String(review?.state || 'pending').toLowerCase();
  switch (state) {
    case 'accepted':
      return {
        eyebrow: 'Accepted · applied',
        title: 'Claim revision accepted',
        body: 'The proposed claim is now the accepted Wiki claim.'
      };
    case 'preserved':
      return {
        eyebrow: 'Preserved · claim text retained',
        title: 'Current judgment preserved',
        body: 'The claim text was retained. The review and evidence were recorded without changing the accepted claim wording.'
      };
    case 'rejected':
      return {
        eyebrow: 'Rejected · not applied',
        title: 'Candidate rejected',
        body: 'The proposed revision was rejected. Your accepted Wiki claim is unchanged.'
      };
    case 'deferred':
      return {
        eyebrow: 'Deferred · not applied',
        title: 'Candidate deferred',
        body: review?.deferredUntil
          ? `Review deferred until ${formatDeferredUntil(review.deferredUntil)}. Your accepted Wiki claim is unchanged.`
          : 'Review deferred. Your accepted Wiki claim is unchanged.'
      };
    default:
      return {
        eyebrow: 'Candidate · not applied',
        title: 'Review the proposed claim revision',
        body: review?.canAct
          ? 'Compare the proposal, then accept, preserve, reject, or defer. Nothing changes until you confirm a write.'
          : 'This is a read-only comparison. Your accepted Wiki claim has not changed.'
      };
  }
};

const proposedLabelFor = (review) => {
  const state = String(review?.state || 'pending').toLowerCase();
  if (state === 'accepted') return 'Accepted claim wording';
  if (state === 'preserved') return 'Reviewed proposal · claim text retained';
  return 'Proposed claim · not applied';
};

const tomorrowDateInputValue = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const deferredUntilFromDateInput = (value) => {
  const trimmed = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: 'Choose a valid deferral date.' };
  }
  const iso = `${trimmed}T12:00:00.000Z`;
  const deferred = new Date(iso);
  if (Number.isNaN(deferred.getTime())) {
    return { error: 'Choose a valid deferral date.' };
  }
  if (deferred.getTime() <= Date.now()) {
    return { error: 'Deferral requires a future date.' };
  }
  return { iso };
};

const dispositionErrorMessage = (error) => (
  error?.response?.data?.error
  || error?.message
  || 'Could not record this disposition.'
);

const DispositionControls = ({
  review,
  busy,
  pendingAction,
  confirmAction,
  deferDate,
  note,
  writeError,
  onSelectAction,
  onCancelConfirm,
  onConfirm,
  onDeferDateChange,
  onNoteChange,
  onRetry
}) => {
  if (!review?.canAct) return null;

  const confirming = Boolean(confirmAction);
  const needsConfirm = confirmAction === 'accept' || confirmAction === 'preserve';
  const isDefer = confirmAction === 'defer';

  return (
    <section
      className="claim-revision-review__disposition"
      aria-labelledby="claim-revision-disposition-title"
    >
      <h4 id="claim-revision-disposition-title">Record a disposition</h4>
      <p className="claim-revision-review__quiet">
        Only an explicit human action can change this candidate. Writes stay pending until the server confirms them.
      </p>

      {!confirming ? (
        <div className="claim-revision-review__actions" role="group" aria-label="Claim disposition actions">
          <button
            type="button"
            onClick={() => onSelectAction('accept')}
            disabled={busy}
          >
            Accept revision
          </button>
          <button
            type="button"
            onClick={() => onSelectAction('preserve')}
            disabled={busy}
          >
            Preserve current judgment
          </button>
          <button
            type="button"
            onClick={() => onSelectAction('reject')}
            disabled={busy}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onSelectAction('defer')}
            disabled={busy}
          >
            Defer
          </button>
        </div>
      ) : (
        <div className="claim-revision-review__confirm" role="region" aria-label="Confirm disposition">
          {needsConfirm ? (
            <p>
              {confirmAction === 'accept'
                ? 'Confirm that you want to apply this proposed claim to the accepted Wiki page.'
                : 'Confirm that you want to preserve the current claim text and record this review without applying the proposal.'}
            </p>
          ) : null}
          {isDefer ? (
            <label className="claim-revision-review__defer">
              <span>Defer until</span>
              <input
                type="date"
                value={deferDate}
                min={tomorrowDateInputValue()}
                onChange={event => onDeferDateChange(event.target.value)}
                disabled={busy}
                required
              />
            </label>
          ) : null}
          <label className="claim-revision-review__note">
            <span>Optional note</span>
            <textarea
              value={note}
              onChange={event => onNoteChange(event.target.value)}
              disabled={busy}
              rows={2}
              maxLength={2000}
            />
          </label>
          <div className="claim-revision-review__actions">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || (isDefer && !deferDate)}
            >
              {busy && pendingAction === confirmAction
                ? 'Recording…'
                : confirmAction === 'accept'
                  ? 'Confirm accept'
                  : confirmAction === 'preserve'
                    ? 'Confirm preserve'
                    : confirmAction === 'reject'
                      ? 'Confirm reject'
                      : 'Confirm defer'}
            </button>
            <button type="button" onClick={onCancelConfirm} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {busy ? (
        <p className="claim-revision-review__write-status" role="status" aria-live="polite">
          Recording disposition…
        </p>
      ) : null}

      {writeError ? (
        <div className="claim-revision-review__write-error" role="alert">
          <p>{writeError}</p>
          {pendingAction ? (
            <button type="button" onClick={onRetry} disabled={busy}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

const DurableReceipt = ({ receipt, deferredUntil, state }) => {
  if (!receipt && !deferredUntil && !['accepted', 'preserved', 'rejected', 'deferred'].includes(String(state || '').toLowerCase())) {
    return null;
  }
  return (
    <section className="claim-revision-review__receipt" aria-labelledby="claim-revision-receipt-title">
      <h4 id="claim-revision-receipt-title">Disposition record</h4>
      {receipt ? (
        <dl>
          <div>
            <dt>Receipt</dt>
            <dd>{receipt.id || 'Recorded'}</dd>
          </div>
          {receipt.title ? (
            <div>
              <dt>Title</dt>
              <dd>{receipt.title}</dd>
            </div>
          ) : null}
          {receipt.summary ? (
            <div>
              <dt>Summary</dt>
              <dd>{receipt.summary}</dd>
            </div>
          ) : null}
          {receipt.completedAt || receipt.createdAt ? (
            <div>
              <dt>Recorded</dt>
              <dd>{formatDeferredUntil(receipt.completedAt || receipt.createdAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="claim-revision-review__quiet">No durable receipt is attached yet.</p>
      )}
      {deferredUntil ? (
        <p className="claim-revision-review__quiet">
          Deferred until {formatDeferredUntil(deferredUntil)}.
        </p>
      ) : null}
    </section>
  );
};

const ClaimRevisionReview = ({ review: reviewProp, onReviewChange = null }) => {
  const [review, setReview] = useState(reviewProp);
  const [confirmAction, setConfirmAction] = useState('');
  const [deferDate, setDeferDate] = useState(tomorrowDateInputValue());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [writeError, setWriteError] = useState('');
  const submitLockRef = useRef(false);
  const onReviewChangeRef = useRef(onReviewChange);
  onReviewChangeRef.current = onReviewChange;

  const reviewSyncKey = [
    reviewProp?.identity?.revisionId || '',
    reviewProp?.state || '',
    reviewProp?.canAct ? '1' : '0',
    reviewProp?.receipt?.id || '',
    reviewProp?.resolvedAt || '',
    reviewProp?.deferredUntil || '',
    reviewProp?.candidateHash || ''
  ].join('|');

  useEffect(() => {
    setReview(reviewProp);
    // Intentionally keyed by durable review fields so a parent re-render with a
    // stale pending prop cannot overwrite a successful local reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewSyncKey]);

  if (!review) return null;

  const evidence = review.evidenceDelta || {};
  const affected = [
    ...(Array.isArray(review.affected?.pages) ? review.affected.pages : []),
    ...(Array.isArray(review.affected?.concepts) ? review.affected.concepts : [])
  ];
  const unresolved = Array.isArray(review.unresolved) ? review.unresolved : [];
  const header = headerCopyFor(review);
  const terminalOrDeferred = ['accepted', 'preserved', 'rejected', 'deferred']
    .includes(String(review.state || '').toLowerCase());

  const reloadInvestigation = async () => {
    const identity = review.identity || {};
    const conceptId = identity.conceptId;
    const wikiPageId = identity.wikiPageId;
    if (!conceptId || !wikiPageId) {
      throw new Error('This review is missing exact investigation identity for reload.');
    }
    const payload = await getConceptInvestigation({
      conceptId,
      wikiPageId,
      revisionId: identity.revisionId || '',
      claimId: identity.claimId || ''
    });
    const nextReview = payload?.investigation?.claimReview || null;
    if (!nextReview) {
      throw new Error('The investigation reload did not return a claim review.');
    }
    setReview(nextReview);
    onReviewChangeRef.current?.(nextReview);
    return nextReview;
  };

  const submitDisposition = async (action) => {
    if (submitLockRef.current || busy) return;
    const revisionId = review.identity?.revisionId;
    if (!revisionId) {
      setWriteError('This review is missing a revision id.');
      return;
    }

    let deferredUntil;
    if (action === 'defer') {
      const parsed = deferredUntilFromDateInput(deferDate);
      if (parsed.error) {
        setWriteError(parsed.error);
        setPendingAction(action);
        return;
      }
      deferredUntil = parsed.iso;
    }

    submitLockRef.current = true;
    setBusy(true);
    setPendingAction(action);
    setWriteError('');
    try {
      await disposeWikiClaimRevision(revisionId, {
        action,
        note,
        ...(deferredUntil ? { deferredUntil } : {})
      });
      await reloadInvestigation();
      setConfirmAction('');
      setNote('');
      setPendingAction('');
    } catch (error) {
      setWriteError(dispositionErrorMessage(error));
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  };

  const selectAction = (action) => {
    if (busy) return;
    setWriteError('');
    setPendingAction('');
    setConfirmAction(action);
    if (action === 'defer' && !deferDate) {
      setDeferDate(tomorrowDateInputValue());
    }
  };

  return (
    <section className="claim-revision-review" aria-labelledby="claim-revision-review-title">
      <header className="claim-revision-review__header">
        <div>
          <span className="claim-revision-review__eyebrow">{header.eyebrow}</span>
          <h3 id="claim-revision-review-title">{header.title}</h3>
          <p>{header.body}</p>
        </div>
        <span className="claim-revision-review__state">{review.state || 'pending'}</span>
      </header>

      <div className="claim-revision-review__claims">
        <ClaimState label="Current accepted claim" claim={review.current} />
        <ClaimState label={proposedLabelFor(review)} claim={review.proposed} proposed />
      </div>

      <SemanticDiff diff={review.diff} />

      <section className="claim-revision-review__evidence" aria-labelledby="claim-revision-evidence-title">
        <h4 id="claim-revision-evidence-title">Evidence change</h4>
        <div>
          <EvidenceGroup title="Added" items={evidence.added} empty="No evidence was added." />
          <EvidenceGroup title="Removed" items={evidence.removed} empty="No evidence was removed." />
          <EvidenceGroup title="Supporting" items={evidence.supporting} empty="No supporting evidence is attached." />
          <EvidenceGroup title="Contradicting" items={evidence.contradicting} empty="No contradicting evidence is attached." />
        </div>
      </section>

      {unresolved.length ? (
        <section className="claim-revision-review__unresolved">
          <h4>Still unresolved</h4>
          <ul>{unresolved.map((item, index) => <li key={`${item?.source || 'unresolved'}:${index}`}>{item?.text}</li>)}</ul>
        </section>
      ) : null}

      <ReferenceList title="Affected knowledge" items={affected} />

      <DispositionControls
        review={review}
        busy={busy}
        pendingAction={pendingAction}
        confirmAction={confirmAction}
        deferDate={deferDate}
        note={note}
        writeError={writeError}
        onSelectAction={selectAction}
        onCancelConfirm={() => {
          if (busy) return;
          setConfirmAction('');
          setWriteError('');
        }}
        onConfirm={() => {
          if (!confirmAction) return;
          submitDisposition(confirmAction);
        }}
        onDeferDateChange={setDeferDate}
        onNoteChange={setNote}
        onRetry={() => {
          if (!pendingAction) return;
          submitDisposition(pendingAction);
        }}
      />

      {!review.canAct && review.unavailableReason ? (
        <p className="claim-revision-review__unavailable" role="note">
          {review.unavailableReason}
        </p>
      ) : null}

      {terminalOrDeferred || review.receipt ? (
        <DurableReceipt
          receipt={review.receipt}
          deferredUntil={review.deferredUntil}
          state={review.state}
        />
      ) : null}
    </section>
  );
};

export default ClaimRevisionReview;
