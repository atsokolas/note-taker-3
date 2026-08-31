import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getDecisions,
  recordWikiDecisionOutcome,
  transitionWikiDecision
} from '../../../api/decisions';
import '../../../styles/wiki-decisions.css';
import { formatCalendarDate } from '../../../utils/calendarDate';

const RESULT_OPTIONS = ['positive', 'negative', 'mixed'];

const clean = (value) => String(value || '').trim();
const exactSourceRefId = (source) => clean(source?.sourceRefId);
const safeInternalHref = (value) => {
  const href = clean(value);
  return href.startsWith('/') && !href.startsWith('//') ? href : '';
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const mutationError = (error) => {
  const code = clean(error?.response?.data?.code);
  const message = error?.response?.data?.error || error?.message || 'Could not update this decision.';
  return { code, message };
};

const localDateTimeInputValue = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 23);
};

const isoFromDateTimeInput = (value) => {
  const trimmed = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(trimmed)) {
    return { error: 'Choose a valid observation date and time.' };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { error: 'Choose a valid observation date and time.' };
  if (parsed.getTime() > Date.now()) return { error: 'Observation time cannot be in the future.' };
  return { iso: parsed.toISOString() };
};

const DecisionOutcomeForm = ({
  pageId,
  decisionId,
  item,
  onRecorded
}) => {
  const formId = useId();
  const submitLockRef = useRef(false);
  const [observedAt, setObservedAt] = useState(() => localDateTimeInputValue());
  const [summary, setSummary] = useState('');
  const [result, setResult] = useState('mixed');
  const [processScore, setProcessScore] = useState('0.7');
  const [calibrationNote, setCalibrationNote] = useState('');
  const [lesson, setLesson] = useState('');
  const [evidenceSourceRefIds, setEvidenceSourceRefIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [idempotent, setIdempotent] = useState(false);

  const expectedDecisionHash = clean(item?.continuity?.immutableSnapshotHash);
  const sources = Array.isArray(item?.links?.sources?.resolved) ? item.links.sources.resolved : [];
  const pageSources = sources.length
    ? sources
    : [];

  // Prefer exact owned source ids from the decision's source links; caller may also
  // pass page sourceRefs via item.links.sources.resolved only.
  const selectableSourceIds = Array.from(new Set([
    ...pageSources.map(exactSourceRefId).filter(Boolean),
    ...(Array.isArray(item?.decisionSourceRefIds) ? item.decisionSourceRefIds.map(clean).filter(Boolean) : [])
  ]));

  const toggleEvidence = (id) => {
    setEvidenceSourceRefIds(current => (
      current.includes(id) ? current.filter(value => value !== id) : [...current, id]
    ));
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    if (submitLockRef.current || busy) return;
    if (!expectedDecisionHash) {
      setWriteError('This decision is missing a verified immutable snapshot hash. Outcome recording is blocked.');
      setErrorCode('incomplete_continuity');
      return;
    }
    const observed = isoFromDateTimeInput(observedAt);
    if (observed.error) {
      setWriteError(observed.error);
      return;
    }
    if (!clean(summary) || !clean(calibrationNote) || !clean(lesson)) {
      setWriteError('Observation summary, calibration note, and lesson are required.');
      return;
    }
    if (!RESULT_OPTIONS.includes(result)) {
      setWriteError('Result must be positive, negative, or mixed.');
      return;
    }
    if (!evidenceSourceRefIds.length) {
      setWriteError('Select at least one exact outcome evidence source reference.');
      return;
    }
    const score = Number(processScore);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      setWriteError('Process score must be between 0 and 1.');
      return;
    }

    submitLockRef.current = true;
    setBusy(true);
    setWriteError('');
    setErrorCode('');
    setReceipt(null);
    setIdempotent(false);
    try {
      const response = await recordWikiDecisionOutcome(pageId, decisionId, {
        outcome: {
          expectedDecisionHash,
          observedAt: observed.iso,
          summary: clean(summary),
          result,
          processScore: score,
          calibrationNote: clean(calibrationNote),
          lesson: clean(lesson),
          evidenceSourceRefIds
        }
      });
      setReceipt(response.receipt || null);
      setIdempotent(Boolean(response.idempotent));
      onRecorded?.(response);
    } catch (error) {
      const parsed = mutationError(error);
      setWriteError(parsed.message);
      setErrorCode(parsed.code);
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  };

  return (
    <form className="wiki-decision-outcome" onSubmit={submit} aria-labelledby={`${formId}-title`}>
      <h4 id={`${formId}-title`}>Record observed outcome</h4>
      <p className="wiki-decisions__quiet">
        Noeis does not infer the result. Your original rationale stays visible above.
      </p>

      {!expectedDecisionHash ? (
        <p className="wiki-decision-form__blocker" role="alert">
          Incomplete continuity — `continuity.immutableSnapshotHash` is missing, so the
          outcome form cannot send `expectedDecisionHash`.
        </p>
      ) : (
        <>
          <label>
            Observed at
            <input
              type="datetime-local"
              aria-label="Observed at"
              value={observedAt}
              onChange={event => setObservedAt(event.target.value)}
              max={localDateTimeInputValue()}
              step="0.001"
              required
              disabled={busy}
            />
            <span className="wiki-decisions__quiet">
              Record when the result was observed, not merely the day it was reviewed.
            </span>
          </label>
          <label>
            Observation summary
            <textarea
              aria-label="Observation summary"
              value={summary}
              onChange={event => setSummary(event.target.value)}
              required
              disabled={busy}
              rows={3}
            />
          </label>
          <div className="wiki-decision-form__row">
            <label>
              Result
              <select
                aria-label="Outcome result"
                value={result}
                onChange={event => setResult(event.target.value)}
                disabled={busy}
              >
                {RESULT_OPTIONS.map(value => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Process score (0–1)
              <input
                aria-label="Process score"
                inputMode="decimal"
                value={processScore}
                onChange={event => setProcessScore(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <label>
            Calibration note
            <textarea
              aria-label="Calibration note"
              value={calibrationNote}
              onChange={event => setCalibrationNote(event.target.value)}
              required
              disabled={busy}
              rows={3}
            />
          </label>
          <label>
            Lesson
            <textarea
              aria-label="Lesson"
              value={lesson}
              onChange={event => setLesson(event.target.value)}
              required
              disabled={busy}
              rows={3}
            />
          </label>
          <fieldset disabled={busy}>
            <legend>Outcome evidence source references (at least one)</legend>
            {selectableSourceIds.length ? selectableSourceIds.map(id => {
              const source = pageSources.find(row => exactSourceRefId(row) === id);
              return (
                <label key={id} className="wiki-decision-form__check">
                  <input
                    type="checkbox"
                    checked={evidenceSourceRefIds.includes(id)}
                    onChange={() => toggleEvidence(id)}
                  />
                  <span>{source?.title || id}</span>
                </label>
              );
            }) : (
              <p className="wiki-decisions__quiet">
                No exact owned source references are linked on this decision.
              </p>
            )}
          </fieldset>

          {writeError ? (
            <div className="wiki-decision-form__error" role="alert">
              <p>
                {errorCode === 'stale_decision' ? 'Stale decision — ' : ''}
                {errorCode === 'incomplete_continuity' ? 'Incomplete continuity — ' : ''}
                {errorCode === 'observation_precedes_decision' ? 'Observation precedes decision — ' : ''}
                {writeError}
              </p>
              <button type="button" onClick={submit} disabled={busy}>Retry</button>
            </div>
          ) : null}

          {busy ? <p className="wiki-decisions__quiet" role="status">Recording outcome…</p> : null}

          {receipt ? (
            <div className="wiki-decision-form__receipt" role="status">
              <p>
                {idempotent
                  ? 'Idempotent replay — outcome already recorded with the same evidence.'
                  : 'Outcome recorded.'}
              </p>
              <p>Receipt: {receipt.id || receipt.receiptId || 'recorded'}</p>
            </div>
          ) : null}

          <button type="submit" disabled={busy || !expectedDecisionHash}>
            {busy ? 'Recording…' : 'Record outcome'}
          </button>
        </>
      )}
    </form>
  );
};

const DecisionReviewPanel = ({
  pageId,
  decisionId = '',
  page = null,
  onPageRefresh
}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitionBusy, setTransitionBusy] = useState('');
  const [transitionError, setTransitionError] = useState('');
  const [transitionReceipt, setTransitionReceipt] = useState(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getDecisions({
        filter: 'all',
        limit: 50,
        windowDays: 365,
        pageId
      });
      setItems(result.items);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not load decisions for this page.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    setLoading(true);
    getDecisions({
      filter: 'all',
      limit: 50,
      windowDays: 365,
      pageId
    }).then((result) => {
      if (!cancelled) setItems(result.items);
    }).catch((err) => {
      if (!cancelled) {
        setError(err?.response?.data?.error || err?.message || 'Could not load decisions for this page.');
        setItems([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pageId]);

  const focused = decisionId
    ? items.find(item => clean(item?.identity?.decisionId) === clean(decisionId))
    : null;
  const rows = focused ? [focused] : items;

  const runTransition = async (item, action) => {
    if (transitionBusy) return;
    setTransitionBusy(action);
    setTransitionError('');
    setTransitionReceipt(null);
    try {
      const response = await transitionWikiDecision(
        item.identity.pageId,
        item.identity.decisionId,
        { action }
      );
      setTransitionReceipt({
        action,
        idempotent: Boolean(response.idempotent),
        receipt: response.receipt || null,
        status: response.status
      });
      await reload();
      onPageRefresh?.(response);
    } catch (err) {
      const parsed = mutationError(err);
      setTransitionError(parsed.message);
    } finally {
      setTransitionBusy('');
    }
  };

  if (!pageId) return null;

  return (
    <section
      className="wiki-decision-review"
      aria-labelledby="wiki-decision-review-title"
      data-decision-id={decisionId || undefined}
    >
      <header>
        <p className="wiki-decisions__eyebrow">Decision review</p>
        <h3 id="wiki-decision-review-title">
          {decisionId ? 'Review this decision' : 'Page decisions'}
        </h3>
        <p>Original rationale is preserved. Outcomes are never inferred.</p>
      </header>

      {loading ? <p className="wiki-decisions__quiet" role="status">Loading decisions…</p> : null}
      {error ? (
        <div className="wiki-decisions__error" role="status">
          <p>{error}</p>
          <button type="button" onClick={reload}>Try again</button>
        </div>
      ) : null}

      {!loading && !error && !rows.length ? (
        <p className="wiki-decisions__quiet">No reconstructable decisions on this page yet.</p>
      ) : null}

      {rows.map(item => {
        const status = clean(item?.decision?.status);
        const incomplete = item?.continuity?.complete === false;
        const pageHref = safeInternalHref(item?.page?.href);
        const sources = Array.isArray(item?.links?.sources?.resolved) ? item.links.sources.resolved : [];
        const decisionSourceRefIds = sources.map(exactSourceRefId).filter(Boolean);
        // Also expose page-level source refs for outcome evidence selection when the
        // decision already links them via missing resolution — prefer resolved ids.
        const pageSourceIds = (Array.isArray(page?.sourceRefs) ? page.sourceRefs : [])
          .map(ref => clean(ref?._id || ref?.id))
          .filter(Boolean);
        const enriched = {
          ...item,
          decisionSourceRefIds: decisionSourceRefIds.length ? decisionSourceRefIds : pageSourceIds,
          links: {
            ...item.links,
            sources: {
              ...item.links?.sources,
              resolved: sources.length
                ? sources
                : pageSourceIds.map(id => {
                  const ref = (page?.sourceRefs || []).find(row => clean(row?._id || row?.id) === id);
                  return {
                    id,
                    sourceRefId: id,
                    title: clean(ref?.title || ref?.url || id),
                    type: clean(ref?.type),
                    href: ''
                  };
                })
            }
          }
        };

        return (
          <article
            key={item.id || item.identity?.decisionId}
            className={`wiki-decisions__row${incomplete ? ' is-incomplete' : ''}`}
            id={item.identity?.decisionId ? `decision-${item.identity.decisionId}` : undefined}
          >
            <header>
              <div>
                <p className="wiki-decisions__eyebrow">{status}</p>
                <h4>{item?.decision?.summary || 'Untitled decision'}</h4>
              </div>
              <span className="wiki-decisions__continuity" role="status">
                {incomplete
                  ? `Incomplete continuity${Array.isArray(item?.continuity?.missing) && item.continuity.missing.length
                    ? ` · ${item.continuity.missing.join(', ')}`
                    : ''}`
                  : 'Continuity verified'}
              </span>
            </header>

            <div className="wiki-decision-review__chronology" aria-label="Decision consequence chronology">
              <section className="wiki-decision-review__basis" aria-labelledby={`decision-basis-${item.identity?.decisionId}`}>
                <p className="wiki-decisions__eyebrow">01 · Decision as made</p>
                <h5 id={`decision-basis-${item.identity?.decisionId}`}>Immutable basis</h5>
                {item?.decision?.rationale ? (
                  <p className="wiki-decisions__rationale">
                    <strong>Original rationale</strong>
                    {' '}
                    {item.decision.rationale}
                  </p>
                ) : null}
                {item?.decision?.expectedOutcome ? (
                  <p className="wiki-decisions__expected">
                    <strong>Expected outcome</strong>
                    {' '}
                    {item.decision.expectedOutcome}
                  </p>
                ) : null}
                <p className="wiki-decisions__meta">
                  {formatDate(item?.decision?.decidedAt || item?.decision?.createdAt)
                    ? `Decision recorded ${formatDate(item?.decision?.decidedAt || item?.decision?.createdAt)}`
                    : 'Decision time unavailable'}
                  {item?.continuity?.acceptedRevisionId
                    ? ` · Accepted revision ${item.continuity.acceptedRevisionId}`
                    : ' · Accepted revision not verified'}
                </p>
              </section>

              <section className="wiki-decision-review__review-clock" aria-labelledby={`decision-review-${item.identity?.decisionId}`}>
                <p className="wiki-decisions__eyebrow">02 · Review clock</p>
                <h5 id={`decision-review-${item.identity?.decisionId}`}>Return when evidence can settle it</h5>
                <p className="wiki-decisions__meta">
                  Review {formatCalendarDate(item?.decision?.reviewAt) || 'not scheduled'}
                  {item?.decision?.outcomeDueAt
                    ? ` · Outcome due ${formatDate(item.decision.outcomeDueAt)}`
                    : ''}
                </p>
              </section>

              <section className="wiki-decision-review__observed-layer" aria-labelledby={`decision-observed-${item.identity?.decisionId}`}>
                <p className="wiki-decisions__eyebrow">03 · What happened later</p>
                <h5 id={`decision-observed-${item.identity?.decisionId}`}>Observed outcome</h5>
                {status === 'reviewed' || item?.outcome?.state === 'observed' ? (
                  <div className="wiki-decisions__outcome">
                    <p>
                      <strong>Observed result</strong>
                      {' '}
                      {item.outcome?.result || 'unknown'}
                      {item.outcome?.observedAt ? ` · ${formatDate(item.outcome.observedAt)}` : ''}
                    </p>
                    {item.outcome?.reviewedAt ? (
                      <p className="wiki-decisions__meta">Reviewed {formatDate(item.outcome.reviewedAt)}</p>
                    ) : null}
                    {item.outcome?.calibrationNote ? <p>{item.outcome.calibrationNote}</p> : null}
                    {item.outcome?.lesson ? (
                      <p>
                        <strong>Lesson</strong>
                        {' '}
                        {item.outcome.lesson}
                      </p>
                    ) : null}
                    {item.outcome?.receiptId ? <p className="wiki-decisions__receipt-line">Outcome receipt: {item.outcome.receiptId}</p> : null}
                  </div>
                ) : (
                  <p className="wiki-decisions__quiet">Noeis has not inferred an outcome.</p>
                )}
              </section>
            </div>

            {pageHref ? (
              <p>
                <Link to={pageHref}>{item.page?.title || 'Wiki page'}</Link>
              </p>
            ) : null}

            {Array.isArray(item?.links?.claims?.resolved) && item.links.claims.resolved.length ? (
              <ul aria-label="Related claims">
                {item.links.claims.resolved.map(claim => {
                  const href = safeInternalHref(claim.href);
                  return (
                    <li key={claim.id}>
                      {href ? <Link to={href}>{claim.title || claim.id}</Link> : claim.title || claim.id}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {status === 'planned' ? (
              <div className="wiki-decision-review__transitions" role="group" aria-label="Decision transitions">
                <button
                  type="button"
                  disabled={Boolean(transitionBusy)}
                  onClick={() => runTransition(item, 'take')}
                >
                  {transitionBusy === 'take' ? 'Marking taken…' : 'Mark taken'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(transitionBusy)}
                  onClick={() => runTransition(item, 'cancel')}
                >
                  {transitionBusy === 'cancel' ? 'Cancelling…' : 'Cancel decision'}
                </button>
              </div>
            ) : null}

            {transitionError ? (
              <div className="wiki-decision-form__error" role="alert">
                <p>{transitionError}</p>
              </div>
            ) : null}

            {transitionReceipt ? (
              <div className="wiki-decision-form__receipt" role="status">
                <p>
                  {transitionReceipt.idempotent
                    ? `Idempotent replay — already ${transitionReceipt.status}.`
                    : `Transitioned to ${transitionReceipt.status}.`}
                </p>
                {transitionReceipt.receipt?.id || transitionReceipt.receipt?.receiptId ? (
                  <p>Receipt: {transitionReceipt.receipt.id || transitionReceipt.receipt.receiptId}</p>
                ) : null}
              </div>
            ) : null}

            {status === 'taken' && item?.outcome?.state !== 'observed' ? (
              <DecisionOutcomeForm
                pageId={pageId}
                decisionId={item.identity.decisionId}
                item={enriched}
                onRecorded={async (response) => {
                  await reload();
                  onPageRefresh?.(response);
                }}
              />
            ) : null}

          </article>
        );
      })}
    </section>
  );
};

export default DecisionReviewPanel;
