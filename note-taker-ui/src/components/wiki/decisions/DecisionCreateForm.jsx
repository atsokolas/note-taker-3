import React, { useEffect, useId, useRef, useState } from 'react';
import { listWikiRevisions } from '../../../api/wiki';
import { createWikiDecision } from '../../../api/decisions';
import {
  acceptedRevisionIdFromClaimReview,
  selectableAcceptedRevisions
} from './acceptedRevisionIdentity';
import '../../../styles/wiki-decisions.css';

const DECISION_TYPES = [
  'research', 'outreach', 'product', 'operating', 'investment', 'no_action', 'close'
];

const clean = (value) => String(value || '').trim();

const futureDateInputValue = (daysAhead = 7) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
};

const isoFromDateInput = (value, { required = false, future = false } = {}) => {
  const trimmed = clean(value);
  if (!trimmed) {
    return required ? { error: 'This date is required.' } : { iso: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: 'Choose a valid date.' };
  }
  const iso = `${trimmed}T12:00:00.000Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { error: 'Choose a valid date.' };
  if (future && parsed.getTime() <= Date.now()) {
    return { error: 'Choose a future date.' };
  }
  return { iso };
};

const localDateTimeInputValue = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const isoFromDateTimeInput = (value, { required = false, future = false } = {}) => {
  const trimmed = clean(value);
  if (!trimmed) return required ? { error: 'This date and time is required.' } : { iso: null };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(trimmed)) {
    return { error: 'Choose a valid date and time.' };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { error: 'Choose a valid date and time.' };
  if (future && parsed.getTime() <= Date.now()) return { error: 'Choose a future date and time.' };
  return { iso: parsed.toISOString() };
};

const newRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `decision-req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const claimOptions = (page) => (
  (Array.isArray(page?.claims) ? page.claims : [])
    .map(claim => ({
      id: clean(claim?.claimId),
      label: clean(claim?.text).slice(0, 160) || clean(claim?.claimId)
    }))
    .filter(option => option.id)
);

const sourceOptions = (page) => (
  (Array.isArray(page?.sourceRefs) ? page.sourceRefs : [])
    .map(ref => ({
      id: clean(ref?._id || ref?.id),
      label: clean(ref?.title || ref?.url || ref?.type || ref?._id || ref?.id).slice(0, 160)
    }))
    .filter(option => option.id)
);

const mutationErrorMessage = (error) => (
  error?.response?.data?.error
  || error?.message
  || 'Could not record this decision.'
);

const DecisionCreateForm = ({
  page,
  pageId,
  claimReview = null,
  onCreated
}) => {
  const formId = useId();
  const submitLockRef = useRef(false);
  const [revisions, setRevisions] = useState([]);
  const [revisionsLoading, setRevisionsLoading] = useState(true);
  const [revisionsError, setRevisionsError] = useState('');
  const [acceptedRevisionId, setAcceptedRevisionId] = useState(
    () => acceptedRevisionIdFromClaimReview(claimReview)
  );
  const [summary, setSummary] = useState('');
  const [rationale, setRationale] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [decisionType, setDecisionType] = useState('research');
  const [status, setStatus] = useState('planned');
  const [reviewAt, setReviewAt] = useState(futureDateInputValue(14));
  const [outcomeDueAt, setOutcomeDueAt] = useState('');
  const [relatedClaimIds, setRelatedClaimIds] = useState([]);
  const [sourceRefIds, setSourceRefIds] = useState([]);
  const [horizon, setHorizon] = useState('');
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [idempotent, setIdempotent] = useState(false);
  const [requestId] = useState(() => newRequestId());

  const claims = claimOptions(page);
  const sources = sourceOptions(page);
  const safePageId = clean(pageId || page?._id || page?.id);

  useEffect(() => {
    const fromReview = acceptedRevisionIdFromClaimReview(claimReview);
    if (fromReview) setAcceptedRevisionId(fromReview);
  }, [claimReview]);

  useEffect(() => {
    if (!safePageId) {
      setRevisions([]);
      setRevisionsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setRevisionsLoading(true);
    setRevisionsError('');
    listWikiRevisions(safePageId)
      .then((rows) => {
        if (cancelled) return;
        const selectable = selectableAcceptedRevisions(rows);
        setRevisions(selectable);
        setAcceptedRevisionId((current) => {
          if (current && selectable.some(row => row.revisionId === current)) return current;
          const fromReview = acceptedRevisionIdFromClaimReview(claimReview);
          if (fromReview && selectable.some(row => row.revisionId === fromReview)) return fromReview;
          return selectable[0]?.revisionId || '';
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setRevisionsError(error?.response?.data?.error || error?.message || 'Could not load revisions.');
        setRevisions([]);
      })
      .finally(() => {
        if (!cancelled) setRevisionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [safePageId, claimReview]);

  const toggleId = (list, id, setter) => {
    setter(list.includes(id) ? list.filter(value => value !== id) : [...list, id]);
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    if (submitLockRef.current || busy) return;
    if (!safePageId) {
      setWriteError('A Wiki page is required.');
      return;
    }
    if (!acceptedRevisionId) {
      setWriteError('An accepted or preserved claim revision is required. None is structurally available on this page.');
      return;
    }
    const reviewParsed = isoFromDateInput(reviewAt, { required: true, future: true });
    if (reviewParsed.error) {
      setWriteError(reviewParsed.error);
      return;
    }
    const outcomeParsed = isoFromDateTimeInput(outcomeDueAt, { required: false, future: true });
    if (outcomeParsed.error) {
      setWriteError(outcomeParsed.error);
      return;
    }
    if (!clean(summary) || !clean(rationale) || !clean(expectedOutcome)) {
      setWriteError('Summary, rationale, and expected outcome are required.');
      return;
    }
    if (!relatedClaimIds.length || !sourceRefIds.length) {
      setWriteError('Select at least one related claim and one owned source reference.');
      return;
    }

    submitLockRef.current = true;
    setBusy(true);
    setWriteError('');
    setReceipt(null);
    setIdempotent(false);
    try {
      const result = await createWikiDecision(safePageId, {
        acceptedRevisionId,
        requestId,
        decision: {
          summary: clean(summary),
          rationale: clean(rationale),
          expectedOutcome: clean(expectedOutcome),
          decisionType,
          status,
          reviewAt: reviewParsed.iso,
          outcomeDueAt: outcomeParsed.iso,
          relatedClaimIds,
          sourceRefIds,
          horizon: clean(horizon) || undefined
        }
      });
      setReceipt(result.receipt || null);
      setIdempotent(Boolean(result.idempotent));
      onCreated?.(result);
    } catch (error) {
      setWriteError(mutationErrorMessage(error));
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  };

  if (!safePageId) return null;

  const noAcceptedBasis = !revisionsLoading && !revisions.length && !acceptedRevisionId;

  return (
    <section className="wiki-decision-form" aria-labelledby={`${formId}-title`}>
      <header>
        <p className="wiki-decisions__eyebrow">Record a decision</p>
        <h3 id={`${formId}-title`}>Accept a decision against a retained claim revision</h3>
        <p>
          Uses the dedicated decision endpoint — never a generic Wiki page edit.
          Outcomes are recorded later; this form only captures the decision and clocks.
        </p>
      </header>

      {revisionsLoading ? (
        <p className="wiki-decisions__quiet" role="status">Loading accepted revisions…</p>
      ) : null}
      {revisionsError ? (
        <p className="wiki-decision-form__error" role="status">{revisionsError}</p>
      ) : null}
      {noAcceptedBasis ? (
        <p className="wiki-decision-form__blocker" role="alert">
          Blocked: no accepted or preserved claim revision identity is structurally available
          for this page (`claimReview.state` accepted/preserved with receipt events on
          `GET /api/wiki/pages/:id/revisions`, or `claimReview.identity.revisionId` after
          disposition). Noeis will not invent `acceptedRevisionId` from `updatedAt`,
          `initialRevisionId`, or the latest revision.
        </p>
      ) : (
        <form onSubmit={submit} className="wiki-decision-form__fields">
          <label htmlFor={`${formId}-accepted-revision`}>
            Accepted / preserved revision
            <select
              id={`${formId}-accepted-revision`}
              aria-label="Accepted or preserved revision"
              value={acceptedRevisionId}
              onChange={event => setAcceptedRevisionId(event.target.value)}
              required
              disabled={busy}
            >
              {!acceptedRevisionId ? <option value="">Select a revision</option> : null}
              {revisions.map(row => (
                <option key={row.revisionId} value={row.revisionId}>
                  {row.disposition} · {row.summary}
                </option>
              ))}
            </select>
          </label>

          <label>
            Decision summary
            <input
              aria-label="Decision summary"
              value={summary}
              onChange={event => setSummary(event.target.value)}
              required
              disabled={busy}
            />
          </label>

          <label>
            Rationale
            <textarea
              aria-label="Decision rationale"
              value={rationale}
              onChange={event => setRationale(event.target.value)}
              required
              disabled={busy}
              rows={3}
            />
          </label>

          <label>
            Expected outcome
            <textarea
              aria-label="Expected outcome"
              value={expectedOutcome}
              onChange={event => setExpectedOutcome(event.target.value)}
              required
              disabled={busy}
              rows={3}
            />
          </label>

          <div className="wiki-decision-form__row">
            <label>
              Type
              <select
                aria-label="Decision type"
                value={decisionType}
                onChange={event => setDecisionType(event.target.value)}
                disabled={busy}
              >
                {DECISION_TYPES.map(value => (
                  <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </label>
            <label>
              State
              <select
                aria-label="Decision status"
                value={status}
                onChange={event => setStatus(event.target.value)}
                disabled={busy}
              >
                <option value="planned">planned</option>
                <option value="taken">taken</option>
              </select>
            </label>
          </div>

          <div className="wiki-decision-form__row">
            <label>
              Future review date
              <input
                type="date"
                aria-label="Future review date"
                value={reviewAt}
                onChange={event => setReviewAt(event.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              Outcome due at
              <input
                type="datetime-local"
                aria-label="Outcome due at"
                value={outcomeDueAt}
                onChange={event => setOutcomeDueAt(event.target.value)}
                min={localDateTimeInputValue()}
                step="60"
                disabled={busy}
              />
              <span className="wiki-decisions__quiet">
                Optional. Noeis will return this decision when the human-set outcome clock arrives.
              </span>
            </label>
          </div>

          <label>
            Horizon
            <input
              aria-label="Decision horizon"
              value={horizon}
              onChange={event => setHorizon(event.target.value)}
              disabled={busy}
            />
          </label>

          <fieldset disabled={busy}>
            <legend>Related claims (at least one)</legend>
            {claims.length ? claims.map(claim => (
              <label key={claim.id} className="wiki-decision-form__check">
                <input
                  type="checkbox"
                  checked={relatedClaimIds.includes(claim.id)}
                  onChange={() => toggleId(relatedClaimIds, claim.id, setRelatedClaimIds)}
                />
                <span>{claim.label}</span>
              </label>
            )) : (
              <p className="wiki-decisions__quiet">No claims are available on this page.</p>
            )}
          </fieldset>

          <fieldset disabled={busy}>
            <legend>Owned source references (at least one)</legend>
            {sources.length ? sources.map(source => (
              <label key={source.id} className="wiki-decision-form__check">
                <input
                  type="checkbox"
                  checked={sourceRefIds.includes(source.id)}
                  onChange={() => toggleId(sourceRefIds, source.id, setSourceRefIds)}
                />
                <span>{source.label}</span>
              </label>
            )) : (
              <p className="wiki-decisions__quiet">No owned source references are available on this page.</p>
            )}
          </fieldset>

          {writeError ? (
            <div className="wiki-decision-form__error" role="alert">
              <p>{writeError}</p>
              <button type="button" onClick={submit} disabled={busy}>Retry</button>
            </div>
          ) : null}

          {busy ? <p className="wiki-decisions__quiet" role="status">Recording decision…</p> : null}

          {receipt ? (
            <div className="wiki-decision-form__receipt" role="status">
              <p>
                {idempotent ? 'Idempotent replay — decision already recorded.' : 'Decision accepted.'}
              </p>
              <p>Receipt: {receipt.id || receipt.receiptId || 'recorded'}</p>
            </div>
          ) : null}

          <button type="submit" disabled={busy || !acceptedRevisionId}>
            {busy ? 'Recording…' : 'Record decision'}
          </button>
        </form>
      )}
    </section>
  );
};

export default DecisionCreateForm;
